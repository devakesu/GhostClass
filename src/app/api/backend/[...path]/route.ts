import { NextRequest, NextResponse } from "next/server";
import { Buffer } from "buffer";
import { getAuthTokenWithFallback } from "@/lib/security/auth-cookie";
import { withSecurity } from "@/lib/security/app-check";
import { getAllowedHosts, resolveRequestHostname } from "@/lib/security/origin-validation";
import { logger } from "@/lib/logger";
import { ezygoCircuitBreaker, UpstreamServerError } from "@/lib/circuit-breaker";
import { getClientIp } from "@/lib/utils.server";
import { fetchEzygoData, invalidateEzygoCacheForUser } from "@/lib/ezygo-batch-fetcher";

// Modular proxy imports
import { 
  PUBLIC_PATHS, MAX_RESPONSE_BYTES, MAX_ERROR_BODY_LOG_LENGTH, RETRYABLE_UPSTREAM_STATUSES 
} from "@/lib/proxy/constants";
import { buildEgressTargets, resolveSafeUpstreamErrorMessage, readWithLimit } from "@/lib/proxy/proxy-utils";

const BASE_API_URL = process.env.NEXT_PUBLIC_BACKEND_URL?.trim().replace(/\/+$/, "");
const EGRESS_TARGETS = buildEgressTargets();
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// Runtime validation for proxy secrets (defense-in-depth)
const MISCONFIGURED_EGRESS_TARGET = EGRESS_TARGETS.find(target => target.name !== "direct" && !target.secret);

