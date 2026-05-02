/**
 * EzyGo API Batch Fetcher with Request Deduplication and Rate Limiting
 * 
 * Solves the concurrent user problem by:
 * 1. Deduplicating identical in-flight requests (60-second cache window)
 * 2. Rate limiting concurrent requests to max 3 at a time
 * 3. Queueing additional requests to prevent overwhelming the API
 * 
 * Example: 20 concurrent users = max 3 concurrent API calls instead of 120
 */

import 'server-only';

import { LRUCache } from 'lru-cache';
import { logger } from './logger';
import { ezygoCircuitBreaker, NonBreakerError } from './circuit-breaker';
import { createHash } from 'crypto';
import { egressFetch } from './utils.server';

/**
 * Create an AbortSignal with a timeout.
 * Falls back to AbortController + setTimeout for environments where AbortSignal.timeout() is unavailable.
 * Returns an object with the signal and a cleanup function.
 */
function createTimeoutSignal(timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  // Use native AbortSignal.timeout() if available
  if (typeof AbortSignal !== 'undefined' && 
      'timeout' in AbortSignal && 
      typeof AbortSignal.timeout === 'function') {
    return { 
      signal: AbortSignal.timeout(timeoutMs),
      cleanup: () => {} // Native timeout doesn't need cleanup
    };
  }
  
  // Fallback for environments without AbortSignal.timeout() (e.g., jsdom)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return { 
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId)
  };
}

/**
 * Queue-related errors that should not trip the circuit breaker
 * These indicate local resource constraints, not API failure
 */
export class QueueFullError extends NonBreakerError {
  constructor(size: number) {
    super(`Request queue is full (${size} items). Please try again later.`);
    this.name = 'QueueFullError';
  }
}

export class QueueTimeoutError extends NonBreakerError {
  constructor(timeoutMs: number) {
    super(`Request queue timeout: waited ${timeoutMs}ms without getting a slot`);
    this.name = 'QueueTimeoutError';
  }
}

// 1. LONG-LIVED CACHE (60 seconds) - Handles burst traffic and queuing delays
// Stores in-flight request promises from the moment they are enqueued
// TTL starts when the promise enters the cache (before queue wait + fetch)
// TTL must be >= QUEUE_TIMEOUT_MS (30s) + fetch timeout (15s) to ensure the promise
// doesn't expire while waiting in queue or during the fetch operation
// Resolved results remain cached for any remaining TTL after completion
const requestCache = new LRUCache<string, Promise<any>>({
  max: 500,
  ttl: 60000, // 60 seconds - accounts for 30s queue wait + 15s fetch + buffer
  updateAgeOnGet: false, // Don't reset TTL on access
  updateAgeOnHas: false,
});

// 2. RATE LIMITER - Conservative limit to avoid EzyGo rate limiting
// With a single server IP, we must be very careful not to trigger rate limits
// MAX_CONCURRENT = 3 means max 3 simultaneous requests from server to EzyGo
// This is conservative but safe - increase only if you verify EzyGo's limits
let activeRequests = 0;
const MAX_CONCURRENT = 3; // Conservative: 3 concurrent requests from single IP
const MAX_QUEUE_SIZE = 100; // Prevent unbounded queue growth
const QUEUE_TIMEOUT_MS = 30000; // 30 seconds max wait time in queue

// Use a counter for unique queue item identification
let queueItemId = 0;

// Generation counter to invalidate stale in-flight requests after reset
// Prevents in-flight requests from corrupting activeRequests when they complete after reset
let generation = 0;

interface QueuedRequest {
  id: number;
  timeoutId: NodeJS.Timeout;
  resolve: () => void;
  reject: (error: Error) => void;
}

const requestQueue: QueuedRequest[] = [];

/**
 * Wait for an available request slot
 * If max concurrent requests reached, queues the request
 * Throws QueueFullError if queue is full or QueueTimeoutError if wait exceeds timeout
 * 
 * Ensures FIFO fairness: if there are queued requests, new requests must also queue
 * to prevent jumping the line.
 * 
 * @returns The current generation ID to be passed to releaseSlot()
 */
