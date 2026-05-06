import { headers as nextHeaders, cookies as nextCookies } from "next/headers";
import { getAppCheck } from "@/lib/firebase/admin";
import { logger } from "@/lib/logger";
import { verifyPlayIntegrity } from "@/lib/security/integrity";
import { verifyDeviceCheckToken } from "@/lib/security/device-check";
import { validateCsrfToken } from "@/lib/security/csrf";
import { decryptRequest, encryptResponse } from "@/lib/security/jwe";
import { NextResponse } from "next/server";
import crypto from "crypto";
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
  alreadyLogged?: boolean;
  integrity?: any;
}

/**
 * Options for App Check verification
 */
export interface AppCheckOptions {
  consume?: boolean; // If true, the token is invalidated after use (Replay Protection)
}

/**
 * Checks if the request is from an authorized mobile app using the mobile API key.
 */
export function isMobileRequest(headers: Headers): boolean {
  const mobileApiKey = headers.get("x-mobile-api-key");
  const mobileSecret = process.env.MOBILE_API_SECRET;

  if (!mobileApiKey || !mobileSecret) return false;

  const keyBuffer = Buffer.from(mobileApiKey);
  const secretBuffer = Buffer.from(mobileSecret);
  if (keyBuffer.length !== secretBuffer.length) return false;

  return crypto.timingSafeEqual(keyBuffer, secretBuffer);
}

/**
 * Authentication result - either CSRF (web) or App Check (mobile)
 */
export interface AuthResult {
  isValid: boolean;
  error?: string;
  reason?: string;
  action?: string;
  alreadyLogged?: boolean;
  integrity?: any;
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
      reason: "Device verification was skipped or blocked by a firewall.",
      action: "Please ensure your internet connection is stable and you are not using a VPN or custom DNS."
    };
  }

  // If no token and enforcement is off, proceed
  if (!token) return { isValid: true };

  const appCheck = getAppCheck();
  if (!appCheck) {
    logger.error(
      "App Check verification skipped: Firebase Admin not initialized",
    );

    return { isValid: true, alreadyLogged: true };
  }

  try {
    // Verify token and optionally consume it (Nonce-equivalent replay protection)
    const decodedToken = await appCheck.verifyToken(token, {
      consume: options.consume,
    });

    const authorizedAppIds = [
      process.env.FIREBASE_APP_ID_ANDROID || "1:424804867878:android:015bb34927f1dd8e21abe7",
      process.env.FIREBASE_APP_ID_IOS || "1:424804867878:ios:43e6f61b15e0954321abe7",
    ];

    // Validate that the token belongs to our authorized mobile apps
    if (!authorizedAppIds.includes(decodedToken.appId)) {
      logger.error(
        `App Check verification failed: Unauthorized App ID: ${decodedToken.appId}`,
      );
      return { 
        isValid: false, 
        error: "Unauthorized App ID",
        reason: "The application signature does not match our security records.",
        action: "Please reinstall the official GhostClass app from the Google Play Store or Apple App Store."
      };
    }

    // Determine which platform (Android or iOS) based on App ID
    const isAndroid = decodedToken.appId.includes("android");
    const isIOS = decodedToken.appId.includes("ios");

    let integrity: any = null;

    // Android: Verify with Play Integrity
    if (isAndroid) {
      const playIntegrityToken = headerList.get("X-Play-Integrity");
      const shouldEnforceIntegrity = process.env.ENFORCE_PLAY_INTEGRITY === "true";

      if (playIntegrityToken) {
        const integrityResult = await verifyPlayIntegrity(playIntegrityToken);
        integrity = integrityResult.verdict;

        if (!integrityResult.isValid) {
          return {
            isValid: false,
            error: integrityResult.error || "Device integrity check failed",
            reason: integrityResult.reason || "Android Play Integrity check failed (Device may be compromised or uncertified).",
            action: integrityResult.action || "Please ensure your device is not rooted and you are using the official version of the app.",
            integrity,
          };
        }
      } else if (shouldEnforceIntegrity) {
        logger.warn(
          "App Check: Android client missing mandatory Play Integrity token (ENFORCE_PLAY_INTEGRITY=true)",
        );
        return {
          isValid: false,
          error: "Missing mandatory integrity attestation",
          reason: "Play Integrity token was not provided by the Android system.",
          action: "Please ensure your device is not rooted and is running a certified version of Android."
        };
      }
    }

    // iOS: Verify with DeviceCheck
    if (isIOS) {
      const deviceCheckToken = headerList.get("X-Device-Check");
      const shouldEnforceDeviceCheck = process.env.ENFORCE_DEVICE_CHECK === "true";

      if (deviceCheckToken) {
        const nonce = headerList.get("X-Device-Check-Nonce");
        const deviceCheckResult = await verifyDeviceCheckToken(deviceCheckToken, nonce || undefined);
        integrity = deviceCheckResult.verdict;

        if (!deviceCheckResult.isValid) {
          return {
            isValid: false,
            error: deviceCheckResult.error || "Device integrity check failed",
            reason: "iOS DeviceCheck verification failed (Device integrity cannot be guaranteed).",
            action: "Please ensure your device is not jailbroken and is using an official iOS release.",
            integrity,
          };
        }
      } else if (shouldEnforceDeviceCheck) {
        logger.warn(
          "App Check: iOS client missing mandatory DeviceCheck token (ENFORCE_DEVICE_CHECK=true)",
        );
        return {
          isValid: false,
          error: "Missing mandatory device check",
          reason: "DeviceCheck token was not provided by the iOS system.",
          action: "Please ensure your device is not jailbroken and is using an official iOS release."
        };
      }
    }

    return { isValid: true, integrity };
  } catch (error: any) {
    Sentry.captureException(error, {
      tags: { type: "app_check_error", location: "verifyAppCheckToken" },
    });

    return { 
      isValid: false, 
      error: "Invalid App Check token",
      reason: "The security token provided by your device has expired or is invalid.",
      action: "Please restart the app. If the issue persists after repeated attempts, please contact support."
    };
  }
}

