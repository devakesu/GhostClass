/**
 * Tests for POST /api/analytics/track
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { trackGA4Event } from "@/lib/analytics";
import { syncRateLimiter } from "@/lib/ratelimit";
import { getClientIp as _getClientIp } from "@/lib/utils.server";

// Mock dependencies
vi.mock("server-only", () => ({}));

vi.mock("@/lib/analytics", () => ({
  trackGA4Event: vi.fn(),
}));

vi.mock("@/lib/ratelimit", () => ({
  syncRateLimiter: {
    limit: vi.fn(() => Promise.resolve({ success: true, reset: 0 })),
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
    error: vi.fn(),
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

describe("POST /api/analytics/track", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when IP cannot be determined", async () => {
    vi.mocked(_getClientIp).mockReturnValueOnce(null);
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/analytics/track", {
      method: "POST",
    });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(syncRateLimiter.limit).mockResolvedValueOnce({
      success: false,
      reset: Date.now() + 1000,
      limit: 1,
      remaining: 0,
      pending: Promise.resolve(),
    });
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/analytics/track", {
      method: "POST",
    });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid body", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/analytics/track", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(400);
  });

  it("returns 400 when missing fields", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/analytics/track", {
      method: "POST",
      body: JSON.stringify({ clientId: "123" }), // missing events
    });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(400);
  });

  it("tracks events successfully", async () => {
    const { POST } = await import("../route");
    const body = {
      clientId: "client-123",
      events: [{ name: "page_view", params: { page: "/" } }],
      userProperties: { role: "admin", status: { value: "active" } },
    };
    const req = new NextRequest("http://localhost/api/analytics/track", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(200);
    expect(trackGA4Event).toHaveBeenCalledWith(
      "client-123",
      [{ name: "page_view", params: { page: "/" } }],
      { role: { value: "admin" }, status: { value: "active" } },
    );
  });

  it("uses decryptedBody if provided", async () => {
    const { POST } = await import("../route");
    const body = {
      clientId: "client-123",
      events: [{ name: "mobile_event" }],
    };
    const req = new NextRequest("http://localhost/api/analytics/track", {
      method: "POST",
    });
    const res = await POST(req, { decryptedBody: body, params: {} } as any);
    expect(res.status).toBe(200);
    expect(trackGA4Event).toHaveBeenCalled();
  });

  it("returns 500 on tracking error", async () => {
    vi.mocked(trackGA4Event).mockRejectedValueOnce(
      new Error("Tracking failed"),
    );
    const { POST } = await import("../route");
    const body = {
      clientId: "client-123",
      events: [{ name: "test" }],
    };
    const req = new NextRequest("http://localhost/api/analytics/track", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(500);
  });
});
