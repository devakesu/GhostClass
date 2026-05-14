import { describe, it, expect, vi, beforeEach } from "vitest";
import { addCourseAction } from "../courses";
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

describe("course actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe("addCourseAction", () => {
    it("returns error if code or name is missing", async () => {
      const formData = new FormData();
      formData.append("courseCode", "");
      const result = await addCourseAction(formData);
      expect(result.error).toBe("Course code and name are required");
    });

    it("returns error if turnstile token is missing", async () => {
      const formData = new FormData();
      formData.append("courseCode", "CS101");
      formData.append("courseName", "Intro CS");
      const result = await addCourseAction(formData);
      expect(result.error).toContain("Security verification failed");
    });

    it("handles turnstile verification failure", async () => {
      const formData = new FormData();
      formData.append("courseCode", "CS101");
      formData.append("courseName", "Intro CS");
      formData.append("cf-turnstile-response", "invalid");

      vi.mocked(fetch).mockResolvedValue({
        json: async () => ({ success: false }),
      } as never);

      const result = await addCourseAction(formData);
      expect(result.error).toBe("Security verification failed. Please try again.");
    });

    it("successfully adds a course", async () => {
      const formData = new FormData();
      formData.append("courseCode", "CS 101");
      formData.append("courseName", "intro to computer science");
      formData.append("semester", "Odd");
      formData.append("academicYear", "2024-25");
      formData.append("cf-turnstile-response", "valid");

      vi.mocked(fetch).mockResolvedValue({
        json: async () => ({ success: true }),
      } as never);

      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-id" } } }),
        },
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { class_id: "class-id" } }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
      vi.mocked(createClient).mockResolvedValue(mockSupabase as never);

      const result = await addCourseAction(formData);

      expect(result).toEqual({});
      expect(mockSupabase.insert).toHaveBeenCalledWith(expect.objectContaining({
        course_code: "CS101",
        course_name: "Intro To Computer Science"
      }));
      expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    });

    it("handles duplicate course error", async () => {
      const formData = new FormData();
      formData.append("courseCode", "CS101");
      formData.append("courseName", "Intro CS");
      formData.append("cf-turnstile-response", "valid");

      vi.mocked(fetch).mockResolvedValue({ json: async () => ({ success: true }) } as never);

      const mockSupabase = {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u" } } }) },
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { class_id: "c" } }),
        insert: vi.fn().mockResolvedValue({ error: { code: "23505" } }),
      };
      vi.mocked(createClient).mockResolvedValue(mockSupabase as never);

      const result = await addCourseAction(formData);
      expect(result.error).toBe("This course is already in your class lineup.");
    });
  });
});
