// Axios instance with base URL and auth token
// src/lib/axios.ts

import axios, { InternalAxiosRequestConfig } from "axios";
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

/**
 * Retrieves a cookie value by name from document.cookie.
 * Client-side only - returns null on server.
 * 
 * @param name - Cookie name to retrieve
 * @returns Cookie value or null if not found
 */
export function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${escapedName}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Storage for CSRF token using sessionStorage (Synchronizer Token Pattern).
 * 
 * SECURITY ARCHITECTURE:
 * - Server stores token in httpOnly cookie (inaccessible to JavaScript)
 * - Server returns token in API response for client-side storage
 * - Client stores token in sessionStorage for use in request headers
 * - Server validates request header token against httpOnly cookie
 * 
 * ⚠️ XSS VULNERABILITY CONSIDERATION:
 * sessionStorage is accessible to JavaScript, which means if an XSS vulnerability
 * exists in the application, an attacker can read this token. This implementation
 * is ONLY secure when combined with strict XSS prevention measures:
 * 
 * PRIMARY DEFENSE LAYERS:
 * 1. Content Security Policy (CSP) with nonce-based script execution (see src/lib/csp.ts)
 *    - Prevents unauthorized inline scripts from executing
 *    - Blocks scripts from untrusted sources
 *    - Verified at runtime in production (see verifyCspEnabled below)
 * 2. Input sanitization and output encoding across all user inputs
 * 3. Regular security audits and vulnerability scanning
 * 
 * ARCHITECTURAL TRADE-OFFS:
 * This sessionStorage approach was chosen over the previous double-submit cookie pattern:
 * 
 * Advantages:
 * - Token persists across page navigations (better UX than in-memory storage)
 * - Simpler client-side implementation (no cookie parsing/setting logic)
 * - Tab-scoped storage (sessionStorage is isolated per tab, cleared on tab close)
 * - Works with same-site cookies for additional protection
 * 
 * Disadvantages:
 * - Accessible to JavaScript (creates XSS vulnerability surface)
 * - Requires strict XSS prevention (CSP, sanitization) as primary defense
 * - Single point of failure if CSP is misconfigured or disabled
 * 
 * ALTERNATIVE CONSIDERED:
 * The double-submit cookie pattern (both tokens in httpOnly cookies) is more secure
 * against XSS attacks but was changed due to technical constraints with cookie handling
 * in the Next.js middleware and API routes. If cookie handling can be improved in the
 * future, consider reverting to double-submit pattern for defense-in-depth.
 * 
 * ⚠️ CRITICAL: XSS prevention is the primary defense. CSRF protection is a
 * secondary layer. If XSS vulnerabilities exist, both defenses can be bypassed.
 * 
 * INITIALIZATION: Token must be initialized by calling /api/csrf/init endpoint
 * and storing the returned token using setCsrfToken().
 */
const CSRF_STORAGE_KEY = "csrf_token_memory";

// CSRF token validation constants
// Tokens are 32-byte (256-bit) hex strings, resulting in 64 characters
// Separate validation steps (length and pattern) are used intentionally:
// - Provides clearer code structure and easier maintenance
// - Prevents regex complexity (single regex would be /^[0-9a-f]{64,}$/)
// - Both validations use the same generic error message to avoid exposing details
// Note: crypto.randomBytes().toString("hex") always produces lowercase hex in Node.js
const CSRF_TOKEN_MIN_LENGTH = 64;
const CSRF_TOKEN_HEX_PATTERN = /^[0-9a-f]+$/;

type RetryableRequestConfig = {
  _csrfRetried?: boolean;
  _authRetried?: boolean;
};

let csrfRefreshPromise: Promise<string | null> | null = null;

