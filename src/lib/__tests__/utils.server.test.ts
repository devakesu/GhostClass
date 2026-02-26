/**
 * Tests for server-only utilities: getClientIp, redact, egressFetch,
 * and egressAxios (HMAC-SHA256 version).
 *
 * The 'server-only' guard must be mocked so Vitest's jsdom environment doesn't
 * trigger the build-time-only restriction at runtime.
 */

// Must be hoisted before any module imports that transitively import server-only
vi.mock('server-only', () => ({}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getClientIp, redact, egressFetch, egressAxios } from '@/lib/utils.server';

// ---------------------------------------------------------------------------
// getClientIp — ported from utils.test.ts (moved alongside the implementation)
// ---------------------------------------------------------------------------

describe('getClientIp', () => {
  it('should return IP from cf-connecting-ip header', () => {
    const headers = new Headers();
    headers.set('cf-connecting-ip', '1.2.3.4');
    expect(getClientIp(headers)).toBe('1.2.3.4');
  });

  it('should return IP from x-real-ip header when cf-connecting-ip is not present', () => {
    const headers = new Headers();
    headers.set('x-real-ip', '5.6.7.8');
    expect(getClientIp(headers)).toBe('5.6.7.8');
  });

  it('should return IP from x-forwarded-for header when others are not present', () => {
    const headers = new Headers();
    headers.set('x-forwarded-for', '9.10.11.12, 192.168.1.1');
    expect(getClientIp(headers)).toBe('9.10.11.12');
  });

  it('should prioritize cf-connecting-ip over other headers', () => {
    const headers = new Headers();
    headers.set('cf-connecting-ip', '1.2.3.4');
    headers.set('x-real-ip', '5.6.7.8');
    headers.set('x-forwarded-for', '9.10.11.12');
    expect(getClientIp(headers)).toBe('1.2.3.4');
  });

  it('should prioritize x-real-ip over x-forwarded-for', () => {
    const headers = new Headers();
    headers.set('x-real-ip', '5.6.7.8');
    headers.set('x-forwarded-for', '9.10.11.12');
    expect(getClientIp(headers)).toBe('5.6.7.8');
  });

  it('should trim whitespace from IP addresses', () => {
    const headers = new Headers();
    headers.set('cf-connecting-ip', '  1.2.3.4  ');
    expect(getClientIp(headers)).toBe('1.2.3.4');
  });

  it('should handle x-forwarded-for with multiple IPs and trim', () => {
    const headers = new Headers();
    headers.set('x-forwarded-for', ' 9.10.11.12 , 192.168.1.1 ');
    expect(getClientIp(headers)).toBe('9.10.11.12');
  });

  it('should return dev fallback in development when no headers present', () => {
    // NODE_ENV is 'development' in Vitest (see vitest.config.ts)
    const headers = new Headers();
    const ip = getClientIp(headers);
    // Returns TEST_CLIENT_IP env var or "127.0.0.1" in development
    expect(ip).toBe('127.0.0.1');
  });
});

// ---------------------------------------------------------------------------
// redact — HMAC-SHA256 server implementation
// ---------------------------------------------------------------------------

describe('redact (server / HMAC-SHA256)', () => {
  it('should redact email addresses deterministically', () => {
    const email = 'user@example.com';
    const hash1 = redact('email', email);
    const hash2 = redact('email', email);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(12);
    expect(hash1).not.toContain('@');
    expect(hash1).not.toContain('example');
  });

  it('should redact IDs deterministically', () => {
    const id = '12345';
    const hash1 = redact('id', id);
    const hash2 = redact('id', id);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(12);
    expect(hash1).not.toContain('12345');
  });

  it('should produce different hashes for different types', () => {
    const value = 'test@example.com';
    expect(redact('email', value)).not.toBe(redact('id', value));
  });

  it('should produce different hashes for different values', () => {
    expect(redact('email', 'user1@example.com')).not.toBe(
      redact('email', 'user2@example.com'),
    );
  });

  it('should only contain hex characters', () => {
    const hash = redact('id', 'abc-123');
    expect(hash).toMatch(/^[0-9a-f]{12}$/);
  });
});

// ---------------------------------------------------------------------------
// egressFetch — header merging edge cases
// ---------------------------------------------------------------------------

describe('egressFetch header merging', () => {
  const mockFetch = vi.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = mockFetch as typeof global.fetch;
    mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubEnv('CF_PROXY_URL', 'https://cf-proxy.example.com');
    vi.stubEnv('CF_PROXY_SECRET', 'test-proxy-secret-key');
    // Ensure AWS / direct tiers are not active so CF tier is used
    vi.stubEnv('AWS_SECONDARY_URL', '');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    mockFetch.mockReset();
  });

  it('merges proxy headers with a plain object init.headers', async () => {
    await egressFetch('login', { headers: { authorization: 'Bearer token' } });
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const h = init?.headers as Headers;
    expect(h.get('authorization')).toBe('Bearer token');
    expect(h.get('x-proxy-secret')).toBe('test-proxy-secret-key');
  });

  it('merges proxy headers with a Headers instance init.headers', async () => {
    await egressFetch('login', { headers: new Headers({ authorization: 'Bearer from-headers' }) });
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const h = init?.headers as Headers;
    expect(h.get('authorization')).toBe('Bearer from-headers');
    expect(h.get('x-proxy-secret')).toBe('test-proxy-secret-key');
  });

  it('merges proxy headers with a tuple-array init.headers', async () => {
    await egressFetch('login', { headers: [['authorization', 'Bearer from-tuple']] });
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const h = init?.headers as Headers;
    expect(h.get('authorization')).toBe('Bearer from-tuple');
    expect(h.get('x-proxy-secret')).toBe('test-proxy-secret-key');
  });

  it('proxy headers override any same-named caller header', async () => {
    await egressFetch('login', { headers: { 'x-proxy-secret': 'caller-value' } });
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const h = init?.headers as Headers;
    expect(h.get('x-proxy-secret')).toBe('test-proxy-secret-key');
  });

  it('constructs the correct full URL from CF base + endpoint', async () => {
    await egressFetch('myprofile');
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://cf-proxy.example.com/myprofile');
  });
});