/**
 * Unified authentication verification
 * Checks for EITHER CSRF token (web) OR App Check token (mobile)
 * Both must be valid for the request to proceed
 */
async function verifyAuthentication(req: Request): Promise<AuthResult> {
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
  if (process.env.VITEST && !process.env.DISABLE_SECURITY_BYPASS && !hasAppCheckToken && !csrfToken) {
    logger.dev("Authentication bypassed for Vitest test environment");
    return { isValid: true, authType: "none" };
  }

  // If neither token present, reject
  if (!hasAppCheckToken && !csrfToken) {
    logger.warn("Authentication failed: Neither App Check nor CSRF token present");
    return {
      isValid: false,
      error: "Unauthenticated request",
      reason: "Missing device verification token.",
      action: "Please restart the app and ensure you are using a secure internet connection. If this persists, please contact support.",
      authType: "none",
    };
  }

  // Prioritize App Check (mobile) if both present (defensive)
  if (hasAppCheckToken) {
    const appCheckResult = await verifyAppCheckToken(req);

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
export function withSecurity(
  handler: (
    req: Request,
    context: { params: any; decryptedBody?: any; authType?: string },
  ) => Promise<Response>,
) {
  return async (req: Request, context: any) => {
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
        // Web requests: stricter rate limiting (10 req/min per IP)
        // This compensates for lack of device attestation by preventing
        // automated attacks that use CSRF token bypass techniques
        const { Ratelimit } = await import("@upstash/ratelimit");
        const webLimiter = new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(10, "60 s"),
          prefix: "@ghostclass/web-api",
        });

        const rateLimitResult = await webLimiter.limit(`web:${clientIp}`);
        if (!rateLimitResult.success) {
          logger.warn("Web request rate limit exceeded", { ip: clientIp });
          return NextResponse.json(
            { error: "Rate limit exceeded" },
            { status: 429, headers: { "Retry-After": "60" } },
          );
        }
      }
    } catch (_error) {
      logger.dev("Rate limiting unavailable, proceeding without check");
    }

    // 2. Enforce unified authentication (CSRF or App Check)
    const authResult = await verifyAuthentication(req);

    if (!authResult.isValid) {
      logger.warn("Authentication failed", {
        authType: authResult.authType,
        error: authResult.error,
        ip: clientIp,
      });
      
      const appCheckRes = authResult as any;
      const status = authResult.authType === "csrf" ? 403 : 401;
      
      return NextResponse.json(
        { 
          error: authResult.error || "Unauthenticated",
          message: authResult.error || "Unauthenticated",
          reason: appCheckRes.reason || "The security handshake failed or timed out.",
          action: appCheckRes.action || "Please try again in a few moments.",
          type: "security"
        },
        { status },
      );
    }

    let decryptedBody: any = null;
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
        isMutationMethod &&
        authResult.isMobileRequest
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

        const decrypted = (await decryptRequest(jwe)) as any;

        // Handle both nested {payload, rcek} and flat {token, ..., rcek} structures
        if (decrypted && typeof decrypted === "object" && "payload" in decrypted) {
          decryptedBody = decrypted.payload;
          responseCek = decrypted.rcek || null;
        } else {
          decryptedBody = decrypted;
          responseCek =
            decrypted && typeof decrypted === "object" ? decrypted.rcek : null;
        }
      } else if (jweKeyHeader && authResult.isMobileRequest) {
        // Support for GET requests or requests without bodies:
        // The client sends the JWE-wrapped CEK in a header.
        const decrypted = (await decryptRequest(jweKeyHeader)) as any;
        // For header-only JWE, rcek might be direct or in a payload property
        if (decrypted && typeof decrypted === "object" && "payload" in decrypted) {
          responseCek = decrypted.rcek || null;
        } else {
          responseCek =
            decrypted && typeof decrypted === "object"
              ? decrypted.rcek || decrypted.payload?.rcek || null
              : null;
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
      decryptedBody,
      authType: authResult.authType,
    });

    // SAFETY CHECK: Ensure we actually have a response object
    if (!response) {
      console.error("SECURITY HOF DEBUG: Crash - Handler returned no response");
      return NextResponse.json(
        { error: "Internal security error" },
        { status: 500 },
      );
    }

    // 5. Handle JWE Response Encryption (mobile only)
    if (responseCek && response.ok && authResult.isMobileRequest) {
      try {
        // Only attempt to encrypt if the client provided a response CEK
        // and the handler returned a successful response.
        let responseData: any;
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
