import { NextRequest, NextResponse } from "next/server";
import { Buffer } from "node:buffer";
import { getAuthTokenWithFallback } from "@/lib/security/auth-cookie";
import { withSecurity } from "@/lib/security/app-check";
import {
  getAllowedHosts,
  resolveRequestHostname,
} from "@/lib/security/origin-validation";
import { logger } from "@/lib/logger";
import {
  ezygoCircuitBreaker,
  UpstreamServerError,
} from "@/lib/circuit-breaker";
import { getClientIp } from "@/lib/utils.server";
import {
  fetchEzygoData,
  invalidateEzygoCacheForUser,
} from "@/lib/ezygo-batch-fetcher";

import {
  MAX_RESPONSE_BYTES,
  PUBLIC_PATHS,
  RETRYABLE_UPSTREAM_STATUSES,
} from "@/lib/proxy/constants";
import {
  buildEgressTargets,
  readWithLimit,
  resolveSafeUpstreamErrorMessage,
} from "@/lib/proxy/proxy-utils";

const _rawBaseApiUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
let BASE_API_URL: string | undefined = undefined;
if (_rawBaseApiUrl) {
  let tmp = _rawBaseApiUrl;
  while (tmp.endsWith("/")) tmp = tmp.slice(0, -1);
  BASE_API_URL = tmp;
}
const EGRESS_TARGETS = buildEgressTargets();
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const SHOULD_EXPOSE_EGRESS_HEADERS = !IS_PRODUCTION ||
  process.env.DEBUG_EGRESS === "true";

function getEgressHeaders(
  headersObj: Record<string, string>,
  targetName?: string,
  modeName?: string,
): Record<string, string> {
  if (!SHOULD_EXPOSE_EGRESS_HEADERS) return headersObj;
  return {
    ...headersObj,
    ...(targetName ? { "x-egress-target": targetName } : {}),
    ...(modeName ? { "x-egress-mode": modeName } : {}),
  };
}

const MISCONFIGURED_EGRESS_TARGET = EGRESS_TARGETS.find(
  (target) => target.name !== "direct" && !target.secret,
);

function sanitizeHeaderKey(k: string) {
  return k.toLowerCase().replace(/[^a-z0-9-_]/g, "");
}

function getSanitizedHeaders(headers: Headers) {
  const map: Record<string, string> = {};
  headers.forEach((v, k) => {
    const lowerK = k.toLowerCase();
    if (lowerK !== "content-encoding") {
      map[sanitizeHeaderKey(k)] = v;
    }
  });
  return map;
}

function validateOrigin(
  req: NextRequest,
  fullPath: string,
  isPublic: boolean,
  isMobileApp: boolean,
) {
  if (isPublic || isMobileApp || !IS_PRODUCTION) return null;

  const allowedHosts = getAllowedHosts();
  const origin = req.headers.get("origin");

  if (!origin) {
    const isRead = req.method === "GET" || req.method === "HEAD";
    const secFetchSite = req.headers.get("sec-fetch-site")?.toLowerCase();
    const requestHostname = resolveRequestHostname(req);
    if (
      isRead && secFetchSite === "same-origin" && !!requestHostname &&
      allowedHosts?.has(requestHostname)
    ) {
      return null;
    }
    return {
      message:
        "Origin header required. This endpoint is browser-only. For API access, use programmatic endpoints or implement API key authentication.",
      status: 400,
    };
  }

  try {
    const originHostname = new URL(origin).hostname.toLowerCase();
    if (!allowedHosts?.has(originHostname)) {
      logger.warn("Origin validation failed", {
        origin: originHostname,
        path: fullPath,
      });
      return {
        message:
          "Origin not allowed. This endpoint only accepts requests from authorized domains.",
        status: 403,
      };
    }
  } catch {
    return { message: "Invalid origin header format", status: 400 };
  }
  return null;
}

