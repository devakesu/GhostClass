import { headers as nextHeaders, cookies as nextCookies } from "next/headers";
import { getAppCheck } from "@/lib/firebase/admin";
import { logger } from "@/lib/logger";
import { validateCsrfToken } from "@/lib/security/csrf";
import { decryptRequest, encryptResponse } from "@/lib/security/jwe";
import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/utils.server";
import { redis } from "@/lib/redis";
import * as Sentry from "@sentry/nextjs";

/**
 * Result of App Check verification
 */
export interface AppCheckResult {
  isValid: boolean;
  error?: string;
  reason?: string;
  action?: string;
  criticalRisk?: boolean;
  alreadyLogged?: boolean;
  integrity?: unknown;
}

/**
 * Options for App Check verification
 */
export interface AppCheckOptions {
  consume?: boolean; // If true, the token is invalidated after use (Replay Protection)
}

/**
 * Common security error messages
 */
export const SECURITY_ERRORS = {
  MISSING_TOKEN: {
    reason: "Your device is missing the security attestation required to access this service.",
    action: "Please ensure you have a stable internet connection and are not using an uncertified device. This can also happen if the app was not installed from the official app store.",
  },
  UNAUTHORIZED_APP: {
    reason: "This app version is unrecognized or has been modified.",
    action: "Please reinstall the official GhostClass app from the Play Store or Apple App Store.",
  },
  VERIFICATION_FAILED: {
    reason: "Your device failed the automated security handshake (Attestation Error).",
    action: "Please ensure your device is certified, you are using the official app, and your system clock is accurate.",
  },
  DEFAULT: {
    reason: "The security handshake failed or timed out.",
    action: "Please try again in a few moments.",
  }
} as const;


/**
 * Authentication result - either CSRF (web) or App Check (mobile)
 */
export interface AuthResult {
  isValid: boolean;
  error?: string;
  reason?: string;
  action?: string;
  criticalRisk?: boolean;
  alreadyLogged?: boolean;
  integrity?: unknown;
  authType: "csrf" | "app-check" | "none"; // 'csrf' for web, 'app-check' for mobile
  isWebRequest?: boolean;
  isMobileRequest?: boolean;
}

/**
 * Verifies CSRF token with session binding
 * @param headerList - Request headers
 * @param sessionId - Session ID from cookie (optional, for additional binding)
 * @returns CSRF validation result
 */
async function verifyCsrfTokenWithSessionBinding(
  headerList: Headers,
  sessionId?: string,
): Promise<{ isValid: boolean; error?: string }> {
  const csrfToken = headerList.get("x-csrf-token");

  if (!csrfToken) {
    return { isValid: false, error: "Missing CSRF token" };
  }

  // Validate CSRF token against httpOnly cookie
  const isValid = await validateCsrfToken(csrfToken);

  if (!isValid) {
    logger.warn("CSRF token validation failed");
    return { isValid: false, error: "Invalid CSRF token" };
  }

  // Strict session binding: if a session cookie exists, the CSRF token must be
  // bound to that exact session ID in Redis.
  if (sessionId) {
    try {
      const tokenSessionKey = `csrf:token:${csrfToken}:session`;
      const boundSession = await redis.get(tokenSessionKey);

      if (!boundSession || boundSession !== sessionId) {
        logger.warn("CSRF token session binding mismatch", { sessionId });
        return {
          isValid: false,
          error: "CSRF token session mismatch",
        };
      }
    } catch (_error) {
      logger.warn("CSRF session binding check unavailable");
      return {
        isValid: false,
        error: "CSRF session binding unavailable",
      };
    }
  }

  return { isValid: true };
}

/**
 * Verifies Firebase App Check token and mobile device integrity
 * Supports both Android (Play Integrity) and iOS (DeviceCheck)
 */
