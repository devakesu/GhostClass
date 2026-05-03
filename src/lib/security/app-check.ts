import { headers as nextHeaders } from "next/headers";
import { getAppCheck } from "@/lib/firebase/admin";
import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";
import { verifyPlayIntegrity } from "@/lib/security/integrity";
import { decryptRequest, encryptResponse } from "@/lib/security/jwe";
import { NextResponse } from "next/server";
import crypto from "crypto";

/**
 * Result of App Check verification
 */
export interface AppCheckResult {
  isValid: boolean;
  error?: string;
  alreadyLogged?: boolean;
  integrity?: any;
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
 * Options for App Check verification
 */
export interface AppCheckOptions {
  consume?: boolean; // If true, the token is invalidated after use (Replay Protection)
}

/**
 * Verifies the Firebase App Check token from the request headers.
 */
export async function verifyAppCheckToken(
  req?: Request,
  options: AppCheckOptions = {},
): Promise<AppCheckResult> {
  // If in development and APP_CHECK_DISABLED is set, allow all (for testing)
  if (
    process.env.NODE_ENV === "development" &&
    (process.env.DISABLE_APP_CHECK === "true" ||
      process.env.ENFORCE_PLAY_INTEGRITY !== "true")
  ) {
    // Note: We still allow local testing without full integrity enforcement
    // but the token presence might still be checked by callers.
  }

  const headerList = req ? req.headers : await nextHeaders();
  const token = headerList.get("X-Firebase-AppCheck");
  const isMobileApp = isMobileRequest(headerList);
  const isProd = process.env.NODE_ENV === "production";

  // In production, App Check is mandatory for ALL mobile traffic.
  // We identify mobile traffic via the x-mobile-api-key (isMobileApp).
  if (isMobileApp && isProd && !token) {
    logger.warn("App Check verification failed: Absolute requirement for mobile requests, but token is missing");
    return { isValid: false, error: "Missing mandatory App Check token" };
  }

  // Fallback for non-mobile traffic if enforcement is explicitly turned on
  if (!token && isProd && process.env.ENFORCE_APP_CHECK === "true") {
    logger.warn("App Check verification failed: Missing token (enforced)");
    return { isValid: false, error: "Missing App Check token" };
  }

  // If no token and not mobile/not enforced, proceed
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
      return { isValid: false, error: "Unauthorized App ID" };
    }

    // 2. Secondary deep attestation for Android (Play Integrity)
    const playIntegrityToken = headerList.get("X-Play-Integrity");
    const userAgent = headerList.get("user-agent") || "";
    const isAndroid = userAgent.toLowerCase().includes("android");

    let integrity: any = null;

    if (playIntegrityToken) {
      // The mobile app uses the project number as a static nonce for basic attestation.
      const expectedNonce = process.env.PLAY_INTEGRITY_PROJECT_NUMBER || "424804867878";
      const integrityResult = await verifyPlayIntegrity(playIntegrityToken, expectedNonce);
      integrity = integrityResult.verdict;
      
      if (!integrityResult.isValid) {
        return {
          isValid: false,
          error: integrityResult.error || "Device integrity check failed",
          integrity,
        };
      }
    } else if (isAndroid && isProd) {
      // MANDATORY for Android mobile requests in production if enforcement is enabled.
      // We check ENFORCE_PLAY_INTEGRITY as the master switch for mandatory token presence.
      const shouldEnforceIntegrity = isMobileApp || process.env.ENFORCE_PLAY_INTEGRITY === "true";
      
      if (shouldEnforceIntegrity) {
        logger.warn(
          "App Check: Missing mandatory Play Integrity token for Android client",
        );
        return {
          isValid: false,
          error: "Missing mandatory integrity attestation",
        };
      }
    }

    return { isValid: true, integrity };
  } catch (error: any) {
    logger.error("App Check verification failed:", error.message);
    Sentry.captureException(error, {
      tags: { type: "app_check_failure" },
    });
    return { isValid: false, error: "Invalid App Check token" };
  }
}

