import { headers as nextHeaders, cookies as nextCookies } from "next/headers";
import { getAppCheck } from "@/lib/firebase/admin";
import { logger } from "@/lib/logger";
import { validateCsrfToken } from "@/lib/security/csrf";
import { decryptRequest, encryptResponse } from "@/lib/security/jwe";
import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/utils.server";
import { redis } from "@/lib/redis";
import * as Sentry from "@sentry/nextjs";

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
    reason: "Your device is missing the security attestation required to access this service.",
    action: "Please ensure you have a stable internet connection and are not using an official app.",
  },
  UNAUTHORIZED_APP: {
    reason: "This app version is unrecognized or has been modified.",
    action: "Please reinstall the official GhostClass app.",
  },
  VERIFICATION_FAILED: {
    reason: "Your device failed the automated security handshake.",
    action: "Please ensure your device is certified and your system clock is accurate.",
  },
  DEFAULT: {
    reason: "The security handshake failed or timed out.",
    action: "Please try again in a few moments.",
  }
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
    const decodedToken = await appCheck.verifyToken(token, { consume: options.consume });
    const authIds = [process.env.FIREBASE_APP_ID_ANDROID, process.env.FIREBASE_APP_ID_IOS];

    if (!authIds.includes(decodedToken.appId)) {
      return { 
        isValid: false, 
        error: "Unauthorized Application",
        reason: SECURITY_ERRORS.UNAUTHORIZED_APP.reason,
        action: SECURITY_ERRORS.UNAUTHORIZED_APP.action,
        criticalRisk: true,
      };
    }

    return { isValid: true, integrity: { appId: decodedToken.appId, ...(decodedToken.token || {}) } };
  } catch (error: unknown) {
    Sentry.captureException(error);
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

async function verifyAppCheckAuth(
  req: Request,
  options: AppCheckOptions,
): Promise<AuthResult> {
  const res = await verifyAppCheckToken(req, options);
  if (!res.isValid) {
    return {
      isValid: false, error: res.error, reason: res.reason, action: res.action,
      authType: "app-check", isMobileRequest: true, alreadyLogged: res.alreadyLogged,
    };
  }
  return { isValid: true, authType: "app-check", isMobileRequest: true, integrity: res.integrity };
}

async function verifyCsrfAuth(
  headerList: Headers,
): Promise<AuthResult> {
  const cookieStore = await nextCookies();
  const sessionId = (cookieStore.get("__Secure-authjs.session-token") || cookieStore.get("authjs.session-token"))?.value;
  const res = await verifyCsrfTokenWithSessionBinding(headerList, sessionId);
  if (!res.isValid) {
    return {
      isValid: false, error: res.error, reason: "Web security check failed.",
      action: "Please refresh your browser.", authType: "csrf", isWebRequest: true,
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
    if (process.env.CRON_SECRET && authHeader.slice(7) === process.env.CRON_SECRET) {
      return { isValid: true, authType: "none" };
    }
  }

  if (process.env.NODE_ENV !== "production" && process.env.VITEST === "true" && !hasAppCheckToken && !csrfToken) {
    return { isValid: true, authType: "none" };
  }

  if (hasAppCheckToken) {
    return verifyAppCheckAuth(req, options);
  }

  if (csrfToken) {
    return verifyCsrfAuth(headerList);
  }

  // State-changing web requests MUST have a CSRF token.
  const method = req.method.toUpperCase();
  const isStateChanging = ["POST", "PUT", "DELETE", "PATCH"].includes(method);
  if (isStateChanging && !hasAppCheckToken) {
    const isVitestBypass = process.env.NODE_ENV !== "production" && process.env.VITEST === "true";
    if (!isVitestBypass) {
      return {
        isValid: false,
        error: "Missing CSRF token",
        reason: "Web security check failed.",
        action: "Please refresh your browser.",
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
    const limit = isBackend ? parseInt(process.env.PROXY_RATE_LIMIT_REQUESTS || "300", 10) : parseInt(process.env.WEB_RATE_LIMIT_REQUESTS || "60", 10);
    const window = isBackend ? parseInt(process.env.PROXY_RATE_LIMIT_WINDOW || "60", 10) : 60;

    const { Ratelimit } = await import("@upstash/ratelimit");
    const limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${window} s`),
      prefix: isBackend ? "@ghostclass/web-proxy" : "@ghostclass/web-api",
    });

    const result = await limiter.limit(`web:${clientIp}`);
    return result.success;
  } catch (e) {
    logger.dev("Rate limiting error", e);
    return true;
  }
}

async function handleDecryption<T>(req: NextRequest): Promise<{ decryptedBody?: T; responseCek: string | null; error?: Response }> {
  const contentType = (req.headers.get("content-type") || "").toLowerCase();
  const jweKeyHeader = req.headers.get("X-JWE-Key");
  let decryptedBody: T | undefined;
  let responseCek: string | null = null;

  try {
    if (contentType.includes("application/jose") && ["POST", "PUT", "PATCH"].includes(req.method.toUpperCase())) {
      const jwe = await req.text();
      if (!jwe || jwe.split(".").length !== 5) return { responseCek: null, error: NextResponse.json({ error: "Invalid secure payload" }, { status: 400 }) };
      const decrypted = (await decryptRequest(jwe)) as Record<string, unknown> | undefined;
      if (decrypted && typeof decrypted === "object") {
        decryptedBody = (decrypted.payload ?? decrypted) as T;
        const payloadObj = decrypted.payload as Record<string, unknown> | undefined;
        responseCek = (decrypted.rcek as string | undefined) ?? (payloadObj?.rcek as string | undefined) ?? null;
      }
    } else if (jweKeyHeader) {
      const decrypted = (await decryptRequest(jweKeyHeader)) as Record<string, unknown> | undefined;
      if (decrypted && typeof decrypted === "object") {
        const payloadObj = decrypted.payload as Record<string, unknown> | undefined;
        responseCek = (decrypted.rcek as string | undefined) ?? (payloadObj?.rcek as string | undefined) ?? null;
      }
    }
    return { decryptedBody, responseCek };
  } catch (e) {
    logger.error("JWE Decryption error", e);
    return { responseCek: null, error: NextResponse.json({ error: "Security Handshake Failed" }, { status: 400 }) };
  }
}

async function handleEncryption(response: Response, responseCek: string | null) {
  if (!responseCek || !response.ok) return response;
  try {
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    const encrypted = await encryptResponse(data, responseCek);
    const headers = new Headers(response.headers);
    headers.set("Content-Type", "application/jose");
    return new Response(encrypted, { status: response.status, headers });
  } catch (e) {
    logger.error("Encryption failure", e);
    return NextResponse.json({ error: "Secure Transmission Failed" }, { status: 500 });
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (req: NextRequest, context: any) => {
    const rawParams = context?.params;
    const resolvedParams = rawParams instanceof Promise ? await rawParams : (rawParams ?? {});
    
    let clientIp: string | null = null;
    try { clientIp = getClientIp(await nextHeaders()); } catch (e) { logger.dev("IP check failed", e); }

    if (!(await handleRateLimit(req, clientIp))) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": "60" } });
    }

    const authRes = await verifyAuthentication(req, options);
    if (!authRes.isValid) {
      return NextResponse.json({ 
        error: authRes.error || "Unauthenticated", message: authRes.error || "Unauthenticated",
        reason: authRes.reason || SECURITY_ERRORS.DEFAULT.reason, action: authRes.action || SECURITY_ERRORS.DEFAULT.action,
        criticalRisk: authRes.criticalRisk ?? false, type: "security",
      }, { status: authRes.authType === "csrf" ? 403 : 401 });
    }

    const { decryptedBody, responseCek, error: decErr } = await handleDecryption<T>(req);
    if (decErr) return decErr;

    const response = await handler(req, { ...context, params: resolvedParams as Record<string, string | string[]>, decryptedBody, authType: authRes.authType });
    if (!response) {
      Sentry.captureException(new Error("Handler no response"));
      return NextResponse.json({ error: "Internal security error" }, { status: 500 });
    }

    return handleEncryption(response, responseCek);
  };
}
