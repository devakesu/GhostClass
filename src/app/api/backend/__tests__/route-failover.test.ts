/**
 * Egress failover chain tests for the backend proxy route.
 *
 * These tests run in their own file to get a fresh module instance with CF and
 * AWS egress tier env vars pre-configured. The EGRESS_TARGETS array is computed
 * at module load time, so the env vars must be stubbed before the module is
 * imported (done via vi.hoisted below).
 *
 * Scenarios covered:
 * - Successful failover from CF (503) → AWS (200)
 * - Successful failover from CF (network error) → AWS (200)
 * - Non-retryable 4xx returned immediately without failover
 * - All tiers exhausted (CF 503, AWS 503, direct 503)
 * - x-egress-target header reflects the tier that actually served the response
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Must be hoisted before any module imports that transitively import server-only
vi.mock("server-only", () => ({}));

// Pre-configure CF + AWS egress tiers BEFORE importing the route module
// so that EGRESS_TARGETS is built with all three tiers (CF → AWS → direct).
vi.hoisted(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "https://direct.ezygo.example.com");
  vi.stubEnv("CF_PROXY_URL", "https://cf.proxy.example.com");
  vi.stubEnv("CF_PROXY_SECRET", "cf-secret-key");
  vi.stubEnv("AWS_SECONDARY_URL", "https://aws.proxy.example.com");
  vi.stubEnv("AWS_SECONDARY_SECRET", "aws-secret-key");
});

vi.mock("@/lib/security/auth-cookie", () => ({
  getAuthTokenServer: vi.fn(() => Promise.resolve("mock-token")),
  getAuthTokenWithFallback: vi.fn(() => Promise.resolve("mock-token")),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateCsrfToken: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("@/lib/ratelimit", () => ({
  proxyRateLimiter: {
    limit: vi.fn().mockResolvedValue({
      success: true,
      reset: 0,
      limit: 100,
      remaining: 99,
    }),
  },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({
    get: vi.fn((name: string) => {
      if (name === "x-csrf-token") return { value: "mock-csrf-token" };
      return null;
    }),
  })),
  headers: vi.fn(() => ({
    get: vi.fn(() => null),
  })),
}));

// Provide a lightweight pass-through circuit breaker so that:
// (a) the real @sentry/nextjs initialization is never triggered in this file
//     (Sentry registers setInterval timers; if a sibling test left fake timers
//     active in the same Vitest worker, those timers would hang the import)
// (b) tests are not affected by circuit-breaker state left open by other files
// Error classes are re-declared so that route.ts instanceof guards still work.
vi.mock("@/lib/circuit-breaker", () => {
  class CircuitBreakerOpenError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "CircuitBreakerOpenError";
    }
  }
  class NonBreakerError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "NonBreakerError";
    }
  }
  class UpstreamServerError extends Error {
    status: number;
    statusText: string;
    body: string;
    headers?: Headers;
    constructor(
      message: string,
      status: number,
      statusText: string,
      body: string,
      headers?: Headers,
    ) {
      super(message);
      this.name = "UpstreamServerError";
      this.status = status;
      this.statusText = statusText;
      this.body = body;
      this.headers = headers;
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

describe("Backend Proxy Route – Egress Failover Chain", () => {
  type RouteModule = typeof import("../[...path]/route");
  let GET: RouteModule["GET"];

  beforeEach(async () => {
    // Defensive: restore real timers first in case a sibling file in the same
    // Vitest worker left fake timers active. This prevents module imports from
    // hanging due to Sentry's timer-based initialization code.
    vi.resetModules();
    vi.useRealTimers();
    vi.clearAllMocks();

    if (!GET) {
      const routeModule = await import("../[...path]/route");
      GET = routeModule.GET;
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeGetRequest() {
    return new NextRequest("http://localhost:3000/api/backend/users", {
      method: "GET",
      headers: {
        origin: "http://localhost",
        "x-csrf-token": "mock-csrf-token",
      },
    });
  }

  async function callGet(req: NextRequest) {
    const ctx = { params: Promise.resolve({ path: ["users"] }) };
    return GET(req, ctx);
  }

  it("should failover from CF (503) to AWS and return 200", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (new URL(url).origin === "https://cf.proxy.example.com") {
        return new Response("Service Unavailable", {
          status: 503,
          headers: { "content-type": "text/plain" },
        });
      }
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const response = await callGet(makeGetRequest());

    expect(response.status).toBe(200);
    // CF was tried first, AWS succeeded second
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(response.headers.get("x-egress-target")).toBe("secondary");
  });

  it("should failover from CF (network error) to AWS and return 200", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (new URL(url).origin === "https://cf.proxy.example.com") {
        throw new Error("Network connection failed");
      }
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const response = await callGet(makeGetRequest());

    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(response.headers.get("x-egress-target")).toBe("secondary");
  });

  it("should NOT failover on non-retryable 4xx — returns 401 after a single attempt", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ message: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );

    const response = await callGet(makeGetRequest());

    // 401 is not retryable — returned immediately, no failover to AWS/direct
    expect(response.status).toBe(401);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should try all three tiers and return 503 when all are exhausted", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        new Response("Service Unavailable", {
          status: 503,
          headers: { "content-type": "text/plain" },
        }),
      )
    );

    const response = await callGet(makeGetRequest());

    // All 3 tiers were attempted
    expect(mockFetch).toHaveBeenCalledTimes(3);
    // The last UpstreamServerError (from direct tier) is bubbled up as 503
    expect(response.status).toBe(503);
  });

  it('should set x-egress-target to "direct" when CF and AWS both fail but direct succeeds', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (
        new URL(url).origin === "https://cf.proxy.example.com" ||
        new URL(url).origin === "https://aws.proxy.example.com"
      ) {
        return new Response("Bad Gateway", {
          status: 502,
          headers: { "content-type": "text/plain" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const response = await callGet(makeGetRequest());

    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(response.headers.get("x-egress-target")).toBe("direct");
  });
});
