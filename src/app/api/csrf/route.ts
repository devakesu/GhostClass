/**
 * CSRF Token API Route
 * 
 * This is the single canonical CSRF endpoint.
 * Both pre-authentication (login page) and post-authentication (session refresh)
 * callers use this route. The separate /api/csrf/init endpoint has been consolidated
 * here to eliminate overlap.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { initializeCsrfToken, regenerateCsrfToken } from "@/lib/security/csrf";
import { authRateLimiter } from "@/lib/ratelimit";
import { getClientIp } from "@/lib/utils.server";
import { logger } from "@/lib/logger";

export const dynamic = 'force-dynamic';

/**
 * GET /api/csrf
 * Returns (or initializes) the CSRF token for the current session.
 * Rate limited per IP to prevent DoS attacks.
 */
export async function GET() {
  try {
    // Get client IP for rate limiting (10 requests per minute per IP)
    const headersList = await headers();
    const ip = getClientIp(headersList);

    if (!ip) {
      logger.warn("Unable to determine client IP for CSRF init rate limiting");
    }

    if (ip) {
      const { success, limit, reset, remaining } = await authRateLimiter.limit(`csrf_init_${ip}`);
      if (!success) {
        return NextResponse.json(
          {
            error: "Too many CSRF initialization requests. Please try again later.",
            retryAfter: reset,
          },
          {
            status: 429,
            headers: {
              'Retry-After': Math.max(0, Math.ceil((reset - Date.now()) / 1000)).toString(),
              'X-RateLimit-Limit': limit.toString(),
              'X-RateLimit-Remaining': remaining.toString(),
              'X-RateLimit-Reset': reset.toString(),
            },
          }
        );
      }
    }

    // Initialize token if needed (this will set the cookie via Route Handler)
    const token = await initializeCsrfToken();
    
    return NextResponse.json(
      { 
        token,
        message: "CSRF token initialized successfully" 
      },
      { 
        status: 200,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        }
      }
    );
  } catch (error) {
    // Log minimal error info to avoid leaking sensitive details
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error("CSRF token initialization error:", { message: errorMessage });
    
    return NextResponse.json(
      { error: "Failed to initialize CSRF token" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/csrf
 * Explicitly refresh/regenerate CSRF token (always creates new token)
 * Rate limited to prevent abuse and token exhaustion attacks
 * 
 * Note: IP-based rate limiting using x-forwarded-for header. While this header
 * can be spoofed, it provides basic protection. Consider using additional factors
 * like session tracking for production deployments with sophisticated attackers.
 */
export async function POST() {
  try {
    // Get client IP for rate limiting
    // Note: x-forwarded-for can be spoofed, but provides basic protection
    const headersList = await headers();
    const ip = getClientIp(headersList);

    // If we cannot determine the client IP, avoid using a shared rate limit key
    if (!ip) {
      logger.error("CSRF token refresh error: unable to determine client IP for rate limiting");
      return NextResponse.json(
        { error: "Unable to determine client IP for rate limiting" },
        { status: 500 }
      );
    }
    
    // Apply rate limiting to prevent token regeneration abuse
    const { success, reset } = await authRateLimiter.limit(`csrf_regen_${ip}`);
    
    if (!success) {
      return NextResponse.json(
        { error: "Too many token regeneration requests. Please try again later." },
        {
          status: 429,
          headers: { 'Retry-After': Math.max(0, Math.ceil((reset - Date.now()) / 1000)).toString() },
        }
      );
    }
    
    const token = await regenerateCsrfToken();
    
    return NextResponse.json(
      { 
        token,
        message: "CSRF token refreshed successfully" 
      },
      { 
        status: 200,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        }
      }
    );
  } catch (error) {
    // Log minimal error info to avoid leaking sensitive details
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error("CSRF token refresh error:", { message: errorMessage });
    
    return NextResponse.json(
      { error: "Failed to refresh CSRF token" },
      { status: 500 }
    );
  }
}
