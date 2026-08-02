import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cn,
  compressImage,
  formatCourseCode,
  formatSessionName,
  generateSlotKey,
  getAppDomain,
  getSessionNumber,
  isValidAvatarUrl,
  normalizeDate,
  normalizeSession,
  normalizeToISODate,
  redact,
  toRoman,
  toTitleCase,
} from "../utils";

describe("utils.ts", () => {
  describe("cn", () => {
    it("merges tailwind classes", () => {
      expect(cn("px-2", "px-4")).toBe("px-4");
      expect(cn("px-2 py-1", { "bg-red-500": true })).toBe(
        "px-2 py-1 bg-red-500",
      );
    });
  });

  describe("toTitleCase", () => {
    it("converts string to title case", () => {
      expect(toTitleCase("JOHN DOE")).toBe("John Doe");
      expect(toTitleCase("  jane   smith  ")).toBe("Jane Smith");
      expect(toTitleCase("")).toBe("");
    });
  });

  describe("toRoman", () => {
    it("converts numbers to Roman numerals", () => {
      expect(toRoman(1)).toBe("I");
      expect(toRoman("5")).toBe("V");
      expect(toRoman(12)).toBe("XII");
    });

    it("returns original value for out-of-range or invalid inputs", () => {
      expect(toRoman(0)).toBe("0");
      expect(toRoman(13)).toBe("13");
      expect(toRoman("invalid")).toBe("invalid");
    });
  });

  describe("redact", () => {
    it("redacts email and id deterministically", () => {
      const email = "test@example.com";
      const h1 = redact("email", email);
      const h2 = redact("email", email);
      expect(h1).toBe(h2);
      expect(h1).toHaveLength(12);
      expect(h1).toMatch(/^[0-9a-f]{12}$/);

      const id = "12345";
      const h3 = redact("id", id);
      expect(h3).not.toBe(h1);
      expect(h3).toHaveLength(12);
    });
  });

  describe("normalizeSession", () => {
    it("normalizes various session strings", () => {
      expect(normalizeSession("Session 1")).toBe("1");
      expect(normalizeSession("2nd Hour")).toBe("2");
      expect(normalizeSession("iii")).toBe("3");
      expect(normalizeSession("Extra")).toBe("EXTRA");
      expect(normalizeSession("Lecture 5")).toBe("5");
      expect(normalizeSession("vii extra")).toBe("7");
      expect(normalizeSession("8th Period")).toBe("8");
      expect(normalizeSession("")).toBe("UNKNOWN");
      expect(normalizeSession(null as any)).toBe("UNKNOWN");
      expect(normalizeSession(undefined as any)).toBe("UNKNOWN");
    });
  });

  describe("normalizeToISODate", () => {
    it("converts various formats to YYYY-MM-DD", () => {
      expect(normalizeToISODate("2024-01-15T10:30:00Z")).toBe("2024-01-15");
      expect(normalizeToISODate("15/01/2024")).toBe("2024-01-15");
      expect(normalizeToISODate("15-01-2024")).toBe("2024-01-15");
      expect(normalizeToISODate("20251201")).toBe("2025-12-01");
      expect(normalizeToISODate("invalid")).toBe("invalid");
      expect(normalizeToISODate("")).toBe("");
    });
  });

  describe("normalizeDate", () => {
    it("converts to YYYYMMDD", () => {
      expect(normalizeDate(new Date(2024, 0, 15))).toBe("20240115");
      expect(normalizeDate("2024-01-15")).toBe("20240115");
      expect(normalizeDate("15/01/2024")).toBe("20240115");
      expect(normalizeDate("")).toBe("");
      expect(normalizeDate("2024-01-15T10:00:00Z")).toBe("20240115");

      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(normalizeDate("not-a-date")).toBe("");
      expect(spy).toHaveBeenCalled();
    });
  });

  describe("formatSessionName", () => {
    it("formats small numbers as ordinals", () => {
      expect(formatSessionName("1")).toBe("1st Hour");
      expect(formatSessionName("2")).toBe("2nd Hour");
      expect(formatSessionName("3")).toBe("3rd Hour");
      expect(formatSessionName("4")).toBe("4th Hour");
      expect(formatSessionName("11")).toBe("11th Hour");
      expect(formatSessionName("12")).toBe("12th Hour");
      expect(formatSessionName("13")).toBe("13th Hour");
    });

    it("handles roman numerals and edge cases", () => {
      expect(formatSessionName("i")).toBe("1st Hour");
      expect(formatSessionName("iii")).toBe("3rd Hour");
      expect(formatSessionName("ix")).toBe("9th Hour");
      expect(formatSessionName("Lab")).toBe("Session Lab");
      expect(formatSessionName("Session 1")).toBe("1st Hour");
      expect(formatSessionName("")).toBe("");
    });

    it("formats large numbers with prefix", () => {
      expect(formatSessionName("21")).toBe("Session 21");
    });
  });

  describe("isValidAvatarUrl", () => {
    const supabaseUrl = "https://project.supabase.co";

    beforeEach(() => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl);
    });

    it("returns false for empty or non-URL strings", () => {
      expect(isValidAvatarUrl(null)).toBe(false);
      expect(isValidAvatarUrl("")).toBe(false);
      expect(isValidAvatarUrl("not-a-url")).toBe(false);
    });

    it("returns false for non-https protocols", () => {
      expect(isValidAvatarUrl("http://example.com")).toBe(false);
    });

    it("returns true if it matches the Supabase hostname", () => {
      expect(
        isValidAvatarUrl(
          "https://project.supabase.co/storage/v1/object/public/avatars/test.png",
        ),
      ).toBe(true);
    });

    it("returns true even if it points to a different hostname (validation moved to next.config.ts)", () => {
      expect(isValidAvatarUrl("https://other-project.supabase.co/test.png"))
        .toBe(true);
      expect(isValidAvatarUrl("https://evil.com/test.png")).toBe(true);
    });

    it("is permissive if NEXT_PUBLIC_SUPABASE_URL is missing", () => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
      expect(isValidAvatarUrl("https://any-domain.com/test.png")).toBe(true);
    });
  });

  describe("getSessionNumber", () => {
    it("extracts numeric value from session name", () => {
      expect(getSessionNumber("1st Hour")).toBe(1);
      expect(getSessionNumber("iii")).toBe(3);
      expect(getSessionNumber("Session 5")).toBe(5);
      expect(getSessionNumber("Lab")).toBe(999);
      expect(getSessionNumber("IX")).toBe(9);
      expect(getSessionNumber("")).toBe(999);
    });
    it("returns empty string for non-numeric date parts in DD/MM/YYYY", () => {
      expect(normalizeDate("12/AA/2024")).toBe("");
    });
  });

  describe("getAppDomain", () => {
    it("returns domain from environment", () => {
      vi.stubEnv("NEXT_PUBLIC_APP_DOMAIN", "test.com");
      expect(getAppDomain()).toBe("test.com");
    });

    it("falls back to default domain", () => {
      vi.stubEnv("NEXT_PUBLIC_APP_DOMAIN", "");
      vi.stubEnv("NEXT_PUBLIC_DEFAULT_DOMAIN", "default.com");
      expect(getAppDomain()).toBe("default.com");
    });

    it("falls back to window.location.hostname in dev", () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("NEXT_PUBLIC_APP_DOMAIN", "");
      vi.stubEnv("NEXT_PUBLIC_DEFAULT_DOMAIN", "");

      const originalWindow = global.window;
      global.window = { location: { hostname: "my-app.com" } } as any;

      expect(getAppDomain()).toBe("my-app.com");

      global.window = originalWindow;
    });

    it("ignores localhost/IPs in dev fallback", () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("NEXT_PUBLIC_APP_DOMAIN", "");

      const originalWindow = global.window;
      global.window = { location: { hostname: "localhost" } } as any;
      expect(getAppDomain("fallback.com")).toBe("fallback.com");

      global.window = { location: { hostname: "127.0.0.1" } } as any;
      expect(getAppDomain("fallback.com")).toBe("fallback.com");

      global.window = originalWindow;
    });

    it("warns in production if no env var set", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_APP_DOMAIN", "");
      vi.stubEnv("NEXT_PUBLIC_DEFAULT_DOMAIN", "");

      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      getAppDomain();
      expect(spy).toHaveBeenCalledWith(expect.stringContaining("SECURITY"));
    });
  });

  describe("isValidAvatarUrl", () => {
    it("validates Supabase avatar URLs", () => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
      expect(
        isValidAvatarUrl(
          "https://abc.supabase.co/storage/v1/object/public/avatars/u.png",
        ),
      ).toBe(true);
      expect(isValidAvatarUrl("http://abc.supabase.co/u.png")).toBe(false);
      expect(isValidAvatarUrl("https://other.com/u.png")).toBe(true);
      expect(isValidAvatarUrl(null)).toBe(false);
      expect(isValidAvatarUrl("not-a-url")).toBe(false);
    });

    it("allows any HTTPS URL if SUPABASE_URL is missing", () => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
      expect(isValidAvatarUrl("https://anywhere.com/img.png")).toBe(true);
    });
  });

  describe("generateSlotKey", () => {
    it("generates a canonical slot key", () => {
      expect(generateSlotKey(101, "2024-01-15", 1)).toBe("101_20240115_I");
      expect(generateSlotKey("CS101", "2024-01-15", "iii")).toBe(
        "CS101_20240115_III",
      );
    });
  });

  describe("formatCourseCode", () => {
    it("removes whitespace and handles hyphens", () => {
      expect(formatCourseCode("CS 101-A")).toBe("CS101A");
      expect(formatCourseCode("MATH 201")).toBe("MATH201");
    });
  });

  describe("compressImage", () => {
    it("rejects invalid quality values", async () => {
      const file = new File([""], "test.png", { type: "image/png" });
      await expect(compressImage(file, -1)).rejects.toThrow(RangeError);
      await expect(compressImage(file, 2)).rejects.toThrow(RangeError);
      await expect(compressImage(file, NaN)).rejects.toThrow(RangeError);
    });

    it("should reject if canvas context is null", async () => {
      const mockCanvas = {
        getContext: vi.fn().mockReturnValue(null),
      };
      vi.spyOn(document, "createElement").mockReturnValue(mockCanvas as any);

      // Mock FileReader
      const mockReader = {
        readAsDataURL: vi.fn().mockImplementation(function (this: any) {
          setTimeout(() => {
            if (this.onload) {
              this.onload({ target: { result: "data:image/png;base64," } });
            }
          }, 0);
        }),
      };
      vi.stubGlobal(
        "FileReader",
        vi.fn().mockImplementation(function () {
          return mockReader;
        }),
      );

      // Mock Image
      const mockImage = {
        set src(_: string) {
          setTimeout(() => (this as any).onload(), 0);
        },
      };
      vi.stubGlobal(
        "Image",
        vi.fn().mockImplementation(function () {
          return mockImage;
        }),
      );

      const file = new File(["test"], "test.png", { type: "image/png" });
      await expect(compressImage(file, 0.5)).rejects.toThrow(
        "Failed to get canvas context",
      );
    });

    it("should reject if blob is null", async () => {
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn().mockReturnValue({
          fillStyle: "",
          fillRect: vi.fn(),
          drawImage: vi.fn(),
        }),
        toBlob: vi.fn().mockImplementation((cb) => cb(null)),
      };
      vi.spyOn(document, "createElement").mockReturnValue(mockCanvas as any);

      const mockImage = {
        set src(_: string) {
          setTimeout(() => (this as any).onload(), 0);
        },
      };
      vi.stubGlobal(
        "Image",
        vi.fn().mockImplementation(function () {
          return mockImage;
        }),
      );

      const file = new File(["test"], "test.png", { type: "image/png" });
      await expect(compressImage(file, 0.5)).rejects.toThrow("Canvas is empty");
    });

    it("compresses image (mocked)", async () => {
      // Mocking the browser-specific parts
      const mockBlob = new Blob(["compressed"], { type: "image/jpeg" });
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn().mockReturnValue({
          fillStyle: "",
          fillRect: vi.fn(),
          drawImage: vi.fn(),
        }),
        toBlob: vi.fn().mockImplementation((cb) => cb(mockBlob)),
      };

      const spyCreate = vi.spyOn(document, "createElement").mockReturnValue(
        mockCanvas as any,
      );

      // Mock FileReader
      const mockReader = {
        readAsDataURL: vi.fn().mockImplementation(function (this: any) {
          setTimeout(() => {
            if (this.onload) {
              this.onload({ target: { result: "data:image/png;base64," } });
            }
          }, 0);
        }),
      };
      vi.stubGlobal(
        "FileReader",
        vi.fn().mockImplementation(function () {
          return mockReader;
        }),
      );

      // Mock Image
      const mockImage = {
        width: 2000,
        height: 1000,
        set src(_: string) {
          setTimeout(() => (this as any).onload(), 0);
        },
      };
      vi.stubGlobal(
        "Image",
        vi.fn().mockImplementation(function () {
          return mockImage;
        }),
      );

      const file = new File(["original"], "test.png", { type: "image/png" });
      const result = await compressImage(file, 0.5);

      expect(result).toBeInstanceOf(File);
      expect(result.name).toBe("test.jpg");
      expect(mockCanvas.width).toBe(1920); // Scaled down

      spyCreate.mockRestore();
    });
  });
});