async function refreshCsrfToken(): Promise<string | null> {
  if (typeof window === "undefined") {
    return null;
  }

  if (csrfRefreshPromise) {
    return csrfRefreshPromise;
  }

  csrfRefreshPromise = (async () => {
    try {
      const response = await fetch("/api/csrf", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        logger.warn("[axios] Failed to refresh CSRF token", {
          status: response.status,
          statusText: response.statusText,
        });
        return null;
      }

      const data = await response.json().catch(() => null);
      const token = typeof data?.token === "string" ? data.token : null;

      if (!token) {
        logger.warn("[axios] CSRF refresh response missing token");
        return null;
      }

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

/**
 * Attempts to heal the EzyGo session by calling the sync endpoint.
 * This restores the ezygo_access_token cookie if a valid Supabase session exists.
 */
async function syncSession(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    try {
      const csrfToken = getCsrfToken();
      const response = await fetch("/api/auth/sync", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(csrfToken ? { [CSRF_HEADER]: csrfToken } : {}),
        },
        // Ensure credentials are included to pass the Supabase session cookies
        credentials: "include", 
      });

      if (!response.ok) {
        logger.warn("[axios] Session sync failed", { status: response.status });
        return false;
      }

      const data = await response.json().catch(() => null);
      return !!data?.success;
    } catch (error) {
      logger.warn("[axios] Error during session sync", error);
      return false;
    } finally {
      syncPromise = null;
    }
  })();

  return syncPromise;
}

/**
 * Check for CSP meta tag in the document.
 * 
 * NOTE: This function has limited scope - it only checks for CSP meta tags,
 * NOT HTTP headers (which cannot be read from JavaScript). In most production
 * configurations, CSP is enforced via HTTP headers, so this function will
 * return false even when CSP is correctly configured.
 * 
 * Returns true if any of:
 * 1. Running in development mode (CSP not required)
 * 2. A CSP meta tag is found (alternative CSP delivery method)
 * 3. On server-side (CSP will be applied by middleware)
 * 
 * If no meta tag is found in production (normal for HTTP header-based CSP),
 * this indicates the common case, NOT a security issue. Callers should log
 * informational warnings, not errors.
 * 
 * @returns true if in dev mode, CSP meta tag found, or on server-side
 */
function checkForCspMetaTag(): boolean {
  // Skip check in development mode
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  // Check if CSP meta tag is present
  if (typeof document !== "undefined") {
    // Check for CSP meta tag
    const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    if (cspMeta) {
      return true;
    }

    // No meta tag found - this is expected when CSP is enforced via HTTP headers
    // Return false so caller can log a one-time informational warning if needed
    // To verify CSP is active: check Network tab in DevTools for Content-Security-Policy header
    return false;
  }

  // Document is undefined (server-side) - assume CSP will be applied by middleware
  return true;
}

// Track if we've already logged the CSP warning to avoid spam
// This flag is shared between getCsrfToken() and setCsrfToken() to avoid duplicate warnings
// from either function, as they're typically called together during CSRF token operations
let cspWarningLogged = false;

/**
 * Get the current CSRF token from sessionStorage.
 * Used for Synchronizer Token Pattern in client-side requests.
 * 
 * Performs runtime CSP check in production to raise awareness about security posture.
 * Note: CSP check only detects meta tags, not HTTP headers. See checkForCspMetaTag() docs.
 * 
 * @returns CSRF token from sessionStorage or null if not initialized
 */
export function getCsrfToken(): string | null {
  if (typeof sessionStorage === "undefined") return null;

  // Check for CSP meta tag in production (for informational awareness only)
  // Only log warning once to avoid console spam
  // Note: This check cannot detect HTTP header-based CSP (the recommended and more secure approach)
  // which is invisible to JavaScript. The absence of a meta tag does NOT indicate a security issue.
  if (process.env.NODE_ENV === "production" && !checkForCspMetaTag() && !cspWarningLogged) {
    cspWarningLogged = true;
    logger.info(
      "[CSRF Security - Informational] No CSP meta tag detected. " +
      "This is NORMAL and EXPECTED if CSP is enforced via HTTP headers (the recommended approach). " +
      "HTTP header-based CSP cannot be detected by JavaScript but provides stronger security. " +
      "To verify CSP is active: Open DevTools → Network tab → Click any request → Check Response Headers for 'Content-Security-Policy'. " +
      "If the header is missing in production, please contact your security team."
    );
  }

  return sessionStorage.getItem(CSRF_STORAGE_KEY);
}