async function forward(req: NextRequest, method: string, path: string[], decryptedBody?: any, authType?: "app-check" | "csrf" | "none") {
  let lastAttemptedEgressName = "direct"; // Declare at top to ensure visibility in catch block
  if (!BASE_API_URL) {
    logger.error("NEXT_PUBLIC_BACKEND_URL is not configured");
    return NextResponse.json({ message: "Backend URL not configured" }, { status: 500 });
  }

  // 1. Path & Body Validation
  const pathSegments = path ?? [];
  if (pathSegments.length === 0) return NextResponse.json({ message: "Missing path" }, { status: 400 });
  const fullPath = pathSegments.join("/");
  if (fullPath.includes("#") || fullPath.includes("?")) {
    return NextResponse.json({ message: "Invalid path format" }, { status: 400 });
  }

  const isPublic = PUBLIC_PATHS.has(fullPath);
  const isMobileApp = authType === "app-check";
  const isWrite = method !== "GET" && method !== "HEAD";
  const clientIp = getClientIp(req.headers);

  // 1.5 Origin & Access Validation
  if (!isPublic && !isMobileApp && !IS_PRODUCTION) {
    // Basic development check
  } else if (!isPublic && !isMobileApp && IS_PRODUCTION) {
    const allowedHosts = getAllowedHosts();
    const origin = req.headers.get("origin");
    if (!origin) {
      const isRead = method === "GET" || method === "HEAD";
      const secFetchSite = req.headers.get("sec-fetch-site")?.toLowerCase();
      const requestHostname = resolveRequestHostname(req);
      if (!(isRead && secFetchSite === "same-origin" && !!requestHostname && allowedHosts?.has(requestHostname))) {
        return NextResponse.json({ 
          message: "Origin header required. This endpoint is browser-only. For API access, use programmatic endpoints or implement API key authentication." 
        }, { status: 400 });
      }
    } else {
      try {
        const originHostname = new URL(origin).hostname.toLowerCase();
        if (!allowedHosts?.has(originHostname)) {
          logger.warn("Origin validation failed", { origin: originHostname, path: fullPath });
          return NextResponse.json({ 
            message: "Origin not allowed. This endpoint only accepts requests from authorized domains." 
          }, { status: 403 });
        }
      } catch { return NextResponse.json({ message: "Invalid origin header format" }, { status: 400 }); }
    }
  }

  // 2. Authentication (Self-Healing Fallback)
  // Logic: Some paths (like login) are public for Auth but still protected by CSRF.
  const pathLower = fullPath.toLowerCase().replace(/\/$/, "");
  const isAuthPublic = isPublic || pathLower === "login" || pathLower === "auth/login";
  const token = isAuthPublic ? undefined : await getAuthTokenWithFallback();
  
  if (!isAuthPublic && !token) {
    return NextResponse.json({ message: "No authentication token – please log in again" }, { status: 401 });
  }

  // 3. Request Body Preparation
  let body: BodyInit | undefined;
  let resolvedContentType = "application/json";
  if (isWrite) {
    if (decryptedBody) {
      body = JSON.stringify(decryptedBody);
    } else {
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        body = await req.text();
      } else {
        body = Buffer.from(await req.arrayBuffer());
        resolvedContentType = contentType.split(";")[0].trim().toLowerCase() || "application/octet-stream";
      }
    }
  }

  const clientUserAgent = req.headers.get("user-agent");

  if (MISCONFIGURED_EGRESS_TARGET) {
    logger.error(`Egress target "${MISCONFIGURED_EGRESS_TARGET.name}" requires a secret but none is set`);
    return NextResponse.json({ message: "Proxy secret not configured" }, { status: 500 });
  }

  try {
    // 4. Batch Fetcher Shortcut (GETs or Empty POSTs)
    const isBatchablePost = method === "POST" && (!body || body === "{}");
    const isTest = !!process.env.VITEST;
    if ((method === "GET" || isBatchablePost) && !isPublic && token && !isTest) {
      try {
        const pathSuffix = `${fullPath}${req.nextUrl.search}`;
        const data = await fetchEzygoData(pathSuffix, token, method as "GET" | "POST", isBatchablePost ? {} : null, {
          ...(clientIp ? { "x-forwarded-for": clientIp, "x-real-ip": clientIp } : {}),
          ...(clientUserAgent ? { "user-agent": clientUserAgent } : {}),
        });
        return NextResponse.json(data, { status: 200, headers: { "x-egress-mode": "batched", "content-type": "application/json" } });
      } catch (err) { logger.warn(`[backend-proxy] Batch fetcher failed for ${fullPath}, falling back to direct:`, err); }
    }

    // 5. Egress Failover Chain Execution
    const result = await ezygoCircuitBreaker.execute(async () => {
      const pathSuffix = `${fullPath}${req.nextUrl.search}`;
      const baseHeaders: Record<string, string> = {
        ...(isAuthPublic ? {} : { "authorization": `Bearer ${token}` }),
        "content-type": resolvedContentType,
        "accept": "application/json, text/plain, */*",
        "referer": "https://edu.ezygo.app/",
        "origin": "https://edu.ezygo.app",
        ...(clientIp ? { "x-forwarded-for": clientIp, "x-real-ip": clientIp } : {}),
        ...(clientUserAgent ? { "user-agent": clientUserAgent } : {}),
        // Forward client-hints if present for better stealth
        ...(req.headers.get("sec-ch-ua") ? { "sec-ch-ua": req.headers.get("sec-ch-ua")! } : {}),
        ...(req.headers.get("sec-ch-ua-mobile") ? { "sec-ch-ua-mobile": req.headers.get("sec-ch-ua-mobile")! } : {}),
        ...(req.headers.get("sec-ch-ua-platform") ? { "sec-ch-ua-platform": req.headers.get("sec-ch-ua-platform")! } : {}),
      };

      let lastError: Error | null = null;
      for (let i = 0; i < EGRESS_TARGETS.length; i++) {
        const egress = EGRESS_TARGETS[i];
        lastAttemptedEgressName = egress.name;
        const isLastTier = i === EGRESS_TARGETS.length - 1;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), egress.timeoutMs);
        try {
          const res = await fetch(`${egress.baseUrl}/${pathSuffix}`, {
            method,
            headers: { ...baseHeaders, ...(egress.secret ? { "x-proxy-secret": egress.secret } : {}) },
            body: isWrite ? body : undefined,
            ...(isWrite ? { duplex: "half" as const } : {}),
            signal: controller.signal,
          });

          const text = await readWithLimit(res.body, MAX_RESPONSE_BYTES, controller.signal);
          if (RETRYABLE_UPSTREAM_STATUSES.has(res.status) && !isLastTier) {
            lastError = new UpstreamServerError(`Upstream error on ${egress.name}: ${res.status}`, res.status, res.statusText, text, res.headers);
            continue;
          }
          if (RETRYABLE_UPSTREAM_STATUSES.has(res.status)) {
            throw new UpstreamServerError(`Upstream server error: ${res.status}`, res.status, res.statusText, text, res.headers);
          }
          return { res, text, egressName: egress.name };
        } catch (err) {
          if (err instanceof UpstreamServerError) throw err;
          if (!isLastTier) { lastError = err as Error; continue; }
          throw err;
        } finally { clearTimeout(timeout); }
      }
      throw lastError ?? new Error("All egress targets failed");
    });

    // 6. Response Construction & Sanitization
    const { res, text, egressName } = result;
    const sanitizedHeaders = Object.fromEntries(
      Array.from(res.headers.entries())
        .filter(([k]) => k.toLowerCase() !== "content-encoding")
    );

    if (!res.ok) {
        const sanitizedBody = text.length > MAX_ERROR_BODY_LOG_LENGTH ? text.substring(0, MAX_ERROR_BODY_LOG_LENGTH) + '...' : text;
        const logMethod = res.status === 429 ? "warn" : "error";
        const logMsg = res.status === 429 ? "Proxy upstream rate limit (429)" : "Proxy upstream error";
        logger[logMethod](logMsg, { status: res.status, path: fullPath, bodyPreview: sanitizedBody });
        
        const errorMessage = resolveSafeUpstreamErrorMessage(text, res.status);
        const clientMessage = (IS_PRODUCTION && res.status >= 500) ? "EzyGo service is currently unreachable or experiencing an outage." : errorMessage;
        return NextResponse.json(
          { message: clientMessage, status: res.status }, 
          { status: res.status, headers: { ...sanitizedHeaders, "x-egress-target": egressName || "" } }
        );
    }

    return new NextResponse(text, { 
      status: res.status, 
      headers: { ...sanitizedHeaders, "x-egress-target": egressName || "" } 
    });

  } catch (err) {
    const error = (err || new Error("Unknown error")) as Error;
    const egressHeader = { "x-egress-target": lastAttemptedEgressName };
    
    if (error.name === "CircuitBreakerOpenError") {
      return NextResponse.json({ message: "Exception: EzyGo servers are having technical issues." }, { status: 503, headers: egressHeader });
    }
    if (error.name === "UpstreamServerError") {
      const upstreamError = error as any;
      const headers = upstreamError.headers instanceof Headers ? upstreamError.headers : new Headers(upstreamError.headers as any);
      const sanitizedErrorHeaders = Object.fromEntries(
        (Array.from(headers.entries()) as [string, string][]).filter(([k]) => k.toLowerCase() !== "content-encoding")
      );
      
      const logMethod = upstreamError.status === 429 ? "warn" : "error";
      const logMsg = upstreamError.status === 429 ? "Proxy upstream rate limit (429)" : "Proxy upstream error";
      logger[logMethod](logMsg, { status: upstreamError.status, path: fullPath, bodyPreview: upstreamError.body?.substring(0, MAX_ERROR_BODY_LOG_LENGTH) });
 
      const clientMessage = (IS_PRODUCTION && upstreamError.status >= 500) ? "An error occurred while processing your request" : resolveSafeUpstreamErrorMessage(upstreamError.body, upstreamError.status);
      return NextResponse.json(
        { message: clientMessage, status: upstreamError.status }, 
        { status: upstreamError.status, headers: { ...sanitizedErrorHeaders, ...egressHeader } }
      );
    }
    if (error.name === "UpstreamResponseTooLargeError") return NextResponse.json({ message: "Upstream response too large" }, { status: 502, headers: egressHeader });
    if (error.name === "AbortError") return NextResponse.json({ message: "Upstream timed out" }, { status: 502, headers: egressHeader });
    
    logger.error("Proxy fetch failed", { path: fullPath, error: error?.message });
    return NextResponse.json(
      { message: "Exception: EzyGo servers are having technical issues. Please try again later, contact us if still not resolved." }, 
      { status: 502, headers: egressHeader }
    );
  }
}

