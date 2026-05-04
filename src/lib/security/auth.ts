// Auth token management utilities
// src/lib/security/auth.ts
import { createClient } from "@/lib/supabase/client";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";
import { safeResponseJson } from "@/lib/json";

/**
 * Checks if an error is related to a missing authentication session.
 * This helper provides a more robust check than exact string matching,
 * making it resilient to error message variations.
 * 
 * @param error - The error object to check
 * @returns true if the error is related to a missing auth session
 * 
 * @example
 * ```ts
 * const { error } = await supabase.auth.getUser();
 * if (error && !isAuthSessionMissingError(error)) {
 *   throw error; // Only throw if it's not a session missing error
 * }
 * ```
 */
export const isAuthSessionMissingError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }
  if (!('message' in error) || typeof error.message !== 'string') {
    return false;
  }
  const lowerMessage = error.message.toLowerCase();
  return lowerMessage.includes("session missing") || lowerMessage.includes("auth session");
};

/**
 * Detects Supabase browser lock manager timeout errors.
 * These can occur on some devices/browsers when another tab/process holds
 * the auth lock too long; callers can treat this as a recoverable client state issue.
 */
export const isSupabaseLockTimeoutError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }
  if (!('message' in error) || typeof error.message !== 'string') {
    return false;
  }

  const lowerMessage = error.message.toLowerCase();
  return (
    lowerMessage.includes("navigator lockmanager") ||
    lowerMessage.includes("exclusive navigator lockmanager lock") ||
    (lowerMessage.includes("timed out") && lowerMessage.includes("auth-token"))
  );
};

/**
 * Performs comprehensive logout with cleanup of all authentication state.
 * Handles Supabase session, local storage, cookies, and redirects to home.
 * 
 * Multi-Device Support:
 * - Only clears the current device's cookies (ezygo_access_token, CSRF, terms_version)
 * - Does NOT invalidate other devices' sessions (no password changes)
 * - Each device can maintain independent sessions from the same user account
 * - Logging out on one device does not affect active sessions on other devices
 * 
 * Process:
 * 1. Sign out from Supabase (revokes the session for this device on the server)
 * 2. Clear authentication and terms cookies via API (with CSRF protection)
 * 3. Redirect to home page
 * 4. Clear browser storage (localStorage, sessionStorage) in finally block
 * 
 * Error Handling:
 * - Logs errors to Sentry
 * - Forces redirect even on failure to prevent user from being stuck
 * - Client storage cleanup (localStorage/sessionStorage) always happens via finally block
 * - Best-effort cleanup of server cookies continues even if Supabase signOut fails
 * 
 * @param csrfToken - Optional CSRF token for API logout. If not provided, will attempt to retrieve from storage.
 * 
 * @example
 * ```ts
 * import { getCsrfToken } from "@/lib/axios";
 * 
 * const csrfToken = getCsrfToken();
 * await handleLogout(csrfToken);
 * // User is redirected to home page with all auth state cleared
 * // Other devices remain logged in (multi-device support)
 * ```
 */

/**
 * Fetches a fresh CSRF token from the server.
 * Extracted helper to avoid duplicating the fetch logic in handleLogout's
 * main path, 403-retry path, and catch-block fallback path.
 */
async function fetchFreshCsrfToken(): Promise<string | null> {
  try {
    const response = await fetch("/api/csrf", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) {
      logger.error("[handleLogout] Failed to fetch CSRF token:", response.statusText);
      return null;
    }
    const data = await safeResponseJson<{ token: string }>(response);
    return typeof data?.token === "string" ? data.token : null;
  } catch (err) {
    logger.error("[handleLogout] Error fetching CSRF token:", err);
    return null;
  }
}

