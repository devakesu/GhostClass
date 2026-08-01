import { cookies as nextCookies, headers as nextHeaders } from "next/headers";
import { getAppCheck } from "@/lib/firebase/admin";
import { logger } from "@/lib/logger";
import { validateCsrfToken } from "@/lib/security/csrf";
import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/utils.server";
import { redis } from "@/lib/redis";
import * as Sentry from "@sentry/nextjs";
import { Ratelimit } from "@upstash/ratelimit";

// C-2: Module-level lazy singletons — avoids creating a new Ratelimit instance
// (and its internal HTTP connection pool) on every inbound request.
let _webProxyLimiter: Ratelimit | null = null;
let _webApiLimiter: Ratelimit | null = null;

function getWebProxyLimiter(): Ratelimit {
  if (!_webProxyLimiter) {
    const limit = parseInt(process.env.PROXY_RATE_LIMIT_REQUESTS || "300", 10);
    const window = parseInt(process.env.PROXY_RATE_LIMIT_WINDOW || "60", 10);
    _webProxyLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${window} s`),
      prefix: "@ghostclass/web-proxy",
    });
  }
  return _webProxyLimiter;
}

function getWebApiLimiter(): Ratelimit {
  if (!_webApiLimiter) {
    const limit = parseInt(process.env.WEB_RATE_LIMIT_REQUESTS || "60", 10);
    const window = parseInt(process.env.WEB_RATE_LIMIT_WINDOW || "60", 10);
    _webApiLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${window} s`),
      prefix: "@ghostclass/web-api",
    });
  }
  return _webApiLimiter;
}

export interface AppCheckResult {
  isValid: boolean;
  error?: string;
  reason?: string;
  action?: string;
  criticalRisk?: boolean;
  alreadyLogged?: boolean;
  integrity?: unknown;
}

export interface AppCheckOptions {
  consume?: boolean;
}

export const SECURITY_ERRORS = {
  MISSING_TOKEN: {
    reason:
      "Your device is missing the security attestation required to access this service.",
    action:
      "Please ensure that you have a stable internet connection and are using the official app from Play Store/App Store.",
  },
  UNAUTHORIZED_APP: {
    reason: "This app version is unrecognized or has been modified.",
    action:
      "Please reinstall the official GhostClass app from Play Store/App Store.",
  },
  VERIFICATION_FAILED: {
    reason: "Your device failed the automated security handshake.",
    action:
      "Please ensure your device is certified and your system clock is accurate.",
  },
  DEFAULT: {
    reason: "The security handshake failed or timed out.",
    action: "Please try again in a few moments.",
  },
} as const;

export interface AuthResult {
  isValid: boolean;
  error?: string;
  reason?: string;
  action?: string;
  criticalRisk?: boolean;
  alreadyLogged?: boolean;
  integrity?: unknown;
  authType: "csrf" | "app-check" | "none";
  isWebRequest?: boolean;
  isMobileRequest?: boolean;
}

async function verifyCsrfTokenWithSessionBinding(
  headerList: Headers,
  sessionId?: string,
): Promise<{ isValid: boolean; error?: string }> {
  const csrfToken = headerList.get("x-csrf-token");
  if (!csrfToken) return { isValid: false, error: "Missing CSRF token" };

  if (!(await validateCsrfToken(csrfToken))) {
    logger.warn("CSRF token validation failed");
    return { isValid: false, error: "Invalid CSRF token" };
  }

  if (sessionId) {
    try {
      const boundSession = await redis.get(`csrf:token:${csrfToken}:session`);
      if (!boundSession || boundSession !== sessionId) {
        logger.warn("CSRF token session binding mismatch");
        return { isValid: false, error: "CSRF token session mismatch" };
      }
    } catch (error) {
      logger.warn("CSRF session binding check unavailable", error);
      return { isValid: false, error: "CSRF session binding unavailable" };
    }
  }
  return { isValid: true };
}

