/**
 * Tests for GET /api/profile and PATCH /api/profile
 *
 * These tests verify that:
 * - PII fields (birth_date, gender, phone) are encrypted before DB writes
 * - PII fields are decrypted before being returned to the client
 * - Ciphertext and IV values are never exposed in the response
 * - Auth and CSRF checks reject unauthenticated / forged requests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { __resetCachedKey } from "@/lib/crypto";
import { __resetAllowedHostsCache } from "@/lib/security/origin-validation";

// Mock server-only to allow tests to run in jsdom / Node environments.
// Without this, importing any server-only module (e.g. @/lib/utils.server)
// throws "This module cannot be imported from a Client Component module".
vi.mock("server-only", () => ({}));

// --- Environment setup (must be before module imports) ---
vi.hoisted(() => {
  vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "https://ezygo.example.com");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
});

// --- Mock next/server: preserve all real exports, stub `after` as no-op ---
// `after()` requires a Next.js request context which is not available in Vitest.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn() };
});

// --- Mock server Supabase client (async) ---
const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
    })
  ),
}));

// --- Mock admin Supabase client ---
const mockAdminSelect = vi.fn();
const mockAdminUpsert = vi.fn();
const mockAdminUpdate = vi.fn();
const mockAdminEq = vi.fn();
const mockAdminMaybeSingle = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: mockAdminSelect,
      upsert: mockAdminUpsert,
      update: mockAdminUpdate,
    })),
  })),
}));

// --- Mock CSRF validation ---
const mockValidateCsrf = vi.fn();
vi.mock("@/lib/security/csrf", () => ({
  validateCsrfToken: mockValidateCsrf,
}));

vi.mock("@/lib/security/app-check", async () => {
  const actual = await vi.importActual<typeof import("@/lib/security/app-check")>("@/lib/security/app-check");
  return {
    ...actual,
    withSecurity: vi.fn((handler) => handler),
    isMobileRequest: vi.fn(() => false),
  };
});

// --- Mock auth cookie ---
const mockGetAuthToken = vi.fn();
vi.mock("@/lib/security/auth-cookie", () => ({
  getAuthTokenServer: mockGetAuthToken,
  getAuthTokenWithFallback: mockGetAuthToken,
}));

// --- Mock egressFetch (for EzyGo calls) ---
const mockEgressFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/utils.server", () => ({
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  redact: vi.fn((_: string, v: unknown) => `***${String(v).slice(-4)}`),
  egressFetch: mockEgressFetch,
}));

// --- Mock rate limiter ---
const mockRateLimiterLimit = vi.fn();
vi.mock("@/lib/ratelimit", () => ({
  authRateLimiter: { limit: mockRateLimiterLimit },
}));

// --- Mock sync logic ---
const mockPerformProfileSync = vi.fn();
vi.mock("@/lib/user/sync", () => ({
  performProfileSync: mockPerformProfileSync,
}));

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

const VALID_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const MOCK_USER = { id: "auth-user-id-123" };

const MOCK_EZYGO_PROFILE = {
  user_id: 42,
  username: "testuser",
  email: "test@example.com",
  mobile: "9876543210",
  first_name: "Test",
  last_name: "User",
  gender: "male",
  birth_date: "2000-01-15",
};

function makeEzygoFetchOk(profile = MOCK_EZYGO_PROFILE) {
  mockEgressFetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ data: profile }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  );
}

function makeEzygoFetchFail() {
  mockEgressFetch.mockRejectedValueOnce(new Error("network error"));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Helper: build a NextRequest that passes Origin validation.
// Tests run with NODE_ENV=test and NEXT_PUBLIC_APP_DOMAIN=localhost (vitest.setup.ts).
const makeGetReq = (overrideHeaders?: Record<string, string>) =>
  new NextRequest("http://localhost/api/profile", {
    headers: { origin: "http://localhost", ...overrideHeaders },
  });

function makePatchRequest(body: Record<string, unknown>, csrfHeader = "valid-csrf") {
  return new NextRequest("http://localhost:3000/api/profile", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-csrf-token": csrfHeader,
    },
    body: JSON.stringify(body),
  });
}

describe("GET /api/profile", () => {

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    // Set a valid encryption key directly (bypasses vi.unstubAllEnvs cleanup)
    process.env.ENCRYPTION_KEY = VALID_ENCRYPTION_KEY;
    __resetCachedKey();
    // Reset the origin-validation module cache so each test reads the current env vars
    __resetAllowedHostsCache();

    mockGetUser.mockResolvedValue({
      data: { user: MOCK_USER },
      error: null,
    });
    mockGetAuthToken.mockResolvedValue("ezygo-session-token");
    // Default: no existing DB row
    mockAdminSelect.mockReturnValue({
      eq: mockAdminEq.mockReturnValue({
        maybeSingle: mockAdminMaybeSingle.mockResolvedValue({
          data: null,
          error: null,
        }),
      }),
    });
    // Default: upsert succeeds
    mockAdminUpsert.mockResolvedValue({ error: null });
    // Default: rate limiter allows the request
    mockRateLimiterLimit.mockResolvedValue({ success: true, reset: Date.now() + 60000, limit: 5, remaining: 4 });
  });

  afterEach(() => {
    __resetCachedKey();
    __resetAllowedHostsCache();
    vi.restoreAllMocks();
  });

  it("returns 500 when NEXT_PUBLIC_APP_DOMAIN is missing in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_DOMAIN", "");
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/profile", {
      headers: { origin: "http://localhost" },
    });
    const res = await GET(req, { params: {} });
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Server misconfiguration");
  });

  it("returns 403 when Origin is not from the allowed domain", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/profile", {
      headers: { origin: "https://evil.example.com" },
    });
    const res = await GET(req, { params: {} });
    expect(res.status).toBe(403);
  });

  it("returns 400 when Origin header is absent and Sec-Fetch-Site is not same-origin", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/profile");
    const res = await GET(req, { params: {} });
    expect(res.status).toBe(400);
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const { GET } = await import("../route");
    const res = await GET(makeGetReq(), { params: {} });
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 502 when EzyGo is unavailable", async () => {
    makeEzygoFetchFail();
    const { GET } = await import("../route");
    const res = await GET(makeGetReq(), { params: {} });
    expect(res.status).toBe(502);
    const body = await res.json() as { error: string };
    expect(body.error.toLowerCase()).toContain("failed");
  });

  it("returns plaintext PII fields (not ciphertext) on success", async () => {
    makeEzygoFetchOk();
    const { GET } = await import("../route");
    const res = await GET(makeGetReq(), { params: {} });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;

    expect(body.phone).toBe(MOCK_EZYGO_PROFILE.mobile);
    expect(body.gender).toBe(MOCK_EZYGO_PROFILE.gender);
    expect(body.birth_date).toBe(MOCK_EZYGO_PROFILE.birth_date);
    expect(body.username).toBe(MOCK_EZYGO_PROFILE.username);
    expect(body.email).toBe(MOCK_EZYGO_PROFILE.email);
  });

  it("never exposes IV columns in the response", async () => {
    makeEzygoFetchOk();
    const { GET } = await import("../route");
    const res = await GET(makeGetReq(), { params: {} });
    const body = await res.json() as Record<string, unknown>;

    expect(body).not.toHaveProperty("phone_iv");
    expect(body).not.toHaveProperty("gender_iv");
    expect(body).not.toHaveProperty("birth_date_iv");
  });

  it("writes encrypted PII (not plaintext) to the database", async () => {
    makeEzygoFetchOk();
    const { GET } = await import("../route");
    await GET(makeGetReq(), { params: {} });

    expect(mockAdminUpsert).toHaveBeenCalledOnce();
    const [upsertPayload] = mockAdminUpsert.mock.calls[0] as [Record<string, unknown>];

    // Ciphertext must differ from plaintext
    expect(upsertPayload.phone).not.toBe(MOCK_EZYGO_PROFILE.mobile);
    expect(upsertPayload.gender).not.toBe(MOCK_EZYGO_PROFILE.gender);
    expect(upsertPayload.birth_date).not.toBe(MOCK_EZYGO_PROFILE.birth_date);

    // IV columns must be present alongside ciphertext
    expect(upsertPayload.phone_iv).toBeTruthy();
    expect(upsertPayload.gender_iv).toBeTruthy();
    expect(upsertPayload.birth_date_iv).toBeTruthy();
  });

  it("soft-syncs gender/birth_date: preserves local DB value over EzyGo value", async () => {
    // Existing row in DB has a user-edited gender value (encrypted)
    const { encrypt } = await import("@/lib/crypto");
    const { content: encGender, iv: genderIv } = encrypt("other");
    const { content: encBirthDate, iv: bdIv } = encrypt("1999-12-31");

    mockAdminSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            first_name: "Test",
            gender: encGender,
            gender_iv: genderIv,
            birth_date: encBirthDate,
            birth_date_iv: bdIv,
          },
          error: null,
        }),
      }),
    });

    makeEzygoFetchOk(); // EzyGo returns gender:"male", birth_date:"2000-01-15"

    const { GET } = await import("../route");
    const res = await GET(makeGetReq(), { params: {} });
    const body = await res.json() as { gender: string; birth_date: string };

    // Local user-edited values must take precedence
    expect(body.gender).toBe("other");
    expect(body.birth_date).toBe("1999-12-31");
  });

  it("falls back to EzyGo value when no local DB value exists", async () => {
    makeEzygoFetchOk();
    const { GET } = await import("../route");
    const res = await GET(makeGetReq(), { params: {} });
    const body = await res.json() as { gender: string; birth_date: string };

    expect(body.gender).toBe(MOCK_EZYGO_PROFILE.gender);
    expect(body.birth_date).toBe(MOCK_EZYGO_PROFILE.birth_date);
  });

  describe("rate limiting", () => {
    it("returns 429 with Cache-Control: no-store when rate limit is exceeded", async () => {
      mockRateLimiterLimit.mockResolvedValueOnce({
        success: false,
        reset: Date.now() + 60000,
        limit: 5,
        remaining: 0,
      });
      const { GET } = await import("../route");
      const res = await GET(makeGetReq(), { params: {} });
      expect(res.status).toBe(429);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(res.headers.get("Retry-After")).toBeDefined();
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
      const body = await res.json() as { error: string };
      expect(body.error).toMatch(/too many requests/i);
    });

    it("does not call auth or EzyGo when rate limited", async () => {
      mockRateLimiterLimit.mockResolvedValueOnce({
        success: false,
        reset: Date.now() + 60000,
        limit: 5,
        remaining: 0,
      });
      const { GET } = await import("../route");
      await GET(makeGetReq(), { params: {} });
      expect(mockGetUser).not.toHaveBeenCalled();
      expect(mockEgressFetch).not.toHaveBeenCalled();
    });

    it("returns 400 with Cache-Control: no-store when client IP cannot be determined", async () => {
      const { getClientIp } = await import("@/lib/utils.server");
      vi.mocked(getClientIp).mockReturnValueOnce(null);
      const { GET } = await import("../route");
      const res = await GET(makeGetReq(), { params: {} });
      expect(res.status).toBe(400);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(mockRateLimiterLimit).not.toHaveBeenCalled();
    });
  });
});

describe("PATCH /api/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    // Set a valid encryption key directly (bypasses vi.unstubAllEnvs cleanup)
    process.env.ENCRYPTION_KEY = VALID_ENCRYPTION_KEY;
    __resetCachedKey();

    mockValidateCsrf.mockResolvedValue(true);
    mockGetUser.mockResolvedValue({
      data: { user: MOCK_USER },
      error: null,
    });
    mockAdminUpdate.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    // Default: rate limiter allows the request
    mockRateLimiterLimit.mockResolvedValue({ success: true, reset: Date.now() + 60000, limit: 5, remaining: 4 });
  });

  afterEach(() => {
    __resetCachedKey();
    vi.restoreAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const { PATCH } = await import("../route");
    const req = makePatchRequest({ first_name: "Alice", gender: "female" });
    const res = await PATCH(req, { params: {} });
    expect(res.status).toBe(401);
  });

  it("returns 422 for invalid request body", async () => {
    const { PATCH } = await import("../route");
    // first_name too short
    const req = makePatchRequest({ first_name: "A", gender: "male" });
    const res = await PATCH(req, { params: {} });
    expect(res.status).toBe(422);
  });

  it("returns 200 and plaintext values on success", async () => {
    const { PATCH } = await import("../route");
    const req = makePatchRequest({
      first_name: "Alice",
      last_name: "Smith",
      gender: "female",
      birth_date: "1995-06-20",
    });
    const res = await PATCH(req, { params: {} });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.first_name).toBe("Alice");
    expect(body.gender).toBe("female");
    expect(body.birth_date).toBe("1995-06-20");
  });

  it("never exposes IV columns in the response", async () => {
    const { PATCH } = await import("../route");
    const req = makePatchRequest({
      first_name: "Alice",
      gender: "female",
      birth_date: "1995-06-20",
    });
    const res = await PATCH(req, { params: {} });
    const body = await res.json() as Record<string, unknown>;
    expect(body).not.toHaveProperty("gender_iv");
    expect(body).not.toHaveProperty("birth_date_iv");
  });

  it("writes encrypted PII (not plaintext) to the database", async () => {
    let capturedUpdate: Record<string, unknown> = {};
    mockAdminUpdate.mockImplementation((data: Record<string, unknown>) => {
      capturedUpdate = data;
      return { eq: vi.fn().mockResolvedValue({ error: null }) };
    });

    const { PATCH } = await import("../route");
    const req = makePatchRequest({
      first_name: "Alice",
      gender: "female",
      birth_date: "1995-06-20",
    });
    await PATCH(req, { params: {} });

    // Ciphertext must differ from plaintext
    expect(capturedUpdate.gender).not.toBe("female");
    expect(capturedUpdate.birth_date).not.toBe("1995-06-20");

    // IV columns must be present alongside ciphertext
    expect(capturedUpdate.gender_iv).toBeTruthy();
    expect(capturedUpdate.birth_date_iv).toBeTruthy();
  });

  it("omits PII fields from update payload when not provided", async () => {
    let capturedUpdate: Record<string, unknown> = {};
    mockAdminUpdate.mockImplementation((data: Record<string, unknown>) => {
      capturedUpdate = data;
      return { eq: vi.fn().mockResolvedValue({ error: null }) };
    });

    const { PATCH } = await import("../route");
    // gender and birth_date omitted – they should not appear in the update payload
    const req = makePatchRequest({ first_name: "Alice" });
    await PATCH(req, { params: {} });

    expect(capturedUpdate).not.toHaveProperty("gender");
    expect(capturedUpdate).not.toHaveProperty("gender_iv");
    expect(capturedUpdate).not.toHaveProperty("birth_date");
    expect(capturedUpdate).not.toHaveProperty("birth_date_iv");
  });

  it("stores NULL in DB when PII fields are explicitly cleared", async () => {
    let capturedUpdate: Record<string, unknown> = {};
    mockAdminUpdate.mockImplementation((data: Record<string, unknown>) => {
      capturedUpdate = data;
      return { eq: vi.fn().mockResolvedValue({ error: null }) };
    });

    const { PATCH } = await import("../route");
    // gender and birth_date explicitly set to null – should be stored as NULL
    const req = makePatchRequest({ first_name: "Alice", gender: null, birth_date: null });
    await PATCH(req, { params: {} });

    expect(capturedUpdate.gender).toBeNull();
    expect(capturedUpdate.gender_iv).toBeNull();
    expect(capturedUpdate.birth_date).toBeNull();
    expect(capturedUpdate.birth_date_iv).toBeNull();
  });

  describe("rate limiting", () => {
    it("returns 429 with Cache-Control: no-store when rate limit is exceeded", async () => {
      mockRateLimiterLimit.mockResolvedValueOnce({
        success: false,
        reset: Date.now() + 60000,
        limit: 5,
        remaining: 0,
      });
      const { PATCH } = await import("../route");
      const req = makePatchRequest({ first_name: "Alice", gender: "female" });
      const res = await PATCH(req, { params: {} });
      expect(res.status).toBe(429);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(res.headers.get("Retry-After")).toBeDefined();
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
      const body = await res.json() as { error: string };
      expect(body.error).toMatch(/too many requests/i);
    });

    it("does not call CSRF or auth when rate limited", async () => {
      mockRateLimiterLimit.mockResolvedValueOnce({
        success: false,
        reset: Date.now() + 60000,
        limit: 5,
        remaining: 0,
      });
      const { PATCH } = await import("../route");
      const req = makePatchRequest({ first_name: "Alice", gender: "female" });
      await PATCH(req, { params: {} });
      expect(mockValidateCsrf).not.toHaveBeenCalled();
      expect(mockGetUser).not.toHaveBeenCalled();
    });

    it("returns 400 with Cache-Control: no-store when client IP cannot be determined", async () => {
      const { getClientIp } = await import("@/lib/utils.server");
      vi.mocked(getClientIp).mockReturnValueOnce(null);
      const { PATCH } = await import("../route");
      const req = makePatchRequest({ first_name: "Alice", gender: "female" });
      const res = await PATCH(req, { params: {} });
      expect(res.status).toBe(400);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(mockRateLimiterLimit).not.toHaveBeenCalled();
    });
  });
});

describe("Edge Case & Branch Coverage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockAdminSelect.mockReset();
    mockAdminUpsert.mockReset();
    mockAdminUpdate.mockReset();
    mockPerformProfileSync.mockReset();
    mockGetAuthToken.mockReset();
    mockRateLimiterLimit.mockReset();
    mockGetUser.mockReset();
    mockEgressFetch.mockReset();

    process.env.ENCRYPTION_KEY = VALID_ENCRYPTION_KEY;
    __resetCachedKey();
    __resetAllowedHostsCache();

    mockGetUser.mockResolvedValue({
      data: { user: MOCK_USER },
      error: null,
    });
    mockGetAuthToken.mockResolvedValue("ezygo-session-token");
    mockAdminSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      }),
    });
    mockAdminUpsert.mockResolvedValue({ error: null });
    mockAdminUpdate.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
    });
    mockRateLimiterLimit.mockResolvedValue({ success: true, reset: Date.now() + 60000, limit: 5, remaining: 4 });
  });

  it("handles shouldSync=true when getAuthTokenServer returns null", async () => {
    mockAdminSelect.mockImplementation(() => ({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 1, first_name: "Alice", auth_id: MOCK_USER.id },
          error: null,
        }),
      }),
    }));
    mockGetAuthToken.mockResolvedValue(null);
    
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/profile?sync=true");
    const res = await GET(req, { params: {} });
    
    expect(res.status).toBe(200);
    expect(mockPerformProfileSync).not.toHaveBeenCalled();
  });

  it("handles profile sync failure gracefully (logged but success response)", async () => {
    mockAdminSelect.mockImplementation(() => ({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 1, first_name: "Alice", auth_id: MOCK_USER.id },
          error: null,
        }),
      }),
    }));
    mockPerformProfileSync.mockRejectedValue(new Error("Sync failed"));
    
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/profile?sync=true");
    const res = await GET(req, { params: {} });
    
    expect(res.status).toBe(200);
    // Even if sync fails, we return the existing DB data
    const body = await res.json();
    expect(body.first_name).toBe("Alice");
  });

  it("returns 502 when EzyGo returns error status", async () => {
    mockEgressFetch.mockResolvedValue(new Response(JSON.stringify({ error: "EzyGo error" }), { status: 500 }));
    
    const { GET } = await import("../route");
    const res = await GET(makeGetReq(), { params: {} });
    
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body.error).toContain("Failed to reach EzyGo profile service");
  });

  it("handles EzyGo response without .data wrapper", async () => {
    mockEgressFetch.mockResolvedValue(new Response(JSON.stringify({ user_id: 123, username: "direct" }), { status: 200 }));
    
    const { GET } = await import("../route");
    const res = await GET(makeGetReq(), { params: {} });
    
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.username).toBe("direct");
  });

  it("returns 400 for malformed JSON body in PATCH", async () => {
    const { PATCH } = await import("../route");
    const req = new NextRequest("http://localhost/api/profile", {
      method: "PATCH",
      body: "not-json",
      headers: { "content-type": "application/json" }
    });
    const res = await PATCH(req, { params: {} });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid or empty JSON body" });
  });

  it("returns 500 when database update fails in PATCH", async () => {
    mockAdminUpdate.mockImplementation(() => ({
      eq: vi.fn().mockResolvedValue({ error: { message: "DB Error" } }),
    }));
    
    const { PATCH } = await import("../route");
    const req = makePatchRequest({ first_name: "Alice" });
    const res = await PATCH(req, { params: {} });
    
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to update profile" });
  });
  });
