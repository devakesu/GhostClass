import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ezygoCircuitBreaker, CircuitBreakerOpenError } from '../circuit-breaker';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    // Reset circuit breaker before each test
    ezygoCircuitBreaker.reset();
    vi.clearAllMocks();
  });

  describe('CLOSED state', () => {
    it('should allow requests to pass through when closed', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');
      const result = await ezygoCircuitBreaker.execute(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should reset failure count after successful request', async () => {
      const failFn = vi.fn().mockRejectedValue(new Error('fail'));
      const successFn = vi.fn().mockResolvedValue('success');
      
      // Fail once
      await expect(ezygoCircuitBreaker.execute(failFn)).rejects.toThrow('fail');
      
      // Succeed - should reset failure count
      await ezygoCircuitBreaker.execute(successFn);
      
      const status = ezygoCircuitBreaker.getStatus();
      expect(status.failures).toBe(0);
    });
  });

  describe('CLOSED -> OPEN transition', () => {
    it('should open circuit after failure threshold (3 failures)', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('fail'));
      
      // Fail 3 times to open circuit
      for (let i = 0; i < 3; i++) {
        await expect(ezygoCircuitBreaker.execute(mockFn)).rejects.toThrow('fail');
      }
      
      const status = ezygoCircuitBreaker.getStatus();
      expect(status.state).toBe('OPEN');
      expect(status.isOpen).toBe(true);
      expect(status.failures).toBe(3);
    });

    it('should not open circuit before threshold is reached', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('fail'));
      
      // Fail only 2 times
      for (let i = 0; i < 2; i++) {
        await expect(ezygoCircuitBreaker.execute(mockFn)).rejects.toThrow('fail');
      }
      
      const status = ezygoCircuitBreaker.getStatus();
      expect(status.state).toBe('CLOSED');
      expect(status.failures).toBe(2);
    });
  });

  describe('OPEN state', () => {
    beforeEach(async () => {
      // Open the circuit by failing 3 times
      const mockFn = vi.fn().mockRejectedValue(new Error('fail'));
      for (let i = 0; i < 3; i++) {
        await expect(ezygoCircuitBreaker.execute(mockFn)).rejects.toThrow('fail');
      }
    });

    it('should fail fast when circuit is open', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');
      
      await expect(ezygoCircuitBreaker.execute(mockFn)).rejects.toThrow(CircuitBreakerOpenError);
      
      // Function should not be called when circuit is open
      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should include retry time in error message', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');
      
      try {
        await ezygoCircuitBreaker.execute(mockFn);
        expect.fail('Should have thrown CircuitBreakerOpenError');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitBreakerOpenError);
        expect((error as Error).message).toMatch(/Retry in \d+s/);
      }
    });
  });

  describe('OPEN -> HALF_OPEN transition', () => {
    it('should transition to HALF_OPEN after reset timeout', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('fail'));
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(ezygoCircuitBreaker.execute(mockFn)).rejects.toThrow('fail');
      }
      
      expect(ezygoCircuitBreaker.getStatus().state).toBe('OPEN');
      
      // Set lastFailTime to 61 seconds ago to force transition
      (ezygoCircuitBreaker as any).lastFailTime = Date.now() - 61000;
      
      // Next request should transition to HALF_OPEN
      const successFn = vi.fn().mockResolvedValue('success');
      await ezygoCircuitBreaker.execute(successFn);
      
      // Should have transitioned through HALF_OPEN and might be CLOSED now
      const newStatus = ezygoCircuitBreaker.getStatus();
      expect(['HALF_OPEN', 'CLOSED']).toContain(newStatus.state);
    });
  });

  describe('HALF_OPEN state', () => {
    beforeEach(async () => {
      // Open the circuit and transition to HALF_OPEN
      const mockFn = vi.fn().mockRejectedValue(new Error('fail'));
      for (let i = 0; i < 3; i++) {
        await expect(ezygoCircuitBreaker.execute(mockFn)).rejects.toThrow();
      }
      
      // Force transition to HALF_OPEN by setting lastFailTime to past
      (ezygoCircuitBreaker as any).lastFailTime = Date.now() - 61000;
    });

    it('should limit concurrent requests in HALF_OPEN (max 2)', async () => {
      const slowFn = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('success'), 100))
      );
      
      // Start 3 concurrent requests
      const promises = [
        ezygoCircuitBreaker.execute(slowFn),
        ezygoCircuitBreaker.execute(slowFn),
        ezygoCircuitBreaker.execute(slowFn),
      ];
      
      // Third request should be rejected due to HALF_OPEN limit (max 2)
      const results = await Promise.allSettled(promises);
      
      const rejectedCount = results.filter(r => r.status === 'rejected').length;
      expect(rejectedCount).toBeGreaterThan(0);
      
      // At least one should be rejected with CircuitBreakerOpenError
      const hasCircuitBreakerError = results.some(
        r => r.status === 'rejected' && r.reason instanceof CircuitBreakerOpenError
      );
      expect(hasCircuitBreakerError).toBe(true);
    });

    it('should transition to CLOSED after enough successes (2)', async () => {
      const successFn = vi.fn().mockResolvedValue('success');
      
      // Execute 2 successful requests (halfOpenMaxRequests = 2)
      await ezygoCircuitBreaker.execute(successFn);
      await ezygoCircuitBreaker.execute(successFn);
      
      const status = ezygoCircuitBreaker.getStatus();
      expect(status.state).toBe('CLOSED');
      expect(status.failures).toBe(0);
    });

    it('should reopen circuit on failure in HALF_OPEN', async () => {
      const successFn = vi.fn().mockResolvedValue('success');
      const failFn = vi.fn().mockRejectedValue(new Error('fail'));
      
      // One success
      await ezygoCircuitBreaker.execute(successFn);
      
      // Then fail
      await expect(ezygoCircuitBreaker.execute(failFn)).rejects.toThrow('fail');
      
      const status = ezygoCircuitBreaker.getStatus();
      expect(status.state).toBe('OPEN');
    });
  });

  describe('getStatus', () => {
    it('should return current circuit breaker status', () => {
      const status = ezygoCircuitBreaker.getStatus();
      
      expect(status).toHaveProperty('state');
      expect(status).toHaveProperty('failures');
      expect(status).toHaveProperty('timeUntilReset');
      expect(status).toHaveProperty('successCount');
      expect(status).toHaveProperty('isOpen');
    });

    it('should reflect CLOSED state correctly', () => {
      const status = ezygoCircuitBreaker.getStatus();
      
      expect(status.state).toBe('CLOSED');
      expect(status.isOpen).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset circuit breaker to initial state', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('fail'));
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(ezygoCircuitBreaker.execute(mockFn)).rejects.toThrow();
      }
      
      expect(ezygoCircuitBreaker.getStatus().state).toBe('OPEN');
      
      // Reset
      ezygoCircuitBreaker.reset();
      
      const status = ezygoCircuitBreaker.getStatus();
      expect(status.state).toBe('CLOSED');
      expect(status.failures).toBe(0);
      expect(status.successCount).toBe(0);
    });
  });

  describe('NonBreakerError handling', () => {
    it('should not increment failure count for NonBreakerError', async () => {
      const { NonBreakerError } = await import('../circuit-breaker');
      const mockFn = vi.fn().mockRejectedValue(new NonBreakerError('Client error'));
      
      // Fail with NonBreakerError - should not count as failure
      await expect(ezygoCircuitBreaker.execute(mockFn)).rejects.toThrow('Client error');
      
      const status = ezygoCircuitBreaker.getStatus();
      expect(status.failures).toBe(0);
      expect(status.state).toBe('CLOSED');
    });

    it('should not open circuit with multiple NonBreakerErrors', async () => {
      const { NonBreakerError } = await import('../circuit-breaker');
      const mockFn = vi.fn().mockRejectedValue(new NonBreakerError('Client error'));
      
      // Fail 5 times with NonBreakerError - should not open circuit
      for (let i = 0; i < 5; i++) {
        await expect(ezygoCircuitBreaker.execute(mockFn)).rejects.toThrow('Client error');
      }
      
      const status = ezygoCircuitBreaker.getStatus();
      expect(status.failures).toBe(0);
      expect(status.state).toBe('CLOSED');
    });

    it('should allow HALF_OPEN to progress with NonBreakerError', async () => {
      const { NonBreakerError } = await import('../circuit-breaker');
      
      // Open the circuit
      const failFn = vi.fn().mockRejectedValue(new Error('Server error'));
      for (let i = 0; i < 3; i++) {
        await expect(ezygoCircuitBreaker.execute(failFn)).rejects.toThrow('Server error');
      }
      
      expect(ezygoCircuitBreaker.getStatus().state).toBe('OPEN');
      
      // Manually transition to HALF_OPEN by resetting the circuit
      ezygoCircuitBreaker.reset();
      ezygoCircuitBreaker['state'] = 'HALF_OPEN' as any;
      ezygoCircuitBreaker['halfOpenInFlight'] = 0;
      ezygoCircuitBreaker['successCount'] = 0;
      
      // Make request with NonBreakerError in HALF_OPEN - should count as success for bookkeeping
      const clientErrorFn = vi.fn().mockRejectedValue(new NonBreakerError('Auth error'));
      await expect(ezygoCircuitBreaker.execute(clientErrorFn)).rejects.toThrow('Auth error');
      
      // Should have incremented success count
      expect(ezygoCircuitBreaker.getStatus().successCount).toBe(1);
      
      // Make one more successful request to close the circuit
      const successFn = vi.fn().mockResolvedValue('success');
      await ezygoCircuitBreaker.execute(successFn);
      
      const status = ezygoCircuitBreaker.getStatus();
      expect(status.state).toBe('CLOSED');
    });

    it('should reset prior failures when NonBreakerError occurs in CLOSED', async () => {
      const { NonBreakerError } = await import('../circuit-breaker');
      
      // Fail twice with regular errors
      const failFn = vi.fn().mockRejectedValue(new Error('Server error'));
      await expect(ezygoCircuitBreaker.execute(failFn)).rejects.toThrow();
      await expect(ezygoCircuitBreaker.execute(failFn)).rejects.toThrow();
      
      expect(ezygoCircuitBreaker.getStatus().failures).toBe(2);
      
      // NonBreakerError should reset failure count
      const clientErrorFn = vi.fn().mockRejectedValue(new NonBreakerError('Client error'));
      await expect(ezygoCircuitBreaker.execute(clientErrorFn)).rejects.toThrow('Client error');
      
      const status = ezygoCircuitBreaker.getStatus();
      expect(status.failures).toBe(0);
      expect(status.state).toBe('CLOSED');
    });
  });
});
