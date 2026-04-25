/**
 * Tests for robots.ts
 */

import { describe, it, expect, afterEach } from "vitest";
import robots from "../robots";

describe("robots.txt", () => {
  const originalSitemapUrl = process.env.NEXT_PUBLIC_SITEMAP_URL;
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    if (originalSitemapUrl !== undefined) {
      process.env.NEXT_PUBLIC_SITEMAP_URL = originalSitemapUrl;
    } else {
      delete process.env.NEXT_PUBLIC_SITEMAP_URL;
    }

    if (originalAppUrl !== undefined) {
      process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    } else {
      delete process.env.NEXT_PUBLIC_APP_URL;
    }
  });

  it("should return robots configuration", () => {
    const config = robots();
    expect(config).toBeDefined();
    expect(config).toHaveProperty("rules");
    expect(config).toHaveProperty("sitemap");
  });

  it("should allow all user agents", () => {
    const config = robots();
    const rules = Array.isArray(config.rules) ? config.rules[0] : config.rules;
    expect(rules).toHaveProperty("userAgent", "*");
  });

  it("should allow root path", () => {
    const config = robots();
    const rules = Array.isArray(config.rules) ? config.rules[0] : config.rules;
    expect(rules).toHaveProperty("allow", "/");
  });

  it("should disallow protected paths", () => {
    const config = robots();
    const rules = Array.isArray(config.rules) ? config.rules[0] : config.rules;
    const disallowed = rules.disallow;

    expect(disallowed).toContain("/profile");
    expect(disallowed).toContain("/notifications");
    expect(disallowed).toContain("/dashboard");
    expect(disallowed).toContain("/tracking");
  });

  it("should include sitemap URL from environment", () => {
    process.env.NEXT_PUBLIC_SITEMAP_URL = "https://example.com/sitemap.xml";
    
    const config = robots();
    expect(config.sitemap).toBe("https://example.com/sitemap.xml");
  });

  it("should derive sitemap URL from app URL when NEXT_PUBLIC_SITEMAP_URL is missing", () => {
    delete process.env.NEXT_PUBLIC_SITEMAP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com";

    const config = robots();
    expect(config.sitemap).toBe("https://example.com/sitemap.xml");
  });

  it("should handle missing sitemap and app URL", () => {
    delete process.env.NEXT_PUBLIC_SITEMAP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;

    const config = robots();
    expect(config.sitemap).toBeUndefined();
  });

  it("should have correct structure", () => {
    const config = robots();
    const rules = Array.isArray(config.rules) ? config.rules[0] : config.rules;
    
    expect(typeof rules).toBe("object");
    expect(Array.isArray(rules.disallow)).toBe(true);
  });

  it("should disallow exactly 7 paths", () => {
    const config = robots();
    const rules = Array.isArray(config.rules) ? config.rules[0] : config.rules;
    expect(rules.disallow).toHaveLength(7);
  });

  it("should disallow /scores", () => {
    const config = robots();
    const rules = Array.isArray(config.rules) ? config.rules[0] : config.rules;
    expect(rules.disallow).toContain("/scores");
  });
});