async function prepareRequestBody(
  req: NextRequest,
  method: string,
  decryptedBody?: unknown,
) {
  if (method === "GET" || method === "HEAD") {
    return { body: undefined, contentType: "application/json" };
  }

  if (decryptedBody) {
    return {
      body: JSON.stringify(decryptedBody),
      contentType: "application/json",
    };
  }

  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return { body: await req.text(), contentType: "application/json" };
  }

  const buf = Buffer.from(await req.arrayBuffer());
  const resolvedType = contentType.split(";")[0].trim().toLowerCase() ||
    "application/octet-stream";
  return { body: buf, contentType: resolvedType };
}

interface EgressResult {
  res: Response;
  text: string;
  egressName: string;
}

function validateProxyRequestPath(
  path?: string[],
): { fullPath: string; errorResponse: NextResponse | null } {
  if (!BASE_API_URL) {
    return {
      fullPath: "",
      errorResponse: NextResponse.json({
        message: "Backend URL not configured",
      }, { status: 500 }),
    };
  }
  if (!path || path.length === 0) {
    return {
      fullPath: "",
      errorResponse: NextResponse.json({ message: "Missing path" }, {
        status: 400,
      }),
    };
  }
  const fullPath = path.join("/");
  if (fullPath.includes("#") || fullPath.includes("?")) {
    return {
      fullPath,
      errorResponse: NextResponse.json({ message: "Invalid path format" }, {
        status: 400,
      }),
    };
  }
  if (MISCONFIGURED_EGRESS_TARGET) {
    return {
      fullPath,
      errorResponse: NextResponse.json({ message: "Proxy config error" }, {
        status: 500,
      }),
    };
  }
  return { fullPath, errorResponse: null };
}

async function validateProxyAuthAndOrigin(
  req: NextRequest,
  fullPath: string,
  authType?: "app-check" | "csrf" | "none",
): Promise<{ token?: string; errorResponse?: NextResponse }> {
  const isPublic = PUBLIC_PATHS.has(fullPath);
  const isMobileApp = authType === "app-check";

  const originError = await validateOrigin(
    req,
    fullPath,
    isPublic,
    isMobileApp,
  );
  if (originError) {
    return {
      errorResponse: NextResponse.json({ message: originError.message }, {
        status: originError.status,
      }),
    };
  }

  const pathLower = fullPath.toLowerCase().replace(/\/$/, "");
  const isAuthPublic = isPublic || pathLower === "login" ||
    pathLower === "auth/login";
  const token = isAuthPublic ? undefined : await getAuthTokenWithFallback();

  if (!isAuthPublic && !token) {
    return {
      errorResponse: NextResponse.json({ message: "Unauthorized" }, {
        status: 401,
      }),
    };
  }

  return { token };
}

function handleProxyUpstreamError(
  err: unknown,
  lastAttemptedEgressName: string,
): NextResponse {
  const egressHeader = getEgressHeaders({}, lastAttemptedEgressName);
  const errObj = err as {
    name?: string;
    status?: number;
    body?: string;
    headers?: unknown;
  };

  if (errObj?.name === "CircuitBreakerOpenError") {
    return NextResponse.json({ message: "EzyGo issues." }, {
      status: 503,
      headers: egressHeader,
    });
  }

  const isUpstreamErr = err instanceof UpstreamServerError ||
    errObj?.name === "UpstreamServerError";
  if (isUpstreamErr) {
    const uStatus = errObj?.status ?? 502;
    if (uStatus === 429) {
      logger.warn("Proxy upstream rate limit (429)", { status: 429 });
    }
    const rawHeaders = errObj?.headers;
    const headers = getSanitizedHeaders(
      rawHeaders instanceof Headers
        ? rawHeaders
        : new Headers((rawHeaders as Record<string, string>) || {}),
    );
    const msg = (IS_PRODUCTION && uStatus >= 500)
      ? "Error processing request"
      : resolveSafeUpstreamErrorMessage(errObj?.body ?? "", uStatus);
    return NextResponse.json({ message: msg, status: uStatus }, {
      status: uStatus,
      headers: { ...headers, ...egressHeader },
    });
  }

  if (errObj?.name === "AbortError") {
    return NextResponse.json({ message: "Upstream timed out" }, {
      status: 502,
      headers: egressHeader,
    });
  }

  return NextResponse.json({
    message:
      "EzyGo servers are having technical issues. Exception: EzyGo servers",
  }, { status: 502, headers: egressHeader });
}

