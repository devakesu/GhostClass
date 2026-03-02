/**
 * Tests for validateEnvironment() — focused on the Supabase browser proxy
 * URL validation blocks added for ISP-bypass proxy support.
 *
 * Only the proxy-specific branches are tested here; the rest of validate-env
 * is covered implicitly via integration (the full env is valid in all other
 * test runs because vitest.setup.ts stubs the minimum required vars).
 *
 * `window` is stubbed to `undefined` locally so that validateEnvironment()
 * does not short-circuit its `typeof window !== "undefined"` server-only guard.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validateEnvironment } from "@/lib/validate-env";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Stubs all critical + required env vars so validateEnvironment() passes the
 * pre-proxy checks and reaches the Supabase proxy URL validation blocks.
 */
function stubAllRequired() {
  vi.stubEnv("ENCRYPTION_KEY", "a".repeat(64)); // 64 hex chars
  vi.stubEnv("CRON_SECRET", "cron-secret-value");
  vi.stubEnv("REQUEST_SIGNING_SECRET", "b".repeat(64)); // distinct from ENCRYPTION_KEY
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "redis-token");
  vi.stubEnv("BREVO_API_KEY", "brevo-api-key"); // satisfies email provider requirement
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA"); // test key (dev only)
  vi.stubEnv("TURNSTILE_SECRET_KEY", "1x0000000000000000000000000000000AA"); // test key (dev only)
  vi.stubEnv("NEXT_PUBLIC_APP_NAME", "GhostClass");
  vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.0.0");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://ghostclass.devakesu.com");
  vi.stubEnv("NEXT_PUBLIC_APP_DOMAIN", "ghostclass.devakesu.com");
  vi.stubEnv("NEXT_PUBLIC_APP_EMAIL", "@ghostclass.devakesu.com");
  vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "https://production.api.ezygo.app");
  vi.stubEnv("SENTRY_HASH_SALT", "sentry-hash-salt-value");
  // Clear proxy vars by default; individual tests set them as needed.
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", "");
  vi.stubEnv("CF_PROXY_URL", "");
  vi.stubEnv("AWS_SECONDARY_URL", "");
}

// ---------------------------------------------------------------------------
// Supabase CF proxy URL validation
// ---------------------------------------------------------------------------

describe("validateEnvironment — NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", () => {
  beforeEach(() => {
    // Stub window to undefined so the server-only guard in validateEnvironment()
    // does not short-circuit (the guard is `if (typeof window !== 'undefined') return`).
    vi.stubGlobal("window", undefined);
    stubAllRequired();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("passes without error when CF proxy URL is not set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", "");
    expect(() => validateEnvironment()).not.toThrow();
  });

  it("passes without error when CF proxy URL is a valid HTTPS URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", "https://supabase-proxy.workers.dev");
    expect(() => validateEnvironment()).not.toThrow();
  });

  it("passes without error when CF proxy URL is a valid HTTP URL in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", "http://localhost:8787");
    expect(() => validateEnvironment()).not.toThrow();
  });

  it("throws when CF proxy URL is not a valid absolute URL", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", "not-a-url");
    expect(() => validateEnvironment()).toThrow("Environment validation failed");
    expect(spy.mock.calls.flat().join(" ")).toMatch(
      /NEXT_PUBLIC_SUPABASE_CF_PROXY_URL must be a valid absolute URL/,
    );
    spy.mockRestore();
  });

  it("throws when CF proxy URL uses an unsupported protocol", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", "ftp://supabase-proxy.workers.dev");
    expect(() => validateEnvironment()).toThrow("Environment validation failed");
    expect(spy.mock.calls.flat().join(" ")).toMatch(
      /NEXT_PUBLIC_SUPABASE_CF_PROXY_URL must use http or https protocol/,
    );
    spy.mockRestore();
  });

  it("throws when CF proxy URL uses http:// in production", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_CF_PROXY_URL", "http://supabase-proxy.workers.dev");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "real-site-key-prod");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "real-secret-key-prod");
    expect(() => validateEnvironment()).toThrow("Environment validation failed");
    expect(spy.mock.calls.flat().join(" ")).toMatch(
      /NEXT_PUBLIC_SUPABASE_CF_PROXY_URL must use https:\/\/ in production/,
    );
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Supabase AWS proxy URL validation
// ---------------------------------------------------------------------------

describe("validateEnvironment — NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", () => {
  beforeEach(() => {
    vi.stubGlobal("window", undefined);
    stubAllRequired();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("passes without error when AWS proxy URL is not set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", "");
    expect(() => validateEnvironment()).not.toThrow();
  });

  it("passes without error when AWS proxy URL is a valid HTTPS URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", "https://abc123.execute-api.ap-south-1.amazonaws.com");
    expect(() => validateEnvironment()).not.toThrow();
  });

  it("passes without error when AWS proxy URL is a valid HTTP URL in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", "http://localhost:3001");
    expect(() => validateEnvironment()).not.toThrow();
  });

  it("throws when AWS proxy URL is not a valid absolute URL", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", "not-a-url");
    expect(() => validateEnvironment()).toThrow("Environment validation failed");
    expect(spy.mock.calls.flat().join(" ")).toMatch(
      /NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL must be a valid absolute URL/,
    );
    spy.mockRestore();
  });

  it("throws when AWS proxy URL uses an unsupported protocol", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", "ftp://abc123.execute-api.amazonaws.com");
    expect(() => validateEnvironment()).toThrow("Environment validation failed");
    expect(spy.mock.calls.flat().join(" ")).toMatch(
      /NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL must use http or https protocol/,
    );
    spy.mockRestore();
  });

  it("throws when AWS proxy URL uses http:// in production", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL", "http://abc123.execute-api.ap-south-1.amazonaws.com");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "real-site-key-prod");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "real-secret-key-prod");
    expect(() => validateEnvironment()).toThrow("Environment validation failed");
    expect(spy.mock.calls.flat().join(" ")).toMatch(
      /NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL must use https:\/\/ in production/,
    );
    spy.mockRestore();
  });
});