/**
 * withSecurity (HOF)
 * -----------------
 * Wraps a Next.js API route handler to provide:
 * 1. Global App Check & Integrity enforcement
 * 2. Bi-directional JWE Decryption & Encryption
 */
export function withSecurity(
  handler: (
    req: Request,
    context: { params: any; decryptedBody?: any },
  ) => Promise<Response>,
  options: AppCheckOptions = {},
) {
  return async (req: Request, context: any) => {
    // 1. Enforce App Check / Integrity
    const authResult = await verifyAppCheckToken(req, options);
    if (!authResult.isValid && process.env.ENFORCE_APP_CHECK === "true") {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    let decryptedBody: any = null;
    let responseCek: string | null = null;
    const contentType = (req.headers.get("content-type") || "").toLowerCase();
    const jweKeyHeader = req.headers.get("X-JWE-Key");

    try {
      // 2. Handle JWE Request Decryption
      // Only process body decryption for mutation methods with content-type 'application/jose'
      const isMutationMethod = ['POST', 'PUT', 'PATCH'].includes(req.method.toUpperCase());
      
      if (contentType.includes("application/jose") && isMutationMethod) {
        const jwe = await req.text();
        
        // Basic segments check (JWE has 5 parts / 4 dots)
        if (!jwe || jwe.split('.').length !== 5) {
          logger.warn(`withSecurity: Received 'application/jose' content-type but body is not a valid JWE structure. (Length: ${jwe?.length})`);
          return NextResponse.json({ error: "Invalid secure payload structure" }, { status: 400 });
        }

        const decrypted = await decryptRequest(jwe) as any;
        
        // Handle both nested {payload, rcek} and flat {token, ..., rcek} structures
        if (decrypted && typeof decrypted === 'object' && 'payload' in decrypted) {
          decryptedBody = decrypted.payload;
          responseCek = decrypted.rcek || null;
        } else {
          decryptedBody = decrypted;
          responseCek = (decrypted && typeof decrypted === 'object') ? decrypted.rcek : null;
        }
      } else if (jweKeyHeader) {
        // Support for GET requests or requests without bodies:
        // The client sends the JWE-wrapped CEK in a header.
        const decrypted = await decryptRequest(jweKeyHeader) as any;
        // For header-only JWE, rcek might be direct or in a payload property
        if (decrypted && typeof decrypted === 'object' && 'payload' in decrypted) {
          responseCek = decrypted.rcek || null;
        } else {
          responseCek = (decrypted && typeof decrypted === 'object') ? (decrypted.rcek || decrypted.payload?.rcek || null) : null;
        }
      }
    } catch (error) {
      logger.error("withSecurity: JWE Decryption error:", error);
      return NextResponse.json({ error: "Security Handshake Failed" }, {
        status: 400,
      });
    }

    // 3. Execute the handler
    const response = await handler(req, { ...context, decryptedBody });

    // SAFETY CHECK: Ensure we actually have a response object
    if (!response) {
       console.error("SECURITY HOF DEBUG: Crash - Handler returned no response");
      return NextResponse.json({ error: "Internal security error" }, { status: 500 });
    }

    // 4. Handle JWE Response Encryption
    if (responseCek && response.ok) {
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

        const encryptedResponse = await encryptResponse(
          responseData,
          responseCek,
        );

        const newHeaders = new Headers(response.headers);
        newHeaders.set("Content-Type", "application/jose");

        return new Response(encryptedResponse, {
          status: response.status,
          headers: newHeaders,
        });
      } catch (error) {
        logger.error("withSecurity: Response encryption failure:", error);
        // Fallback to error if encryption fails
        return NextResponse.json({ error: "Secure Transmission Failed" }, {
          status: 500,
        });
      }
    }

    return response;
  };
}
