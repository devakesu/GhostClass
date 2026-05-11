/**
 * Tests for POST /api/attendance/summary-batch
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthTokenServer } from "@/lib/security/auth-cookie";
import { fetchEzygoData } from "@/lib/ezygo-batch-fetcher";
import { proxyRateLimiter } from "@/lib/ratelimit";
import { getClientIp as _getClientIp } from "@/lib/utils.server";

// Mock dependencies
vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/security/auth-cookie", () => ({
  getAuthTokenServer: vi.fn(() => "token-123"),
}));

vi.mock("@/lib/ezygo-batch-fetcher", () => ({
  fetchEzygoData: vi.fn(),
}));

vi.mock("@/lib/ratelimit", () => ({
  proxyRateLimiter: {
    limit: vi.fn(() => Promise.resolve({ success: true })),
  },
}));

vi.mock("@/lib/utils.server", () => ({
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("@/lib/security/app-check", () => ({
  withSecurity: vi.fn((handler) => handler),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
  },
}));

describe("POST /api/attendance/summary-batch", () => {
  const mockAuthGetUser = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    (createClient as any).mockResolvedValue({
      auth: { getUser: mockAuthGetUser },
    });
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
  });

  it("returns 400 when IP cannot be determined", async () => {
    const { getClientIp } = await import("@/lib/utils.server");
    vi.mocked(getClientIp).mockReturnValueOnce(null);
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/attendance/summary-batch", { method: "POST" });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate limited", async () => {
    const { POST } = await import("../route");
    vi.mocked(proxyRateLimiter.limit).mockResolvedValueOnce({ success: false } as any);
    const req = new NextRequest("http://localhost/api/attendance/summary-batch", { method: "POST" });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(429);
  });

  it("returns 401 when unauthorized", async () => {
    const { POST } = await import("../route");
    mockAuthGetUser.mockResolvedValueOnce({ data: { user: null }, error: new Error("Unauthorized") });
    const req = new NextRequest("http://localhost/api/attendance/summary-batch", { method: "POST" });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(401);
  });

  it("returns 401 when token is missing", async () => {
    const { POST } = await import("../route");
    vi.mocked(getAuthTokenServer).mockResolvedValueOnce(undefined);
    const req = new NextRequest("http://localhost/api/attendance/summary-batch", { method: "POST" });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/attendance/summary-batch", { 
      method: "POST",
      body: "not-json"
    });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(400);
  });

  it("returns 400 if courses is not an array", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/attendance/summary-batch", { 
      method: "POST",
      body: JSON.stringify({ courses: "not-an-array" })
    });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(400);
  });

  it("batches requests successfully", async () => {
    const { POST } = await import("../route");
    vi.mocked(fetchEzygoData).mockResolvedValueOnce({ present: 10, absent: 2, total: 12 });
    
    const body = {
      courses: [
        { code: "CS101", id: 101, name: "Intro" },
        { code: "STAGING", id: 0, name: "Staging" }
      ]
    };
    const req = new NextRequest("http://localhost/api/attendance/summary-batch", { 
      method: "POST",
      body: JSON.stringify(body)
    });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(200);
    const results = await res.json();
    expect(results["CS101"]).toEqual({ present: 10, absent: 2, total: 12 });
    expect(results["STAGING"].present).toBe(0);
  });

  it("handles fetch failure for individual courses", async () => {
    const { POST } = await import("../route");
    vi.mocked(fetchEzygoData).mockImplementation(async (url) => {
      if (url.includes("/2/")) throw new Error("Fail");
      return { present: 10 };
    });
    
    const body = {
      courses: [
        { code: "OK", id: 1, name: "OK" },
        { code: "FAIL", id: 2, name: "FAIL" }
      ]
    };
    const req = new NextRequest("http://localhost/api/attendance/summary-batch", { 
      method: "POST",
      body: JSON.stringify(body)
    });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(200);
    const results = await res.json();
    expect(results["OK"]).toBeDefined();
    expect(results["FAIL"]).toBeDefined();
    expect(results["FAIL"].error).toBe("Fail");
  });

  it("uses fallback summary path if summery fails", async () => {
    const { POST } = await import("../route");
    vi.mocked(fetchEzygoData)
      .mockRejectedValueOnce(new Error("404 summery"))
      .mockResolvedValueOnce({ present: 5 });
    
    const body = {
      courses: [{ code: "TEST", id: 1, name: "TEST" }]
    };
    const req = new NextRequest("http://localhost/api/attendance/summary-batch", { 
      method: "POST",
      body: JSON.stringify(body)
    });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(200);
    expect(fetchEzygoData).toHaveBeenCalledTimes(2);
    expect(fetchEzygoData).toHaveBeenNthCalledWith(1, expect.stringContaining("summery"), "token-123");
    expect(fetchEzygoData).toHaveBeenNthCalledWith(2, expect.stringContaining("summary"), "token-123");
  });
});
