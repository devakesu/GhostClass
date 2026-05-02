import { describe, it, expect, vi, beforeEach } from "vitest";
import { upsertInstructorAction } from "../instructors";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    dev: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

describe("instructor actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe("upsertInstructorAction", () => {
    it("returns error if courseCode or instructorName is missing", async () => {
      const formData = new FormData();
      formData.append("courseCode", "");
      const result = await upsertInstructorAction(formData);
      expect(result.error).toBe("Course code and instructor name are required");
    });

    it("successfully upserts an instructor", async () => {
      const formData = new FormData();
      formData.append("courseCode", "CS 101");
      formData.append("instructorName", "john doe");
      formData.append("semester", "Odd");
      formData.append("academicYear", "2024-25");
      formData.append("cf-turnstile-response", "valid");

      vi.mocked(fetch).mockResolvedValue({
        json: async () => ({ success: true }),
      } as any);

      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-id" } } }),
        },
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { class_id: "class-id" } }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      };
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any);

      const result = await upsertInstructorAction(formData);

      expect(result).toEqual({});
      expect(mockSupabase.upsert).toHaveBeenCalledWith(expect.objectContaining({
        course_code: "CS101",
        instructor_name: "John Doe"
      }), expect.any(Object));
      expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    });

    it("handles database error", async () => {
        const formData = new FormData();
        formData.append("courseCode", "CS101");
        formData.append("instructorName", "John");
        formData.append("cf-turnstile-response", "valid");
  
        vi.mocked(fetch).mockResolvedValue({ json: async () => ({ success: true }) } as any);
  
        const mockSupabase = {
          auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u" } } }) },
          from: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { class_id: "c" } }),
          upsert: vi.fn().mockResolvedValue({ error: { message: "Fail" } }),
        };
        vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  
        const result = await upsertInstructorAction(formData);
        expect(result.error).toBe("Failed to save instructor to database");
      });
  });
});
