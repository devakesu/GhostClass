import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../route";

// Mocking dependencies
vi.mock("next/headers", () => ({
  headers: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body, init) => ({
      status: init?.status || 200,
      json: async () => body,
      headers: new Map(Object.entries(init?.headers || {})),
    })),
  },
}));

vi.mock("@/lib/crypto", () => ({
  encrypt: vi.fn(() => ({ content: "encrypted-token", iv: "0123456789abcdef01234567" })),
  decrypt: vi.fn(() => "decrypted-password"),
}));

vi.mock("@/lib/ratelimit", () => ({
  authRateLimiter: {
    limit: vi.fn(() => Promise.resolve({ success: true, limit: 10, reset: 0, remaining: 9 })),
  },
}));

vi.mock("@/lib/redis", () => ({
  redis: {
    set: vi.fn(() => Promise.resolve("OK")),
    eval: vi.fn(() => Promise.resolve(1)),
  },
}));

vi.mock("@/lib/utils.server", () => ({
  getClientIp: vi.fn(() => "127.0.0.1"),
  egressFetch: vi.fn(),
  redact: vi.fn((_, val) => val),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    dev: vi.fn(),
  },
}));

vi.mock("@/lib/security/csrf", () => ({
}));

vi.mock("@/lib/security/auth-cookie", () => ({
  setAuthCookie: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: vi.fn(),
}));

vi.mock("@/lib/user/sync", () => ({
  performProfileSync: vi.fn(() => Promise.resolve({ updates: 0, deletions: 0 })),
}));

vi.mock("@/lib/security/app-check", () => ({
  withSecurity: (fn: any) => fn,
  isMobileRequest: vi.fn(() => false),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      signInWithPassword: vi.fn(() => Promise.resolve({ data: { user: { id: "auth-id" } }, error: null })),
    },
  })),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import { headers, cookies } from "next/headers";
import { authRateLimiter } from "@/lib/ratelimit";
import { egressFetch } from "@/lib/utils.server";
import { getAdminClient } from "@/lib/supabase/admin";
import { __resetAllowedHostsCache } from "@/lib/security/origin-validation";

