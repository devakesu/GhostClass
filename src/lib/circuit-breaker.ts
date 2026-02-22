/**
 * Circuit Breaker Pattern Implementation
 * 
 * Protects the application from cascading failures when the EzyGo API is down
 * or experiencing issues. Uses three states:
 * 
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: API is failing, reject requests immediately (fail fast)
 * - HALF_OPEN: Testing if API has recovered
 * 
 * Configuration:
 * - Opens after 3 consecutive failures
 * - Stays open for 60 seconds before attempting recovery
 * - Tests with 2 requests before closing
 * 
 * ⚠️ DEPLOYMENT NOTE — IN-MEMORY STATE:
 * This implementation stores state in the Node.js module singleton (in-memory).
 * It works correctly for the current Docker-based deployment (`output: "standalone"`)
 * where a single persistent Node.js process handles all requests.
 * 
 * If the app is ever deployed to a multi-instance or serverless platform (e.g., Vercel,
 * AWS Lambda, Kubernetes with >1 replica), each instance will have its own independent
 * circuit-breaker state, making the protection ineffective across instances.
 * In that scenario, circuit-breaker state should be migrated to Redis (which is already
 * available via `@/lib/redis`) using atomic INCR/SET operations.
 */

import * as Sentry from '@sentry/nextjs';
import { logger } from './logger';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Custom error thrown when circuit breaker is open
 */
export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

/**
 * Error that should not trigger circuit breaker (e.g., 4xx client errors)
 */
export class NonBreakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonBreakerError';
  }
}

/**
 * Error for upstream 5xx responses that should trip the circuit breaker
 * Carries response details so they can be properly proxied to the client
 */
export class UpstreamServerError extends Error {
  constructor(
    message: string,
    public status: number,
    public statusText: string,
    public body: string,
    public headers?: Headers
  ) {
    super(message);
    this.name = 'UpstreamServerError';
  }
}