function waitForSlot(): Promise<number> {
  // Capture generation at slot acquisition time
  const slotGeneration = generation;
  
  // Only take an immediate slot if queue is empty AND slots are available
  // This ensures FIFO: queued requests are always processed before new arrivals
  if (requestQueue.length === 0 && activeRequests < MAX_CONCURRENT) {
    activeRequests++;
    return Promise.resolve(slotGeneration);
  }
  
  // Check queue size limit
  if (requestQueue.length >= MAX_QUEUE_SIZE) {
    throw new QueueFullError(MAX_QUEUE_SIZE);
  }
  
  return new Promise((resolve, reject) => {
    const itemId = ++queueItemId;
    const timeoutId = setTimeout(() => {
      // Remove from queue if still present
      const index = requestQueue.findIndex(item => item.id === itemId);
      requestQueue.splice(index, 1);
      reject(new QueueTimeoutError(QUEUE_TIMEOUT_MS));
    }, QUEUE_TIMEOUT_MS);
    
    requestQueue.push({
      id: itemId,
      timeoutId,
      resolve: () => {
        clearTimeout(timeoutId);
        activeRequests++;
        resolve(slotGeneration);
      },
      reject: (error: Error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  });
}

/**
 * Release a request slot and process queue
 * Only releases if the generation matches (prevents stale in-flight requests from corrupting state)
 * @param slotGeneration - The generation ID from when the slot was acquired
 */
function releaseSlot(slotGeneration: number) {
  // Ignore releases from prior generations (before last reset)
  // This prevents in-flight requests from corrupting activeRequests after reset
  if (slotGeneration !== generation) {
    return;
  }
  
  activeRequests--;
  const next = requestQueue.shift();
  if (next) {
    next.resolve();
  }
}

/**
 * Smart fetch with deduplication and rate limiting
 * 
 * @param endpoint - API endpoint path (e.g., '/myprofile')
 * @param token - EzyGo access token
 * @param method - HTTP method (default: 'GET')
 * @param body - Request body for POST requests
 * @returns Promise with API response data
 */
export function fetchEzygoData<T>(
  endpoint: string,
  token: string,
  method: 'GET' | 'POST' = 'GET',
  body?: Record<string, unknown> | unknown[] | null,
  extraHeaders?: Record<string, string>
): Promise<T> {
  // Normalize endpoint for consistent cache key (remove leading slashes)
  const normalizedEndpoint = endpoint.replace(/^\/+/, '');
  
  // Create a secure cache key by hashing the token and serialized body separately
  // and concatenating those hashes with the HTTP method and normalized endpoint.
  // This uses full SHA-256 hashes (64 hex chars) to reduce cross-user collision risk
  // and keeps raw tokens/bodies out of long-lived cache key / LRU structures, while
  // still using serializedBody transiently for the request. Explicitly encode body
  // presence to distinguish undefined from {} or other falsy values.
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const serializedBody = body !== undefined ? JSON.stringify(body) : undefined;
  const bodyHash = serializedBody 
    ? createHash('sha256').update(serializedBody).digest('hex')
    : '__SENTINEL_NO_BODY_VALUE__';
  const cacheKey = `${method}:${tokenHash}:${normalizedEndpoint}:${bodyHash}`;
  
  // Check if request is already in-flight
  const existingRequest = requestCache.get(cacheKey);
  if (existingRequest) {
    return existingRequest;
  }
  
  // Create a deferred promise that we control
  // This ensures we can set it in cache before any synchronous errors occur
  let resolveDeferred!: (value: T) => void;
  let rejectDeferred!: (error: Error) => void;
  const deferredPromise = new Promise<T>((resolve, reject) => {
    resolveDeferred = resolve;
    rejectDeferred = reject;
  });
  
  // Set the deferred promise in cache immediately
  // This ensures eviction works even if waitForSlot() throws synchronously
  requestCache.set(cacheKey, deferredPromise);
  
  // Execute the actual request asynchronously
  (async () => {
    // QueueFullError and QueueTimeoutError are thrown by waitForSlot()
    // They already extend NonBreakerError so they won't trip the circuit breaker
    // Initialize to -1 so releaseSlot() safely ignores it if waitForSlot() throws
    let slotGeneration: number = -1;
    try {
      slotGeneration = await waitForSlot();
    } catch (error) {
      // Queue errors (full/timeout) are transient - evict from cache to allow immediate retry
      // when queue has capacity again
      if (error instanceof QueueFullError || error instanceof QueueTimeoutError) {
        requestCache.delete(cacheKey);
      }
      rejectDeferred(error as Error);
      return;
    }
    
    try {
      // Validate that at least one egress target is configured before entering the
      // circuit breaker (avoids counting config errors as breaker failures).
      const hasAnyEgressTarget =
        !!process.env.NEXT_PUBLIC_BACKEND_URL?.trim() ||
        !!process.env.CF_PROXY_URL?.trim() ||
        !!process.env.AWS_SECONDARY_URL?.trim();
      if (!hasAnyEgressTarget) {
        throw new NonBreakerError(
          'No egress target configured: set NEXT_PUBLIC_BACKEND_URL, CF_PROXY_URL, or AWS_SECONDARY_URL'
        );
      }

      const result = await ezygoCircuitBreaker.execute(async () => {
        const fetchHeaders: Record<string, string> = {
          'Authorization': `Bearer ${token}`,
          ...(extraHeaders ?? {}),
        };

        // Only include Content-Type and body for POST requests with a body
        // to avoid runtime errors in Node/undici and make headers semantically correct
        if (method === 'POST' && serializedBody !== undefined) {
          fetchHeaders['Content-Type'] = 'application/json';
        }

        const { signal, cleanup } = createTimeoutSignal(15000); // 15 second timeout
        const fetchOptions: RequestInit = {
          method,
          headers: fetchHeaders,
          signal,
        };

        if (method === 'POST' && serializedBody !== undefined) {
          fetchOptions.body = serializedBody;
        }

        try {
          // egressFetch transparently fails over across CF → AWS → direct tiers on
          // 429 / 5xx retryable statuses, so a single call covers all egress tiers.
          const response = await egressFetch(endpoint, fetchOptions);

          if (!response.ok) {
            const errorMsg = `EzyGo API error: ${response.status} ${response.statusText}`;
            // All 4xx errors (client errors) except 429 shouldn't trip the circuit breaker
            // They indicate invalid request/token/permissions/resource, not API failure
            // Note: 429 (rate limit) is intentionally excluded as it indicates service degradation
            if (response.status >= 400 && response.status < 500 && response.status !== 429) {
              throw new NonBreakerError(errorMsg);
            }
            // 5xx errors (server errors) and 429 should trip the circuit breaker
            throw new Error(errorMsg);
          }

          const text = await response.text();
          try {
            // EzyGo endpoints usually return JSON, but some settings endpoints 
            // return plain strings (e.g. "even", "odd") which are not valid JSON.
            // We try to parse as JSON first, but fallback to raw text if it's a 
            // SyntaxError and the response was OK.
            return JSON.parse(text);
          } catch (err) {
            if (err instanceof SyntaxError && response.ok) {
              return text as unknown as T;
            }
            throw err;
          }
        } finally {
          cleanup();
        }
      });
      
      resolveDeferred(result);
    } catch (error) {
      // Only evict transient failures from cache to allow immediate retries
      // NonBreakerErrors (401/403/404 + config errors) represent permanent/config errors that shouldn't be retried
      if (!(error instanceof NonBreakerError)) {
        requestCache.delete(cacheKey);
      }
      rejectDeferred(error as Error);
    } finally {
      releaseSlot(slotGeneration);
      // Successful promises stay cached for remaining TTL to enable deduplication
    }
  })();
  
  return deferredPromise;
}

/**
 * Batch fetch dashboard data in parallel (courses and attendance)
 * Respects global rate limit but fetches concurrently when slots available
 * 
 * Note: Profile is fetched client-side via useProfile hook to avoid redundant SSR fetching
 * 
 * @param token - EzyGo access token
 * @returns Promise with courses and attendance data
 */
export async function fetchDashboardData(token: string) {
  // These run concurrently but respect the global rate limit
  // Note: Profile is not fetched here as DashboardClient fetches it directly via useProfile
  const [courses, attendance] = await Promise.all([
    fetchEzygoData('/institutionuser/courses/withusers', token).catch((error) => {
      logger.error('[EzyGo] Failed to fetch courses', {
        context: 'ezygo-batch-fetcher',
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }),
    fetchEzygoData('/attendancereports/student/detailed', token, 'POST', {}).catch((error) => {
      logger.error('[EzyGo] Failed to fetch attendance', {
        context: 'ezygo-batch-fetcher',
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    })
  ]);
  
  return { courses, attendance };
}

/**
 * Get current rate limiter stats (for monitoring/debugging)
 */
export function getRateLimiterStats() {
  return {
    activeRequests,
    queueLength: requestQueue.length,
    maxConcurrent: MAX_CONCURRENT,
    cacheSize: requestCache.size,
  };
}

/**
 * Invalidates all cached EzyGo requests for a specific user token.
 */
export function invalidateEzygoCacheForUser(token: string) {
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const iterableCache = requestCache as unknown as Iterable<
    [string, Promise<any>]
  >;

  for (const [key] of iterableCache) {
    if (key.includes(`:${tokenHash}:`)) {
      requestCache.delete(key);
    }
  }
}

/**
 * Reset rate limiter state (for testing only)
 * Clears all in-flight requests, queue, and cache
 * Cancels pending timeouts and rejects queued promises
 * Increments generation to invalidate any in-flight requests
 * @internal
 */
export function resetRateLimiterState() {
  // Increment generation to invalidate in-flight requests
  // This prevents stale requests from corrupting activeRequests when they complete
  generation++;
  
  // Reset active request counter
  activeRequests = 0;
  
  // Reject queued promises to prevent dangling handlers
  // Note: We don't need to explicitly clearTimeout here because the reject 
  // handler (defined in waitForSlot at line 120-123) already clears the timeout
  while (requestQueue.length > 0) {
    const item = requestQueue.shift()!;
    clearTimeout(item.timeoutId);
    item.reject(new Error('Rate limiter state reset'));
  }
  
  // Clear LRU cache
  requestCache.clear();
}