describe("POST /api/auth/save-token", () => {
  const mockHeaders = {
    get: vi.fn(),
  };

  const mockCookies = {
    getAll: vi.fn(() => []),
    set: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    __resetAllowedHostsCache();
    vi.mocked(authRateLimiter.limit).mockResolvedValue({ success: true, limit: 10, reset: 0, remaining: 9 } as any);
    mockHeaders.get.mockImplementation((name) => {
      if (name === "x-csrf-token") return "valid-csrf";
      if (name === "origin") return "https://localhost:3000";
      if (name === "host") return "localhost:3000";
      return null;
    });
    vi.mocked(headers).mockResolvedValue(mockHeaders as any);
    vi.mocked(cookies).mockResolvedValue(mockCookies as any);
    vi.stubEnv("NEXT_PUBLIC_APP_DOMAIN", "localhost:3000");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_LOCK_TTL", "20");
  });

  it("returns 403 for invalid origin on web", async () => {
    mockHeaders.get.mockImplementation((name) => {
      if (name === "origin") return "https://malicious.com";
      if (name === "host") return "localhost:3000";
      return "valid-csrf";
    });

    const req = { json: async () => ({ token: "test-token" }) } as any;
    const response = await POST(req, {} as any);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.message).toBe("Invalid origin");
  });

  it("accepts requests behind a proxy when x-forwarded-host matches the app domain", async () => {
    mockHeaders.get.mockImplementation((name) => {
      if (name === "origin") return null;
      if (name === "sec-fetch-site") return "same-origin";
      if (name === "x-forwarded-host") return "localhost:3000";
      if (name === "host") return "internal-container:3000";
      return "valid-csrf";
    });

    vi.mocked(egressFetch).mockResolvedValue({
      status: 200,
      json: async () => ({ username: "proxyuser", id: "99999", email: "proxy@example.com" }),
    } as any);

    const mockSupabaseAdmin = {
      auth: {
        admin: {
          createUser: vi.fn(() => Promise.resolve({ data: { user: { id: "proxy-auth-id" } }, error: null })),
        },
      },
      from: vi.fn(() => ({
        upsert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn(() => Promise.resolve({ data: { id: "99999" }, error: null })),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(() => Promise.resolve({ data: null })),
      })),
    };
    vi.mocked(getAdminClient).mockReturnValue(mockSupabaseAdmin as any);

    const req = { json: async () => ({ token: "a-very-long-token-that-is-valid-length" }) } as any;
    const response = await POST(req, {} as any);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.userId).toBe("proxy-auth-id");
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(authRateLimiter.limit).mockResolvedValue({ success: false, limit: 1, reset: Date.now() + 1000, remaining: 0 } as any);

    const req = { json: async () => ({ token: "test-token" }) } as any;
    const response = await POST(req, {} as any);

    expect(response.status).toBe(429);
  });

  it("returns 400 for invalid token format", async () => {
    const req = { json: async () => ({ token: "too-short" }) } as any;
    const response = await POST(req, {} as any);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.message).toBe("Invalid request format");
  });

  it("handles EzyGo authentication success and user creation", async () => {
    vi.mocked(egressFetch).mockResolvedValue({
      status: 200,
      json: async () => ({ username: "testuser", id: "12345", email: "test@example.com" }),
    } as any);

    const mockSupabaseAdmin = {
      auth: {
        admin: {
          createUser: vi.fn(() => Promise.resolve({ data: { user: { id: "new-auth-id" } }, error: null })),
        },
      },
      from: vi.fn(() => ({
        upsert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn(() => Promise.resolve({ data: { id: "12345" }, error: null })),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(() => Promise.resolve({ data: null })),
      })),
    };
    vi.mocked(getAdminClient).mockReturnValue(mockSupabaseAdmin as any);

    const req = { json: async () => ({ token: "a-very-long-token-that-is-valid-length" }) } as any;
    const response = await POST(req, {} as any);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.userId).toBe("new-auth-id");
    expect(body.ezygo_token).toBeUndefined();
  });

  it("handles existing user login", async () => {
    vi.mocked(egressFetch).mockResolvedValue({
      status: 200,
      json: async () => ({ username: "existinguser", id: "54321", email: "existing@example.com" }),
    } as any);

    const mockSupabaseAdmin = {
      auth: {
        admin: {
          createUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: { message: "User already registered", status: 422 } })),
        },
      },
      from: vi.fn((table) => {
        if (table === "users") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn(() => Promise.resolve({ 
              data: { 
                auth_id: "existing-uuid", 
                auth_password: "encrypted", 
                auth_password_iv: "0123456789abcdef01234567" 
              }, 
              error: null 
            })),
            upsert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === "user_settings") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn(() => Promise.resolve({ data: { target_percentage: 75 } })),
          };
        }
        return {};
      }),
    };
    vi.mocked(getAdminClient).mockReturnValue(mockSupabaseAdmin as any);

    const req = { json: async () => ({ token: "a-very-long-token-that-is-valid-length" }) } as any;
    const response = await POST(req, {} as any);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.userId).toBe("existing-uuid");
  });

  it("handles orphan user cleanup", async () => {
    vi.mocked(egressFetch).mockResolvedValue({
      status: 200,
      json: async () => ({ username: "orphanuser", id: "99999", email: "orphan@example.com" }),
    } as any);

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "service-role-key");

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ users: [{ id: "orphan-uuid", email: "ezygo_99999@localhost:3000" }] }),
    });
    vi.stubGlobal("fetch", mockFetch as unknown as typeof fetch);

    const mockSupabaseAdmin = {
      auth: {
        admin: {
          createUser: vi.fn()
            .mockResolvedValueOnce({ data: { user: null }, error: { message: "User already registered", status: 422 } })
            .mockResolvedValueOnce({ data: { user: { id: "new-auth-id-after-cleanup" } }, error: null }),
          listUsers: vi.fn(() => Promise.resolve({ 
            data: { users: [{ id: "orphan-uuid", email: "ezygo_99999@localhost:3000" }] }, 
            error: null 
          })),
          deleteUser: vi.fn(() => Promise.resolve({ error: null })),
        },
      },
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(() => Promise.resolve({ data: { auth_id: null }, error: null })), // Orphan detected
        upsert: vi.fn().mockResolvedValue({ error: null }),
      })),
    };
    vi.mocked(getAdminClient).mockReturnValue(mockSupabaseAdmin as any);

    const req = { json: async () => ({ token: "a-very-long-token-that-is-valid-length" }) } as any;
    const response = await POST(req, {} as any);

    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const requestUrl = new URL(String(mockFetch.mock.calls[0]?.[0]));
    expect(requestUrl.searchParams.get("email")).toBe("ezygo_99999@localhost:3000");
    const body = await response.json();
    expect(body.userId).toBe("new-auth-id-after-cleanup");
  });

  it("returns 403 when origin or host is missing", async () => {
    mockHeaders.get.mockImplementation((name) => {
      if (name === "origin") return null;
      if (name === "host") return "localhost:3000";
      return null;
    });
    const req = { json: async () => ({ token: "test-token" }) } as any;
    const response = await POST(req, {} as any);
    expect(response.status).toBe(403);
  });

  it("returns 500 when NEXT_PUBLIC_APP_DOMAIN is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_DOMAIN", "");
    const req = { json: async () => ({ token: "test-token" }) } as any;
    const response = await POST(req, {} as any);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.message).toContain("Server configuration error");
  });

  it("returns 500 when NEXT_PUBLIC_APP_DOMAIN contains protocol", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_DOMAIN", "https://localhost:3000");
    const req = { json: async () => ({ token: "test-token" }) } as any;
    const response = await POST(req, {} as any);
    expect(response.status).toBe(500);
  });

  it("returns 400 when IP cannot be determined", async () => {
    const { getClientIp } = await import("@/lib/utils.server");
    vi.mocked(getClientIp).mockReturnValueOnce(null);
    const req = { json: async () => ({ token: "test-token" }) } as any;
    const response = await POST(req, {} as any);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "Unable to determine client IP" });
  });

  it("returns 401 when EzyGo returns 401", async () => {
    vi.mocked(egressFetch).mockResolvedValueOnce({ status: 401 } as any);
    const req = { json: async () => ({ token: "a-very-long-token-that-is-valid-length" }) } as any;
    const response = await POST(req, {} as any);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ message: "Invalid or expired token" });
  });

  it("returns 502 when EzyGo returns unexpected status", async () => {
    vi.mocked(egressFetch).mockResolvedValueOnce({ status: 404 } as any);
    const req = { json: async () => ({ token: "a-very-long-token-that-is-valid-length" }) } as any;
    const response = await POST(req, {} as any);
    expect(response.status).toBe(502);
  });

  it("returns 504 when EzyGo request times out", async () => {
    const timeoutError = new Error("AbortError");
    timeoutError.name = "AbortError";
    vi.mocked(egressFetch).mockRejectedValueOnce(timeoutError);
    const req = { json: async () => ({ token: "a-very-long-token-that-is-valid-length" }) } as any;
    const response = await POST(req, {} as any);
    expect(response.status).toBe(504);
  });

  it("returns 503 when Redis lock acquisition fails", async () => {
    const { redis } = await import("@/lib/redis");
    vi.mocked(redis.set).mockRejectedValueOnce(new Error("Redis down"));
    vi.mocked(egressFetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ username: "testuser", id: "12345", email: "test@example.com" }),
    } as any);

    const req = { json: async () => ({ token: "a-very-long-token-that-is-valid-length" }) } as any;
    const response = await POST(req, {} as any);
    expect(response.status).toBe(503);
  });

  it("returns 409 when login is already in progress (lock held)", async () => {
    const { redis } = await import("@/lib/redis");
    vi.mocked(redis.set).mockResolvedValueOnce(null); // Lock not acquired
    vi.mocked(egressFetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ username: "testuser", id: "12345", email: "test@example.com" }),
    } as any);

    const req = { json: async () => ({ token: "a-very-long-token-that-is-valid-length" }) } as any;
    const response = await POST(req, {} as any);
    expect(response.status).toBe(409);
  });

  it("returns 400 for invalid user identifier sanitization", async () => {
    vi.mocked(egressFetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ username: "testuser", id: "invalid#id", email: "test@example.com" }),
    } as any);
    const req = { json: async () => ({ token: "a-very-long-token-that-is-valid-length" }) } as any;
    const response = await POST(req, {} as any);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "Invalid user identifier" });
  });

  it("bootstraps canonical password for legacy user", async () => {
    vi.mocked(egressFetch).mockResolvedValue({
      status: 200,
      json: async () => ({ username: "legacyuser", id: "77777", email: "legacy@example.com" }),
    } as any);

    const mockSupabaseAdmin = {
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: "User already registered", status: 422 } }),
          updateUserById: vi.fn().mockResolvedValue({ data: {}, error: null }),
        },
      },
      from: vi.fn((table) => {
        if (table === "users") {
          const mockUsers = {
            select: vi.fn().mockImplementation(() => {
              // The handler calls .select() in two ways:
              // 1. Initial lookup: .from("users").select(...).eq(...).single()
              // 2. Update bootstrap: .from("users").update(...).eq(...).is(...).select(...)
              
              // Case 1: Initial lookup or Case 2: Terminal select
              const terminalResult = Promise.resolve({ 
                data: [{ auth_password: "enc", auth_password_iv: "iv" }], 
                error: null 
              });
              
              return Object.assign(terminalResult, {
                eq: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ 
                  data: { auth_id: "legacy-uuid", auth_password: null, auth_password_iv: null }, 
                  error: null 
                }),
                is: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
              });
            }),
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            upsert: vi.fn().mockResolvedValue({ error: null }),
          };
          return mockUsers;
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        };
      }),
    };
    vi.mocked(getAdminClient).mockReturnValue(mockSupabaseAdmin as any);

    const req = { json: async () => ({ token: "a-very-long-token-that-is-valid-length" }) } as any;
    const response = await POST(req, {} as any);
    expect(response.status).toBe(200);
  });

  it("returns 500 when DB upsert fails", async () => {
    vi.mocked(egressFetch).mockResolvedValue({
      status: 200,
      json: async () => ({ username: "testuser", id: "12345", email: "test@example.com" }),
    } as any);

    const mockSupabaseAdmin = {
      auth: { admin: { createUser: vi.fn().mockResolvedValue({ data: { user: { id: "new-auth-id" } }, error: null }) } },
      from: vi.fn(() => ({
        upsert: vi.fn().mockResolvedValue({ error: { message: "Upsert failed" } }),
      })),
    };
    vi.mocked(getAdminClient).mockReturnValue(mockSupabaseAdmin as any);

    const req = { json: async () => ({ token: "a-very-long-token-that-is-valid-length" }) } as any;
    const response = await POST(req, {} as any);
    expect(response.status).toBe(500);
  });
});
