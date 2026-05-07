import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyAppCheckToken, withSecurity } from '../app-check';
import { getAppCheck } from '@/lib/firebase/admin';
import { verifyPlayIntegrity } from '@/lib/security/integrity';
import { verifyDeviceCheckToken } from '@/lib/security/device-check';
import { headers, cookies } from 'next/headers';
import { validateCsrfToken } from '@/lib/security/csrf';
import { decryptRequest, encryptResponse } from '@/lib/security/jwe';

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

  describe('verifyAppCheckToken iOS', () => {
    const mockAppCheck = { verifyToken: vi.fn() };
    beforeEach(() => {
      vi.mocked(getAppCheck).mockReturnValue(mockAppCheck as any);
    });

    it('verifies valid iOS token with DeviceCheck', async () => {
      const h = new Headers();
      h.set('X-Firebase-AppCheck', 'valid-token');
      h.set('X-Device-Check', 'device-token');
      h.set('X-Device-Check-Nonce', 'nonce');
      vi.mocked(headers).mockResolvedValue(h as any);
      
      mockAppCheck.verifyToken.mockResolvedValue({ appId: 'ios-id' });
      vi.mocked(verifyDeviceCheckToken).mockResolvedValue({ isValid: true, verdict: { ok: true } } as any);

      const result = await verifyAppCheckToken();
      expect(result.isValid).toBe(true);
    });

    it('fails if iOS DeviceCheck is enforced but missing', async () => {
      process.env.ENFORCE_DEVICE_CHECK = 'true';
      const h = new Headers();
      h.set('X-Firebase-AppCheck', 'valid-token');
      vi.mocked(headers).mockResolvedValue(h as any);
      
      mockAppCheck.verifyToken.mockResolvedValue({ appId: 'ios-id' });

      const result = await verifyAppCheckToken();
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Missing mandatory device check');
    });
  });

  describe('CSRF Session Binding', () => {
    it('fails if CSRF is bound to a different session', async () => {
        process.env.DISABLE_SECURITY_BYPASS = 'true';
        const h = new Headers({ 'x-csrf-token': 'token123' });
        vi.mocked(headers).mockResolvedValue(h);
        vi.mocked(cookies).mockResolvedValue({
            get: vi.fn().mockReturnValue({ value: 'session-actual' }),
        } as any);
        vi.mocked(validateCsrfToken).mockResolvedValue(true);
        const { redis } = await import('@/lib/redis');
        vi.mocked(redis.get).mockResolvedValue('session-expected');

        const wrapped = withSecurity(vi.fn().mockResolvedValue(new Response('ok')));
        const req = new Request('https://test.com', { headers: h });
        const res = await wrapped(req, { params: {} });

        expect(res.status).toBe(403);
    });
  });

  describe('Bypass and Cron', () => {
    it('bypasses for Cron requests with valid secret', async () => {
        process.env.CRON_SECRET = 'cron-secret';
        const h = new Headers({ 'authorization': 'Bearer cron-secret' });
        vi.mocked(headers).mockResolvedValue(h);

        const wrapped = withSecurity(vi.fn().mockResolvedValue(new Response('ok')));
        const req = new Request('https://test.com', { headers: h });
        const res = await wrapped(req, { params: {} });

        expect(res.status).toBe(200);
    });
  });

  describe('JWE Response Encryption', () => {
    it('encrypts response for mobile requests when rcek is present', async () => {
        const h = new Headers({
            'X-Firebase-AppCheck': 'valid-token',
            'X-JWE-Key': 'cek-jwe'
        });
        vi.mocked(headers).mockResolvedValue(h);
        const mockAppCheck = { verifyToken: vi.fn().mockResolvedValue({ appId: 'android-id' }) };
        vi.mocked(getAppCheck).mockReturnValue(mockAppCheck as any);
        
        vi.mocked(decryptRequest).mockResolvedValue({ rcek: 'response-cek' });
        vi.mocked(encryptResponse).mockResolvedValue('encrypted-blob');

        const handler = vi.fn().mockResolvedValue(new Response('{"data":"secret"}'));
        const wrapped = withSecurity(handler);
        const req = new Request('https://test.com', { headers: h });
        const res = await wrapped(req, { params: {} });

        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('application/jose');
        expect(await res.text()).toBe('encrypted-blob');
    });
  });

/*
  describe('Rate Limiting Enforcement', () => {
    it('enforces rate limiting for web requests', async () => {
        rateLimitMock.success = false;
        process.env.DISABLE_SECURITY_BYPASS = 'true';
        
        const h = new Headers({ 'x-csrf-token': 'valid' });
        vi.mocked(headers).mockResolvedValue(h);
        vi.mocked(getClientIp).mockReturnValue('1.2.3.4');
        vi.mocked(validateCsrfToken).mockResolvedValue(true);

        const wrapped = withSecurity(vi.fn().mockResolvedValue(new Response('ok')));
        const req = new Request('https://test.com', { headers: h });
        const res = await wrapped(req, { params: {} });
        
        expect(res.status).toBe(429);
    });
  });
*/
});
