/**
 * Tests for POST /api/auth/save-token
 *
 * Focused on the terms-cookie branch introduced in the PR:
 *   - clearTermsVersionCookie() is called when the user has NOT accepted the current terms
 *   - setTermsVersionCookie() is called when the user HAS already accepted the current terms
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Environment stubs (must be hoisted) ---
vi.hoisted(() => {
  vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "https://ezygo.example.com/");
  vi.stubEnv("NEXT_PUBLIC_APP_DOMAIN", "localhost");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
  vi.stubEnv(
    "ENCRYPTION_KEY",
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  );
  vi.stubEnv("NODE_ENV", "development");
});

// --- Hoist shared mock functions so they are defined before vi.mock() factories run ---
const mockAxiosGet = vi.hoisted(() => vi.fn());

// --- server-only shim ---
vi.mock("server-only", () => ({}));

// --- CSRF ---
const mockValidateCsrf = vi.fn();
vi.mock("@/lib/security/csrf", () => ({
  validateCsrfToken: mockValidateCsrf,
}));

// --- Rate limiter ---
vi.mock("@/lib/ratelimit", () => ({
  authRateLimiter: {
    limit: vi.fn().mockResolvedValue({
      success: true,
      limit: 10,
      reset: Date.now() + 60_000,
      remaining: 9,
    }),
  },
}));

// --- Utils server ---
vi.mock("@/lib/utils.server", () => ({
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  redact: vi.fn((_: string, v: unknown) => `***${String(v).slice(-4)}`),
  egressAxios: { get: mockAxiosGet },
}));

// --- Sentry ---
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

// --- Logger ---
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), dev: vi.fn(), info: vi.fn() },
}));

// --- Auth cookie ---
const mockSetAuthCookie = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/security/auth-cookie", () => ({
  setAuthCookie: mockSetAuthCookie,
}));

// --- User actions (terms cookies) ---
const mockSetTermsVersionCookie = vi.fn().mockResolvedValue(undefined);
const mockClearTermsVersionCookie = vi.fn().mockResolvedValue(undefined);
vi.mock("@/app/actions/user", () => ({
  setTermsVersionCookie: mockSetTermsVersionCookie,
  clearTermsVersionCookie: mockClearTermsVersionCookie,
}));

// --- Redis ---
vi.mock("@/lib/redis", () => ({
  redis: {
    set: vi.fn().mockResolvedValue("OK"),
    eval: vi.fn().mockResolvedValue(1),
  },
}));

// --- Axios (EzyGo token verification) ---
vi.mock("axios", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    default: {
      get: mockAxiosGet,
    },
    isAxiosError: (actual as { isAxiosError: unknown }).isAxiosError,
  };
});

// --- Crypto ---
const MOCK_IV = "aabbccddeeff001122334455";
vi.mock("@/lib/crypto", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    encrypt: vi.fn().mockReturnValue({ iv: MOCK_IV, content: "encrypted-content" }),
    decrypt: vi.fn().mockReturnValue("decrypted-password"),
  };
});

// --- next/headers ---
const mockHeadersGet = vi.fn();
const mockCookieStore = { getAll: vi.fn().mockReturnValue([]), set: vi.fn() };
vi.mock("next/headers", () => ({
  headers: vi.fn(() => Promise.resolve({ get: mockHeadersGet })),
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}));

// --- Supabase SSR client (device sign-in) ---
const mockSignInWithPassword = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { signInWithPassword: mockSignInWithPassword },
  })),
}));

// --- Supabase admin client ---
const mockCreateUser = vi.fn();
const mockAdminAuthAdmin = { createUser: mockCreateUser };

// Per-table mock chains – reassigned per test
let mockUsersTable: {
  select: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
};
let mockUserSettingsTable: { select: ReturnType<typeof vi.fn> };

const mockAdminClient = {
  auth: { admin: mockAdminAuthAdmin },
  from: vi.fn((table: string) => {
    if (table === "users") return mockUsersTable;
    if (table === "user_settings") return mockUserSettingsTable;
    return {};
  }),
};

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: vi.fn(() => mockAdminClient),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.x";

const EZYGO_USER = {
  id: 42,
  username: "testuser",
  email: "testuser@example.com",
  mobile: "9876543210",
};

function makeRequest(token = VALID_TOKEN) {
  return new Request("http://localhost/api/auth/save-token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/auth/save-token – terms cookie branching", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // CSRF always passes
    mockValidateCsrf.mockResolvedValue(true);

    // EzyGo returns a valid user
    mockAxiosGet.mockResolvedValue({ status: 200, data: EZYGO_USER });

    // Supabase sign-in always succeeds
    mockSignInWithPassword.mockResolvedValue({ error: null });

    // Users table: select chain (terms check) and upsert
    mockUsersTable = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    };

    // User settings table
    mockUserSettingsTable = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    };
  });

  it("calls clearTermsVersionCookie() for a new user who has not accepted terms", async () => {
    // First login: createUser succeeds
    mockCreateUser.mockResolvedValueOnce({
      data: { user: { id: "auth-uuid-new" } },
      error: null,
    });

    // No users-table SELECT happens for first-time users (cachedUserData stays null);
    // the default table mock is sufficient.

    const { POST } = await import("../route");
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(mockClearTermsVersionCookie).toHaveBeenCalledOnce();
    expect(mockSetTermsVersionCookie).not.toHaveBeenCalled();
  });

  it("calls setTermsVersionCookie() for an existing user who has already accepted terms", async () => {
    // Returning user: createUser fails with "already registered"
    mockCreateUser.mockResolvedValueOnce({
      data: null,
      error: { message: "User already registered", status: 422 },
    });

    // CASE 2: single combined query returns auth_id, password fields, and terms fields.
    mockUsersTable.select
      .mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              auth_id: "auth-uuid-existing",
              auth_password: "enc-pw",
              auth_password_iv: MOCK_IV,
              terms_version: "2.2",
              terms_accepted_at: "2026-01-29T00:00:00Z",
            },
            error: null,
          }),
        }),
      });

    const { POST } = await import("../route");
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(mockSetTermsVersionCookie).toHaveBeenCalledWith("2.2");
    expect(mockClearTermsVersionCookie).not.toHaveBeenCalled();
  });
});
