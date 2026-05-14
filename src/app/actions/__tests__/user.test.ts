import { describe, it, expect, vi, beforeEach } from "vitest";
import { acceptTermsAction, setTermsVersionCookie, clearTermsVersionCookie, clearTermsRedirectCountCookie } from "../user";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("user actions", () => {
  const mockCookieStore = {
    set: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cookies).mockResolvedValue(mockCookieStore as never);
  });

  describe("acceptTermsAction", () => {
    it("successfully accepts terms", async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-id" } } }),
        },
        from: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
      vi.mocked(createClient).mockResolvedValue(mockSupabase as never);

      await acceptTermsAction("v1");

      expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({
        terms_version: "v1"
      }));
      expect(mockCookieStore.set).toHaveBeenCalledWith(expect.objectContaining({
        name: "terms_version",
        value: "v1"
      }));
      expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    });

    it("throws error if unauthorized", async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
        },
      };
      vi.mocked(createClient).mockResolvedValue(mockSupabase as never);

      await expect(acceptTermsAction("v1")).rejects.toThrow("Unauthorized");
    });

    it("throws error if database update fails", async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-id" } } }),
        },
        from: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: { message: "DB Error" } }),
      };
      vi.mocked(createClient).mockResolvedValue(mockSupabase as never);

      await expect(acceptTermsAction("v1")).rejects.toThrow("DB Error");
    });
  });

  describe("setTermsVersionCookie", () => {
    it("sets the cookie correctly", async () => {
      await setTermsVersionCookie("v2");
      expect(mockCookieStore.set).toHaveBeenCalledWith(expect.objectContaining({
        name: "terms_version",
        value: "v2",
        maxAge: 31536000
      }));
    });
  });

  describe("clearTermsVersionCookie", () => {
    it("clears the cookie", async () => {
      await clearTermsVersionCookie();
      expect(mockCookieStore.set).toHaveBeenCalledWith(expect.objectContaining({
        name: "terms_version",
        value: "",
        maxAge: 0
      }));
    });
  });

  describe("clearTermsRedirectCountCookie", () => {
    it("clears the redirect count cookie", async () => {
      await clearTermsRedirectCountCookie();
      expect(mockCookieStore.set).toHaveBeenCalledWith(expect.objectContaining({
        name: "terms_redirect_count",
        value: "",
        maxAge: 0
      }));
    });
  });
});
