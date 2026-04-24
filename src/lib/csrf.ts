// CSRF Token Generation and Validation (Server-side only)
// src/lib/csrf.ts
"use server";

import crypto from "crypto";
import { cookies } from "next/headers";
import { CSRF_HEADER, CSRF_TOKEN_NAME } from "./csrf-constants";

const TOKEN_LENGTH = 32;
const TOKEN_TTL = 3600; // 1 hour in seconds

/**
 * Generates a cryptographically secure CSRF token
 * @returns Hex-encoded token string
 */
async function generateCsrfToken(): Promise<string> {
  return crypto.randomBytes(TOKEN_LENGTH).toString("hex");
}

/**
 * Sets CSRF token in HTTP-only cookie
 * Server Actions: Use this to set token for client-side forms
 */
export async function setCsrfCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CSRF_TOKEN_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TOKEN_TTL,
  });
}

/**
 * Gets CSRF token from cookie
 * Server-side only
 */
export async function getCsrfTokenFromCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(CSRF_TOKEN_NAME)?.value;
}

/**
 * Validates CSRF token from request header against cookie value
 * If no cookie exists, sets the header token as the cookie (first-time use)
 * @param request Request object or headers
 * @returns true if token is valid, false otherwise
 */
export async function validateCsrfToken(request: Request): Promise<boolean> {
  try {
    // Get token from header
    const headerToken = request.headers.get(CSRF_HEADER);
    if (!headerToken) {
      return false;
    }

    // Get token from cookie
    const cookieStore = await cookies();
    const cookieToken = cookieStore.get(CSRF_TOKEN_NAME)?.value;
    
    if (!cookieToken) {
      // First-time use: Set the header token as the cookie
      await setCsrfCookie(headerToken);
      return true;
    }

    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(headerToken),
      Buffer.from(cookieToken)
    );
  } catch {
    return false;
  }
}

/**
 * Generates and optionally retrieves CSRF token for forms
 * Just generates a token - the cookie will be set by the API route during validation
 */
export async function initializeCsrfToken(): Promise<string> {
  // Check if token already exists in cookie
  const existingToken = await getCsrfTokenFromCookie();
  if (existingToken) {
    return existingToken;
  }
  
  // Generate new token (cookie will be set by API route when validating)
  return await generateCsrfToken();
}

/**
 * Clears CSRF token (useful on logout)
 */
export async function clearCsrfToken(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CSRF_TOKEN_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
