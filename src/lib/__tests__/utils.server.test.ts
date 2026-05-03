import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock server-only to avoid build errors in tests
vi.mock('server-only', () => ({}));

// Mock next/headers
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers())
}));

import { getClientIp, redact, getEgressConfig, egressFetch, egressAxios, _resetModuleState } from '@/lib/utils.server';

describe('utils.server.ts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    _resetModuleState();
    vi.stubGlobal('console', { 
      warn: vi.fn(), 
      error: vi.fn(), 
      log: vi.fn() 
    });
    global.fetch = vi.fn();
  });

  describe('getClientIp', () => {
    it('prioritizes cf-connecting-ip', () => {
      const headers = new Headers({ 'cf-connecting-ip': '1.1.1.1', 'x-real-ip': '2.2.2.2' });
      expect(getClientIp(headers)).toBe('1.1.1.1');
    });

    it('falls back to x-real-ip', () => {
      const headers = new Headers({ 'x-real-ip': '2.2.2.2', 'x-forwarded-for': '3.3.3.3' });
      expect(getClientIp(headers)).toBe('2.2.2.2');
    });

    it('falls back to x-forwarded-for (first IP)', () => {
      const headers = new Headers({ 'x-forwarded-for': '3.3.3.3, 4.4.4.4' });
      expect(getClientIp(headers)).toBe('3.3.3.3');
    });

    it('returns null in production when no headers present', () => {
      vi.stubEnv('NODE_ENV', 'production');
      expect(getClientIp(new Headers())).toBeNull();
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('No IP forwarding headers found in production'));
    });

    it('uses TEST_CLIENT_IP in development', () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('TEST_CLIENT_IP', '9.9.9.9');
      expect(getClientIp(new Headers())).toBe('9.9.9.9');
    });

    it('falls back to 127.0.0.1 and warns in development', () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('TEST_CLIENT_IP', '');
      expect(getClientIp(new Headers())).toBe('127.0.0.1');
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('DEVELOPMENT MODE: Client IP Detection'));
    });
  });

  describe('redact', () => {
    it('uses SENTRY_HASH_SALT if provided', () => {
      vi.stubEnv('SENTRY_HASH_SALT', 'custom-salt');
      const h1 = redact('id', 'v');
      _resetModuleState();
      vi.stubEnv('SENTRY_HASH_SALT', 'other-salt');
      const h2 = redact('id', 'v');
      expect(h1).not.toBe(h2);
    });

    it('throws in production if SENTRY_HASH_SALT is missing', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('SENTRY_HASH_SALT', '');
      expect(() => redact('id', 'v')).toThrow('SENTRY_HASH_SALT is required in production');
    });

    it('warns in development if SENTRY_HASH_SALT is missing', () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('SENTRY_HASH_SALT', '');
      const spy = vi.spyOn(console, 'warn');
      const h = redact('id', 'v');
      expect(h).toBeDefined();
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('SECURITY WARNING'));
    });

    it('throws if NODE_ENV is neither production nor development/test', () => {
      vi.stubEnv('NODE_ENV', 'other');
      vi.stubEnv('SENTRY_HASH_SALT', '');
      expect(() => redact('id', 'v')).toThrow('SENTRY_HASH_SALT is required in production');
    });

    it('redacts deterministically', () => {
      const h1 = redact('id', '123');
      const h2 = redact('id', '123');
      expect(h1).toBe(h2);
      expect(h1).toHaveLength(12);
    });

    it('throws in production if salt is missing', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('SENTRY_HASH_SALT', '');
      expect(() => redact('id', 'v')).toThrow('SENTRY_HASH_SALT is required in production');
    });

    it('warns in development if salt is missing', () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('SENTRY_HASH_SALT', '');
      redact('id', 'v');
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Using fallback salt'));
    });
  });

  describe('getEgressConfig', () => {
    it('returns config with proxyHeaders if secret present', () => {
      vi.stubEnv('CF_PROXY_URL', 'https://cf');
      vi.stubEnv('CF_PROXY_SECRET', 'secret');
      expect(getEgressConfig().proxyHeaders).toEqual({ 'x-proxy-secret': 'secret' });
    });

    it('returns config without proxyHeaders if secret missing', () => {
      vi.stubEnv('CF_PROXY_URL', 'https://cf');
      vi.stubEnv('CF_PROXY_SECRET', '');
      expect(getEgressConfig().proxyHeaders).toEqual({});
    });

    it('prioritizes AWS if CF is missing', () => {
      vi.stubEnv('CF_PROXY_URL', '');
      vi.stubEnv('AWS_SECONDARY_URL', 'https://aws');
      vi.stubEnv('AWS_SECONDARY_SECRET', 'aws-secret');
      const config = getEgressConfig();
      expect(config.baseUrl).toBe('https://aws');
      expect(config.proxyHeaders).toEqual({ 'x-proxy-secret': 'aws-secret' });
    });

    it('falls back to direct backend if both CF and AWS are missing', () => {
      vi.stubEnv('CF_PROXY_URL', '');
      vi.stubEnv('AWS_SECONDARY_URL', '');
      vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'https://direct');
      expect(getEgressConfig().baseUrl).toBe('https://direct');
    });
  });

  describe('egressFetch', () => {
    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'https://direct');
      vi.stubEnv('CF_PROXY_URL', 'https://cf');
      vi.stubEnv('CF_PROXY_SECRET', 'cf-secret');
      vi.stubEnv('AWS_SECONDARY_URL', 'https://aws');
    });

    it('throws if no targets are configured', async () => {
      vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', '');
      vi.stubEnv('CF_PROXY_URL', '');
      vi.stubEnv('AWS_SECONDARY_URL', '');
      await expect(egressFetch('/test')).rejects.toThrow('No egress targets configured');
    });

    it('rethrows AbortError if caller signal is aborted', async () => {
      (global.fetch as any).mockRejectedValue(new (class AbortError extends Error { name = 'AbortError'; })());
      const controller = new AbortController();
      controller.abort();
      await expect(egressFetch('/test', { signal: controller.signal })).rejects.toThrow();
    });


    it('fails over on retryable statuses (429, 502, etc)', async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({ status: 429, ok: false, body: { cancel: vi.fn() } })
        .mockResolvedValueOnce({ status: 200, ok: true });
      
      const res = await egressFetch('/test');
      expect(res.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('handles network errors and non-Error rejections', async () => {
      (global.fetch as any)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce('String error')
        .mockResolvedValueOnce({ status: 200, ok: true });
      
      const res = await egressFetch('/test');
      expect(res.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('stops at last tier even if it fails', async () => {
      vi.stubEnv('CF_PROXY_URL', '');
      vi.stubEnv('AWS_SECONDARY_URL', '');
      (global.fetch as any).mockRejectedValue(new Error('Last tier failed'));
      
      await expect(egressFetch('/test')).rejects.toThrow('Last tier failed');
    });

    it('handles missing body or cancel method', async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({ status: 429, ok: false, body: null })
        .mockResolvedValueOnce({ status: 502, ok: false, body: {} })
        .mockResolvedValueOnce({ status: 200, ok: true });
      
      const res = await egressFetch('/test');
      expect(res.status).toBe(200);
    });

    it('respects caller signal', async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(egressFetch('/test', { signal: controller.signal })).rejects.toThrow();
    });

    it('injects stealth headers and proxy secret', async () => {
      (global.fetch as any).mockResolvedValue({ status: 200, ok: true });
      await egressFetch('/test');
      
      const lastCallHeaders = (global.fetch as any).mock.calls[0][1].headers;
      expect(lastCallHeaders.get('origin')).toBe('https://edu.ezygo.app');
      expect(lastCallHeaders.get('x-proxy-secret')).toBe('cf-secret');
    });

    it('handles next/headers failure (catch block)', async () => {
      const { headers } = await import('next/headers');
      vi.mocked(headers).mockRejectedValue(new Error('Next.js context error'));
      
      (global.fetch as any).mockResolvedValue({ status: 200, ok: true });
      await egressFetch('/test');
      
      const lastCallHeaders = (global.fetch as any).mock.calls[0][1].headers;
      expect(lastCallHeaders.get('user-agent')).toContain('Mozilla'); // Fallback UA
    });

    it('uses user-agent and sec-ch-ua from next/headers if available', async () => {
      const { headers } = await import('next/headers');
      vi.mocked(headers).mockResolvedValue(new Headers({ 
        'user-agent': 'Browser UA',
        'sec-ch-ua': 'Browser UA Info'
      }));
      
      (global.fetch as any).mockResolvedValue({ status: 200, ok: true });
      await egressFetch('/test');
      
      const lastCallHeaders = (global.fetch as any).mock.calls[0][1].headers;
      expect(lastCallHeaders.get('user-agent')).toBe('Browser UA');
      expect(lastCallHeaders.get('sec-ch-ua')).toBe('Browser UA Info');
    });
  });

  describe('egressAxios', () => {
    it('has correct timeout and interceptor logic', async () => {
      vi.stubEnv('CF_PROXY_URL', 'https://cf');
      vi.stubEnv('CF_PROXY_SECRET', 'secret');
      
      expect(egressAxios.defaults.timeout).toBe(15000);

      // Manual check of interceptor
      const config: any = { headers: new Map() };
      const handlers = (egressAxios.interceptors.request as any).handlers;
      const interceptor = handlers[0].fulfilled;
      const result = interceptor(config);
      
      expect(result.baseURL).toBe('https://cf');
      expect(result.headers.get('x-proxy-secret')).toBe('secret');
      expect(result.headers.get('origin')).toBe('https://edu.ezygo.app');
    });
  });
});
