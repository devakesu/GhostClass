/**
 * CSRF Protection Module
 * 
 * Implements Synchronizer Token Pattern for CSRF protection.
 * This module provides token generation and validation for protecting
 * against Cross-Site Request Forgery attacks.
 * 
 * Security Model:
 * - The token is stored in an httpOnly cookie (server-side validation)
 * - Client receives token via API response and stores in sessionStorage
 * - Client includes token in X-CSRF-Token header for state-changing requests
 * - Server validates header token against httpOnly cookie
 * 
 * ⚠️ CRITICAL SECURITY TRADE-OFF - sessionStorage and XSS:
 * 
 * This implementation stores the CSRF token in sessionStorage, which is accessible
 * to JavaScript and therefore vulnerable to XSS (Cross-Site Scripting) attacks.
 * If an attacker can execute arbitrary JavaScript in the application context,
 * they can read the token from sessionStorage and bypass CSRF protection.
 * 
 * WHY THIS APPROACH WAS CHOSEN:
 * - sessionStorage provides token persistence across page navigations within a tab
 * - Allows token sharing across all pages in the same browsing session
 * - Avoids repeated server round-trips for token retrieval
 * - Simpler client-side implementation than alternatives (meta tags, hidden fields)
 * 
 * ALTERNATIVE APPROACHES CONSIDERED:
 * 1. In-Memory Only: Token lost on page refresh, poor UX
 * 2. Meta Tag Injection: Complex with client-side navigation in Next.js
 * 3. Hidden Form Fields: Only works for forms, not AJAX requests
 * 
 * MANDATORY SECURITY REQUIREMENTS:
 * This approach is ONLY secure when combined with strict XSS prevention:
 * 
 * 1. CONTENT SECURITY POLICY (CSP):
 *    - Implemented in src/lib/csp.ts with nonce-based script execution
 *    - Production uses 'strict-dynamic' and blocks 'unsafe-inline'
 *    - Prevents unauthorized JavaScript execution
 * 
 * 2. INPUT SANITIZATION:
 *    - All user input must be sanitized to prevent script injection
 *    - Use proper encoding when rendering user content
 * 
 * 3. SECURITY HEADERS:
 *    - X-Content-Type-Options: nosniff
 *    - X-Frame-Options: DENY (or via CSP frame-ancestors)
 * 
 * ⚠️ WARNING: If CSP is disabled or weakened, or if XSS vulnerabilities exist,
 * this CSRF protection can be bypassed. XSS prevention is the PRIMARY defense;
 * CSRF protection is a secondary layer. Both must be maintained.
 * 
 * IMPORTANT: Cookie writes must only happen in Route Handlers or Server Actions,
 * not in Server Components. Use getCsrfToken() from Server Components (read-only),
 * Route Handlers, and Server Actions.
 */

import { cookies } from "next/headers";
import crypto from "crypto";
import { logger } from "@/lib/logger";

// Configuration
const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_TOKEN_LENGTH = 32;
const CSRF_COOKIE_MAX_AGE = 60 * 60 * 24; // 24 hours
const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Generate a cryptographically secure random CSRF token
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString("hex");
}

/**
 * Get the current CSRF token from cookies (read-only, safe for server components)
 * @returns The CSRF token if it exists, null otherwise
 */
export async function getCsrfToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(CSRF_COOKIE_NAME);
  return token?.value || null;
}

/**
 * Set CSRF token in cookie
 * WARNING: This function can ONLY be called from Route Handlers or Server Actions,
 * NOT from Server Components. Calling from Server Components will cause:
 * "Error: Cookies can only be modified in a Server Action or Route Handler"
 * 
 * @param token - The CSRF token to set
 */
export async function setCsrfCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  
  cookieStore.set({
    name: CSRF_COOKIE_NAME,
    value: token,
    httpOnly: true, // Server-side validation token (not accessible to JavaScript)
    secure: process.env.HTTPS === 'true' || process.env.NODE_ENV === 'production',
    sameSite: "strict",
    maxAge: CSRF_COOKIE_MAX_AGE,
    path: "/",
  });
}

/**
 * Validate CSRF token from request against cookie
 * @param requestToken - Token from request header or body
 * @returns true if valid, false otherwise
 */
export async function validateCsrfToken(requestToken: string | null | undefined): Promise<boolean> {
  if (!requestToken) {
    return false;
  }

  const cookieToken = await getCsrfToken();
  
  if (!cookieToken) {
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  // Let timingSafeEqual handle length mismatches by throwing;
  // we treat any error as a failed comparison to avoid observable early returns
  try {
    return crypto.timingSafeEqual(
      Buffer.from(cookieToken),
      Buffer.from(requestToken)
    );
  } catch (_error) {
    // timingSafeEqual throws RangeError if buffers have different lengths.
    // Treat any error as a failed comparison without exposing timing details.
    // Log sanitized error for debugging in development only (avoid exposing info in production logs)
    if (!IS_PRODUCTION) {
      logger.error("CSRF token validation failed", {
        errorType: _error instanceof Error ? _error.name : 'unknown',
      });
    }
    return false;
  }
}

/**
 * Initialize CSRF token - creates new token if none exists.
 * WARNING: Can ONLY be called from Route Handlers or Server Actions.
 *
 * M-δ: This function deliberately reuses an existing token for the session lifetime
 * (CSRF_COOKIE_MAX_AGE). Callers that represent a significant privilege change
 * (login, password change) should call regenerateCsrfToken() instead to bind the
 * token to the new session. The POST /api/csrf endpoint exposes regenerateCsrfToken()
 * for client-initiated rotation; logout already calls removeCsrfToken().
 *
 * @returns The token (existing or newly created)
 */
export async function initializeCsrfToken(): Promise<string> {
  const existingToken = await getCsrfToken();
  
  if (existingToken) {
    return existingToken;
  }

  const newToken = generateCsrfToken();
  await setCsrfCookie(newToken);
  
  return newToken;
}

/**
 * Regenerate CSRF token - always creates a new token
 * WARNING: Can ONLY be called from Route Handlers or Server Actions
 * @returns The new token
 */
export async function regenerateCsrfToken(): Promise<string> {
  const newToken = generateCsrfToken();
  await setCsrfCookie(newToken);
  
  return newToken;
}

/**
 * Remove CSRF token from cookies
 * WARNING: Can ONLY be called from Route Handlers or Server Actions
 */
export async function removeCsrfToken(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(CSRF_COOKIE_NAME);
}
