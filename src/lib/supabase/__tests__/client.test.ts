/**
 * Tests for buildSupabaseTieredFetch — the browser-side tiered proxy logic
 * in src/lib/supabase/client.ts.
 *
 * The global vitest.setup.ts mocks @/lib/supabase/client entirely; we unmock
 * it here so we can import and test the actual implementation.
 */

// Unmock before any import so Vitest resolves the real module.
vi.unmock("@/lib/supabase/client");

// Mock createBrowserClient — we're only testing the fetch wrapper, not the
// Supabase client itself.
vi.mock("@supabase/ssr", () => ({
  createBrowserClient: vi.fn(() => ({ isMock: true })),
}));

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Must be mocked for tests to run in jsdom/node
vi.mock("server-only", () => ({}));

import { buildSupabaseTieredFetch } from "@/lib/supabase/fetch";

// Ensure vi.stubGlobal() calls in any suite don't leak into subsequent suites.
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SUPABASE_ORIGIN = "https://test.supabase.co";
const CF_PROXY = "https://cf-proxy.workers.dev";
const AWS_PROXY = "https://aws-proxy.execute-api.amazonaws.com";

/** Creates a mock fetch that throws a network error on the first call. */
function mockFetchNetworkError(thenStatus = 200): ReturnType<typeof vi.fn> {
  return vi.fn()
    .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockResolvedValue(new Response("{}", { status: thenStatus }));
}

// ---------------------------------------------------------------------------
// Tier construction
// ---------------------------------------------------------------------------

describe("buildSupabaseTieredFetch — tier construction", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns undefined when no proxy vars are set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", "");
    expect(buildSupabaseTieredFetch(SUPABASE_ORIGIN)).toBeUndefined();
  });

  it("returns a function when only CF proxy is set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", CF_PROXY);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", "");
    expect(buildSupabaseTieredFetch(SUPABASE_ORIGIN)).toBeTypeOf("function");
  });

  it("returns a function when only AWS proxy is set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", AWS_PROXY);
    expect(buildSupabaseTieredFetch(SUPABASE_ORIGIN)).toBeTypeOf("function");
  });

  it("returns a function when both proxies are set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", CF_PROXY);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", AWS_PROXY);
    expect(buildSupabaseTieredFetch(SUPABASE_ORIGIN)).toBeTypeOf("function");
  });

  it("ignores invalid proxy URL and returns undefined when it is the only one", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", "not-a-url!!");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", "");
    expect(buildSupabaseTieredFetch(SUPABASE_ORIGIN)).toBeUndefined();
  });

  it("strips trailing slashes from proxy origins", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", `${CF_PROXY}///`);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", "");
    expect(buildSupabaseTieredFetch(SUPABASE_ORIGIN)).toBeTypeOf("function");
  });
});

// ---------------------------------------------------------------------------
// Pass-through: non-Supabase URLs
// ---------------------------------------------------------------------------

describe("buildSupabaseTieredFetch — non-Supabase URL pass-through", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", CF_PROXY);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("passes through requests not aimed at the Supabase origin", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response("ok", { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const tieredFetch = buildSupabaseTieredFetch(SUPABASE_ORIGIN)!;
    const res = await tieredFetch("https://other.example.com/api", {});

    expect(res.status).toBe(200);
    // Should have been called with the original URL, not a proxy URL.
    expect(mockFetch).toHaveBeenCalledWith(
      "https://other.example.com/api",
      expect.anything(),
    );
  });
});

// ---------------------------------------------------------------------------
// Successful first-tier response (no failover needed)
// ---------------------------------------------------------------------------

