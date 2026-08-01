/**
 * Tests for POST /api/contact
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { getAdminClient } from "@/lib/supabase/admin";
import { processContactSubmission, contactSchema } from "@/lib/contact/service";
import { getClientIp } from "@/lib/utils.server";
import { contactRateLimiter } from "@/lib/ratelimit";

// Mock dependencies
vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: vi.fn(),
}));

vi.mock("@/lib/security/app-check", () => ({
  withSecurity: vi.fn((handler) => handler),
}));

vi.mock("@/lib/contact/service", () => ({
  processContactSubmission: vi.fn(),
  contactSchema: {
    safeParse: vi.fn((data) => ({ success: true, data })),
  },
}));

vi.mock("@/lib/utils.server", () => ({
  getClientIp: vi.fn(),
}));

vi.mock("@/lib/ratelimit", () => ({
  contactRateLimiter: {
    limit: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    dev: vi.fn(),
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

const MOCK_SUBMISSION = {
  name: "Test User",
  email: "test@example.com",
  subject: "Test Subject",
  message: "Test Message",
};

describe("POST /api/contact", () => {
  const mockAuthGetUser = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (nextHeaders as any).mockResolvedValue(new Headers({ "user-agent": "test-agent" }));
    (getAdminClient as any).mockReturnValue({
      auth: { getUser: mockAuthGetUser },
    });
    (getClientIp as any).mockReturnValue("127.0.0.1");
    (contactRateLimiter.limit as any).mockResolvedValue({ success: true, reset: Date.now() + 60000 });
  });

  it("returns 400 when client IP cannot be determined", async () => {
    (getClientIp as any).mockReturnValue(null);
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/contact", { method: "POST" });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Unable to determine client IP" });
  });

  it("returns 429 when rate limit is exceeded", async () => {
    (contactRateLimiter.limit as any).mockResolvedValueOnce({ success: false, reset: Date.now() + 60000 });
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/contact", { method: "POST" });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Too many requests. Please wait before submitting again." });
  });

  it("returns 400 for malformed JSON body", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/contact", { 
      method: "POST",
      body: "not-json"
    });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid request body" });
  });

  it("returns 400 when validation fails", async () => {
    (contactSchema.safeParse as any).mockReturnValueOnce({
      success: false,
      error: { issues: [{ message: "Invalid email" }] }
    });
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/contact", { 
      method: "POST",
      body: JSON.stringify(MOCK_SUBMISSION)
    });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid email" });
  });

  it("processes submission with auth user", async () => {
    mockAuthGetUser.mockResolvedValueOnce({ data: { user: { id: "user-123" } }, error: null });
    (processContactSubmission as any).mockResolvedValueOnce({ success: true, id: "msg-123" });
    (nextHeaders as any).mockResolvedValue(new Headers({ 
      "authorization": "Bearer token",
      "user-agent": "test-agent"
    }));

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/contact", { 
      method: "POST",
      body: JSON.stringify(MOCK_SUBMISSION)
    });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, id: "msg-123" });
    expect(processContactSubmission).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      MOCK_SUBMISSION,
      expect.objectContaining({ userId: "user-123", userAgent: "test-agent" })
    );
  });

  it("returns 500 when submission flow fails", async () => {
    (processContactSubmission as any).mockResolvedValueOnce({ success: false, error: "Internal Error" });
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/contact", { 
      method: "POST",
      body: JSON.stringify(MOCK_SUBMISSION)
    });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal Error" });
  });

  it("uses decryptedBody if provided by withSecurity", async () => {
    (processContactSubmission as any).mockResolvedValueOnce({ success: true, id: "msg-contact" });
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/contact", { method: "POST" });
    // withSecurity passes decryptedBody as second argument
    const res = await POST(req as any, { decryptedBody: MOCK_SUBMISSION, params: {} } as any);
    expect(res.status).toBe(200);
    expect(processContactSubmission).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      MOCK_SUBMISSION,
      expect.anything()
    );
  });
});
