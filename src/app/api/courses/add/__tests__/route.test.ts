/**
 * Tests for POST /api/courses/add
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
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

const MOCK_COURSE = {
  courseCode: "CS101",
  courseName: "Intro to Computer Science",
};

describe("POST /api/courses/add", () => {
  const mockAuthGetUser = vi.fn();
  const mockFrom = vi.fn();
  const mockSelect = vi.fn();
  const mockEq = vi.fn();
  const mockSingle = vi.fn();
  const mockInsert = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (createClient as any).mockResolvedValue({
      auth: { getUser: mockAuthGetUser },
      from: mockFrom,
    });

    mockFrom.mockReturnValue({
      select: mockSelect,
      insert: mockInsert,
    });
    mockSelect.mockReturnValue({
      eq: mockEq,
    });
    mockEq.mockReturnValue({
      single: mockSingle,
    });

    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: { class_id: "class-456" },
      error: null,
    });
    mockInsert.mockResolvedValue({ error: null });
  });

  it("returns 400 when required fields are missing", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/courses/add", {
      method: "POST",
      body: JSON.stringify({ courseCode: "CS101" }),
    });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing required fields" });
  });

  it("returns 401 when user is not authenticated", async () => {
    mockAuthGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: new Error("Unauthorized"),
    });
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/courses/add", {
      method: "POST",
      body: JSON.stringify(MOCK_COURSE),
    });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when no class is associated with profile", async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "No class" },
    });
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/courses/add", {
      method: "POST",
      body: JSON.stringify(MOCK_COURSE),
    });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "No class associated with your profile",
    });
  });

  it("returns 201 when course is added successfully", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/courses/add", {
      method: "POST",
      body: JSON.stringify(MOCK_COURSE),
    });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ message: "Course added successfully" });
    expect(mockInsert).toHaveBeenCalledWith({
      class_id: "class-456",
      course_code: "CS101",
      course_name: "Intro to Computer Science",
      created_by: "user-123",
    });
  });

  it("returns 409 when course already exists", async () => {
    mockInsert.mockResolvedValueOnce({ error: { code: "23505" } });
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/courses/add", {
      method: "POST",
      body: JSON.stringify(MOCK_COURSE),
    });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "This course is already in your class lineup.",
    });
  });

  it("returns 500 when database insert fails", async () => {
    mockInsert.mockResolvedValueOnce({ error: { message: "Insert failed" } });
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/courses/add", {
      method: "POST",
      body: JSON.stringify(MOCK_COURSE),
    });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Failed to add course to lineup",
    });
  });

  it("handles unexpected errors", async () => {
    mockFrom.mockImplementationOnce(() => {
      throw new Error("Boom");
    });
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/courses/add", {
      method: "POST",
      body: JSON.stringify(MOCK_COURSE),
    });
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "An internal error occurred" });
  });
});