describe("buildSupabaseTieredFetch — successful first tier", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("routes Supabase requests through direct origin first when proxy is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", CF_PROXY);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", "");

    const mockFetch = vi.fn().mockResolvedValue(
      new Response("{}", { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const tieredFetch = buildSupabaseTieredFetch(SUPABASE_ORIGIN)!;
    await tieredFetch(`${SUPABASE_ORIGIN}/auth/v1/user`, {});

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toMatch(new RegExp(`^${SUPABASE_ORIGIN}`));
    expect(calledUrl).toContain("/auth/v1/user");
  });

  it("preserves query string through fetch", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", CF_PROXY);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", "");

    const mockFetch = vi.fn().mockResolvedValue(
      new Response("{}", { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const tieredFetch = buildSupabaseTieredFetch(SUPABASE_ORIGIN)!;
    await tieredFetch(`${SUPABASE_ORIGIN}/rest/v1/table?select=*`, {});

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("?select=*");
  });

  it("preserves method and headers when input is a Request object", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", CF_PROXY);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", "");

    const mockFetch = vi.fn().mockResolvedValue(
      new Response("{}", { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const requestInput = new Request(`${SUPABASE_ORIGIN}/auth/v1/user`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      body: '{"key":"value"}',
    });

    const tieredFetch = buildSupabaseTieredFetch(SUPABASE_ORIGIN)!;
    await tieredFetch(requestInput);

    const [calledInput, calledInit] = mockFetch.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(calledInput).toMatch(new RegExp(`^${SUPABASE_ORIGIN}`));
    expect(calledInput).toContain("/auth/v1/user");

    // Method and Authorization header from the original Request must be preserved.
    expect(calledInit.method).toBe("POST");
    const headers = new Headers(calledInit.headers as HeadersInit);
    expect(headers.get("authorization")).toBe("Bearer test-token");
  });
});

// ---------------------------------------------------------------------------
// GET failover on retryable 5xx
// ---------------------------------------------------------------------------

describe("buildSupabaseTieredFetch — GET 5xx failover", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("fails over from direct to CF on 502 for GET", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", CF_PROXY);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", "");

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response("bad gateway", { status: 502 }))
      .mockResolvedValueOnce(new Response('{"user":"x"}', { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const tieredFetch = buildSupabaseTieredFetch(SUPABASE_ORIGIN)!;
    const res = await tieredFetch(`${SUPABASE_ORIGIN}/auth/v1/user`, {
      method: "GET",
    });

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // Second call should go to the CF proxy origin.
    const secondUrl = mockFetch.mock.calls[1][0] as string;
    expect(secondUrl).toMatch(new RegExp(`^${CF_PROXY}`));
  });

  it("fails over direct → CF → AWS on 503 for GET when all three tiers configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", CF_PROXY);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", AWS_PROXY);

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const tieredFetch = buildSupabaseTieredFetch(SUPABASE_ORIGIN)!;
    const res = await tieredFetch(`${SUPABASE_ORIGIN}/rest/v1/data`, {
      method: "GET",
    });

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[0][0]).toMatch(new RegExp(`^${SUPABASE_ORIGIN}`));
    expect(mockFetch.mock.calls[1][0]).toMatch(new RegExp(`^${CF_PROXY}`));
    expect(mockFetch.mock.calls[2][0]).toMatch(new RegExp(`^${AWS_PROXY}`));
  });

  it("does NOT fail over on 502 for AWS-only config when direct returns 502 — fails over to AWS and returns 502 as-is on last tier", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", AWS_PROXY);

    // direct → 502 → failover to AWS → 502 again (last tier returns as-is)
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 502 }))
      .mockResolvedValueOnce(new Response("", { status: 502 }));
    vi.stubGlobal("fetch", mockFetch);

    const tieredFetch = buildSupabaseTieredFetch(SUPABASE_ORIGIN)!;
    const res = await tieredFetch(`${SUPABASE_ORIGIN}/auth/v1/user`, {
      method: "GET",
    });

    // Last tier (direct) returns its response regardless of status.
    expect(res.status).toBe(502);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// POST — no status-based failover
// ---------------------------------------------------------------------------

describe("buildSupabaseTieredFetch — POST mutation safety", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("does NOT fail over on 502 for POST — returns 502 immediately", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", CF_PROXY);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", AWS_PROXY);

    const mockFetch = vi.fn().mockResolvedValue(
      new Response("", { status: 502 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const tieredFetch = buildSupabaseTieredFetch(SUPABASE_ORIGIN)!;
    const res = await tieredFetch(`${SUPABASE_ORIGIN}/auth/v1/token`, {
      method: "POST",
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: "tok",
      }),
    });

    expect(res.status).toBe(502);
    // Must only have called fetch once — no failover for mutations on 5xx.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does NOT fail over on 503 for PUT", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", CF_PROXY);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", "");

    const mockFetch = vi.fn().mockResolvedValue(
      new Response("", { status: 503 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const tieredFetch = buildSupabaseTieredFetch(SUPABASE_ORIGIN)!;
    const res = await tieredFetch(`${SUPABASE_ORIGIN}/rest/v1/row`, {
      method: "PUT",
    });

    expect(res.status).toBe(503);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Network error failover (mutations allowed — request never reached server)
// ---------------------------------------------------------------------------

describe("buildSupabaseTieredFetch — network error failover", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("fails over POST to direct when CF throws a network error", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", CF_PROXY);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", "");

    const mockFetch = mockFetchNetworkError(200);
    vi.stubGlobal("fetch", mockFetch);

    const tieredFetch = buildSupabaseTieredFetch(SUPABASE_ORIGIN)!;
    const res = await tieredFetch(`${SUPABASE_ORIGIN}/auth/v1/token`, {
      method: "POST",
      body: '{"grant_type":"refresh_token"}',
    });

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("re-throws when the last tier throws a network error", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", CF_PROXY);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", "");

    const mockFetch = vi.fn().mockRejectedValue(
      new TypeError("Failed to fetch"),
    );
    vi.stubGlobal("fetch", mockFetch);

    const tieredFetch = buildSupabaseTieredFetch(SUPABASE_ORIGIN)!;
    await expect(
      tieredFetch(`${SUPABASE_ORIGIN}/auth/v1/token`, { method: "POST" }),
    ).rejects.toThrow("Failed to fetch");
  });
});

// ---------------------------------------------------------------------------
// ReadableStream body buffering
// ---------------------------------------------------------------------------

describe("buildSupabaseTieredFetch — ReadableStream body buffering", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("buffers ReadableStream body so retry tiers receive the full body", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", CF_PROXY);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", "");

    // First tier throws (network error); second tier should still receive the body.
    const receivedBodies: (BodyInit | null | undefined)[] = [];
    const mockFetch = vi.fn().mockImplementation(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        receivedBodies.push(init?.body ?? null);
        if (receivedBodies.length === 1) throw new TypeError("network error");
        return new Response("{}", { status: 200 });
      },
    );
    vi.stubGlobal("fetch", mockFetch);

    const payload = JSON.stringify({ refresh_token: "abc" });
    const stream = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(new TextEncoder().encode(payload));
        ctrl.close();
      },
    });

    const tieredFetch = buildSupabaseTieredFetch(SUPABASE_ORIGIN)!;
    const res = await tieredFetch(`${SUPABASE_ORIGIN}/auth/v1/token`, {
      method: "POST",
      body: stream,
    });

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // The retry tier must have received an ArrayBuffer (buffered from the stream).
    const retryBody = receivedBodies[1];
    expect(retryBody).toBeInstanceOf(ArrayBuffer);
    const text = new TextDecoder().decode(retryBody as ArrayBuffer);
    expect(text).toBe(payload);
  });
});

