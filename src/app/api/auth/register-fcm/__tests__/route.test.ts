import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/security/app-check", () => ({
  withSecurity: (handler: any) => handler,
}));

const mockRateLimiterLimit = vi.fn();
vi.mock("@/lib/ratelimit", () => ({
  authRateLimiter: { limit: mockRateLimiterLimit },
}));

const mockGetClientIp = vi.fn().mockReturnValue("127.0.0.1");
vi.mock("@/lib/utils.server", () => ({
  getClientIp: () => mockGetClientIp(),
}));

const mockSupabaseAdminUpdate = vi.fn().mockReturnThis();
const mockSupabaseAdminEq = vi.fn().mockResolvedValue({ error: null });
const mockSupabaseAdminAuthGetUser = vi.fn().mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => ({
    auth: { getUser: mockSupabaseAdminAuthGetUser },
    from: () => ({
      update: mockSupabaseAdminUpdate,
      eq: mockSupabaseAdminEq,
    }),
  }),
}));

const mockSupabaseAuthGetUser = vi.fn().mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockSupabaseAuthGetUser },
  }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

describe("POST /api/auth/register-fcm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClientIp.mockReturnValue("127.0.0.1");
    mockRateLimiterLimit.mockResolvedValue({
      success: true,
      reset: Date.now() + 60000,
      limit: 5,
      remaining: 4,
    });
    mockSupabaseAdminAuthGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    mockSupabaseAuthGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    mockSupabaseAdminEq.mockResolvedValue({ error: null } as any);
  });

  it("returns 400 if client IP cannot be determined", async () => {
    mockGetClientIp.mockReturnValueOnce(null);
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/auth/register-fcm", { method: "POST" });
    const res = await POST(req, {} as any);
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate limit is exceeded", async () => {
    mockRateLimiterLimit.mockResolvedValueOnce({
      success: false,
      reset: Date.now() + 60000,
      limit: 5,
      remaining: 0,
    });
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/auth/register-fcm", { method: "POST" });
    const res = await POST(req, {} as any);
    expect(res.status).toBe(429);
  });

  it("returns 401 if unauthorized via Bearer token", async () => {
    mockSupabaseAdminAuthGetUser.mockResolvedValueOnce({ data: { user: null }, error: new Error("Unauthorized") });
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/auth/register-fcm", {
      method: "POST",
      headers: { authorization: "Bearer invalid-token" },
    });
    const res = await POST(req, {} as any);
    expect(res.status).toBe(401);
  });

  it("returns 401 if unauthorized via session cookies", async () => {
    mockSupabaseAuthGetUser.mockResolvedValueOnce({ data: { user: null } });
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/auth/register-fcm", { method: "POST" });
    const res = await POST(req, {} as any);
    expect(res.status).toBe(401);
  });

  it("returns 400 on empty or invalid JSON body", async () => {
    const { POST } = await import("../route");
    const req = {
      headers: new Headers({ authorization: "Bearer valid-token" }),
      json: vi.fn().mockRejectedValue(new Error("Invalid JSON")),
    } as any;
    const res = await POST(req, {} as any);
    expect(res.status).toBe(400);
  });

  it("returns 422 if validation fails (empty fcm_token)", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/auth/register-fcm", {
      method: "POST",
      headers: { authorization: "Bearer valid-token" },
      body: JSON.stringify({ fcm_token: "" }),
    });
    const res = await POST(req, {} as any);
    expect(res.status).toBe(422);
  });

  it("returns 500 if database update fails", async () => {
    mockSupabaseAdminEq.mockResolvedValueOnce({ error: new Error("DB failure") } as any);
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/auth/register-fcm", {
      method: "POST",
      headers: { authorization: "Bearer valid-token" },
      body: JSON.stringify({ fcm_token: "test-token-123" }),
    });
    const res = await POST(req, {} as any);
    expect(res.status).toBe(500);
  });

  it("successfully registers FCM token using decryptedBody", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/auth/register-fcm", {
      method: "POST",
      headers: { authorization: "Bearer valid-token" },
    });
    const res = await POST(req, { decryptedBody: { fcm_token: "decrypted-token-123" } } as any);
    expect(res.status).toBe(200);
    expect(mockSupabaseAdminUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ fcm_token: "decrypted-token-123", has_mobile_app: true }),
    );
  });
});