export const handleLogout = async (csrfToken?: string | null) => {
  const supabase = createClient();
  // Initialize token with csrfToken to maintain fallback behavior even if dynamic import fails
  let token: string | null = csrfToken ?? null;
  
  try {
    // Only import and get CSRF token if not provided to avoid unnecessary module loads
    if (!csrfToken) {
      const { getCsrfToken: getToken } = await import("@/lib/axios");
      token = getToken();
    }
    
    // 1. Sign out from Supabase (Server-side session)
    // CRITICAL: Use scope: 'local' to only logout current device/session
    // Supabase Auth v2 supports three scopes:
    //   - 'global': signs out all sessions for this user (default if scope not specified)
    //   - 'local': signs out only the current session, preserving sessions on other devices
    //   - 'others': signs out all other sessions except the current one
    // We use 'local' to preserve multi-device sessions
    const { error } = await supabase.auth.signOut({
      scope: 'local' // Only sign out the current session, not all sessions
    });
    if (error) throw error;

    // 2. Clear Cookies with CSRF protection
    let csrfTokenToUse = token;

    // If no CSRF token is available, obtain one before logging out
    if (!csrfTokenToUse) {
      csrfTokenToUse = await fetchFreshCsrfToken();
      if (csrfTokenToUse) {
        logger.info("[handleLogout] Obtained CSRF token for logout");
      } else {
        logger.warn("[handleLogout] Unable to obtain CSRF token — skipping /api/logout call. Server-side cookies will not be cleared.");
      }
    }
    
    // Attempt to call logout API to clear server-side cookies
    if (csrfTokenToUse) {
      try {
        const logoutResponse = await fetch("/api/logout", { 
          method: "POST",
          headers: {
            "x-csrf-token": csrfTokenToUse
          }
        });
        
        // Retry once on 403 with a fresh CSRF token
        // 403 typically indicates a stale CSRF token (mismatch between header and cookie)
        if (logoutResponse.status === 403) {
          logger.warn("[handleLogout] Logout received 403 — retrying with fresh CSRF token");
          const freshToken = await fetchFreshCsrfToken();
          if (freshToken) {
            const retryResponse = await fetch("/api/logout", {
              method: "POST",
              headers: { "x-csrf-token": freshToken },
            });
            if (!retryResponse.ok) {
              logger.error("[handleLogout] Logout API retry failed:", retryResponse.status, retryResponse.statusText);
            }
          } else {
            logger.error("[handleLogout] Failed to obtain fresh CSRF token for retry");
          }
        } else if (!logoutResponse.ok) {
          logger.error("[handleLogout] Logout API call failed:", logoutResponse.status, logoutResponse.statusText);
        }
      } catch (logoutError) {
        logger.error("Error calling logout API:", logoutError);
      }
    } else {
      logger.warn("Unable to obtain CSRF token - skipping /api/logout call. Server-side cookies (ezygo_access_token, terms_version, CSRF cookie) will not be cleared and may remain set, requiring explicit re-authentication on next visit.");
    }
    
    // 3. Clear browser storage BEFORE redirect so it always completes
    // (The finally block runs after navigation is queued and may be cancelled by the browser)
    if (typeof window !== "undefined") {
      localStorage.clear();
      sessionStorage.clear();
    }

    // 4. Redirect
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }

  } catch (error) {
    logger.error("Logout failed:", error);
    
    // Capture the error but don't trap the user
    Sentry.captureException(error, { 
        tags: { type: "logout_failure", location: "handleLogout" } 
    });

    // Force redirect anyway so user isn't stuck on a broken page
    if (typeof window !== "undefined") {
      // Best-effort cleanup of known app cookies
      let fallbackToken = token;
      if (!fallbackToken) {
        fallbackToken = await fetchFreshCsrfToken();
      }
      if (fallbackToken) {
        try {
          await fetch("/api/logout", {
            method: "POST",
            headers: { "x-csrf-token": fallbackToken },
          });
        } catch (_logoutError) {
          // Ignore logout errors in error handler
        }
      }

      // Clear storage before redirect in the error path too
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = "/";
    }
  }
  // Note: no finally block — storage is cleared explicitly before each redirect path
  // to ensure it completes before the browser navigates away.
};