export async function verifyAppCheckToken(
  req?: Request,
  options: AppCheckOptions = {},
): Promise<AppCheckResult> {
  const headerList = req ? req.headers : await nextHeaders();
  const token = headerList.get("X-Firebase-AppCheck");

  // App Check is mandatory only when the corresponding env flag enables it.
  if (!token && process.env.ENFORCE_APP_CHECK === "true") {
    logger.warn("App Check verification failed: Missing token (enforced)");
    return { 
      isValid: false, 
      error: "Missing mandatory App Check token",
      reason: SECURITY_ERRORS.MISSING_TOKEN.reason,
      action: SECURITY_ERRORS.MISSING_TOKEN.action,
      criticalRisk: false,
    };
  }

  // If no token and enforcement is off, proceed
  if (!token) return { isValid: true };

  const appCheck = getAppCheck();
  if (!appCheck) {
    logger.error(
      "App Check verification skipped: Firebase Admin not initialized",
    );

    if (process.env.ENFORCE_APP_CHECK === "true") {
      return {
        isValid: false,
        error: "Security Infrastructure Offline",
        reason: "The server's security verifier is currently unavailable.",
        action: "Please try again later. If the issue persists, contact support.",
        criticalRisk: false,
      };
    }

    return { isValid: true, alreadyLogged: true };
  }

  try {
    // Verify token and optionally consume it (Nonce-equivalent replay protection)
    const decodedToken = await appCheck.verifyToken(token, {
      consume: options.consume,
    });

    const integrityDetails = {
      appId: decodedToken.appId,
      ...(decodedToken.token || {}),
    };

    const authorizedAppIds = [
      process.env.FIREBASE_APP_ID_ANDROID,
      process.env.FIREBASE_APP_ID_IOS,
    ];

    // Validate that the token belongs to our authorized mobile apps
    if (!authorizedAppIds.includes(decodedToken.appId)) {
      logger.error(
        `App Check verification failed: Unauthorized App ID: ${decodedToken.appId}`,
      );
      return { 
        isValid: false, 
        error: "Unauthorized Application",
        reason: SECURITY_ERRORS.UNAUTHORIZED_APP.reason,
        action: SECURITY_ERRORS.UNAUTHORIZED_APP.action,
        criticalRisk: true,
      };
    }

    // Android/iOS: We rely on Firebase App Check which already uses Play Integrity/DeviceCheck
    // under the hood. The manual X-Play-Integrity header is no longer required for standard API access.

    return { isValid: true, integrity: integrityDetails };
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { type: "app_check_error", location: "verifyAppCheckToken" },
    });

    return { 
      isValid: false, 
      error: "Security Verification Failed",
      reason: SECURITY_ERRORS.VERIFICATION_FAILED.reason,
      action: SECURITY_ERRORS.VERIFICATION_FAILED.action,
      criticalRisk: true,
      integrity: { error: error instanceof Error ? error.message : String(error) },
    };
  }
}

/**
 * Unified authentication verification
 * Checks for EITHER CSRF token (web) OR App Check token (mobile)
 * Both must be valid for the request to proceed
 */
async function verifyAuthentication(
  req: Request,
  options: AppCheckOptions = {},
): Promise<AuthResult> {
  const headerList = req.headers;

  // Check for App Check token (mobile)
  const hasAppCheckToken = headerList.has("X-Firebase-AppCheck");
  const csrfToken = headerList.get("x-csrf-token");
  const authHeader = headerList.get("authorization");

  // 1. Allow bypass for Cron routes (authenticated via CRON_SECRET)
  if (authHeader?.startsWith("Bearer ")) {
    const providedSecret = authHeader.slice("Bearer ".length);
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && providedSecret === cronSecret) {
      logger.dev("Authentication bypassed for Cron/System request");
      return { isValid: true, authType: "none" };
    }
  }

  // 2. Allow bypass for Vitest test environment
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.VITEST === "true" &&
    !hasAppCheckToken &&
    !csrfToken
  ) {
    logger.dev("Authentication bypassed for Vitest test environment");
    return { isValid: true, authType: "none" };
  }

  // If neither token present, reject
  if (!hasAppCheckToken && !csrfToken) {
    logger.warn("Authentication failed: Neither App Check nor CSRF token present");
    return {
      isValid: false,
      error: "Unauthenticated request",
      reason: "Device verification token is missing or expired.",
      action: "Please restart the app and ensure your device has a stable internet connection",
      authType: "none",
    };
  }

  // Prioritize App Check (mobile) if both present (defensive)
  if (hasAppCheckToken) {
    const appCheckResult = await verifyAppCheckToken(req, options);

    if (!appCheckResult.isValid) {
      logger.warn("App Check verification failed", { error: appCheckResult.error });
      return {
        isValid: false,
        error: appCheckResult.error,
        reason: appCheckResult.reason,
        action: appCheckResult.action,
        authType: "app-check",
        isMobileRequest: true,
        alreadyLogged: appCheckResult.alreadyLogged,
      };
    }

    logger.dev("Mobile request (App Check) authenticated");
    return {
      isValid: true,
      authType: "app-check",
      isMobileRequest: true,
      integrity: appCheckResult.integrity,
    };
  }

  // Web request: Validate CSRF token with session binding
  if (csrfToken) {
    // Try to get session ID from cookies if available
    const cookieStore = await nextCookies();
    const sessionCookie = cookieStore.get("__Secure-authjs.session-token") || 
                          cookieStore.get("authjs.session-token");
    const sessionId = sessionCookie?.value;

    const csrfResult = await verifyCsrfTokenWithSessionBinding(headerList, sessionId);

    if (!csrfResult.isValid) {
      logger.warn("CSRF token verification failed", { error: csrfResult.error });
      return {
        isValid: false,
        error: csrfResult.error,
        reason: "Web security check failed (CSRF mismatch).",
        action: "Please refresh your browser and try again.",
        authType: "csrf",
        isWebRequest: true,
      };
    }

    logger.dev("Web request (CSRF) authenticated");
    return {
      isValid: true,
      authType: "csrf",
      isWebRequest: true,
    };
  }

  // Should not reach here, but failsafe
  return {
    isValid: false,
    error: "Authentication verification failed",
    reason: "Internal security routing failure.",
    action: "Please restart the app and try again.",
    authType: "none",
  };
}