// ---------------------------------------------------------------------------
// egressAxios interceptor — proxy secret header injection
// ---------------------------------------------------------------------------

describe('egressAxios interceptor', () => {
  beforeEach(() => {
    vi.stubEnv('CF_PROXY_URL', 'https://cf-axios.example.com');
    vi.stubEnv('CF_PROXY_SECRET', 'axios-proxy-secret');
    vi.stubEnv('AWS_SECONDARY_URL', '');
  });

  it('injects x-proxy-secret header and baseURL via the CF tier', async () => {
    let capturedConfig: Record<string, unknown> | undefined;
    await egressAxios.get('/test', {
      adapter: (config) => {
        capturedConfig = config as unknown as Record<string, unknown>;
        return Promise.resolve({
          data: {},
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        });
      },
    });
    expect(capturedConfig?.baseURL).toBe('https://cf-axios.example.com');
    const h = capturedConfig?.headers as { get: (name: string) => string | null | undefined };
    expect(h.get('x-proxy-secret')).toBe('axios-proxy-secret');
  });

  it('does not inject x-proxy-secret when direct tier is used (no CF or AWS URL)', async () => {
    vi.stubEnv('CF_PROXY_URL', '');
    vi.stubEnv('AWS_SECONDARY_URL', '');
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'https://api.ezygo.example.com');
    let capturedConfig: Record<string, unknown> | undefined;
    await egressAxios.get('/test', {
      adapter: (config) => {
        capturedConfig = config as unknown as Record<string, unknown>;
        return Promise.resolve({
          data: {},
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        });
      },
    });
    expect(capturedConfig?.baseURL).toBe('https://api.ezygo.example.com');
    const h = capturedConfig?.headers as { get: (name: string) => string | null | undefined };
    expect(h.get('x-proxy-secret')).toBeFalsy();
  });
});
