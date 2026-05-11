import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../route";
import { NextRequest } from "next/server";

// Mock dependencies
vi.mock("@/lib/security/app-check", () => ({
  withSecurity: (handler: any) => (req: any, context: any = {}) => handler(req, context),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "test-user" } }, error: null }),
    },
  })),
}));

vi.mock("@/lib/security/auth-cookie", () => ({
  getAuthTokenServer: vi.fn().mockResolvedValue("test-token"),
}));

vi.mock("@/lib/ezygo-batch-fetcher", () => ({
  fetchEzygoData: vi.fn(),
}));

vi.mock("@/lib/ratelimit", () => ({
  proxyRateLimiter: {
    limit: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock("@/lib/utils.server", () => ({
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
  },
}));

describe("POST /api/scores/batch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new NextRequest("http://localhost/api/scores/batch", {
      method: "POST",
      body: "invalid json",
    });

    const res = await POST(req, {});
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid JSON payload");
  });

  it("returns 400 for invalid request schema", async () => {
    const req = new NextRequest("http://localhost/api/scores/batch", {
      method: "POST",
      body: JSON.stringify({ examIds: "not-an-array" }),
    });

    const res = await POST(req, {});
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid request format");
  });

  it("fetches data for multiple exams in parallel", async () => {
    const { fetchEzygoData } = await import("@/lib/ezygo-batch-fetcher");
    vi.mocked(fetchEzygoData)
      .mockResolvedValueOnce([{ id: 1, question: "Q1" }]) // exam 1 questions
      .mockResolvedValueOnce([{ exam_id: 1, answer: "A1" }]) // exam 1 answers
      .mockResolvedValueOnce([{ id: 2, question: "Q2" }]) // exam 2 questions
      .mockResolvedValueOnce([{ exam_id: 2, answer: "A2" }]); // exam 2 answers

    const req = new NextRequest("http://localhost/api/scores/batch", {
      method: "POST",
      body: JSON.stringify({ examIds: [1, 2] }),
    });

    const res = await POST(req, {});
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data[1].questions).toHaveLength(1);
    expect(data[2].answers).toHaveLength(1);
    expect(fetchEzygoData).toHaveBeenCalledTimes(4);
  });

  it("handles partial failures and returns errors per exam", async () => {
    const { fetchEzygoData } = await import("@/lib/ezygo-batch-fetcher");
    vi.mocked(fetchEzygoData)
      .mockResolvedValueOnce([{ id: 1, question: "Q1" }])
      .mockResolvedValueOnce([{ exam_id: 1, answer: "A1" }])
      .mockRejectedValueOnce(new Error("EzyGo Timeout"));

    const req = new NextRequest("http://localhost/api/scores/batch", {
      method: "POST",
      body: JSON.stringify({ examIds: [1, 2] }),
    });

    const res = await POST(req, {});
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data[1].questions).toHaveLength(1);
    expect(data[2].error).toBe("EzyGo Timeout");
  });

  it("returns 401 if unauthorized", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error("Auth failed") }),
      },
    } as any);

    const req = new NextRequest("http://localhost/api/scores/batch", {
      method: "POST",
      body: JSON.stringify({ examIds: [1] }),
    });

    const res = await POST(req, {});
    expect(res.status).toBe(401);
  });
});