/**
 * withSecurity (HOF)
 * -----------------
 * Wraps a Next.js API route handler to provide:
 * 1. Unified authentication (CSRF for web, App Check for mobile)
 * 2. Mobile device integrity (Play Integrity for Android, DeviceCheck for iOS)
 * 3. Bi-directional JWE Decryption & Encryption (mobile only)
 * 4. Rate limiting (more restrictive for web to compensate for lack of device attestation)
 */
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
  return async (req: NextRequest, context: any) => {
    // Next.js 15+ makes params a Promise. We handle both Promise and direct Record
    // (for tests) using a failsafe any type to satisfy the Next.js RouteContext constraint.
    const rawParams = context?.params;
    const resolvedParams = rawParams instanceof Promise ? await rawParams : (rawParams ?? {});
    const headerList = req.headers;

    // Get client IP for rate limiting
    let clientIp: string | null = null;
    try {
      const headersList = await nextHeaders();
      clientIp = getClientIp(headersList);
    } catch (_error) {
      logger.dev("Could not determine client IP");
    }

    // 1. Rate limiting - Web requests get stricter limits due to no device attestation
    try {
      const isWebRequest = !headerList.has("X-Firebase-AppCheck");

      if (isWebRequest && clientIp) {
        // Web requests: stricter rate limiting than mobile to compensate for
        // lack of device attestation. However, we must allow enough for
        // legitimate dashboard bursts.
        const path = req.nextUrl?.pathname || new URL(req.url).pathname;
        const isBackendProxy = path.startsWith("/api/backend/");

        // Proxy routes get higher throughput (default 300/min) matching proxyRateLimiter
        // Standard web API routes get 60/min (up from 10/min)
        const limit = isBackendProxy
          ? parseInt(process.env.PROXY_RATE_LIMIT_REQUESTS || "300", 10)
          : parseInt(process.env.WEB_RATE_LIMIT_REQUESTS || "60", 10);
        const window = isBackendProxy
          ? parseInt(process.env.PROXY_RATE_LIMIT_WINDOW || "60", 10)
          : 60;

        const { Ratelimit } = await import("@upstash/ratelimit");
        const webLimiter = new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(limit, `${window} s`),
          prefix: isBackendProxy ? "@ghostclass/web-proxy" : "@ghostclass/web-api",
        });

        const rateLimitResult = await webLimiter.limit(`web:${clientIp}`);
        if (!rateLimitResult.success) {
          logger.warn("Web request rate limit exceeded", { ip: clientIp, path, limit });
          return NextResponse.json(
            { error: "Rate limit exceeded" },
            { status: 429, headers: { "Retry-After": String(window) } },
          );
        }
      }
    } catch (_error) {
      logger.dev("Rate limiting unavailable, proceeding without check");
    }

    // 2. Enforce unified authentication (CSRF or App Check)
    const authResult = await verifyAuthentication(req, options);

    if (!authResult.isValid) {
      logger.warn("Authentication failed", {
        authType: authResult.authType,
        error: authResult.error,
        ip: clientIp,
      });
      const status = authResult.authType === "csrf" ? 403 : 401;
      
      return NextResponse.json(
        { 
          error: authResult.error || "Unauthenticated",
          message: authResult.error || "Unauthenticated",
          reason: authResult.reason || SECURITY_ERRORS.DEFAULT.reason,
          action: authResult.action || SECURITY_ERRORS.DEFAULT.action,
          criticalRisk: authResult.criticalRisk ?? false,
          type: "security",
        },
        { status },
      );
    }

    let decryptedBody: T | undefined = undefined;
    let responseCek: string | null = null;
    const contentType = (req.headers.get("content-type") || "").toLowerCase();
    const jweKeyHeader = req.headers.get("X-JWE-Key");

    try {
      // 3. Handle JWE Request Decryption (mobile only)
      // Only process body decryption for mutation methods with content-type 'application/jose'
      // This is only used for mobile requests
      const isMutationMethod = ["POST", "PUT", "PATCH"].includes(
        req.method.toUpperCase(),
      );

      if (
        contentType.includes("application/jose") &&
        isMutationMethod
      ) {
        const jwe = await req.text();

        // Basic segments check (JWE has 5 parts / 4 dots)
        if (!jwe || jwe.split(".").length !== 5) {
          logger.warn(
            `withSecurity: Received 'application/jose' content-type but body is not a valid JWE structure. (Length: ${jwe?.length})`,
          );
          return NextResponse.json(
            { error: "Invalid secure payload structure" },
            { status: 400 },
          );
        }

        const decrypted = (await decryptRequest(jwe)) as unknown;

        // Handle both nested {payload, rcek} and flat {token, ..., rcek} structures
        if (decrypted && typeof decrypted === "object") {
          if ("payload" in decrypted) {
            decryptedBody = (decrypted as { payload: T }).payload;
            responseCek = (decrypted as { rcek?: string }).rcek || null;
          } else {
            decryptedBody = decrypted as T;
            responseCek = (decrypted as { rcek?: string }).rcek || null;
          }
        }
      } else if (jweKeyHeader) {
        // Support for GET requests or requests without bodies:
        // The client sends the JWE-wrapped CEK in a header.
        const decrypted = (await decryptRequest(jweKeyHeader)) as unknown;
        // For header-only JWE, rcek might be direct or in a payload property
        if (decrypted && typeof decrypted === "object") {
          if ("payload" in decrypted) {
            const payload = (decrypted as { payload: any }).payload;
            responseCek = (decrypted as { rcek?: string }).rcek || 
                          (payload && typeof payload === "object" ? (payload as any).rcek : null) || 
                          null;
          } else {
            responseCek = (decrypted as { rcek?: string }).rcek || null;
          }
        }
      }
    } catch (_error) {
      logger.error("withSecurity: JWE Decryption error:", _error);
      return NextResponse.json(
        { error: "Security Handshake Failed" },
        {
          status: 400,
        },
      );
    }

    // 4. Execute the handler
    const response = await handler(req, {
      ...context,
      params: resolvedParams,
      decryptedBody,
      authType: authResult.authType,
    });

    // SAFETY CHECK: Ensure we actually have a response object
    if (!response) {
      logger.error("[withSecurity] Handler returned no response — this indicates a critical bug in the security middleware");
      Sentry.captureException(
        new Error("[withSecurity] Handler returned no response"),
        { level: 'fatal', tags: { type: 'security_middleware_error', location: 'withSecurity' } }
      );
      return NextResponse.json(
        { error: "Internal security error" },
        { status: 500 },
      );
    }

    // 5. Handle JWE Response Encryption
    if (responseCek && response.ok) {
      try {
        // Only attempt to encrypt if the client provided a response CEK
        // and the handler returned a successful response.
        let responseData: unknown;
        const responseText = await response.text();

        try {
          responseData = JSON.parse(responseText);
        } catch {
          // If the upstream returned raw text (e.g. "even" for a semester setting),
          // treat it as a literal string to be encrypted as JSON.
          responseData = responseText;
        }

        const encryptedResponse = await encryptResponse(responseData, responseCek);

        const newHeaders = new Headers(response.headers);
        newHeaders.set("Content-Type", "application/jose");

        return new Response(encryptedResponse, {
          status: response.status,
          headers: newHeaders,
        });
      } catch (_error) {
        logger.error("withSecurity: Response encryption failure:", _error);
        // Fallback to error if encryption fails
        return NextResponse.json(
          { error: "Secure Transmission Failed" },
          {
            status: 500,
          },
        );
      }
    }

    return response;
  };
}
