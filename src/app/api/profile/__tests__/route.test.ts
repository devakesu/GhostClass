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

// --- Environment setup (must be before module imports) ---
vi.hoisted(() => {
  vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "https://ezygo.example.com");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
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

// --- Mock auth cookie ---
const mockGetAuthToken = vi.fn();
vi.mock("@/lib/security/auth-cookie", () => ({
  getAuthTokenServer: mockGetAuthToken,
}));

// --- Mock global fetch (for EzyGo calls) ---
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

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
  mockFetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ data: profile }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  );
}

function makeEzygoFetchFail() {
  mockFetch.mockRejectedValueOnce(new Error("network error"));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set a valid encryption key directly (bypasses vi.unstubAllEnvs cleanup)
    process.env.ENCRYPTION_KEY = VALID_ENCRYPTION_KEY;
    __resetCachedKey();

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
  });

  afterEach(() => {
    __resetCachedKey();
    vi.restoreAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const { GET } = await import("../route");
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 502 when EzyGo is unavailable", async () => {
    makeEzygoFetchFail();
    const { GET } = await import("../route");
    const res = await GET();
    expect(res.status).toBe(502);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("remote source");
  });

  it("returns plaintext PII fields (not ciphertext) on success", async () => {
    makeEzygoFetchOk();
    const { GET } = await import("../route");
    const res = await GET();
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
    const res = await GET();
    const body = await res.json() as Record<string, unknown>;

    expect(body).not.toHaveProperty("phone_iv");
    expect(body).not.toHaveProperty("gender_iv");
    expect(body).not.toHaveProperty("birth_date_iv");
  });

  it("writes encrypted PII (not plaintext) to the database", async () => {
    makeEzygoFetchOk();
    const { GET } = await import("../route");
    await GET();

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
    const res = await GET();
    const body = await res.json() as { gender: string; birth_date: string };

    // Local user-edited values must take precedence
    expect(body.gender).toBe("other");
    expect(body.birth_date).toBe("1999-12-31");
  });

  it("falls back to EzyGo value when no local DB value exists", async () => {
    makeEzygoFetchOk();
    const { GET } = await import("../route");
    const res = await GET();
    const body = await res.json() as { gender: string; birth_date: string };

    expect(body.gender).toBe(MOCK_EZYGO_PROFILE.gender);
    expect(body.birth_date).toBe(MOCK_EZYGO_PROFILE.birth_date);
  });
});

describe("PATCH /api/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });

  afterEach(() => {
    __resetCachedKey();
    vi.restoreAllMocks();
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

  it("returns 403 when CSRF token is invalid", async () => {
    mockValidateCsrf.mockResolvedValueOnce(false);
    const { PATCH } = await import("../route");
    const req = makePatchRequest({ first_name: "Alice", gender: "female" });
    const res = await PATCH(req);
    expect(res.status).toBe(403);
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const { PATCH } = await import("../route");
    const req = makePatchRequest({ first_name: "Alice", gender: "female" });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });

  it("returns 422 for invalid request body", async () => {
    const { PATCH } = await import("../route");
    // first_name too short
    const req = makePatchRequest({ first_name: "A", gender: "male" });
    const res = await PATCH(req);
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
    const res = await PATCH(req);
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
    const res = await PATCH(req);
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
    await PATCH(req);

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
    await PATCH(req);

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
    await PATCH(req);

    expect(capturedUpdate.gender).toBeNull();
    expect(capturedUpdate.gender_iv).toBeNull();
    expect(capturedUpdate.birth_date).toBeNull();
    expect(capturedUpdate.birth_date_iv).toBeNull();
  });
});