async function handleBatchedEgress(
  req: NextRequest,
  method: string,
  fullPath: string,
  token: string,
  isBatchablePost: boolean,
  clientIp?: string | null,
  clientUserAgent?: string | null,
): Promise<NextResponse | null> {
  try {
    const fetchMethod = method as "GET" | "POST";
    const data = await fetchEzygoData(
      `${fullPath}${req.nextUrl.search}`,
      token,
      fetchMethod,
      isBatchablePost ? {} : null,
      {
        ...(clientIp
          ? { "x-forwarded-for": clientIp, "x-real-ip": clientIp }
          : {}),
        ...(clientUserAgent ? { "user-agent": clientUserAgent } : {}),
      },
    );
    return NextResponse.json(data, {
      status: 200,
      headers: getEgressHeaders({}, undefined, "batched"),
    });
  } catch (err) {
    logger.warn(`Batch failed for ${fullPath}`, err);
    return null;
  }
}

function buildEgressRequestInit(
  method: string,
  baseHeaders: Record<string, string>,
  body: BodyInit | null | undefined,
  secret?: string,
  signal?: AbortSignal,
): RequestInit {
  const headers: Record<string, string> = { ...baseHeaders };
  if (secret) {
    headers["x-proxy-secret"] = secret;
  }
  const isBodyless = method === "GET" || method === "HEAD";
  return {
    method,
    headers,
    body,
    ...(!isBodyless ? { duplex: "half" } : {}),
    signal,
  } as RequestInit;
}

async function attemptSingleTarget(
  egress: { name: string; baseUrl: string; timeoutMs: number; secret?: string },
  req: NextRequest,
  method: string,
  fullPath: string,
  baseHeaders: Record<string, string>,
  body: BodyInit | null | undefined,
): Promise<EgressResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), egress.timeoutMs);
  try {
    const init = buildEgressRequestInit(
      method,
      baseHeaders,
      body,
      egress.secret,
      controller.signal,
    );
    const res = await fetch(
      `${egress.baseUrl}/${fullPath}${req.nextUrl.search}`,
      init,
    );
    const text = await readWithLimit(
      res.body,
      MAX_RESPONSE_BYTES,
      controller.signal,
    );

    if (RETRYABLE_UPSTREAM_STATUSES.has(res.status)) {
      throw new UpstreamServerError(
        `Err: ${res.status}`,
        res.status,
        res.statusText,
        text,
        res.headers,
      );
    }
    return { res, text, egressName: egress.name };
  } finally {
    clearTimeout(timeout);
  }
}