class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private lastFailTime = 0;
  private successCount = 0;
  private halfOpenInFlight = 0;
  
  // Conservative thresholds for single-IP deployment
  // Opens circuit after just 3 failures to protect against extended outages
  private readonly failureThreshold = 3; // Lower threshold for faster protection
  private readonly resetTimeout = 60000; // 60 seconds - longer wait for recovery
  private readonly halfOpenMaxRequests = 2; // Test with fewer requests
  
  /**
   * Execute a function with circuit breaker protection
   * 
   * @param fn - Async function to execute
   * @returns Result of the function
   * @throws Error if circuit is open or function fails
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check circuit state
    if (this.state === 'OPEN') {
      const now = Date.now();
      const timeSinceFailure = now - this.lastFailTime;
      
      // Try to close after timeout
      if (timeSinceFailure > this.resetTimeout) {
        logger.dev('[Circuit Breaker] Transitioning to HALF_OPEN', {
          context: 'circuit-breaker',
          timeSinceFailure,
        });
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        this.halfOpenInFlight = 0;
      } else {
        const timeRemaining = Math.ceil((this.resetTimeout - timeSinceFailure) / 1000);
        logger.warn('[Circuit Breaker] Circuit is OPEN - failing fast', {
          context: 'circuit-breaker',
          failures: this.failures,
          timeRemaining: `${timeRemaining}s`,
        });
        throw new CircuitBreakerOpenError(
          `Circuit breaker is open - EzyGo API may be experiencing issues. Retry in ${timeRemaining}s.`
        );
      }
    }
    
    // In HALF_OPEN state, only allow limited concurrent requests through
    if (this.state === 'HALF_OPEN') {
      if (this.halfOpenInFlight >= this.halfOpenMaxRequests) {
        logger.warn('[Circuit Breaker] HALF_OPEN request limit reached - rejecting request', {
          context: 'circuit-breaker',
          halfOpenInFlight: this.halfOpenInFlight,
          maxRequests: this.halfOpenMaxRequests,
        });
        throw new CircuitBreakerOpenError(
          'Circuit breaker is testing recovery - please try again shortly.'
        );
      }
      this.halfOpenInFlight++;
    }

    // Capture whether this request consumed a HALF_OPEN slot before entering the
    // try block. The finally block must use this snapshot — not this.state — because
    // onSuccess() may have already transitioned the breaker to CLOSED by the time
    // finally runs, which would cause the CLOSED-state branch to double-decrement.
    const wasHalfOpen = this.state === 'HALF_OPEN';

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      // Don't count NonBreakerError (4xx client errors) as breaker failures
      // Treat them as "success" for breaker bookkeeping so HALF_OPEN can progress
      // and prior failures can be cleared (even in CLOSED state)
      // Note: This should only execute in HALF_OPEN/CLOSED, never in OPEN state
      if (error instanceof NonBreakerError) {
        if (this.state === 'HALF_OPEN' || this.failures > 0) {
          this.onSuccess();
        }
        throw error;
      }
      this.onFailure(error);
      throw error;
    } finally {
      // Release HALF_OPEN slot only if this request actually claimed one.
      // Using the wasHalfOpen snapshot avoids double-decrement when onSuccess()
      // transitions the breaker to CLOSED before finally executes.
      if (wasHalfOpen) {
        this.halfOpenInFlight = Math.max(0, this.halfOpenInFlight - 1);
      }
    }
  }
  
  /**
   * Handle successful request
   */
  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      logger.dev(`[Circuit Breaker] Success in HALF_OPEN (${this.successCount}/${this.halfOpenMaxRequests})`, {
        context: 'circuit-breaker',
      });
      
      // After successful requests in half-open, close the circuit
      if (this.successCount >= this.halfOpenMaxRequests) {
        logger.dev('[Circuit Breaker] Transitioning to CLOSED - API recovered', {
          context: 'circuit-breaker',
        });
        this.state = 'CLOSED';
        this.failures = 0;
        this.successCount = 0;
        this.halfOpenInFlight = 0;
      }
    } else if (this.state === 'CLOSED') {
      // Reset failure count on success
      if (this.failures > 0) {
        logger.dev('[Circuit Breaker] Resetting failure count', {
          context: 'circuit-breaker',
          previousFailures: this.failures,
        });
        this.failures = 0;
      }
    }
  }
  
  /**
   * Handle failed request
   */
  private onFailure(error: unknown): void {
    this.failures++;
    this.lastFailTime = Date.now();
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (this.state === 'HALF_OPEN') {
      logger.warn('[Circuit Breaker] Failure in HALF_OPEN - reopening circuit', {
        context: 'circuit-breaker',
        error: errorMessage,
      });
      this.state = 'OPEN';
      this.successCount = 0;
      this.halfOpenInFlight = 0;
    } else if (this.failures >= this.failureThreshold) {
      logger.error('[Circuit Breaker] Threshold reached - opening circuit', {
        context: 'circuit-breaker',
        failures: this.failures,
        threshold: this.failureThreshold,
        error: errorMessage,
      });
      Sentry.captureMessage('[Circuit Breaker] Circuit opened — EzyGo API failures exceeded threshold', {
        level: 'error',
        extra: {
          failures: this.failures,
          threshold: this.failureThreshold,
          error: errorMessage,
        },
      });
      this.state = 'OPEN';
      this.halfOpenInFlight = 0;
    } else {
      logger.warn('[Circuit Breaker] Request failed', {
        context: 'circuit-breaker',
        failures: this.failures,
        threshold: this.failureThreshold,
        error: errorMessage,
      });
    }
  }
  
  /**
   * Get current circuit breaker status (for monitoring).
   *
   * Raw lastFailTime (Unix ms) is omitted — it would leak information about
   * when EzyGo last failed if this object is ever surfaced via a health endpoint.
   * timeUntilReset is the only operationally useful derivative and carries no
   * additional timing information beyond what the client already knows.
   */
  getStatus() {
    const timeUntilReset =
      this.state === 'OPEN'
        ? Math.max(0, Math.ceil((this.resetTimeout - (Date.now() - this.lastFailTime)) / 1000))
        : 0;
    return {
      state: this.state,
      failures: this.failures,
      timeUntilReset,
      successCount: this.successCount,
      isOpen: this.state === 'OPEN',
    };
  }
  
  /**
   * Manually reset the circuit breaker (for testing/admin purposes)
   */
  reset(): void {
    logger.dev('[Circuit Breaker] Manual reset', {
      context: 'circuit-breaker',
    });
    this.state = 'CLOSED';
    this.failures = 0;
    this.lastFailTime = 0;
    this.successCount = 0;
    this.halfOpenInFlight = 0;
  }
}

// Export singleton instance
export const ezygoCircuitBreaker = new CircuitBreaker();
