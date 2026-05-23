// Axios instance with base URL and auth token
// src/lib/axios.ts

import axios, { InternalAxiosRequestConfig, AxiosResponse } from "axios";
import { CSRF_HEADER } from "@/lib/security/csrf-constants";
import { logger } from "@/lib/logger";
import { encryptRequest, encryptHeader, decryptResponse } from "@/lib/security/jwe-client";

interface JweAxiosConfig extends InternalAxiosRequestConfig {
  _jweCek?: Uint8Array;
}

const axiosInstance = axios.create({
  baseURL: "/api/backend/",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  timeout: 30000,
});

export function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(
    /* eslint-disable-next-line security/detect-non-literal-regexp */
    new RegExp(`(?:^|;\\s*)${escapedName}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
}

const CSRF_STORAGE_KEY = "csrf_token_memory";
const CSRF_TOKEN_MIN_LENGTH = 64;
const CSRF_TOKEN_HEX_PATTERN = /^[0-9a-f]+$/;

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _csrfRetried?: boolean;
  _authRetried?: boolean;
}

let csrfRefreshPromise: Promise<string | null> | null = null;

async function refreshCsrfToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (csrfRefreshPromise) return csrfRefreshPromise;

  csrfRefreshPromise = (async () => {
    try {
      const response = await fetch("/api/csrf", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        logger.warn("[axios] Failed to refresh CSRF token", { status: response.status });
        return null;
      }

      const data = await response.json().catch(() => null);
      const token = (data && Object.prototype.hasOwnProperty.call(data, "token")) ? String(data.token) : null;

      if (!token) return null;
      setCsrfToken(token);
      return token;
    } catch (error) {
      logger.warn("[axios] Error refreshing CSRF token", error);
      return null;
    } finally {
      csrfRefreshPromise = null;
    }
  })();

  return csrfRefreshPromise;
}

let syncPromise: Promise<boolean> | null = null;

async function syncSession(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    try {
      const csrfToken = getCsrfToken() ?? (await refreshCsrfToken());
      if (!csrfToken) return false;
      const response = await fetch("/api/auth/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER]: csrfToken,
        },
        credentials: "include",
      });

      if (!response.ok) return false;
      const data = await response.json().catch(() => null);
      return !!(data && Object.prototype.hasOwnProperty.call(data, "success") && data.success);
    } catch (error) {
      logger.warn("[axios] Error during session sync", error);
      return false;
    } finally {
      syncPromise = null;
    }
  })();

  return syncPromise;
}

function checkForCspMetaTag(): boolean {
  if (process.env.NODE_ENV !== "production" || typeof document === "undefined") return true;
  return !!document.querySelector('meta[http-equiv="Content-Security-Policy"]');
}

let cspWarningLogged = false;

export function getCsrfToken(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  if (process.env.NODE_ENV === "production" && !checkForCspMetaTag() && !cspWarningLogged) {
    cspWarningLogged = true;
    logger.info("[CSRF Informational] No CSP meta tag detected.");
  }
  return sessionStorage.getItem(CSRF_STORAGE_KEY);
}

export function setCsrfToken(token: string | null): void {
  if (typeof sessionStorage === "undefined") return;
  if (!token) {
    sessionStorage.removeItem(CSRF_STORAGE_KEY);
    return;
  }
  if (typeof token !== "string" || token.length !== CSRF_TOKEN_MIN_LENGTH || !CSRF_TOKEN_HEX_PATTERN.test(token)) {
    logger.error("[CSRF] Invalid token format");
    return;
  }
  sessionStorage.setItem(CSRF_STORAGE_KEY, token);
}

let isLoggingOut401 = false;
let isOutageDetected = false;

export const isGlobalOutageDetected = () => isOutageDetected;
export const resetOutageDetection = () => { isOutageDetected = false; };

async function handleJweDecryption(response: AxiosResponse) {
  const contentType = String(response.headers["content-type"] || "");
  const config = response.config as JweAxiosConfig;
  if (contentType.includes("application/jose") && config._jweCek) {
    response.data = await decryptResponse(response.data, config._jweCek);
  }
  return response;
}

async function handleCsrfRetry(error: unknown) {
  const errObj = error as { config?: RetryableRequestConfig; response?: { status?: number; data?: Record<string, unknown> } } | undefined;
  if (!errObj || !errObj.config) return null;
  const config = errObj.config;
  const data = errObj.response?.data;
  const msg = (data && typeof data === "object") ? (data.message || data.error) : "";

  if (errObj.response?.status === 403 && String(msg).toLowerCase().includes("invalid csrf token") && !config._csrfRetried) {
    config._csrfRetried = true;
    const freshToken = await refreshCsrfToken();
    if (freshToken) {
      config.headers.set(CSRF_HEADER, freshToken);
      return axiosInstance.request(config);
    }
  }
  return null;
}

async function handleAuthRetry(error: unknown) {
  const errObj = error as { config?: RetryableRequestConfig; response?: { status?: number } } | undefined;
  if (!errObj || !errObj.config) return null;
  const config = errObj.config;
  if (errObj.response?.status === 401 && !config._authRetried) {
    config._authRetried = true;
    if (await syncSession()) return axiosInstance.request(config);

    if (!isLoggingOut401) {
      isLoggingOut401 = true;
      const { handleLogout } = await import("@/lib/security/auth");
      await handleLogout();
    }
  }
  return null;
}

axiosInstance.interceptors.response.use(
  (res) => handleJweDecryption(res),
  async (err: unknown) => {
    if (typeof window === "undefined") return Promise.reject(err);
    
    const retryCsrf = await handleCsrfRetry(err);
    if (retryCsrf) return retryCsrf;

    const retryAuth = await handleAuthRetry(err);
    if (retryAuth) return retryAuth;

    const errObj = err as { response?: { status?: number; statusText?: string } } | undefined;
    const status = errObj?.response?.status;
    if ((status === 500 || status === 503) && !isOutageDetected) {
      isOutageDetected = true;
      window.dispatchEvent(new CustomEvent("gc:outage", {
        detail: {
          messages: ["EzyGo servers are down."],
          details: `Error ${status}: ${errObj?.response?.statusText || ""}`,
        },
      }));
    }
    return Promise.reject(err);
  }
);

// L-4: Auto-recovery — reset the outage flag when the user returns to the tab
// so the app doesn't stay blocked after EzyGo recovers while the tab was open.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && isOutageDetected) {
      resetOutageDetection();
    }
  });
}

async function encryptRequestPayload(config: JweAxiosConfig, method: string) {
  if (["post", "put", "patch"].includes(method) && config.data) {
    if (!(typeof config.data === "string" && config.data.split(".").length === 5)) {
      try {
        const { jwe, cek } = await encryptRequest(config.data);
        config.data = jwe;
        config._jweCek = cek;
        config.headers.set("Content-Type", "application/jose");
      } catch (error) {
        logger.error("[axios] JWE request encryption failed", error);
        throw error;
      }
    }
  } else if (method === "get") {
    const { jwe, cek } = await encryptHeader();
    config.headers.set("X-JWE-Key", jwe);
    config._jweCek = cek;
  }
}

function isInternalRequest(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin;
  } catch {
    // Non-parseable values (e.g. bare relative paths like "/api/...") are internal.
    return !url.startsWith("http");
  }
}

function isPublicRequest(url: string): boolean {
  return url.includes("/api/csrf") || url.includes("/api/.well-known/jwks.json");
}

async function applyInternalRequestSecurity(config: JweAxiosConfig) {
  let token = getCsrfToken();
  if (!token) {
    token = await refreshCsrfToken();
  }

  if (token) config.headers.set(CSRF_HEADER, token);

  await encryptRequestPayload(config, config.method?.toLowerCase() || "");
  config.headers.set("Accept", "application/jose, application/json");
}

axiosInstance.interceptors.request.use(async (config: JweAxiosConfig) => {
  if (isOutageDetected) return Promise.reject(new Error("Active service outage"));
  if (typeof window === "undefined") return config;

  const url = config.url || "";
  // H-5: Use URL parsing for internal detection instead of string heuristics.
  // The previous check misclassified proxy paths containing "ezygo.app" as
  // external, causing them to skip CSRF/JWE headers.
  const isInternal = isInternalRequest(url);
  if (isInternal && !isPublicRequest(url)) {
    await applyInternalRequestSecurity(config);
  }

  // Deduplicate slashes in the final URL (path parts)
  if (config.url) {
    // If it's a full URL, we only deduplicate path slashes, not protocol slashes
    if (config.url.startsWith("http")) {
      const parts = config.url.split("://");
      if (parts.length === 2) {
        config.url = `${parts[0]}://${parts[1].replace(/\/+/g, "/")}`;
      }
    } else {
      config.url = config.url.replace(/\/+/g, "/");
    }
  }

  return config;
});

export default axiosInstance;
