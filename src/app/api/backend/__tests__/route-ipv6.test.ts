/**
 * IPv6 hostname normalization tests for the backend proxy route.
 *
 * These tests run in their own file so that they get a fresh module instance
 * with NEXT_PUBLIC_APP_DOMAIN pre-configured to "::1", which is required to
 * exercise the same-origin allow path for IPv6 hosts.
 *
 * Background: normalizeHost() must correctly handle bare (unbracketed) IPv6
 * literals (e.g. "::1") returned by req.nextUrl.hostname. The WHATWG URL spec
 * strips brackets so "http://[::1]:3000" produces hostname "::1". The old code
 * treated "::1" as "host:port" and sliced at the first ":", yielding "" (empty
 * string), causing same-origin reads from an IPv6 host to be incorrectly
 * rejected even when the host was in the allowlist.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Must be hoisted before any module imports that transitively import server-only
vi.mock('server-only', () => ({}));

// Pre-configure the app domain to an IPv6 address BEFORE importing the route
// module so that the module-level allowedHosts cache is populated correctly.
vi.hoisted(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'https://api.example.com');
  vi.stubEnv('NEXT_PUBLIC_APP_DOMAIN', '::1');
});

vi.mock('@/lib/security/auth-cookie', () => ({
  getAuthTokenServer: vi.fn(() => Promise.resolve('mock-token')),
}));

vi.mock('@/lib/security/csrf', () => ({
  validateCsrfToken: vi.fn(() => Promise.resolve(true)),
}));

// Same lightweight pass-through circuit breaker as in route-failover.test.ts.
// Avoids Sentry initialization side effects and cross-file CB state pollution.
vi.mock('@/lib/circuit-breaker', () => {
  class CircuitBreakerOpenError extends Error {
    constructor(message: string) { super(message); this.name = 'CircuitBreakerOpenError'; }
  }
  class NonBreakerError extends Error {
    constructor(message: string) { super(message); this.name = 'NonBreakerError'; }
  }
  class UpstreamServerError extends Error {
    status: number; statusText: string; body: string; headers?: Headers;
    constructor(message: string, status: number, statusText: string, body: string, headers?: Headers) {
      super(message); this.name = 'UpstreamServerError';
      this.status = status; this.statusText = statusText; this.body = body; this.headers = headers;
    }
  }
  return {
    CircuitBreakerOpenError,
    NonBreakerError,
    UpstreamServerError,
    ezygoCircuitBreaker: {
      execute: vi.fn(<T>(fn: () => Promise<T>) => fn()),
      reset: vi.fn(),
    },
  };
});

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('Backend Proxy Route – IPv6 hostname normalization', () => {
  type RouteModule = typeof import('../[...path]/route');
  let GET: RouteModule['GET'];

  beforeEach(async () => {
    // Defensive: restore real timers first (see route-failover.test.ts comment).
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'https://api.example.com');
    vi.stubEnv('NEXT_PUBLIC_APP_DOMAIN', '::1');

    if (!GET) {
      const routeModule = await import('../[...path]/route');
      GET = routeModule.GET;
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should allow same-origin GET from bracketed IPv6 host ([::1]:3000) when ::1 is the app domain', async () => {
    // normalizeHost("[::1]:3000") must return "::1" (strip brackets + port)
    // so that allowedHosts.has("::1") succeeds.
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const request = new NextRequest('http://[::1]:3000/api/backend/users', {
      method: 'GET',
      headers: {
        'sec-fetch-site': 'same-origin',
        host: '[::1]:3000',
      },
    });

    const ctx = { params: Promise.resolve({ path: ['users'] }) };
    const response = await GET(request, ctx);
    expect(response.status).toBe(200);
  });

  it('should allow same-origin GET when x-forwarded-host contains an unbracketed IPv6 address (::1)', async () => {
    // Regression test for the bug where normalizeHost("::1") returned "" (empty
    // string) because the old code treated the first ":" as a port separator.
    // x-forwarded-host can carry a bare IPv6 address (e.g. from a proxy that
    // strips brackets), and req.nextUrl.hostname (WHATWG URL spec) also returns
    // the address without brackets. Both paths share the same normalizeHost() logic.
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const request = new NextRequest('http://[::1]:3000/api/backend/users', {
      method: 'GET',
      headers: {
        'sec-fetch-site': 'same-origin',
        'x-forwarded-host': '::1',
      },
    });

    const ctx = { params: Promise.resolve({ path: ['users'] }) };
    const response = await GET(request, ctx);
    expect(response.status).toBe(200);
  });
});