export const GET = withSecurity(async (req, { params, authType }) => {
  const { path } = params as { path: string[] };
  return forward(req as NextRequest, "GET", path, undefined, authType);
});

export const POST = withSecurity(async (req, { params, decryptedBody, authType }) => {
  const { path } = params as { path: string[] };
  const res = await forward(req as NextRequest, "POST", path, decryptedBody, authType);
  const pathStr = path.join("/");
  if (res.ok && (pathStr.includes("user/setting/default_semester") || pathStr.includes("user/setting/default_academic_year"))) {
    const token = await getAuthTokenWithFallback();
    if (token) invalidateEzygoCacheForUser(token);
  }
  return res;
});

export const PUT = withSecurity(async (req, { params, decryptedBody, authType }) => {
  const { path } = params as { path: string[] };
  return forward(req as NextRequest, "PUT", path, decryptedBody, authType);
});

export const PATCH = withSecurity(async (req, { params, decryptedBody, authType }) => {
  const { path } = params as { path: string[] };
  return forward(req as NextRequest, "PATCH", path, decryptedBody, authType);
});

export const DELETE = withSecurity(async (req, { params, authType }) => {
  const { path } = params as { path: string[] };
  return forward(req as NextRequest, "DELETE", path, undefined, authType);
});

export const HEAD = withSecurity(async (req, { params, authType }) => {
  const { path } = params as { path: string[] };
  return forward(req as NextRequest, "HEAD", path, undefined, authType);
});
