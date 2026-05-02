import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NonBreakerError } from '../circuit-breaker';
import { 
  fetchEzygoData, 
  resetRateLimiterState, 
  getRateLimiterStats, 
  invalidateEzygoCacheForUser, 
  QueueFullError, 
  QueueTimeoutError,
  fetchDashboardData
} from '../ezygo-batch-fetcher';
import { egressFetch } from '../utils.server';

vi.mock('server-only', () => ({}));
vi.mock('../utils.server', () => ({
  egressFetch: vi.fn(),
}));

// Mock logger to avoid console noise
vi.mock('../logger', () => ({
  logger: {
    dev: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ezygo-batch-fetcher', () => {
  beforeEach(() => {
    vi.resetModules();
    resetRateLimiterState();
    vi.useFakeTimers();
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'https://api.ezygo.com');
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetRateLimiterState();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('fetches data successfully', async () => {
    const mockResponse = {
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ data: 'ok' })),
    };
    (egressFetch as any).mockResolvedValue(mockResponse);

    const result = await fetchEzygoData('/test', 'token');
    expect(result).toEqual({ data: 'ok' });
    expect(egressFetch).toHaveBeenCalledWith('/test', expect.anything());
  });

  it('deduplicates identical in-flight requests', async () => {
    let resolveResponse: any;
    const mockResponsePromise = new Promise(resolve => {
      resolveResponse = resolve;
    });
    
    (egressFetch as any).mockReturnValue(mockResponsePromise);

    const p1 = fetchEzygoData('/test', 'token');
    const p2 = fetchEzygoData('/test', 'token');
    
    expect(p1).toBe(p2); // Same promise instance
    
    resolveResponse({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ data: 'ok' })),
    });
    
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual({ data: 'ok' });
    expect(r2).toEqual({ data: 'ok' });
    expect(egressFetch).toHaveBeenCalledTimes(1);
  });

  it('respects MAX_CONCURRENT limit and queues requests', async () => {
    const resolvers: any[] = [];
    (egressFetch as any).mockImplementation(() => new Promise(resolve => {
      resolvers.push(resolve);
    }));

    // Start 3 requests (MAX_CONCURRENT)
    const p1 = fetchEzygoData('/1', 'token').catch(() => {});
    const p2 = fetchEzygoData('/2', 'token').catch(() => {});
    const p3 = fetchEzygoData('/3', 'token').catch(() => {});
    
    // Wait for them to reach egressFetch
    await vi.waitFor(() => expect(resolvers.length).toBe(3));

    expect(getRateLimiterStats().activeRequests).toBe(3);
    expect(getRateLimiterStats().queueLength).toBe(0);

    // 4th request should be queued (won't reach egressFetch yet)
    const p4 = fetchEzygoData('/4', 'token');
    expect(getRateLimiterStats().activeRequests).toBe(3);
    expect(getRateLimiterStats().queueLength).toBe(1);
    expect(resolvers.length).toBe(3);

    // Resolve first request
    resolvers[0]({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ data: '1' })),
    });
    
    await p1;
    
    // Now p4 should be active and reach egressFetch
    await vi.waitFor(() => expect(resolvers.length).toBe(4));
    expect(getRateLimiterStats().activeRequests).toBe(3);
    expect(getRateLimiterStats().queueLength).toBe(0);
    
    // Cleanup
    resolvers.forEach(r => {
      if (typeof r === 'function') {
        r({ ok: true, text: () => Promise.resolve('{}') });
      }
    });
    await Promise.all([p2, p3, p4]);
  });

  it('throws QueueFullError if queue is too long', async () => {
    (egressFetch as any).mockReturnValue(new Promise(() => {}));
    
    const promises: Promise<any>[] = [];
    // Occupy all slots (3)
    promises.push(fetchEzygoData('/1', 'token').catch(() => {}));
    promises.push(fetchEzygoData('/2', 'token').catch(() => {}));
    promises.push(fetchEzygoData('/3', 'token').catch(() => {}));
    
    // Fill queue (100)
    for (let i = 0; i < 100; i++) {
      promises.push(fetchEzygoData(`/q${i}`, 'token').catch(() => {}));
    }
    
    expect(getRateLimiterStats().queueLength).toBe(100);
    
    // 101st queued request should throw
    await expect(fetchEzygoData('/full', 'token')).rejects.toThrow(QueueFullError);
  });

  it('throws QueueTimeoutError if request waits too long', async () => {
    (egressFetch as any).mockReturnValue(new Promise(() => {}));
    
    // Occupy all slots
    fetchEzygoData('/1', 'token').catch(() => {});
    fetchEzygoData('/2', 'token').catch(() => {});
    fetchEzygoData('/3', 'token').catch(() => {});
    
    const pQueued = fetchEzygoData('/queued', 'token');
    
    // Create the expectation before advancing timers
    const rejection = expect(pQueued).rejects.toThrow(QueueTimeoutError);
    
    // Advance time by 31 seconds
    await vi.advanceTimersByTimeAsync(31000);
    
    await rejection;
  });

  it('evicts from cache on transient failure', async () => {
    (egressFetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(fetchEzygoData('/fail', 'token')).rejects.toThrow('EzyGo API error');
    
    // Should be able to retry immediately (not cached)
    (egressFetch as any).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('{"retried":true}'),
    });
    
    const result = await fetchEzygoData('/fail', 'token');
    expect(result).toEqual({ retried: true });
  });

  it('does NOT evict from cache on NonBreakerError', async () => {
    (egressFetch as any).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(fetchEzygoData('/404', 'token')).rejects.toThrow(NonBreakerError);
    
    // Subsequent calls for same key should return the SAME rejected promise
    const p2 = fetchEzygoData('/404', 'token');
    await expect(p2).rejects.toThrow(NonBreakerError);
    
    expect(egressFetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to raw text if JSON parse fails', async () => {
    (egressFetch as any).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('even'),
    });

    const result = await fetchEzygoData('/settings', 'token');
    expect(result).toBe('even');
  });

  it('invalidates cache for specific user', async () => {
    (egressFetch as any).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('{}'),
    });

    const p1 = fetchEzygoData('/data', 'token1');
    const p2 = fetchEzygoData('/data', 'token2');
    await Promise.all([p1, p2]);
    
    expect(getRateLimiterStats().cacheSize).toBe(2);
    
    invalidateEzygoCacheForUser('token1');
    expect(getRateLimiterStats().cacheSize).toBe(1);
  });

  it('fetchDashboardData fetches courses and attendance', async () => {
    (egressFetch as any).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('{}'),
    });

    const result = await fetchDashboardData('token');
    expect(result).toHaveProperty('courses');
    expect(result).toHaveProperty('attendance');
    expect(egressFetch).toHaveBeenCalledTimes(2);
  });

  it('throws if no egress target is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', '');
    vi.stubEnv('CF_PROXY_URL', '');
    vi.stubEnv('AWS_SECONDARY_URL', '');
    
    await expect(fetchEzygoData('/test', 'token')).rejects.toThrow('No egress target configured');
  });

  it('uses POST method and body correctly', async () => {
    (egressFetch as any).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('{}'),
    });

    await fetchEzygoData('/post', 'token', 'POST', { key: 'val' });
    
    expect(egressFetch).toHaveBeenCalledWith('/post', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ key: 'val' }),
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
      }),
    }));
  });

  it('handles fallback AbortSignal timeout', async () => {
    // Force fallback by removing AbortSignal.timeout
    const originalTimeout = (AbortSignal as any).timeout;
    (AbortSignal as any).timeout = undefined;
    
    vi.useFakeTimers();
    
    (egressFetch as any).mockImplementation((_url: string, options: any) => {
      return new Promise((_resolve, reject) => {
        if (options.signal.aborted) {
          reject(new Error('Aborted'));
          return;
        }
        options.signal.addEventListener('abort', () => {
          reject(new Error('Aborted'));
        });
      });
    });

    const p = fetchEzygoData('/test-fallback', 'token');
    
    // Create the expectation before advancing timers
    const rejection = expect(p).rejects.toThrow('Aborted');
    
    // Advance time to trigger the 15s timeout
    await vi.advanceTimersByTimeAsync(15100);
    
    await rejection;
    
    vi.useRealTimers();
    // Restore
    (AbortSignal as any).timeout = originalTimeout;
  });

  it('handles native AbortSignal timeout', async () => {
    // Ensure native AbortSignal.timeout is available
    if (typeof AbortSignal.timeout !== 'function') {
      return;
    }

    const originalTimeout = AbortSignal.timeout;
    const controller = new AbortController();
    (AbortSignal as any).timeout = vi.fn().mockReturnValue(controller.signal);

    (egressFetch as any).mockImplementation((_url: string, options: any) => {
      return new Promise((_resolve, reject) => {
        if (options.signal.aborted) {
          reject(new Error('Aborted'));
          return;
        }
        options.signal.addEventListener('abort', () => {
          reject(new Error('Aborted'));
        });
      });
    });

    const p = fetchEzygoData('/test-native', 'token');
    
    // Manually abort the signal to simulate timeout
    controller.abort();
    
    await expect(p).rejects.toThrow('Aborted');
    expect(AbortSignal.timeout).toHaveBeenCalledWith(15000);
    
    (AbortSignal as any).timeout = originalTimeout;
  });

  it('ignores releaseSlot from prior generations', async () => {
    // This is hard to test directly because releaseSlot is internal
    // but we can trigger it via resetRateLimiterState
    const resolvers: any[] = [];
    (egressFetch as any).mockImplementation(() => new Promise(resolve => {
      resolvers.push(resolve);
    }));

    const p1 = fetchEzygoData('/1', 'token');
    await vi.waitFor(() => expect(resolvers.length).toBe(1));
    
    // Reset state while request is in-flight
    resetRateLimiterState();
    
    // Request finishes from OLD generation
    resolvers[0]({ ok: true, text: () => Promise.resolve('{}') });
    
    // This should NOT crash and should NOT affect new state
    await p1.catch(() => {});
    expect(getRateLimiterStats().activeRequests).toBe(0);
  });

  it('throws non-SyntaxError from JSON.parse', async () => {
    (egressFetch as any).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('not-json'),
    });

    const spy = vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
      throw new TypeError('Mock TypeError');
    });

    await expect(fetchEzygoData('/test', 'token')).rejects.toThrow('Mock TypeError');
    spy.mockRestore();
  });

  it('fetchDashboardData handles failures for courses', async () => {
    (egressFetch as any).mockImplementation((url: string) => {
      if (url === '/institutionuser/courses/withusers') {
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Server Error'
        });
      }
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ data: 'ok' }))
      });
    });

    const result = await fetchDashboardData('token');
    expect(result.courses).toBeNull();
    expect(result.attendance).toEqual({ data: 'ok' });
  });

  it('fetchDashboardData handles string errors', async () => {
    (egressFetch as any).mockImplementation(() => {
      return Promise.reject('String error');
    });

    const result = await fetchDashboardData('token');
    expect(result.courses).toBeNull();
    expect(result.attendance).toBeNull();
  });

  it('fetchDashboardData handles Error objects', async () => {
    (egressFetch as any).mockImplementation((url: string) => {
      return Promise.reject(new Error(`Error for ${url}`));
    });

    const result = await fetchDashboardData('token');
    expect(result.courses).toBeNull();
    expect(result.attendance).toBeNull();
  });

  it('invalidateEzygoCacheForUser handles non-matching tokens', async () => {
    fetchEzygoData('/test', 'token1').catch(() => {});
    invalidateEzygoCacheForUser('token2'); // Should not remove token1's entry
    expect(getRateLimiterStats().cacheSize).toBeGreaterThan(0);
  });

  it('getRateLimiterStats returns correct values', () => {
    resetRateLimiterState();
    const stats = getRateLimiterStats();
    expect(stats.activeRequests).toBe(0);
    expect(stats.queueLength).toBe(0);
    expect(stats.maxConcurrent).toBe(3);
  });
});
