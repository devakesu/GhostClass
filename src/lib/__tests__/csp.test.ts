/**
 * Tests for CSP (Content Security Policy) module
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { getCspHeader } from "../csp";

describe("Content Security Policy", () => {
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  afterEach(() => {
    // Restore original Supabase URL
    if (originalSupabaseUrl !== undefined) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    } else {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    }

    // Restore all stubbed env vars
    vi.unstubAllEnvs();
  });

  it("should return a CSP header string", () => {
    const header = getCspHeader();
    expect(typeof header).toBe("string");
    expect(header.length).toBeGreaterThan(0);
  });

  it("should include default-src directive", () => {
    const header = getCspHeader();
    expect(header).toContain("default-src 'self'");
  });

  it("should include script-src directive", () => {
    const header = getCspHeader();
    expect(header).toContain("script-src");
    expect(header).toContain("'self'");
  });

  it("should include style-src directive", () => {
    const header = getCspHeader();
    expect(header).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("should include font-src directive", () => {
    const header = getCspHeader();
    expect(header).toContain("font-src 'self'");
  });

  it("should set object-src to none", () => {
    const header = getCspHeader();
    expect(header).toContain("object-src 'none'");
  });

  it("should set base-uri to self", () => {
    const header = getCspHeader();
    expect(header).toContain("base-uri 'self'");
  });

  it("should set form-action to self", () => {
    const header = getCspHeader();
    expect(header).toContain("form-action 'self'");
  });

  it("should set frame-ancestors to none", () => {
    const header = getCspHeader();
    expect(header).toContain("frame-ancestors 'none'");
  });

  it("should include Supabase URL in img-src when set", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    
    const header = getCspHeader();
    expect(header).toContain("https://example.supabase.co");
  });

  it("should include Supabase URL in connect-src when set", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    
    const header = getCspHeader();
    const connectSrcSection = header.split("connect-src")[1];
    expect(connectSrcSection).toContain("https://example.supabase.co");
  });

  it("should handle missing Supabase URL gracefully", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    
    const header = getCspHeader();
    expect(header).toBeTruthy();
    expect(header).toContain("connect-src 'self'");
  });

  it("should include localhost in development", () => {
    // Test current environment (which should be test, not production)
    const header = getCspHeader();
    
    // In non-production, should include localhost
    if (process.env.NODE_ENV !== "production") {
      expect(header).toContain("localhost:3000");
    }
  });

  it("should include upgrade-insecure-requests in production", () => {
    // This tests the production path, but we can only verify the code logic
    // In actual production NODE_ENV, this would be included
    const header = getCspHeader();
    
    if (process.env.NODE_ENV === "production") {
      expect(header).toContain("upgrade-insecure-requests");
    } else {
      // In non-production, verify it's not there
      expect(header).not.toContain("upgrade-insecure-requests");
    }
  });

  it("should not include upgrade-insecure-requests in development", () => {
    // In test environment, should not include upgrade-insecure-requests
    const header = getCspHeader();
    
    if (process.env.NODE_ENV !== "production") {
      expect(header).not.toContain("upgrade-insecure-requests");
    }
  });

  it("should include worker-src directive", () => {
    const header = getCspHeader();
    expect(header).toContain("worker-src 'self' blob:");
  });

  it("should include frame-src directive", () => {
    const header = getCspHeader();
    expect(header).toContain("frame-src 'self'");
  });

  it("should not have excessive whitespace", () => {
    const header = getCspHeader();
    expect(header).not.toMatch(/\s{2,}/);
  });

  it("should include Google Analytics domains", () => {
    const header = getCspHeader();
    expect(header).toContain("google-analytics.com");
    expect(header).toContain("doubleclick.net");
  });

  it("should include Cloudflare domains", () => {
    const header = getCspHeader();
    expect(header).toContain("cloudflareinsights.com");
    expect(header).toContain("challenges.cloudflare.com");
  });

  it("should include Sentry domains", () => {
    const header = getCspHeader();
    expect(header).toContain("ingest.sentry.io");
  });

  it("should include EzyGo API domain", () => {
    const header = getCspHeader();
    expect(header).toContain("production.api.ezygo.app");
  });

  it("should be trimmed and formatted", () => {
    const header = getCspHeader();
    expect(header).toBe(header.trim());
    expect(header[0]).not.toBe(" ");
    expect(header[header.length - 1]).not.toBe(" ");
  });

  it("should include report-to and report-uri directives in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    const header = getCspHeader("prod-nonce");

    expect(header).toContain("report-to csp-endpoint");
    expect(header).toContain("report-uri /api/csp-report");
  });

  it("should not include report-to or report-uri directives in development", () => {
    vi.stubEnv("NODE_ENV", "development");

    const header = getCspHeader();

    expect(header).not.toContain("report-to");
    expect(header).not.toContain("report-uri");
  });

  it("should include report-to and report-uri in the fallback no-nonce production CSP", () => {
    vi.stubEnv("NODE_ENV", "production");

    // Passing no nonce triggers the fallback CSP path in production
    const header = getCspHeader();

    expect(header).toContain("report-to csp-endpoint");
    expect(header).toContain("report-uri /api/csp-report");
  });

  describe("FORCE_STRICT_CSP feature", () => {
    it("should enforce production CSP when FORCE_STRICT_CSP is set to 'true'", () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("FORCE_STRICT_CSP", "true");
      
      const header = getCspHeader("test-nonce-123");
      
      // Should include production nonce
      expect(header).toContain("'nonce-test-nonce-123'");
      
      // Should include strict-dynamic for production
      expect(header).toContain("'strict-dynamic'");
      
      // NOTE: 'unsafe-eval' is still included when NODE_ENV=development because HMR (React
      // Fast Refresh) requires eval(). It is only omitted in real production builds.
    });

    it("should enforce production CSP when FORCE_STRICT_CSP is set to '1'", () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("FORCE_STRICT_CSP", "1");
      
      const header = getCspHeader("test-nonce-456");
      
      // Should include production nonce
      expect(header).toContain("'nonce-test-nonce-456'");
      
      // Should include strict-dynamic for production
      expect(header).toContain("'strict-dynamic'");
    });

    it("should enforce production CSP when FORCE_STRICT_CSP is set to 'yes' (case insensitive)", () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("FORCE_STRICT_CSP", "YES");
      
      const header = getCspHeader("test-nonce-789");
      
      // Should include production nonce
      expect(header).toContain("'nonce-test-nonce-789'");
      
      // Should include strict-dynamic for production
      expect(header).toContain("'strict-dynamic'");
    });

    it("should use development CSP when FORCE_STRICT_CSP is not set", () => {
      vi.stubEnv("NODE_ENV", "development");
      
      const header = getCspHeader();
      
      // Should include development-only directives
      expect(header).toContain("'unsafe-eval'");
      expect(header).toContain("'unsafe-inline'");
    });

    it("should use development CSP when FORCE_STRICT_CSP is set to invalid value", () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("FORCE_STRICT_CSP", "false");
      
      const header = getCspHeader();
      
      // Should include development-only directives since 'false' is not a valid truthy value
      expect(header).toContain("'unsafe-eval'");
      expect(header).toContain("'unsafe-inline'");
    });

    it("should enforce production CSP when NEXT_PUBLIC_FORCE_STRICT_CSP is set to 'true'", () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("NEXT_PUBLIC_FORCE_STRICT_CSP", "true");
      
      const header = getCspHeader("client-nonce-123");
      
      // Should include production nonce
      expect(header).toContain("'nonce-client-nonce-123'");
      
      // Should include strict-dynamic for production
      expect(header).toContain("'strict-dynamic'");
    });

    it("should prioritize FORCE_STRICT_CSP over NEXT_PUBLIC_FORCE_STRICT_CSP when both are set", () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("FORCE_STRICT_CSP", "false");
      vi.stubEnv("NEXT_PUBLIC_FORCE_STRICT_CSP", "true");
      
      const header = getCspHeader();
      
      // FORCE_STRICT_CSP is checked first, so 'false' should result in dev mode
      // (since 'false' doesn't match the regex pattern)
      expect(header).toContain("'unsafe-eval'");
    });

    it("should include localhost URLs in connect-src when forced strict CSP in development", () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("FORCE_STRICT_CSP", "true");
      
      const header = getCspHeader("test-nonce");
      
      // Even in strict mode, development localhost URLs should still be included
      // because the actual condition checks NODE_ENV, not isDev flag
      expect(header).toContain("localhost:3000");
    });

    it("should not include upgrade-insecure-requests when forced strict CSP in development", () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("FORCE_STRICT_CSP", "true");
      
      const header = getCspHeader("test-nonce");
      
      // upgrade-insecure-requests checks NODE_ENV === 'production' directly
      // so it won't be included even with forced strict CSP
      expect(header).not.toContain("upgrade-insecure-requests");
    });
  });

  describe("script-src-elem nonce enforcement (SEC-01)", () => {
    it("should include the nonce in script-src-elem in production (FORCE_STRICT_CSP)", () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("FORCE_STRICT_CSP", "true");

      const header = getCspHeader("sec01-nonce");

      // Extract the script-src-elem directive value
      const match = header.match(/script-src-elem ([^;]+)/);
      expect(match).not.toBeNull();
      const directiveValue = match![1];

      // Nonce must be present so CSP3 browsers enforce it and ignore 'unsafe-inline'
      expect(directiveValue).toContain("'nonce-sec01-nonce'");
    });

    it("should retain unsafe-inline in script-src-elem as a CSP2 fallback in production", () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("FORCE_STRICT_CSP", "true");

      const header = getCspHeader("sec01-nonce");

      const match = header.match(/script-src-elem ([^;]+)/);
      expect(match).not.toBeNull();
      const directiveValue = match![1];

      // 'unsafe-inline' must still be present as a CSP Level 2 backward-compat fallback.
      // CSP3 browsers ignore it when the nonce is also present in the directive.
      expect(directiveValue).toContain("'unsafe-inline'");

      // But the nonce MUST come before 'unsafe-inline' so the intent is clear
      const nonceIndex = directiveValue.indexOf("'nonce-sec01-nonce'");
      const unsafeInlineIndex = directiveValue.indexOf("'unsafe-inline'");
      expect(nonceIndex).toBeLessThan(unsafeInlineIndex);
    });

    it("should NOT include the nonce in script-src-elem in development mode", () => {
      vi.stubEnv("NODE_ENV", "development");

      const header = getCspHeader("dev-nonce");

      const match = header.match(/script-src-elem ([^;]+)/);
      expect(match).not.toBeNull();
      const directiveValue = match![1];

      // In development, no nonce in script-src-elem (tooling injects dynamic inline scripts)
      expect(directiveValue).not.toContain("'nonce-dev-nonce'");
    });
  });
});
