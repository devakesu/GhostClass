import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isMobileRequest, verifyAppCheckToken, withSecurity } from '../app-check';
import { getAppCheck } from '@/lib/firebase/admin';
import { verifyPlayIntegrity } from '@/lib/security/integrity';
import { verifyDeviceCheckToken } from '@/lib/security/device-check';
import { headers, cookies } from 'next/headers';
import { validateCsrfToken } from '@/lib/security/csrf';
import { decryptRequest, encryptResponse } from '@/lib/security/jwe';
import { Ratelimit } from '@upstash/ratelimit';
import { getClientIp } from '@/lib/utils.server';

// Create a stable mock result that we can control
const rateLimitMock = {
    success: true,
};

vi.mock('next/headers', () => ({
  headers: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  getAppCheck: vi.fn(),
}));

vi.mock('@/lib/security/integrity', () => ({
  verifyPlayIntegrity: vi.fn(),
}));

vi.mock('@/lib/security/device-check', () => ({
  verifyDeviceCheckToken: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    dev: vi.fn(),
  },
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

vi.mock('@/lib/security/csrf', () => ({
    validateCsrfToken: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({
    redis: {
        get: vi.fn(),
    },
}));

vi.mock('@/lib/security/jwe', () => ({
    decryptRequest: vi.fn(),
    encryptResponse: vi.fn(),
}));

vi.mock('@/lib/utils.server', () => ({
    getClientIp: vi.fn(),
}));

vi.mock('@upstash/ratelimit', () => {
    const RatelimitMock = vi.fn().mockImplementation(() => ({
        limit: vi.fn().mockImplementation(() => Promise.resolve(rateLimitMock)),
    }));
    (RatelimitMock as any).slidingWindow = vi.fn();
    return {
        Ratelimit: RatelimitMock,
    };
});

describe('app-check logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MOBILE_API_SECRET = 'test-secret';
    process.env.VITEST = 'true';
    process.env.DISABLE_SECURITY_BYPASS = 'false';
    process.env.FIREBASE_APP_ID_ANDROID = 'android-id';
    process.env.FIREBASE_APP_ID_IOS = 'ios-id';
    process.env.ENFORCE_APP_CHECK = 'false';
    
    vi.mocked(headers).mockResolvedValue(new Headers());
    vi.mocked(cookies).mockResolvedValue({
        get: vi.fn().mockReturnValue(null),
    } as any);
    
    // Reset rate limit to success by default
    rateLimitMock.success = true;
  });

  describe('isMobileRequest', () => {
    it('returns true for matching secret', () => {
      const h = new Headers();
      h.set('x-mobile-api-key', 'test-secret');
      expect(isMobileRequest(h)).toBe(true);
    });

    it('returns false for mismatched secret', () => {
      const h = new Headers();
      h.set('x-mobile-api-key', 'wrong');
      expect(isMobileRequest(h)).toBe(false);
    });
  });

  describe('verifyAppCheckToken', () => {
    const mockAppCheck = {
      verifyToken: vi.fn(),
    };

    beforeEach(() => {
      vi.mocked(getAppCheck).mockReturnValue(mockAppCheck as any);
    });

    it('returns isValid: true if no token and not enforced', async () => {
      vi.mocked(headers).mockResolvedValue(new Headers() as any);
      const result = await verifyAppCheckToken();
      expect(result.isValid).toBe(true);
    });

    it('verifies valid Android token with Play Integrity', async () => {
      const h = new Headers();
      h.set('X-Firebase-AppCheck', 'valid-token');
      h.set('X-Play-Integrity', 'integrity-token');
      vi.mocked(headers).mockResolvedValue(h as any);
      
      mockAppCheck.verifyToken.mockResolvedValue({ appId: 'android-id' });
      vi.mocked(verifyPlayIntegrity).mockResolvedValue({ isValid: true, verdict: { ok: true } } as any);

      const result = await verifyAppCheckToken();
      expect(result.isValid).toBe(true);
    });
  });

  describe('withSecurity', () => {
    const mockHandler = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    
    it('authenticates web request via CSRF', async () => {
        process.env.DISABLE_SECURITY_BYPASS = 'true';
        const req = new Request('https://test.com', {
            headers: { 'x-csrf-token': 'valid-csrf' }
        });
        vi.mocked(validateCsrfToken).mockResolvedValue(true);
        vi.mocked(headers).mockResolvedValue(new Headers({ 'x-csrf-token': 'valid-csrf' }));
        
        const wrapped = withSecurity(mockHandler);
        const res = await wrapped(req, { params: {} });
        
        expect(res.status).toBe(200);
    });

    it('handles JWE decryption for mobile requests', async () => {
        const h = new Headers();
        h.set('X-Firebase-AppCheck', 'valid-token');
        h.set('Content-Type', 'application/jose');
        
        const req = new Request('https://test.com', {
            method: 'POST',
            headers: h,
            body: 'part1.part2.part3.part4.part5'
        });

        const mockAppCheck = { verifyToken: vi.fn().mockResolvedValue({ appId: 'android-id' }) };
        vi.mocked(getAppCheck).mockReturnValue(mockAppCheck as any);
        vi.mocked(decryptRequest).mockResolvedValue({ payload: { data: 'secret' }, rcek: 'cek' });
        vi.mocked(headers).mockResolvedValue(h as any);

        const wrapped = withSecurity(mockHandler);
        const res = await wrapped(req, { params: {} });
        
        expect(res.status).toBe(200);
    });

/*
    it('enforces rate limiting for web requests', async () => {
        // Trigger rate limit failure
        rateLimitMock.success = false;

        const h = new Headers();
        h.set('x-csrf-token', 'valid');
        vi.mocked(validateCsrfToken).mockResolvedValue(true);
        const req = new Request('https://test.com', { headers: h });
        
        vi.mocked(getClientIp).mockReturnValue('127.0.0.1');
        vi.mocked(headers).mockResolvedValue(new Headers({ 'x-forwarded-for': '127.0.0.1' }));

        const wrapped = withSecurity(mockHandler);
        const res = await wrapped(req, { params: {} });
        
        expect(res.status).toBe(429);
    });
*/
  });
});
