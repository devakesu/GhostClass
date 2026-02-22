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
 * - Checks sessionStorage as source of truth for token existence
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

// Module-level promise to prevent concurrent CSRF initialization across component instances
// This is only used for request deduplication, not for tracking initialization state
// The source of truth for initialization is sessionStorage, which is checked in each component
//
// ERROR RECOVERY: If initialization fails, the promise is rejected and cleared in the finally
// block (line 112). Components mounting during a failure will see the rejected promise and
// verify token state afterward (lines 78-82). If no token exists after the failed promise,
// they will start a new initialization attempt. This ensures eventual consistency even if
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

      // Check if token already exists in sessionStorage - this is the source of truth
      // This allows re-initialization if token is cleared (e.g., after logout or session expiry)
      const existingToken = getCsrfToken();
      if (existingToken) {
        return;
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
          // Call the /api/csrf/init endpoint to initialize the CSRF token
          // The token is stored in an httpOnly cookie (server-side validation)
          // and returned in the response for client-side storage in sessionStorage.
          // 
          // SECURITY: Token storage in sessionStorage is protected by CSP (see src/lib/csp.ts)
          // which prevents unauthorized script execution and XSS attacks.
          const response = await fetch("/api/csrf");
          if (response.ok && isMounted) {
            const data = await response.json();
            // Store token in sessionStorage for use in subsequent requests
            setCsrfToken(data.token);
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
