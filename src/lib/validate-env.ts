// src/lib/validate-env.ts

import { logger } from "./logger";

/** Parses a string as a non-negative integer. Returns NaN for values with non-numeric suffixes (e.g. "10abc"), decimals, or unsafe integers. */
function parseStrictInt(value: string): number {
  if (!/^\d+$/.test(value)) return NaN;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : NaN;
}

/**
 * Validates required and critical environment variables at startup.
 * Throws an error and prevents app from starting if critical vars are missing or invalid.
 * * NOTE: This must only run on the server (instrumentation.ts or next.config.js).
 */
export function validateEnvironment() {
  // 1. Prevent Client-Side Execution
  // Secrets like CRON_SECRET are undefined in the browser, so this would falsely fail on the client.
  if (typeof window !== "undefined") return;

  const errors: string[] = [];
  const warnings: string[] = [];

  // ============================================================================
  // CRITICAL - App won't work without these
  // ============================================================================

  // Security
  if (!process.env.ENCRYPTION_KEY) {
    errors.push("❌ ENCRYPTION_KEY is required");
  } else if (!/^[a-f0-9]{64}$/i.test(process.env.ENCRYPTION_KEY)) {
    errors.push("❌ ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }

  if (!process.env.CRON_SECRET) {
    errors.push("❌ CRON_SECRET is required");
  }

  // Supabase
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    errors.push("❌ NEXT_PUBLIC_SUPABASE_URL is required");
  }

  // Optional development Supabase URL validation
  const devSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_DEV_URL?.trim();
  if (devSupabaseUrl) {
    try {
      new URL(devSupabaseUrl);
    } catch {
      errors.push(
        "❌ NEXT_PUBLIC_SUPABASE_DEV_URL must be a valid absolute URL",
      );
    }
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    errors.push("❌ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required");
  }

  // Optional development Supabase Publishable Key validation
  const devSupabasePublishableKey = process.env
    .NEXT_PUBLIC_SUPABASE_DEV_PUBLISHABLE_KEY?.trim();
  if (devSupabasePublishableKey && devSupabasePublishableKey.length < 20) {
    errors.push("❌ NEXT_PUBLIC_SUPABASE_DEV_PUBLISHABLE_KEY looks invalid");
  }

  if (
    process.env.NODE_ENV === "production" && !process.env.SUPABASE_SECRET_KEY
  ) {
    errors.push("❌ SUPABASE_SECRET_KEY is required in production");
  }

  // Optional development Supabase Secret Key validation
  const devSupabaseSecretKey = process.env.SUPABASE_DEV_SECRET_KEY?.trim();
  if (devSupabaseSecretKey && devSupabaseSecretKey.length < 20) {
    errors.push("❌ SUPABASE_DEV_SECRET_KEY looks invalid");
  }

  // Upstash Redis (Rate Limiting)
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    errors.push("❌ UPSTASH_REDIS_REST_URL is required");
  }
  if (!process.env.UPSTASH_REDIS_REST_TOKEN) {
    errors.push("❌ UPSTASH_REDIS_REST_TOKEN is required");
  }

  // Email Providers (AT LEAST ONE REQUIRED)
  const hasBrevo = !!process.env.BREVO_API_KEY;
  const hasSendPulse = !!(
    process.env.SENDPULSE_CLIENT_ID &&
    process.env.SENDPULSE_CLIENT_SECRET
  );

  if (!hasBrevo && !hasSendPulse) {
    errors.push("❌ At least ONE email provider must be configured:");
    errors.push("   - BREVO_API_KEY (option 1)");
    errors.push(
      "   - SENDPULSE_CLIENT_ID + SENDPULSE_CLIENT_SECRET (option 2)",
    );
  }

  // Cloudflare Turnstile
  if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
    errors.push("❌ NEXT_PUBLIC_TURNSTILE_SITE_KEY is required");
  } else if (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY.startsWith("1x0000")) {
    if (process.env.NODE_ENV === "production") {
      errors.push(
        "❌ NEXT_PUBLIC_TURNSTILE_SITE_KEY is using TEST KEY in production!",
      );
    } else {
      warnings.push(
        "⚠️  NEXT_PUBLIC_TURNSTILE_SITE_KEY is using Cloudflare test key (development only)",
      );
    }
  }

  if (!process.env.TURNSTILE_SECRET_KEY) {
    errors.push("❌ TURNSTILE_SECRET_KEY is required");
  } else if (process.env.TURNSTILE_SECRET_KEY.startsWith("1x0000")) {
    if (process.env.NODE_ENV === "production") {
      errors.push("❌ TURNSTILE_SECRET_KEY is using TEST KEY in production!");
    } else {
      warnings.push(
        "⚠️  TURNSTILE_SECRET_KEY is using Cloudflare test key (development only)",
      );
    }
  }

  // App Configuration
  if (!process.env.NEXT_PUBLIC_APP_NAME) {
    errors.push("❌ NEXT_PUBLIC_APP_NAME is required");
  }

  if (!process.env.NEXT_PUBLIC_APP_VERSION) {
    errors.push("❌ NEXT_PUBLIC_APP_VERSION is required");
  }

  if (!process.env.NEXT_PUBLIC_APP_URL) {
    errors.push("❌ NEXT_PUBLIC_APP_URL is required");
  } else {
    try {
      const url = new URL(process.env.NEXT_PUBLIC_APP_URL);
      if (url.pathname !== "/") {
        warnings.push(
          `⚠️  NEXT_PUBLIC_APP_URL contains a path '${url.pathname}' but should typically only specify the domain (e.g., https://example.com)`,
        );
      }
      if (process.env.NEXT_PUBLIC_APP_URL.endsWith("/")) {
        warnings.push(
          "⚠️  NEXT_PUBLIC_APP_URL ends with a slash. Recommended: remove the trailing slash.",
        );
      }
    } catch {
      errors.push(
        "❌ NEXT_PUBLIC_APP_URL must be a valid absolute URL (e.g. https://example.com)",
      );
    }
  }

  if (!process.env.NEXT_PUBLIC_APP_DOMAIN) {
    errors.push(
      '❌ NEXT_PUBLIC_APP_DOMAIN is required (e.g. "ghostclass.com")',
    );
  } else {
    const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN.trim();
    if (/^https?:\/\//i.test(appDomain)) {
      errors.push(
        "❌ NEXT_PUBLIC_APP_DOMAIN must not include protocol (use ghostclass.com, not https://ghostclass.com)",
      );
    } else if (appDomain.includes("/") || /\s/.test(appDomain)) {
      errors.push(
        "❌ NEXT_PUBLIC_APP_DOMAIN must be a bare domain without path or spaces",
      );
    } else if (
      appDomain.length > 253 ||
      appDomain.startsWith(".") ||
      appDomain.endsWith(".") ||
      appDomain.includes("..") ||
      !/^[a-z0-9.-]+$/i.test(appDomain)
    ) {
      errors.push("❌ NEXT_PUBLIC_APP_DOMAIN contains invalid hostname characters");
    } else if (!appDomain.includes(".") && appDomain !== "localhost") {
      errors.push(
        "❌ NEXT_PUBLIC_APP_DOMAIN must contain a dot-separated hostname (or be localhost in development)",
      );
    }
  }

  if (!process.env.NEXT_PUBLIC_APP_EMAIL) {
    errors.push(
      "❌ NEXT_PUBLIC_APP_EMAIL is required (used for sender addresses)",
    );
  } else if (!/^@[^@]+$/.test(process.env.NEXT_PUBLIC_APP_EMAIL)) {
    errors.push(
      '❌ NEXT_PUBLIC_APP_EMAIL must start with "@" and be a valid email suffix (e.g. @example.com)',
    );
  }

  if (!process.env.NEXT_PUBLIC_BACKEND_URL) {
    errors.push("❌ NEXT_PUBLIC_BACKEND_URL is required (EzyGo API URL)");
  } else {
    try {
      const backendUrl = new URL(process.env.NEXT_PUBLIC_BACKEND_URL);
      if (!["https:", "http:"].includes(backendUrl.protocol)) {
        errors.push(
          "❌ NEXT_PUBLIC_BACKEND_URL must use http or https protocol",
        );
      } else if (
        process.env.NODE_ENV === "production" &&
        backendUrl.protocol !== "https:"
      ) {
        errors.push(
          "❌ NEXT_PUBLIC_BACKEND_URL must use https:// in production",
        );
      }
    } catch {
      errors.push(
        "❌ NEXT_PUBLIC_BACKEND_URL must be a valid absolute URL (e.g. https://api.example.com)",
      );
    }
  }

  // Cloudflare Worker egress — optional tier 1. Set CF_PROXY_URL in your server env to enable.
  const cfProxyUrl = process.env.CF_PROXY_URL?.trim();
  if (cfProxyUrl) {
    try {
      const cfParsed = new URL(cfProxyUrl);
      if (!["https:", "http:"].includes(cfParsed.protocol)) {
        errors.push("❌ CF_PROXY_URL must use http or https protocol");
      } else if (
        process.env.NODE_ENV === "production" && cfParsed.protocol !== "https:"
      ) {
        errors.push("❌ CF_PROXY_URL must use https:// in production");
      }
    } catch {
      errors.push(
        "❌ CF_PROXY_URL must be a valid absolute URL (e.g. https://ezygo-proxy.<username>.workers.dev/api/v1/Xcr45_salt)",
      );
    }

    if (!process.env.CF_PROXY_SECRET) {
      errors.push(
        "❌ CF_PROXY_SECRET is required when CF_PROXY_URL is set.\n" +
          "   The CF Worker will reject requests with 403 without this secret.\n" +
          "   Generate with: openssl rand -hex 32\n" +
          "   Set the same value as the PROXY_SECRET encrypted secret in your CF Worker settings.",
      );
    } else if (process.env.CF_PROXY_SECRET.trim().length < 32) {
      errors.push(
        "❌ CF_PROXY_SECRET is too short (minimum 32 characters).\n" +
          "   Recommended: openssl rand -hex 32 (64 characters).",
      );
    }
  }

  // AWS Lambda egress — optional tier 2. Set AWS_SECONDARY_URL in your server env to enable.
  const awsSecondaryUrl = process.env.AWS_SECONDARY_URL?.trim();
  if (awsSecondaryUrl) {
    try {
      const awsParsed = new URL(awsSecondaryUrl);
      if (!["https:", "http:"].includes(awsParsed.protocol)) {
        errors.push("❌ AWS_SECONDARY_URL must use http or https protocol");
      } else if (
        process.env.NODE_ENV === "production" && awsParsed.protocol !== "https:"
      ) {
        errors.push("❌ AWS_SECONDARY_URL must use https:// in production");
      }
    } catch {
      errors.push(
        "❌ AWS_SECONDARY_URL must be a valid absolute URL (e.g. https://abc123.execute-api.ap-south-1.amazonaws.com)",
      );
    }

    if (!process.env.AWS_SECONDARY_SECRET) {
      errors.push(
        "❌ AWS_SECONDARY_SECRET is required when AWS_SECONDARY_URL is set.\n" +
          "   The AWS Lambda proxy will reject requests with 403 without this secret.\n" +
          "   Generate with: openssl rand -hex 32\n" +
          "   Set the same value as the PROXY_SECRET env var in your AWS Lambda function.",
      );
    } else if (process.env.AWS_SECONDARY_SECRET.trim().length < 32) {
      errors.push(
        "❌ AWS_SECONDARY_SECRET is too short (minimum 32 characters).\n" +
          "   Recommended: openssl rand -hex 32 (64 characters).",
      );
    }
  }

  // Key-separation: CF and AWS secrets must not be the same value.
  if (
    process.env.CF_PROXY_SECRET?.trim() &&
    process.env.AWS_SECONDARY_SECRET?.trim() &&
    process.env.CF_PROXY_SECRET.trim() ===
      process.env.AWS_SECONDARY_SECRET.trim()
  ) {
    errors.push(
      "❌ CF_PROXY_SECRET and AWS_SECONDARY_SECRET must be different values (key separation).\n" +
        "   Reusing the same secret means a compromise of one proxy compromises both tiers.\n" +
        "   Generate two distinct secrets: openssl rand -hex 32 (run twice).",
    );
  }

  // Supabase browser proxy — optional CF Worker (Tier 1).
  // No shared secret: browser proxies use ALLOWED_ORIGIN header checks (secrets
  // would be visible in DevTools). Either or both proxy vars may be set.
  const supabaseCfProxyUrl = process.env.NEXT_PUBLIC_SUPABASE_CF_PROXY_URL
    ?.trim();
  if (supabaseCfProxyUrl) {
    try {
      const parsed = new URL(supabaseCfProxyUrl);
      if (!["https:", "http:"].includes(parsed.protocol)) {
        errors.push(
          "❌ NEXT_PUBLIC_SUPABASE_CF_PROXY_URL must use http or https protocol",
        );
      } else if (
        process.env.NODE_ENV === "production" && parsed.protocol !== "https:"
      ) {
        errors.push(
          "❌ NEXT_PUBLIC_SUPABASE_CF_PROXY_URL must use https:// in production (proxies auth tokens)",
        );
      }
    } catch {
      errors.push(
        "❌ NEXT_PUBLIC_SUPABASE_CF_PROXY_URL must be a valid absolute URL (e.g. https://supabase.example.workers.dev)",
      );
    }
  }

  // Supabase browser proxy — optional AWS Lambda (Tier 2 fallback).
  const supabaseAwsProxyUrl = process.env.NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL
    ?.trim();
  if (supabaseAwsProxyUrl) {
    try {
      const parsed = new URL(supabaseAwsProxyUrl);
      if (!["https:", "http:"].includes(parsed.protocol)) {
        errors.push(
          "❌ NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL must use http or https protocol",
        );
      } else if (
        process.env.NODE_ENV === "production" && parsed.protocol !== "https:"
      ) {
        errors.push(
          "❌ NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL must use https:// in production (proxies auth tokens)",
        );
      }
    } catch {
      errors.push(
        "❌ NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL must be a valid absolute URL (e.g. https://abc123.execute-api.ap-south-1.amazonaws.com)",
      );
    }
  }

  // Firebase App Check
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    warnings.push(
      "ℹ️  GOOGLE_SERVICE_ACCOUNT_JSON not set - App Check verification will be disabled (optional for web-only)",
    );
  } else {
    try {
      const serviceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
      let config;
      if (serviceAccount.startsWith("{")) {
        config = JSON.parse(serviceAccount);
      } else {
        const decoded = Buffer.from(serviceAccount, "base64").toString("utf-8");
        config = JSON.parse(decoded);
      }

      if (!config.project_id || !config.private_key || !config.client_email) {
        errors.push(
          "❌ GOOGLE_SERVICE_ACCOUNT_JSON appears to be an invalid service account key (missing project_id, private_key, or client_email)",
        );
      }
    } catch {
      errors.push(
        "❌ GOOGLE_SERVICE_ACCOUNT_JSON must be a valid JSON string or Base64 encoded JSON",
      );
    }
  }

  const enforceAppCheck = process.env.ENFORCE_APP_CHECK;
  if (
    enforceAppCheck &&
    !["true", "false"].includes(enforceAppCheck.toLowerCase())
  ) {
    errors.push('❌ ENFORCE_APP_CHECK must be either "true" or "false"');
  }

  const disableAppCheck = process.env.DISABLE_APP_CHECK;
  if (
    disableAppCheck &&
    !["true", "false"].includes(disableAppCheck.toLowerCase())
  ) {
    errors.push('❌ DISABLE_APP_CHECK must be either "true" or "false"');
  }

  // Play Integrity Granular Enforcement
  const integrityFlags = [
    "PLAY_INTEGRITY_ENFORCE_BASIC",
    "PLAY_INTEGRITY_ENFORCE_DEVICE",
    "PLAY_INTEGRITY_ENFORCE_STRONG",
    "PLAY_INTEGRITY_ENFORCE_LICENSED",
    "PLAY_INTEGRITY_ENFORCE_PLAY_RECOGNIZED",
    "PLAY_INTEGRITY_ENFORCE_SIGNING_CERT",
  ];

  integrityFlags.forEach((flag) => {
    const value = process.env[flag];
    if (value && !["true", "false"].includes(value.toLowerCase())) {
      errors.push(`❌ ${flag} must be either "true" or "false"`);
    }
  });

  // Application Identity
  if (process.env.NODE_ENV === "production") {
    if (!process.env.NEXT_PUBLIC_ANDROID_PACKAGE_NAME) {
      errors.push("❌ NEXT_PUBLIC_ANDROID_PACKAGE_NAME is required");
    }
    if (!process.env.FIREBASE_APP_ID_ANDROID) {
      errors.push("❌ FIREBASE_APP_ID_ANDROID is required");
    }
    if (!process.env.PLAY_INTEGRITY_PROJECT_NUMBER) {
      errors.push("❌ PLAY_INTEGRITY_PROJECT_NUMBER is required");
    }
  }

  // ============================================================================
  // OPTIONAL - App works but features may be limited
  // ============================================================================

  if (!process.env.NEXT_PUBLIC_AUTHOR_NAME) {
    warnings.push("⚠️  NEXT_PUBLIC_AUTHOR_NAME not set");
  }

  if (!process.env.NEXT_PUBLIC_AUTHOR_URL) {
    warnings.push("⚠️  NEXT_PUBLIC_AUTHOR_URL not set");
  }

  if (!process.env.NEXT_PUBLIC_GITHUB_URL) {
    warnings.push("⚠️  NEXT_PUBLIC_GITHUB_URL not set");
  }

  if (!process.env.MOBILE_API_SECRET) {
    warnings.push(
      "⚠️  MOBILE_API_SECRET not set - mobile application login will be disabled",
    );
  }

  if (!process.env.NEXT_PUBLIC_LEGAL_EMAIL) {
    warnings.push("⚠️  NEXT_PUBLIC_LEGAL_EMAIL not set");
  }

  if (!process.env.NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE) {
    warnings.push("⚠️  NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE not set");
  }

  // Sentry (Error Monitoring)
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
    warnings.push(
      "⚠️  NEXT_PUBLIC_SENTRY_DSN not set - error monitoring disabled",
    );
  }
  // SENTRY_AUTH_TOKEN is build-time only, often not available at runtime, so skipping warning

  if (!process.env.SENTRY_HASH_SALT) {
    if (process.env.NODE_ENV === "production") {
      errors.push(
        "❌ SENTRY_HASH_SALT is required in production\n" +
          "   Used for: Redacting sensitive data (emails, IDs) in logs and error reports\n" +
          "   Generate with: openssl rand -base64 32\n" +
          "   Set in: Deployment environment variables (e.g., your server, Vercel, Docker)\n" +
          "   Treat with the same security as database credentials",
      );
    } else {
      warnings.push(
        "⚠️  SENTRY_HASH_SALT not set - using development-only fallback",
      );
    }
  }

  // Build ID / CI traceability
  if (!process.env.APP_COMMIT_SHA) {
    if (process.env.NODE_ENV === "production") {
      // Error rather than warn: without a commit SHA the build ID falls back to a random
      // UUID (see next.config.ts), which prevents stable asset URLs across rolling restarts.
      // Stable build IDs also make it easier to correlate Sentry errors with deployments.
      warnings.push(
        "⚠️  APP_COMMIT_SHA is not set — Next.js will use a random UUID as the build ID.\n" +
          "   Set APP_COMMIT_SHA to the current git commit SHA in your CI/CD pipeline for\n" +
          "   stable, traceable build IDs (avoids cache mismatches across rolling restarts).",
      );
    }
  }

  // Google Analytics (Server-side Measurement Protocol)
  if (!process.env.NEXT_PUBLIC_GA_ID) {
    warnings.push(
      "ℹ️  NEXT_PUBLIC_GA_ID not set - analytics disabled (optional)",
    );
  } else if (!/^G-[A-Z0-9]{4,20}$/.test(process.env.NEXT_PUBLIC_GA_ID)) {
    // GA4 Measurement IDs are always in the form G-XXXXXXXXXX
    errors.push(
      "❌ NEXT_PUBLIC_GA_ID appears invalid — GA4 Measurement IDs must match the G-XXXXXXXXXX format.\n" +
        "   Get from: Google Analytics → Admin → Data Streams → Measurement ID",
    );
  } else {
    const gaApiSecret = process.env.GA_API_SECRET?.trim() ?? "";
    if (gaApiSecret === "") {
      errors.push(
        "❌ GA_API_SECRET is required when NEXT_PUBLIC_GA_ID is set\n" +
          "   Get from: Google Analytics → Admin → Data Streams → Measurement Protocol API secrets\n" +
          "   Used for: Server-side event tracking via GA4 Measurement Protocol",
      );
    } else if (
      !/^[A-Za-z0-9][A-Za-z0-9_-]{8,126}[A-Za-z0-9]$/.test(gaApiSecret)
    ) {
      errors.push(
        "❌ GA_API_SECRET appears invalid\n" +
          "   It should be an alphanumeric string (optionally including _ and -) between 10 and 128 characters.\n" +
          "   Must start and end with alphanumeric characters.\n" +
          "   Get from: Google Analytics → Admin → Data Streams → Measurement Protocol API secrets",
      );
    }
  }

  // Attendance Target Minimum
  const attendanceTargetMin = process.env.NEXT_PUBLIC_ATTENDANCE_TARGET_MIN;
  if (attendanceTargetMin) {
    const minValue = parseStrictInt(attendanceTargetMin);
    if (isNaN(minValue) || minValue < 1 || minValue > 100) {
      errors.push(
        "❌ NEXT_PUBLIC_ATTENDANCE_TARGET_MIN must be a number between 1 and 100 (default: 75)",
      );
    }
  }

  // Authentication Lock TTL
  const authLockTtl = process.env.AUTH_LOCK_TTL;
  if (authLockTtl) {
    const ttlValue = parseStrictInt(authLockTtl);
    if (isNaN(ttlValue) || ttlValue < 15 || ttlValue > 60) {
      errors.push(
        "❌ AUTH_LOCK_TTL must be a number between 15 and 60 seconds (default: 20)",
      );
    }
  }

  // Rate Limiting (all optional — defaults are hardcoded in ratelimit.ts)
  const rateLimitRequests = process.env.RATE_LIMIT_REQUESTS;
  if (rateLimitRequests) {
    const val = parseStrictInt(rateLimitRequests);
    if (isNaN(val) || val < 1 || val > 1000) {
      errors.push(
        "❌ RATE_LIMIT_REQUESTS must be a number between 1 and 1000 (default when unset: 10)",
      );
    }
  }

  const rateLimitWindow = process.env.RATE_LIMIT_WINDOW;
  if (rateLimitWindow) {
    const val = parseStrictInt(rateLimitWindow);
    if (isNaN(val) || val < 1 || val > 3600) {
      errors.push("❌ RATE_LIMIT_WINDOW is invalid (must be 1–3600 seconds)");
    }
  }

  const syncRateLimitRequests = process.env.SYNC_RATE_LIMIT_REQUESTS;
  if (syncRateLimitRequests) {
    const val = parseStrictInt(syncRateLimitRequests);
    if (isNaN(val) || val < 1 || val > 1000) {
      errors.push(
        "❌ SYNC_RATE_LIMIT_REQUESTS is invalid (must be 1–1000)",
      );
    }
  }

  const syncRateLimitWindow = process.env.SYNC_RATE_LIMIT_WINDOW;
  if (syncRateLimitWindow) {
    const val = parseStrictInt(syncRateLimitWindow);
    if (isNaN(val) || val < 1 || val > 3600) {
      errors.push(
        "❌ SYNC_RATE_LIMIT_WINDOW is invalid (must be 1–3600 seconds)",
      );
    }
  }

  const contactRateLimitRequests = process.env.CONTACT_RATE_LIMIT_REQUESTS;
  if (contactRateLimitRequests) {
    const val = parseStrictInt(contactRateLimitRequests);
    if (isNaN(val) || val < 1 || val > 1000) {
      errors.push(
        "❌ CONTACT_RATE_LIMIT_REQUESTS is invalid (must be 1–1000)",
      );
    }
  }

  const contactRateLimitWindow = process.env.CONTACT_RATE_LIMIT_WINDOW;
  if (contactRateLimitWindow) {
    const val = parseStrictInt(contactRateLimitWindow);
    if (isNaN(val) || val < 1 || val > 3600) {
      errors.push(
        "❌ CONTACT_RATE_LIMIT_WINDOW is invalid (must be 1–3600 seconds)",
      );
    }
  }

  const authRateLimitRequests = process.env.AUTH_RATE_LIMIT_REQUESTS;
  if (authRateLimitRequests) {
    const val = parseStrictInt(authRateLimitRequests);
    if (isNaN(val) || val < 1 || val > 1000) {
      errors.push("❌ AUTH_RATE_LIMIT_REQUESTS is invalid (must be 1–1000)");
    }
  }

  const authRateLimitWindow = process.env.AUTH_RATE_LIMIT_WINDOW;
  if (authRateLimitWindow) {
    const val = parseStrictInt(authRateLimitWindow);
    if (isNaN(val) || val < 1 || val > 3600) {
      errors.push(
        "❌ AUTH_RATE_LIMIT_WINDOW is invalid (must be 1–3600 seconds)",
      );
    }
  }

  const proxyRateLimitRequests = process.env.PROXY_RATE_LIMIT_REQUESTS;
  if (proxyRateLimitRequests) {
    const val = parseStrictInt(proxyRateLimitRequests);
    if (isNaN(val) || val < 1 || val > 5000) {
      errors.push(
        "❌ PROXY_RATE_LIMIT_REQUESTS is invalid (must be 1–5000)",
      );
    }
  }

  const proxyRateLimitWindow = process.env.PROXY_RATE_LIMIT_WINDOW;
  if (proxyRateLimitWindow) {
    const val = parseStrictInt(proxyRateLimitWindow);
    if (isNaN(val) || val < 1 || val > 3600) {
      errors.push(
        "❌ PROXY_RATE_LIMIT_WINDOW is invalid (must be 1–3600 seconds)",
      );
    }
  }

  // Request Signature Max Age
  const requestSigMaxAge = process.env.REQUEST_SIGNATURE_MAX_AGE;
  if (requestSigMaxAge) {
    const maxAgeValue = parseStrictInt(requestSigMaxAge);
    if (isNaN(maxAgeValue) || maxAgeValue < 60 || maxAgeValue > 3600) {
      errors.push(
        "❌ REQUEST_SIGNATURE_MAX_AGE must be a number between 60 and 3600 seconds (default: 600)",
      );
    }
  }

  // Sentry Replay Rate
  const sentryReplayRate = process.env.NEXT_PUBLIC_SENTRY_REPLAY_RATE;
  if (sentryReplayRate) {
    const replayRate = parseFloat(sentryReplayRate);
    if (isNaN(replayRate) || replayRate < 0 || replayRate > 1) {
      errors.push(
        "❌ NEXT_PUBLIC_SENTRY_REPLAY_RATE must be a number between 0.0 and 1.0 (default: 0)",
      );
    }
  }

  // ============================================================================
  // DEPLOYMENT SECURITY VALIDATION
  // ============================================================================

  // Docker HOSTNAME binding security check
  // When HOSTNAME="0.0.0.0", the container accepts connections from any network interface.
  // This is ONLY safe when deployed behind a reverse proxy with proper access controls.
  const hostname = process.env.HOSTNAME;
  if (hostname === "0.0.0.0") {
    // Check for common reverse proxy headers that indicate proper deployment
    // Note: This check runs at startup, so we can't check actual request headers
    // Instead, we check if the app appears to be in a properly configured environment

    const isProduction = process.env.NODE_ENV === "production";
    const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || "";

    // Extract hostname from NEXT_PUBLIC_APP_DOMAIN to check if it's a local address
    let isLocalDomain = false;
    try {
      const appDomainHostname = new URL(`https://${appDomain}`).hostname
        .toLowerCase();
      // Exact match for localhost and loopback addresses
      isLocalDomain = appDomainHostname === "localhost" ||
        appDomainHostname === "127.0.0.1" || appDomainHostname === "::1";
    } catch {
      // If parsing fails, fall back to string checks with word boundaries
      isLocalDomain = !appDomain ||
        appDomain === "localhost" ||
        appDomain === "127.0.0.1" ||
        appDomain.startsWith("localhost:") ||
        appDomain.startsWith("127.0.0.1:");
    }

    const hasProxyIndicators = Boolean(appDomain) && !isLocalDomain;

    if (isProduction && !hasProxyIndicators) {
      warnings.push(
        "⚠️  SECURITY: HOSTNAME=0.0.0.0 in production without clear reverse proxy configuration.\n" +
          "   This binding accepts connections from ANY network interface.\n" +
          "   REQUIRED: Deploy behind a reverse proxy (nginx, Cloudflare, etc.) with:\n" +
          "     • Firewall rules preventing direct container access\n" +
          "     • Proper IP forwarding headers (X-Forwarded-For, X-Real-IP)\n" +
          "     • TLS termination at the proxy layer\n" +
          "   See SECURITY.md for deployment patterns and checklist.",
      );
    }
  }

  // ============================================================================
  // REPORT RESULTS
  // ============================================================================

  if (errors.length > 0) {
    console.error("\n" + "=".repeat(80));
    console.error("🚨 CRITICAL: ENVIRONMENT VALIDATION FAILED");
    console.error("=".repeat(80));
    console.error(
      "The following required environment variables are missing or invalid:\n",
    );
    errors.forEach((error) => console.error(error));
    console.error("\n" + "=".repeat(80));
    console.error(
      "📚 Fix: Copy .example.env to .env and fill in all required values",
    );
    console.error("=".repeat(80) + "\n");

    // We throw an Error to stop the build/startup
    throw new Error("Environment validation failed");
  }

  if (warnings.length > 0) {
    console.warn("\n" + "=".repeat(80));
    console.warn("⚠️  OPTIONAL ENVIRONMENT VARIABLES");
    console.warn("=".repeat(80));
    warnings.forEach((warning) => console.warn(warning));
    console.warn("=".repeat(80) + "\n");
  }

  // Only log success in dev to keep prod logs clean
  if (errors.length === 0 && process.env.NODE_ENV === "development") {
    logger.dev("✅ Environment validation passed");
  }
}
