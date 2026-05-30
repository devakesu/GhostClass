import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.unmock('../circuit-breaker');

import { ezygoCircuitBreaker, CircuitBreakerOpenError, NonBreakerError, UpstreamServerError } from '../circuit-breaker';
import * as Sentry from '@sentry/nextjs';

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
}));

describe('CircuitBreaker', () => {
  beforeEach(async () => {
    await ezygoCircuitBreaker.reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests when CLOSED', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await ezygoCircuitBreaker.execute(fn);
    expect(result).toBe('success');
    expect((await ezygoCircuitBreaker.getStatus()).state).toBe('CLOSED');
  });

  it('increments failures and opens after threshold', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    
    // 1st failure
    await expect(ezygoCircuitBreaker.execute(fn)).rejects.toThrow('fail');
    expect((await ezygoCircuitBreaker.getStatus()).failures).toBe(1);
    
    // 2nd failure
    await expect(ezygoCircuitBreaker.execute(fn)).rejects.toThrow('fail');
    expect((await ezygoCircuitBreaker.getStatus()).failures).toBe(2);
    
    // 3rd failure - should open
    await expect(ezygoCircuitBreaker.execute(fn)).rejects.toThrow('fail');
    expect((await ezygoCircuitBreaker.getStatus()).state).toBe('OPEN');
    expect(Sentry.captureMessage).toHaveBeenCalled();
  });

  it('fails fast when OPEN', async () => {
    // Open the circuit
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await expect(ezygoCircuitBreaker.execute(fn)).rejects.toThrow();
    }
    
    expect((await ezygoCircuitBreaker.getStatus()).state).toBe('OPEN');
    
    // Next request should fail fast
    const fn2 = vi.fn();
    await expect(ezygoCircuitBreaker.execute(fn2)).rejects.toThrow(CircuitBreakerOpenError);
    expect(fn2).not.toHaveBeenCalled();
  });

  it('transitions to HALF_OPEN after timeout', async () => {
    // Open the circuit
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await expect(ezygoCircuitBreaker.execute(fn)).rejects.toThrow();
    }
    
    // Advance time by 61 seconds
    vi.advanceTimersByTime(61000);
    
    const fn2 = vi.fn().mockResolvedValue('half-open-success');
    const result = await ezygoCircuitBreaker.execute(fn2);
    expect(result).toBe('half-open-success');
    expect((await ezygoCircuitBreaker.getStatus()).state).toBe('HALF_OPEN');
  });

  it('closes after enough successes in HALF_OPEN', async () => {
    // Open and wait
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await expect(ezygoCircuitBreaker.execute(fn)).rejects.toThrow();
    }
    vi.advanceTimersByTime(61000);
    
    // 1st success in HALF_OPEN
    await ezygoCircuitBreaker.execute(() => Promise.resolve('ok'));
    expect((await ezygoCircuitBreaker.getStatus()).state).toBe('HALF_OPEN');
    expect((await ezygoCircuitBreaker.getStatus()).successCount).toBe(1);
    
    // 2nd success in HALF_OPEN - should close
    await ezygoCircuitBreaker.execute(() => Promise.resolve('ok'));
    expect((await ezygoCircuitBreaker.getStatus()).state).toBe('CLOSED');
    expect((await ezygoCircuitBreaker.getStatus()).failures).toBe(0);
  });

  it('reopens if a request fails in HALF_OPEN', async () => {
    // Open and wait
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await expect(ezygoCircuitBreaker.execute(fn)).rejects.toThrow();
    }
    vi.advanceTimersByTime(61000);
    
    // Failure in HALF_OPEN
    const fnFail = vi.fn().mockRejectedValue(new Error('still failing'));
    await expect(ezygoCircuitBreaker.execute(fnFail)).rejects.toThrow('still failing');
    expect((await ezygoCircuitBreaker.getStatus()).state).toBe('OPEN');
  });

  it('limits concurrent requests in HALF_OPEN', async () => {
    // Open and wait
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await expect(ezygoCircuitBreaker.execute(fn)).rejects.toThrow();
    }
    vi.advanceTimersByTime(61000);
    
    // Mock a slow request
    let resolve1: any;
    const p1 = ezygoCircuitBreaker.execute(() => new Promise(r => resolve1 = r));
    
    let resolve2: any;
    const p2 = ezygoCircuitBreaker.execute(() => new Promise(r => resolve2 = r));
    
    // 3rd request should be rejected
    await expect(ezygoCircuitBreaker.execute(() => Promise.resolve('ok'))).rejects.toThrow('Circuit breaker is testing recovery');
    
    resolve1('ok');
    resolve2('ok');
    await p1;
    await p2;
  });

  it('NonBreakerError does not trip the circuit', async () => {
    const fn = vi.fn().mockRejectedValue(new NonBreakerError('404 Not Found'));
    
    await expect(ezygoCircuitBreaker.execute(fn)).rejects.toThrow(NonBreakerError);
    expect((await ezygoCircuitBreaker.getStatus()).failures).toBe(0);
    expect((await ezygoCircuitBreaker.getStatus()).state).toBe('CLOSED');
  });

  it('NonBreakerError counts as success in HALF_OPEN', async () => {
    // Open and wait
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await expect(ezygoCircuitBreaker.execute(fn)).rejects.toThrow();
    }
    vi.advanceTimersByTime(61000);
    
    // NonBreakerError in HALF_OPEN
    const fn404 = vi.fn().mockRejectedValue(new NonBreakerError('404'));
    await expect(ezygoCircuitBreaker.execute(fn404)).rejects.toThrow(NonBreakerError);
    expect((await ezygoCircuitBreaker.getStatus()).successCount).toBe(1);
  });

  it('UpstreamServerError carries status and body', () => {
    const error = new UpstreamServerError('Server Error', 502, 'Bad Gateway', 'Error Body');
    expect(error.status).toBe(502);
    expect(error.body).toBe('Error Body');
  });

  it('resets failures on success in CLOSED state', async () => {
    const fnFail = vi.fn().mockRejectedValue(new Error('fail'));
    await expect(ezygoCircuitBreaker.execute(fnFail)).rejects.toThrow();
    expect((await ezygoCircuitBreaker.getStatus()).failures).toBe(1);
    
    await ezygoCircuitBreaker.execute(() => Promise.resolve('ok'));
    expect((await ezygoCircuitBreaker.getStatus()).failures).toBe(0);
  });

  it('handles success when failures are already 0', async () => {
    await ezygoCircuitBreaker.execute(() => Promise.resolve('ok'));
    expect((await ezygoCircuitBreaker.getStatus()).failures).toBe(0);
  });

  it('handles non-Error failures', async () => {
    await expect(ezygoCircuitBreaker.execute(() => Promise.reject('string error'))).rejects.toBe('string error');
    expect((await ezygoCircuitBreaker.getStatus()).failures).toBe(1);
  });
});
