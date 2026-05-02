/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

import { submitContactForm } from "../contact";
import { headers } from "next/headers";
import { validateCsrfToken } from "@/lib/security/csrf";
import { contactRateLimiter } from "@/lib/ratelimit";
import { processContactSubmission } from "@/lib/contact/service";
import { createClient } from "@/lib/supabase/server";

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateCsrfToken: vi.fn(),
}));

vi.mock("@/lib/ratelimit", () => ({
  contactRateLimiter: {
    limit: vi.fn(),
  },
}));

vi.mock("@/lib/contact/service", async () => {
    const actual = await vi.importActual<any>("@/lib/contact/service");
    return {
        ...actual,
        processContactSubmission: vi.fn(),
    };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("contact actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    vi.mocked(headers).mockResolvedValue(new Headers({
      "host": "localhost:3000",
      "origin": "http://localhost:3000",
      "x-forwarded-for": "127.0.0.1"
    }) as any);
  });

  describe("submitContactForm", () => {
    it("returns error if honeypot is filled", async () => {
      const formData = new FormData();
      formData.append("website", "bot-value");
      const result = await submitContactForm(formData);
      expect(result.error).toBe("Invalid submission");
    });

    it("returns error if CSRF is invalid", async () => {
      const formData = new FormData();
      vi.mocked(validateCsrfToken).mockResolvedValue(false);
      const result = await submitContactForm(formData);
      expect(result.error).toContain("Invalid security token");
    });

    it("returns error if rate limited", async () => {
      const formData = new FormData();
      vi.mocked(validateCsrfToken).mockResolvedValue(true);
      vi.mocked(contactRateLimiter.limit).mockResolvedValue({ success: false } as any);

      const result = await submitContactForm(formData);
      expect(result.error).toContain("Too many requests");
    });

    it("successfully submits the form", async () => {
      const formData = new FormData();
      formData.append("name", "John Doe");
      formData.append("email", "john@example.com");
      formData.append("subject", "Hello");
      formData.append("message", "Test message that is long enough for Zod validation");
      formData.append("cf-turnstile-response", "valid-token");
      formData.append("csrf_token", "valid-csrf");

      vi.mocked(validateCsrfToken).mockResolvedValue(true);
      vi.mocked(contactRateLimiter.limit).mockResolvedValue({ success: true } as any);
      vi.mocked(fetch).mockResolvedValue({
        json: async () => ({ success: true }),
      } as any);

      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u" } } }) }
      } as any);

      vi.mocked(processContactSubmission).mockResolvedValue({ success: true });

      const result = await submitContactForm(formData);

      expect(result.success).toBe(true);
      expect(processContactSubmission).toHaveBeenCalled();
    });

    it("handles Turnstile failure", async () => {
        const formData = new FormData();
        formData.append("name", "John Doe");
        formData.append("email", "john@example.com");
        formData.append("subject", "Hello");
        formData.append("message", "Test message that is long enough for Zod validation");
        formData.append("cf-turnstile-response", "invalid");
        formData.append("csrf_token", "valid-csrf");
  
        vi.mocked(validateCsrfToken).mockResolvedValue(true);
        vi.mocked(contactRateLimiter.limit).mockResolvedValue({ success: true } as any);
        vi.mocked(fetch).mockResolvedValue({
          json: async () => ({ success: false }),
        } as any);
  
        const result = await submitContactForm(formData);
        expect(result.error).toContain("CAPTCHA validation failed");
      });
  });
});