/**
 * Set the CSRF token in sessionStorage after receiving it from server.
 * Should be called after fetching token from /api/csrf/init endpoint.
 * 
 * Performs runtime CSP check in production to raise awareness about security posture.
 * Note: CSP check only detects meta tags, not HTTP headers. See checkForCspMetaTag() docs.
 * 
 * @param token - The CSRF token received from server
 */
export function setCsrfToken(token: string | null): void {
  if (typeof sessionStorage === "undefined") return;

  // Check for CSP meta tag in production (for informational awareness only)
  // Only log warning once to avoid console spam (reuses the same flag as getCsrfToken)
  // Note: This check cannot detect HTTP header-based CSP (the recommended and more secure approach)
  // which is invisible to JavaScript. The absence of a meta tag does NOT indicate a security issue.
  if (process.env.NODE_ENV === "production" && !checkForCspMetaTag() && !cspWarningLogged) {
    cspWarningLogged = true;
    logger.info(
      "[CSRF Security - Informational] No CSP meta tag detected. " +
      "This is NORMAL and EXPECTED if CSP is enforced via HTTP headers (the recommended approach). " +
      "HTTP header-based CSP cannot be detected by JavaScript but provides stronger security. " +
      "To verify CSP is active: Open DevTools → Network tab → Click any request → Check Response Headers for 'Content-Security-Policy'. " +
      "If the header is missing in production, please contact your security team."
    );
  }

  if (token) {
    // Validate token format before storing
    if (typeof token !== 'string' || token.trim().length === 0) {
      logger.error('[CSRF] Invalid token format');
      return;
    }
    // Additional validation: ensure exact length and valid hex format
    // CSRF tokens are generated as hex strings (see generateCsrfToken in csrf.ts)
    // Use generic error messages to avoid exposing implementation details to potential attackers
    if (token.length !== CSRF_TOKEN_MIN_LENGTH) {
      logger.error('[CSRF] Invalid token format');
      return;
    }
    // Ensure token contains only valid characters
    if (!CSRF_TOKEN_HEX_PATTERN.test(token)) {
      logger.error('[CSRF] Invalid token format');
      return;
    }
    sessionStorage.setItem(CSRF_STORAGE_KEY, token);
  } else {
    sessionStorage.removeItem(CSRF_STORAGE_KEY);
  }
}