export async function verifyAppCheckToken(
  req?: Request,
  options: AppCheckOptions = {},
): Promise<AppCheckResult> {
  const headerList = req ? req.headers : await nextHeaders();
  const token = headerList.get("X-Firebase-AppCheck");

  if (!token) {
    if (process.env.ENFORCE_APP_CHECK === "true") {
      return {
        isValid: false,
        error: "Missing mandatory App Check token",
        reason: SECURITY_ERRORS.MISSING_TOKEN.reason,
        action: SECURITY_ERRORS.MISSING_TOKEN.action,
      };
    }
    return { isValid: true };
  }

  const appCheck = getAppCheck();
  if (!appCheck) {
    if (process.env.ENFORCE_APP_CHECK === "true") {
      return {
        isValid: false,
        error: "Security Infrastructure Offline",
        reason: "The server's security verifier is unavailable.",
        action: "Please try again later.",
      };
    }
    return { isValid: true, alreadyLogged: true };
  }

  try {
    const decodedToken = await appCheck.verifyToken(token, {
      consume: options.consume,
    });
    const authIds = [
      process.env.FIREBASE_APP_ID_ANDROID,
      process.env.FIREBASE_APP_ID_IOS,
    ];

    if (!authIds.includes(decodedToken.appId)) {
      return {
        isValid: false,
        error: "Unauthorized Application",
        reason: SECURITY_ERRORS.UNAUTHORIZED_APP.reason,
        action: SECURITY_ERRORS.UNAUTHORIZED_APP.action,
        criticalRisk: true,
      };
    }

    return {
      isValid: true,
      integrity: { appId: decodedToken.appId, ...(decodedToken.token || {}) },
    };
  } catch (error: unknown) {
    Sentry.captureException(error);
    return {
      isValid: false,
      error: "Security Verification Failed",
      reason: SECURITY_ERRORS.VERIFICATION_FAILED.reason,
      action: SECURITY_ERRORS.VERIFICATION_FAILED.action,
      criticalRisk: true,
      integrity: {
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function verifyAppCheckAuth(
  req: Request,
  options: AppCheckOptions,
): Promise<AuthResult> {
  const res = await verifyAppCheckToken(req, options);
  if (!res.isValid) {
    return {
      isValid: false,
      error: res.error,
      reason: res.reason,
      action: res.action,
      authType: "app-check",
      isMobileRequest: true,
      alreadyLogged: res.alreadyLogged,
    };
  }
  return {
    isValid: true,
    authType: "app-check",
    isMobileRequest: true,
    integrity: res.integrity,
  };
}

async function verifyCsrfAuth(
  headerList: Headers,
): Promise<AuthResult> {
  const cookieStore = await nextCookies();
  const sessionId = (cookieStore.get("__Secure-authjs.session-token") ||
    cookieStore.get("authjs.session-token"))?.value;
  const res = await verifyCsrfTokenWithSessionBinding(headerList, sessionId);
  if (!res.isValid) {
    return {
      isValid: false,
      error: res.error,
      reason: "Security check failed.",
      action: "Please refresh the page or restart the app.",
      authType: "csrf",
      isWebRequest: true,
    };
  }
  return { isValid: true, authType: "csrf", isWebRequest: true };
}

async function verifyAuthentication(
  req: Request,
  options: AppCheckOptions = {},
): Promise<AuthResult> {
  const headerList = req.headers;
  const hasAppCheckToken = headerList.has("X-Firebase-AppCheck");
  const csrfToken = headerList.get("x-csrf-token");
  const authHeader = headerList.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    if (
      process.env.CRON_SECRET && authHeader.slice(7) === process.env.CRON_SECRET
    ) {
      return { isValid: true, authType: "none" };
    }
  }

  if (
    process.env.NODE_ENV !== "production" && process.env.VITEST === "true" &&
    !hasAppCheckToken && !csrfToken
  ) {
    return { isValid: true, authType: "none" };
  }

  if (hasAppCheckToken) {
    return await verifyAppCheckAuth(req, options);
  }

  if (csrfToken) {
    return await verifyCsrfAuth(headerList);
  }

  // State-changing web requests MUST have a CSRF token.
  const method = req.method.toUpperCase();
  const isStateChanging = ["POST", "PUT", "DELETE", "PATCH"].includes(method);
  if (isStateChanging && !hasAppCheckToken) {
    const isVitestBypass = process.env.NODE_ENV !== "production" &&
      process.env.VITEST === "true";
    if (!isVitestBypass) {
      return {
        isValid: false,
        error: "Missing CSRF token",
        reason: "Security check failed.",
        action: "Please refresh the page or restart the app.",
        authType: "csrf",
        isWebRequest: true,
      };
    }
  }

  // Neither header is present. If App Check is not enforced, we allow the request.
  if (process.env.ENFORCE_APP_CHECK !== "true") {
    return { isValid: true, authType: "none" };
  }

  return { isValid: false, error: "Unauthenticated", authType: "none" };
}

async function handleRateLimit(req: NextRequest, clientIp: string | null) {
  if (!clientIp) return true;
  const headerList = req.headers;
  if (headerList.has("X-Firebase-AppCheck")) return true;

  try {
    const path = req.nextUrl?.pathname || new URL(req.url).pathname;
    const isBackend = path.startsWith("/api/backend/");
    // C-2: Use pre-initialised module-level singletons instead of per-request instantiation.
    const limiter = isBackend ? getWebProxyLimiter() : getWebApiLimiter();
    const result = await limiter.limit(`web:${clientIp}`);
    return result.success;
  } catch (e) {
    logger.dev("Rate limiting error", e);
    return true;
  }
}

export function withSecurity<T = unknown>(
  handler: (
    req: NextRequest,
    context: {
      params: Record<string, string | string[]>;
      decryptedBody?: T;
      authType?: "csrf" | "app-check" | "none";
    },
  ) => Promise<Response>,
  options: AppCheckOptions = {},
) {
  return async (
    req: NextRequest,
    context: { params?: unknown } | undefined,
  ) => {
    const rawParams = context?.params;
    const resolvedParams = rawParams instanceof Promise
      ? await rawParams
      : (rawParams ?? {});

    let clientIp: string | null = null;
    try {
      clientIp = getClientIp(await nextHeaders());
    } catch (e) {
      logger.dev("IP check failed", e);
    }

    if (!(await handleRateLimit(req, clientIp))) {
      return NextResponse.json({ error: "Rate limit exceeded" }, {
        status: 429,
        headers: { "Retry-After": "60" },
      });
    }

    const authRes = await verifyAuthentication(req, options);
    if (!authRes.isValid) {
      return NextResponse.json({
        error: authRes.error || "Unauthenticated",
        message: authRes.error || "Unauthenticated",
        reason: authRes.reason || SECURITY_ERRORS.DEFAULT.reason,
        action: authRes.action || SECURITY_ERRORS.DEFAULT.action,
        criticalRisk: authRes.criticalRisk ?? false,
        type: "security",
      }, { status: authRes.authType === "csrf" ? 403 : 401 });
    }

    const response = await handler(req, {
      ...context,
      params: resolvedParams as Record<string, string | string[]>,
      decryptedBody: (context as { decryptedBody?: T } | undefined)
        ?.decryptedBody,
      authType: authRes.authType,
    });
    if (!response) {
      Sentry.captureException(new Error("Handler no response"));
      return NextResponse.json({ error: "Internal security error" }, {
        status: 500,
      });
    }

    return response;
  };
}