// ---------------------------------------------------------------------------
// Caller AbortSignal propagation
// ---------------------------------------------------------------------------

describe("buildSupabaseTieredFetch — caller AbortSignal", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("propagates an already-aborted caller signal without retrying", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", CF_PROXY);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", AWS_PROXY);

    const controller = new AbortController();
    controller.abort();

    // Simulate fetch honouring the already-aborted signal.
    // The tiered fetch checks callerSignal.aborted without an instanceof guard,
    // so any thrown error type propagates — use DOMException to match browsers.
    const abortError = new DOMException("Aborted", "AbortError");
    const mockFetch = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal("fetch", mockFetch);

    const tieredFetch = buildSupabaseTieredFetch(SUPABASE_ORIGIN)!;
    await expect(
      tieredFetch(`${SUPABASE_ORIGIN}/auth/v1/user`, {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });

    // Must not retry on subsequent tiers when caller aborted.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("uses Request.signal when init.signal is not provided", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", CF_PROXY);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", AWS_PROXY);

    const controller = new AbortController();
    controller.abort();

    const abortError = new DOMException("Aborted", "AbortError");
    const mockFetch = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal("fetch", mockFetch);

    const request = new Request(`${SUPABASE_ORIGIN}/auth/v1/user`, {
      signal: controller.signal,
    });

    const tieredFetch = buildSupabaseTieredFetch(SUPABASE_ORIGIN)!;
    await expect(tieredFetch(request)).rejects.toMatchObject({
      name: "AbortError",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 4xx responses — never fail over
// ---------------------------------------------------------------------------

describe("buildSupabaseTieredFetch — 4xx are not retried", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns 401 immediately without failover", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", CF_PROXY);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", AWS_PROXY);

    const mockFetch = vi.fn().mockResolvedValue(
      new Response('{"error":"invalid_token"}', { status: 401 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const tieredFetch = buildSupabaseTieredFetch(SUPABASE_ORIGIN)!;
    const res = await tieredFetch(`${SUPABASE_ORIGIN}/auth/v1/user`, {
      method: "GET",
    });

    expect(res.status).toBe(401);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns 403 immediately without failover", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", CF_PROXY);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", "");

    const mockFetch = vi.fn().mockResolvedValue(
      new Response('{"error":"forbidden"}', { status: 403 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const tieredFetch = buildSupabaseTieredFetch(SUPABASE_ORIGIN)!;
    const res = await tieredFetch(`${SUPABASE_ORIGIN}/rest/v1/data`, {
      method: "GET",
    });

    expect(res.status).toBe(403);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// API Gateway stage path preservation
// ---------------------------------------------------------------------------

describe("buildSupabaseTieredFetch — API Gateway stage path preservation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("preserves a stage path prefix (e.g. /prod) when rewriting Supabase URLs", async () => {
    const awsWithStage = `${AWS_PROXY}/prod`;
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", awsWithStage);

    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const tieredFetch = buildSupabaseTieredFetch(SUPABASE_ORIGIN)!;
    await tieredFetch(`${SUPABASE_ORIGIN}/auth/v1/token`, { method: "POST" });

    const calledUrl = mockFetch.mock.calls[1][0] as string;
    // The stage prefix must be present and must NOT be doubled on failover.
    expect(calledUrl).toBe(`${AWS_PROXY}/prod/auth/v1/token`);
  });

  it("does not double-slash when proxy URL has a trailing slash", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", `${CF_PROXY}/`);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", "");

    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const tieredFetch = buildSupabaseTieredFetch(SUPABASE_ORIGIN)!;
    await tieredFetch(`${SUPABASE_ORIGIN}/auth/v1/user`, {});

    const calledUrl = mockFetch.mock.calls[1][0] as string;
    expect(calledUrl).not.toContain("//auth"); // must not double-slash
    expect(calledUrl).toBe(`${CF_PROXY}/auth/v1/user`);
  });
});