// Global 401 response interceptor — handles two race conditions:
// 1. Supabase session is valid but the EzyGo httpOnly cookie has been cleared/expired
//    (the backend proxy returns 401 explicitly in that case — see /api/backend/[...path]/route.ts)
// 2. The EzyGo token stored in the DB has become invalid (EzyGo rejects it with 401)
// In either case the user's state is irrecoverably inconsistent and a clean logout is the
// correct recovery path. A singleton flag prevents concurrent logout calls when multiple
// in-flight requests all receive 401 simultaneously.
let isLoggingOut401 = false;
axiosInstance.interceptors.response.use(
  async (response) => {
    // Transparent JWE Decryption for GhostClass internal APIs
    const contentType = String(response.headers["content-type"] || "");
    const config = response.config as JweAxiosConfig;

    if (contentType.includes("application/jose") && config._jweCek) {
      try {
        const decryptedData = await decryptResponse(response.data, config._jweCek);
        response.data = decryptedData;
      } catch (err) {
        logger.error("[axios] Failed to decrypt JWE response", err);
        return Promise.reject(new Error("Failed to decrypt secure response"));
      }
    }
    return response;
  },
  async (error) => {
    const originalConfig = (error?.config ?? {}) as RetryableRequestConfig & {
      headers?: {
        set?: (name: string, value: string) => void;
      };
    };
    const responseData = error?.response?.data as { message?: string; error?: string } | undefined;
    const csrfMessage = responseData?.message || responseData?.error || "";

    if (
      !originalConfig._csrfRetried &&
      error?.response?.status === 403 &&
      typeof csrfMessage === "string" &&
      csrfMessage.toLowerCase().includes("invalid csrf token") &&
      typeof window !== "undefined"
    ) {
      originalConfig._csrfRetried = true;
      const freshToken = await refreshCsrfToken();

      if (freshToken) {
        if (originalConfig.headers?.set) {
          originalConfig.headers.set(CSRF_HEADER, freshToken);
        }
        logger.info("[axios] Retrying request after CSRF token refresh");
        return axiosInstance.request(originalConfig as never);
      }
    }

    if (
      error?.response?.status === 401 &&
      !originalConfig._authRetried &&
      typeof window !== "undefined"
    ) {
      originalConfig._authRetried = true;
      logger.info("[axios] 401 received — attempting session recovery...");
      
      const isHealed = await syncSession();
      if (isHealed) {
        logger.info("[axios] Session recovered successfully, retrying request");
        return axiosInstance.request(originalConfig as any);
      }
      
      if (!isLoggingOut401) {
        isLoggingOut401 = true;
        logger.warn("[axios] Session recovery failed or unauthenticated — logging out");
        try {
          const { handleLogout } = await import("@/lib/security/auth");
          await handleLogout();
        } catch {
          // handleLogout already redirects even on failure
        }
      }
    }
    return Promise.reject(error);
  }
);

// Attach CSRF token and handle JWE encryption
axiosInstance.interceptors.request.use(async (config: JweAxiosConfig) => {
  const isBrowser = typeof window !== "undefined";
  
  if (isBrowser) {
    // 1. Attach CSRF token
    const token = getCsrfToken();
    if (token) {
      config.headers.set(CSRF_HEADER, token);
    }

    // 2. JWE Encryption for internal GhostClass routes
    const url = config.url || "";
    const method = config.method?.toLowerCase() || "";
    
    // Internal routes: anything directed at our own API.
    // 1. Absolute URLs starting with /api/ (typical for Next.js)
    // 2. Relative URLs (axios will prepend baseURL /api/backend/)
    // 3. URLs starting with current origin
    const isInternal = (
      url.startsWith("/api/") || 
      !url.startsWith("http") || 
      (typeof window !== "undefined" && url.startsWith(window.location.origin))
    ) && !url.includes("ezygo.app");
    
    const isMutation = ["post", "put", "patch"].includes(method);
    const isPublic = url.includes("/api/csrf") || url.includes("/api/.well-known/jwks.json");

    if (isInternal && !isPublic) {
      try {
        if (isMutation && config.data) {
          // Idempotency: Don't double-encrypt if already a JWE string (from a retry)
          const isAlreadyJwe = typeof config.data === "string" && config.data.split(".").length === 5;
          
          if (!isAlreadyJwe) {
            // Mutation: Encrypt body and include CEK
            const { jwe, cek } = await encryptRequest(config.data);
            config.data = jwe;
            config._jweCek = cek;
            config.headers.set("Content-Type", "application/jose");
          }
        } else if (method === "get") {
          // GET: Encrypt CEK in header
          const { jwe, cek } = await encryptHeader();
          config.headers.set("X-JWE-Key", jwe);
          config._jweCek = cek;
        }
        config.headers.set("Accept", "application/jose, application/json");
      } catch (err) {
        logger.error("[axios] JWE request encryption failed", err);
        return Promise.reject(err);
      }
    }
  }
  return config;
});

export default axiosInstance;
