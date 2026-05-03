import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../route";
import { } from "next/server";
import { isMobileRequest } from "@/lib/security/app-check";
import { validateCsrfToken } from "@/lib/security/csrf";
import { authRateLimiter } from "@/lib/ratelimit";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";

vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((data, init) => ({
      data,
      status: init?.status || 200,
      headers: new Headers(init?.headers),
    })),
  },
}));

vi.mock("@/lib/security/app-check", async () => {
  const actual = await vi.importActual<any>("@/lib/security/app-check");
  return {
    ...actual,
    isMobileRequest: vi.fn(),
    withSecurity: vi.fn((handler) => handler),
  };
});

vi.mock("@/lib/security/csrf", () => ({
  validateCsrfToken: vi.fn(),
}));

vi.mock("@/lib/ratelimit", () => ({
  authRateLimiter: {
    limit: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: vi.fn(),
}));

vi.mock("@/lib/crypto", () => ({
  decrypt: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/utils.server", () => ({
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  redact: vi.fn((_t, v) => v),
}));

vi.mock("@/lib/security/auth-cookie", () => ({
  getAuthTokenWithFallback: vi.fn(),
}));

describe("POST /api/auth/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(authRateLimiter.limit).mockResolvedValue({
      success: false,
      reset: Date.now() + 1000,
      limit: 10,
      remaining: 0,
    } as any);

    const req = new Request("http://localhost/api/auth/sync", { method: "POST" });
    const response: any = await POST(req, {} as any);

    expect(response.status).toBe(429);
    expect(response.data.message).toContain("Too many requests");
  });

  it("returns 403 for invalid CSRF token on web", async () => {
    vi.mocked(isMobileRequest).mockReturnValue(false);
    vi.mocked(authRateLimiter.limit).mockResolvedValue({ success: true } as any);
    vi.mocked(validateCsrfToken).mockResolvedValue(false);

    const req = new Request("http://localhost/api/auth/sync", {
      method: "POST",
      headers: { "x-csrf-token": "invalid" },
    });
    const response: any = await POST(req, {} as any);

    expect(response.status).toBe(403);
    expect(response.data.message).toBe("Invalid CSRF token");
  });

  it("handles successful web sync", async () => {
    vi.mocked(isMobileRequest).mockReturnValue(false);
    vi.mocked(authRateLimiter.limit).mockResolvedValue({ success: true } as any);
    vi.mocked(validateCsrfToken).mockResolvedValue(true);

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-id" } } }),
      },
    };
    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);

    const mockAdmin = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 1, ezygo_token: "enc", ezygo_iv: "iv" },
        error: null,
      }),
    };
    vi.mocked(getAdminClient).mockReturnValue(mockAdmin as any);
    vi.mocked(decrypt).mockReturnValue("decrypted-token");

    const req = new Request("http://localhost/api/auth/sync", { method: "POST" });
    const response: any = await POST(req, {} as any);

    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);
    expect(response.data.message).toBe("Authentication healed");
  });

  it("handles successful mobile sync", async () => {
    vi.mocked(isMobileRequest).mockReturnValue(true);
    vi.mocked(authRateLimiter.limit).mockResolvedValue({ success: true } as any);

    const mockAdmin = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-id" } } }),
      },
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 1, ezygo_token: "enc", ezygo_iv: "iv", terms_version: "v1" },
        error: null,
      }),
    };
    vi.mocked(getAdminClient).mockReturnValue(mockAdmin as any);
    vi.mocked(decrypt).mockReturnValue("decrypted-token");

    const req = new Request("http://localhost/api/auth/sync", {
      method: "POST",
      headers: { "authorization": "Bearer valid-token" },
    });
    const response: any = await POST(req, {} as any);

    expect(response.status).toBe(200);
    expect(response.data.ezygo_token).toBe("decrypted-token");
    expect(response.data.terms_version).toBe("v1");
  });

  it("returns 401 for mobile without auth header", async () => {
    vi.mocked(isMobileRequest).mockReturnValue(true);
    vi.mocked(authRateLimiter.limit).mockResolvedValue({ success: true } as any);

    const req = new Request("http://localhost/api/auth/sync", { method: "POST" });
    const response: any = await POST(req, {} as any);

    expect(response.status).toBe(401);
    expect(response.data.message).toBe("Unauthorized");
  });
});