async function executeCircuitBreakerLoop(
  req: NextRequest,
  method: string,
  fullPath: string,
  baseHeaders: Record<string, string>,
  body: BodyInit | null | undefined,
  onTargetAttempt: (name: string) => void,
): Promise<EgressResult> {
  let lastError: unknown = null;
  const lastIdx = EGRESS_TARGETS.length - 1;

  for (let i = 0; i < EGRESS_TARGETS.length; i++) {
    const egress = EGRESS_TARGETS.at(i)!;
    onTargetAttempt(egress.name);
    try {
      return await attemptSingleTarget(
        egress,
        req,
        method,
        fullPath,
        baseHeaders,
        body,
      );
    } catch (err) {
      const isUpstreamErr = err instanceof UpstreamServerError;
      if (isUpstreamErr && i === lastIdx) throw err;
      if (isUpstreamErr) {
        lastError = err;
        continue;
      }
      if (i < lastIdx) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError || new Error("Egress failure");
}

async function forward(
  req: NextRequest,
  method: string,
  path: string[],
  decryptedBody?: unknown,
  authType?: "app-check" | "csrf" | "none",
) {
  let lastAttemptedEgressName = "direct";
  const pathValidation = validateProxyRequestPath(path);
  if (pathValidation.errorResponse) return pathValidation.errorResponse;

  const fullPath = pathValidation.fullPath;
  const authRes = await validateProxyAuthAndOrigin(req, fullPath, authType);
  if (authRes.errorResponse) return authRes.errorResponse;

  const token = authRes.token;
  const isPublic = PUBLIC_PATHS.has(fullPath);
  const clientIp = getClientIp(req.headers);
  const clientUserAgent = req.headers.get("user-agent");
  const { body, contentType: resolvedContentType } = await prepareRequestBody(
    req,
    method,
    decryptedBody,
  );

  try {
    const isBatchablePost = method === "POST" && (!body || body === "{}");
    const canBatch = (method === "GET" || isBatchablePost) && !isPublic &&
      token && process.env.VITEST !== "true";

    if (canBatch) {
      const batchedRes = await handleBatchedEgress(
        req,
        method,
        fullPath,
        token,
        isBatchablePost,
        clientIp,
        clientUserAgent,
      );
      if (batchedRes) return batchedRes;
    }

    const result = await ezygoCircuitBreaker.execute(async () => {
      const baseHeaders: Record<string, string> = {
        ...(token ? { "authorization": `Bearer ${token}` } : {}),
        "content-type": resolvedContentType,
        "accept": "application/json, text/plain, */*",
        "referer": "https://edu.ezygo.app/",
        "origin": "https://edu.ezygo.app",
        ...(clientIp
          ? { "x-forwarded-for": clientIp, "x-real-ip": clientIp }
          : {}),
        ...(clientUserAgent ? { "user-agent": clientUserAgent } : {}),
      };

      return await executeCircuitBreakerLoop(
        req,
        method,
        fullPath,
        baseHeaders,
        body as BodyInit | undefined,
        (name) => {
          lastAttemptedEgressName = name;
        },
      );
    });

    const sanitizedHeaders = getSanitizedHeaders(result.res.headers);
    if (!result.res.ok) {
      const isRateLimit = result.res.status === 429;
      if (isRateLimit) {
        logger.warn("Proxy upstream rate limit (429)", {
          path: fullPath,
          status: 429,
        });
      } else {
        logger.error(`Proxy error ${result.res.status}`, { path: fullPath });
      }
      const msg = (IS_PRODUCTION && result.res.status >= 500)
        ? "Service experiencing issues."
        : resolveSafeUpstreamErrorMessage(result.text, result.res.status);
      return NextResponse.json({ message: msg, status: result.res.status }, {
        status: result.res.status,
        headers: getEgressHeaders(sanitizedHeaders, result.egressName),
      });
    }

    return new NextResponse(result.text, {
      status: result.res.status,
      headers: getEgressHeaders(sanitizedHeaders, result.egressName),
    });
  } catch (err: unknown) {
    return handleProxyUpstreamError(err, lastAttemptedEgressName);
  }
}

export const GET = withSecurity((req, { params, authType }) => {
  const { path } = params as { path: string[] };
  return forward(req as NextRequest, "GET", path, undefined, authType);
});

export const POST = withSecurity(
  async (req, { params, decryptedBody, authType }) => {
    const { path } = params as { path: string[] };
    const res = await forward(
      req as NextRequest,
      "POST",
      path,
      decryptedBody,
      authType,
    );
    if (
      res.ok &&
      (path.join("/").includes("default_semester") ||
        path.join("/").includes("default_academic_year"))
    ) {
      const token = await getAuthTokenWithFallback();
      if (token) invalidateEzygoCacheForUser(token);
    }
    return res;
  },
  { consume: true },
);

export const PUT = withSecurity((req, { params, decryptedBody, authType }) => {
  const { path } = params as { path: string[] };
  return forward(req as NextRequest, "PUT", path, decryptedBody, authType);
}, { consume: true });

export const PATCH = withSecurity(
  (req, { params, decryptedBody, authType }) => {
    const { path } = params as { path: string[] };
    return forward(req as NextRequest, "PATCH", path, decryptedBody, authType);
  },
  { consume: true },
);

export const DELETE = withSecurity((req, { params, authType }) => {
  const { path } = params as { path: string[] };
  return forward(req as NextRequest, "DELETE", path, undefined, authType);
}, { consume: true });

export const HEAD = withSecurity((req, { params, authType }) => {
  const { path } = params as { path: string[] };
  return forward(req as NextRequest, "HEAD", path, undefined, authType);
});
