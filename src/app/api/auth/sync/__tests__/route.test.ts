/**
 * Tests for POST /api/auth/sync
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { authRateLimiter } from "@/lib/ratelimit";

const { isMobileRequest } = vi.hoisted(() => ({
  isMobileRequest: vi.fn(),
}));

// Mock dependencies
vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/security/auth-cookie", () => ({
  getAuthTokenWithFallback: vi.fn(() => "web-token"),
}));

vi.mock("@/lib/crypto", () => ({
  decrypt: vi.fn((_iv, content) => `decrypted-${content}`),
}));

vi.mock("@/lib/ratelimit", () => ({
  authRateLimiter: {
    limit: vi.fn(() => Promise.resolve({ success: true, reset: 0, limit: 10, remaining: 9 })),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("@/lib/utils.server", () => ({
  getClientIp: vi.fn(() => "127.0.0.1"),
  redact: vi.fn((_, val) => val),
}));

vi.mock("@/lib/security/app-check", () => ({
  withSecurity: vi.fn((handler) => (req: any, context: any) => handler(req, {
    ...context,
    authType: isMobileRequest() ? "app-check" : "csrf"
  })),
  isMobileRequest,
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

describe("POST /api/auth/sync", () => {
  const mockAuthGetUser = vi.fn();
  const mockAdminMaybeSingle = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (getAdminClient as any).mockReturnValue({
      auth: { getUser: mockAuthGetUser },
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: mockAdminMaybeSingle,
      })),
    });
    (createClient as any).mockResolvedValue({
      auth: { getUser: mockAuthGetUser },
    });
    (isMobileRequest as any).mockReturnValue(false);
  });

  it("returns 400 when IP cannot be determined", async () => {
    const { getClientIp } = await import("@/lib/utils.server");
    vi.mocked(getClientIp).mockReturnValueOnce(null);
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/auth/sync", { method: "POST" });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(authRateLimiter.limit).mockResolvedValueOnce({ success: false, reset: Date.now() + 1000, limit: 1, remaining: 0, pending: Promise.resolve() });
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/auth/sync", { method: "POST" });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(429);
  });

  it("handles mobile auth sync successfully", async () => {
    (isMobileRequest as any).mockReturnValue(true);
    mockAuthGetUser.mockResolvedValueOnce({ data: { user: { id: "mobile-user" } }, error: null });
    mockAdminMaybeSingle.mockResolvedValueOnce({ 
      data: { id: "123", ezygo_token: "token", ezygo_iv: "iv", terms_version: "1.0", terms_accepted_at: "now" }, 
      error: null 
    });

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/auth/sync", { 
      method: "POST",
      headers: { authorization: "Bearer valid-token" }
    });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.ezygo_token).toBe("decrypted-token");
  });

  it("returns 401 for mobile if Authorization header is missing", async () => {
    (isMobileRequest as any).mockReturnValue(true);
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/auth/sync", { method: "POST" });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(401);
  });

  it("handles web auth sync successfully", async () => {
    (isMobileRequest as any).mockReturnValue(false);
    mockAuthGetUser.mockResolvedValueOnce({ data: { user: { id: "web-user" } }, error: null });
    mockAdminMaybeSingle.mockResolvedValueOnce({ 
      data: { id: "456", ezygo_token: "token", ezygo_iv: "iv" }, 
      error: null 
    });

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/auth/sync", { method: "POST" });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, message: "Authentication healed" });
  });

  it("retries getUser on failure", async () => {
    (isMobileRequest as any).mockReturnValue(false);
    mockAuthGetUser
      .mockRejectedValueOnce(new Error("Network fail"))
      .mockResolvedValueOnce({ data: { user: { id: "web-user" } }, error: null });
    
    mockAdminMaybeSingle.mockResolvedValueOnce({ data: { id: "456" }, error: null });

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/auth/sync", { method: "POST" });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(200);
    expect(mockAuthGetUser).toHaveBeenCalledTimes(2);
  });

  it("returns 404 when profile is not found", async () => {
    mockAuthGetUser.mockResolvedValueOnce({ data: { user: { id: "no-profile-user" } }, error: null });
    mockAdminMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/auth/sync", { method: "POST" });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(404);
  });

  it("handles decryption failure gracefully", async () => {
    mockAuthGetUser.mockResolvedValueOnce({ data: { user: { id: "user" } }, error: null });
    mockAdminMaybeSingle.mockResolvedValueOnce({ 
      data: { id: "123", ezygo_token: "token", ezygo_iv: "iv" }, 
      error: null 
    });
    vi.mocked(decrypt).mockImplementationOnce(() => { throw new Error("Decryption failed"); });

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/auth/sync", { method: "POST" });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(200); // Decryption failure for ezygo token shouldn't fail the whole sync
  });

  it("returns 500 on unexpected errors", async () => {
    mockAuthGetUser.mockRejectedValue(new Error("Boom"));
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/auth/sync", { method: "POST" });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(500);
  });
});
