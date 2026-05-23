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
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

const MOCK_INSTRUCTOR = {
  courseCode: "CS101",
  instructorName: "Dr. Jane Smith",
};

describe("POST /api/instructors/upsert", () => {
  const mockAuthGetUser = vi.fn();
  const mockFrom = vi.fn();
  const mockSelect = vi.fn();
  const mockEq = vi.fn();
  const mockSingle = vi.fn();
  const mockUpsert = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (createClient as any).mockResolvedValue({
      auth: { getUser: mockAuthGetUser },
      from: mockFrom,
    });

    mockFrom.mockReturnValue({
      select: mockSelect,
      upsert: mockUpsert,
    });
    mockSelect.mockReturnValue({
      eq: mockEq,
    });
    mockEq.mockReturnValue({
      single: mockSingle,
    });

    mockAuthGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    mockSingle.mockResolvedValue({ data: { class_id: "class-456" }, error: null });
    mockUpsert.mockResolvedValue({ error: null });
  });

  it("returns 400 when required fields are missing", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/instructors/upsert", { 
      method: "POST",
      body: JSON.stringify({ courseCode: "CS101" }) 
    });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing required fields" });
  });

  it("returns 401 when user is not authenticated", async () => {
    mockAuthGetUser.mockResolvedValueOnce({ data: { user: null }, error: new Error("Unauthorized") });
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/instructors/upsert", { 
      method: "POST",
      body: JSON.stringify(MOCK_INSTRUCTOR)
    });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when no class is associated with profile", async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: "No class" } });
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/instructors/upsert", { 
      method: "POST",
      body: JSON.stringify(MOCK_INSTRUCTOR)
    });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No class associated with your profile" });
  });

  it("returns 200 when instructor is upserted successfully", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/instructors/upsert", { 
      method: "POST",
      body: JSON.stringify(MOCK_INSTRUCTOR)
    });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "Instructor saved successfully" });
    expect(mockUpsert).toHaveBeenCalledWith({
      class_id: "class-456",
      course_code: "CS101",
      instructor_name: "Dr. Jane Smith",
      updated_by: "user-123"
    }, {
      onConflict: "class_id, course_code"
    });
  });

  it("returns 500 when database upsert fails", async () => {
    mockUpsert.mockResolvedValueOnce({ error: { message: "Upsert failed" } });
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/instructors/upsert", { 
      method: "POST",
      body: JSON.stringify(MOCK_INSTRUCTOR)
    });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to save instructor to database" });
  });
});
