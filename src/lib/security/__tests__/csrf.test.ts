import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  generateCsrfToken, 
  getCsrfToken, 
  setCsrfCookie, 
  validateCsrfToken, 
  initializeCsrfToken, 
  regenerateCsrfToken,
  removeCsrfToken 
} from '../csrf';
import { cookies } from 'next/headers';
import { redis } from '@/lib/redis';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({
  redis: {
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn(),
    del: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CSRF Security', () => {
  const mockCookieStore = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cookies).mockResolvedValue(mockCookieStore as any);
  });

  describe('generateCsrfToken', () => {
    it('generates a 64-character hex string', () => {
      const token = generateCsrfToken();
      expect(token).toHaveLength(64);
      expect(token).toMatch(/^[0-9a-f]+$/);
    });

    it('generates unique tokens', () => {
      const token1 = generateCsrfToken();
      const token2 = generateCsrfToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('getCsrfToken', () => {
    it('returns the token from cookies', async () => {
      mockCookieStore.get.mockReturnValue({ value: 'mock-token' });
      const token = await getCsrfToken();
      expect(token).toBe('mock-token');
    });

    it('returns null if cookie is missing', async () => {
      mockCookieStore.get.mockReturnValue(undefined);
      const token = await getCsrfToken();
      expect(token).toBe(null);
    });
  });

  describe('setCsrfCookie', () => {
    it('sets the cookie with correct parameters', async () => {
      await setCsrfCookie('new-token');
      expect(mockCookieStore.set).toHaveBeenCalledWith(expect.objectContaining({
        name: 'csrf_token',
        value: 'new-token',
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
      }));
    });
  });

  describe('validateCsrfToken', () => {
    it('returns true for matching tokens', async () => {
      mockCookieStore.get.mockReturnValue({ value: 'match' });
      const isValid = await validateCsrfToken('match');
      expect(isValid).toBe(true);
    });

    it('returns false for mismatched tokens', async () => {
      mockCookieStore.get.mockReturnValue({ value: 'a' });
      const isValid = await validateCsrfToken('b');
      expect(isValid).toBe(false);
    });

    it('handles different length tokens without throwing (timingSafeEqual)', async () => {
      mockCookieStore.get.mockReturnValue({ value: 'long-token' });
      const isValid = await validateCsrfToken('short');
      expect(isValid).toBe(false);
    });

    it('returns false if request token is missing', async () => {
      const isValid = await validateCsrfToken(null);
      expect(isValid).toBe(false);
    });

    it('returns false if cookie token is missing', async () => {
      mockCookieStore.get.mockReturnValue(undefined);
      const isValid = await validateCsrfToken('token');
      expect(isValid).toBe(false);
    });
  });

  describe('initializeCsrfToken', () => {
    it('reuses existing token if present', async () => {
      mockCookieStore.get.mockReturnValue({ value: 'existing' });
      const token = await initializeCsrfToken();
      expect(token).toBe('existing');
      expect(mockCookieStore.set).toHaveBeenCalledWith(expect.objectContaining({ value: 'existing' }));
    });

    it('generates new token if missing', async () => {
      mockCookieStore.get.mockReturnValue(undefined);
      const token = await initializeCsrfToken();
      expect(token).toHaveLength(64);
      expect(mockCookieStore.set).toHaveBeenCalled();
    });
    
    it('binds token to session in redis', async () => {
      mockCookieStore.get.mockImplementation((name) => {
          if (name === 'authjs.session-token') return { value: 'session-123' };
          return undefined;
      });
      const token = await initializeCsrfToken();
      expect(redis.set).toHaveBeenCalledWith(
        `csrf:token:${token}:session`,
        'session-123',
        expect.any(Object)
      );
    });
  });

  describe('regenerateCsrfToken', () => {
    it('always generates a new token', async () => {
      mockCookieStore.get.mockReturnValue({ value: 'old' });
      const token = await regenerateCsrfToken();
      expect(token).not.toBe('old');
      expect(mockCookieStore.set).toHaveBeenCalled();
    });
  });

  describe('removeCsrfToken', () => {
    it('deletes the cookie and redis binding', async () => {
      mockCookieStore.get.mockReturnValue({ value: 'token-to-remove' });
      await removeCsrfToken();
      expect(mockCookieStore.delete).toHaveBeenCalledWith('csrf_token');
      expect(redis.del).toHaveBeenCalledWith('csrf:token:token-to-remove:session');
    });
  });
});
