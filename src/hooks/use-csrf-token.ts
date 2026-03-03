/**
 * Hook for initializing CSRF token
 * 
 * This hook fetches the CSRF token from the server and stores it
 * in sessionStorage for use in subsequent requests.
 * 
 * ⚠️ SECURITY NOTE:
 * The token is stored in sessionStorage, which is accessible to JavaScript.
 * This implementation relies on strict XSS prevention measures (CSP with nonce,
 * input sanitization) to prevent token theft. See src/lib/security/csrf.ts
 * for detailed security architecture and trade-offs.
 * 
 * IMPLEMENTATION NOTES:
 * - Uses useRef to track initialization state to avoid issues with React 18+ concurrent rendering
 * - Always calls /api/csrf on first mount (does NOT short-circuit on sessionStorage)
 *   so the server can re-issue the Set-Cookie header and refresh the cookie TTL.
 *   This prevents the cookie-expired / sessionStorage-stale desync seen after deployments.
 * - Module-level promise prevents duplicate concurrent requests across different component instances
 * - Safe for StrictMode double-effect execution and hot module replacement
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   useCSRFToken();
 *   // Token is now available for API calls via axios interceptor
 * }
 * ```
 */

import { useEffect, useRef } from "react";
import { setCsrfToken, getCsrfToken } from "@/lib/axios";
import { logger } from "@/lib/logger";

// Per-tab throttle: after a successful /api/csrf call the timestamp is stored in
// sessionStorage. On subsequent mounts within CSRF_REINIT_INTERVAL_MS, the fetch is
// skipped when a token already exists. This prevents exhausting the IP-based rate
// limit under shared-NAT scenarios (e.g. multiple users behind one IP) while still
// ensuring the httpOnly cookie is refreshed after the interval or on a fresh tab.
export const CSRF_LAST_INIT_KEY = "csrf_last_init";
export const CSRF_REINIT_INTERVAL_MS = 30 * 60 * 1000; // 30 min — well within the 24-hour cookie TTL

// Module-level promise to prevent concurrent CSRF initialization across component instances.
// This is only used for request deduplication, not for tracking initialization state.
// The promise ensures only one in-flight /api/csrf request runs at a time when multiple
// components mount simultaneously (e.g. initial page render).
//
// ERROR RECOVERY: If initialization fails, the promise is rejected and cleared in the finally
// block. Components mounting during a failure will see the rejected promise and
// attempt initialization themselves. This ensures eventual consistency even if
// some initialization attempts fail due to network issues or component unmounts.
let csrfInitPromise: Promise<void> | null = null;

export function useCSRFToken() {
  // Track if this hook instance has already attempted initialization
  // This prevents duplicate initialization on re-renders and StrictMode double-effect execution
  const hasInitialized = useRef(false);

  useEffect(() => {
    // Track if this component is still mounted to prevent state updates after unmount
    let isMounted = true;
    
    const initCsrf = async () => {
      // Only run in the browser
      if (typeof window === "undefined") {
        return;
      }

      // Skip if this hook instance already attempted initialization
      if (hasInitialized.current) {
        return;
      }

      // Mark as initialized for this component instance
      hasInitialized.current = true;

      // Throttle: if a token is already in sessionStorage and a successful init happened
      // within CSRF_REINIT_INTERVAL_MS, the httpOnly cookie is still fresh — skip the
      // fetch to avoid consuming the IP-rate-limited /api/csrf quota unnecessarily.
      // A fresh tab (no lastInit), an expired interval, or a missing token all bypass
      // the throttle and proceed with the fetch.
      const existingToken = getCsrfToken();
      if (existingToken) {
        try {
          const lastInit = sessionStorage.getItem(CSRF_LAST_INIT_KEY);
          if (lastInit && Date.now() - parseInt(lastInit, 10) < CSRF_REINIT_INTERVAL_MS) {
            return; // Cookie is fresh; skip the rate-limited call
          }
        } catch {
          // sessionStorage unavailable (e.g. private browsing restrictions) — fall through
        }
      }

      // If an initialization is already in progress from another component, wait for it
      if (csrfInitPromise) {
        try {
          await csrfInitPromise;
        } catch (_error) {
          // Error already logged by the component that created the promise
          logger.dev("CSRF init promise rejected, will check token state");
        }
        
        // After waiting, verify that token was actually set
        // If the other component's initialization failed, we should try again
        const tokenAfterWait = getCsrfToken();
        if (tokenAfterWait) {
          return; // Token exists, initialization succeeded
        }
        // Token doesn't exist, fall through to attempt initialization ourselves
      }

      // Start new initialization
      csrfInitPromise = (async () => {
        try {
          // Call /api/csrf to initialize the CSRF token.
          // The token is set in an httpOnly cookie server-side (for server validation)
          // and returned in the response body for client-side storage in sessionStorage.
          // This call is made on every first mount — even if sessionStorage already has a
          // value — so the server always re-issues Set-Cookie and refreshes the TTL.
          //
          // SECURITY: Token storage in sessionStorage is protected by CSP (see src/lib/csp.ts)
          // which prevents unauthorized script execution and XSS attacks.
          const response = await fetch("/api/csrf", { credentials: "include" });
          if (response.ok && isMounted) {
            const data = await response.json();
            // Store token in sessionStorage for use in subsequent requests
            setCsrfToken(data.token);
            // Record the successful init time for per-tab throttling on subsequent mounts
            try {
              sessionStorage.setItem(CSRF_LAST_INIT_KEY, Date.now().toString());
            } catch {
              // sessionStorage unavailable — throttle disabled for this tab, not critical
            }
          } else if (!isMounted) {
            logger.dev("Component unmounted before CSRF init completed");
          } else {
            logger.error("Failed to initialize CSRF token:", response.statusText);
          }
        } catch (error) {
          // Log error but don't block the form - the token will be checked on submission
          if (isMounted) {
            logger.error("Failed to initialize CSRF token:", error);
          }
          throw error; // Re-throw so waiting components know initialization failed
        } finally {
          // Clear in-flight promise to allow retry on future attempts if needed
          csrfInitPromise = null;
        }
      })();

      try {
        await csrfInitPromise;
      } catch (_error) {
        // Error already logged above
      }
    };

    void initCsrf();
    
    // Cleanup function to mark component as unmounted
    return () => {
      isMounted = false;
    };
  }, []); // Empty deps array - initialization should only happen once per component mount
}
