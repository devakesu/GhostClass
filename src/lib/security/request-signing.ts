// Request Signing for Sensitive API Calls
// src/lib/security/request-signing.ts
import crypto from "crypto";

// Compute default maxAge once at module initialization for performance
// Can be overridden via REQUEST_SIGNATURE_MAX_AGE environment variable
const DEFAULT_MAX_AGE = Number(process.env.REQUEST_SIGNATURE_MAX_AGE) || 600;

/**
 * Signs a request payload with HMAC-SHA256
 * @param payload Request payload (should be JSON stringified)
 * @param timestamp Unix timestamp in seconds
 * @returns Signature string
 */
export function signRequest(payload: string, timestamp: number): string {
  const secret = getSigningSecret();
  const message = `${timestamp}.${payload}`;
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

/**
 * Verifies request signature
 * @param payload Original request payload (JSON stringified)
 * @param timestamp Request timestamp
 * @param signature Provided signature
 * @param maxAge Maximum age of request in seconds (default: 600 = 10 minutes)
 * @returns true if signature is valid and not expired
 * 
 * NOTE: The default 10-minute window provides tolerance for clock skew and slow connections
 * while still preventing most replay attacks. This can be overridden via REQUEST_SIGNATURE_MAX_AGE
 * environment variable if needed.
 * 
 * CSRF token expiration is handled separately by cookie maxAge (24 hours / 86400 seconds in csrf.ts).
 * The browser automatically removes expired CSRF cookies, making them invalid for validation.
 */
export function verifyRequestSignature(
  payload: string,
  timestamp: number,
  signature: string,
  maxAge: number = DEFAULT_MAX_AGE
): boolean {
  try {
    // Check timestamp validity (prevent replay attacks)
    const now = Math.floor(Date.now() / 1000);
    const age = now - timestamp;
    
    if (age > maxAge || age < 0) {
      return false; // Request too old or timestamp in future
    }

    // Compute expected signature
    const expectedSignature = signRequest(payload, timestamp);

    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

/**
 * Gets the signing secret from environment.
 * Requires a dedicated REQUEST_SIGNING_SECRET (key-separation principle:
 * never reuse the encryption key for HMAC signing).
 * @throws Error if REQUEST_SIGNING_SECRET is not configured
 */
function getSigningSecret(): string {
  const secret = process.env.REQUEST_SIGNING_SECRET;
  if (!secret) {
    throw new Error("REQUEST_SIGNING_SECRET must be configured for request signing");
  }
  return secret;
}

/**
 * Extracts signature components from request headers
 * Expected headers:
 * - x-signature: The HMAC signature
 * - x-timestamp: Unix timestamp
 */
export function extractSignatureFromRequest(request: Request): {
  signature: string | null;
  timestamp: number | null;
} {
  const signature = request.headers.get("x-signature");
  const timestampHeader = request.headers.get("x-timestamp");
  const timestamp = timestampHeader ? parseInt(timestampHeader, 10) : null;

  return {
    signature,
    timestamp: timestamp && !isNaN(timestamp) ? timestamp : null,
  };
}

/**
 * Middleware helper: Validates signed request
 * @param request Request object
 * @returns true if signature is valid
 */
export async function validateSignedRequest(request: Request): Promise<boolean> {
  try {
    const { signature, timestamp } = extractSignatureFromRequest(request);

    if (!signature || !timestamp) {
      return false;
    }

    // Clone request before reading body to avoid consuming it
    const clonedRequest = request.clone();
    const body = await clonedRequest.text();

    return verifyRequestSignature(body, timestamp, signature);
  } catch {
    return false;
  }
}

/**
 * Client-side helper: Generates headers for signed request
 * Note: This should be used in Server Actions, not client components
 */
export function generateSignedHeaders(payload: string): {
  "x-signature": string;
  "x-timestamp": string;
} {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signRequest(payload, timestamp);

  return {
    "x-signature": signature,
    "x-timestamp": timestamp.toString(),
  };
}
