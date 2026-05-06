/**
 * Tests for GET /api/backend/user-settings
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Mock dependencies
vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
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

describe("GET /api/backend/user-settings", () => {
  const mockAuthGetUser = vi.fn();
  const mockFrom = vi.fn();
  const mockSelect = vi.fn();
  const mockEq = vi.fn();
  const mockMaybeSingle = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (createClient as any).mockResolvedValue({
      auth: { getUser: mockAuthGetUser },
      from: mockFrom,
    });

    mockFrom.mockReturnValue({
      select: mockSelect,
    });
    mockSelect.mockReturnValue({
      eq: mockEq,
    });
    mockEq.mockReturnValue({
      maybeSingle: mockMaybeSingle,
    });

    mockAuthGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    mockMaybeSingle.mockResolvedValue({ data: { bunk_calculator_enabled: true, target_percentage: 75 }, error: null });
  });

  it("returns 401 when user is not authenticated", async () => {
    mockAuthGetUser.mockResolvedValueOnce({ data: { user: null }, error: new Error("Unauthorized") });
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/backend/user-settings");
    const res = await GET(req, { params: {} });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 500 when settings fetch fails", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: "DB Error" } });
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/backend/user-settings");
    const res = await GET(req, { params: {} });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to fetch settings" });
  });

  it("returns settings on success", async () => {
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/backend/user-settings");
    const res = await GET(req, { params: {} });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settings).toEqual({ bunk_calculator_enabled: true, target_percentage: 75 });
  });

  it("handles unexpected errors", async () => {
    mockFrom.mockImplementationOnce(() => { throw new Error("Boom"); });
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/backend/user-settings");
    const res = await GET(req, { params: {} });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
  });
});
