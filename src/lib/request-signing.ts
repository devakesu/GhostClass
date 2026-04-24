// Request Signing for Sensitive API Calls
// src/lib/request-signing.ts
import crypto from "crypto";

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
 * @param maxAge Maximum age of request in seconds (default: 300 = 5 minutes)
 * @returns true if signature is valid and not expired
 */
export function verifyRequestSignature(
  payload: string,
  timestamp: number,
  signature: string,
  maxAge: number = 300
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
 * Gets the signing secret from environment
 * Uses ENCRYPTION_KEY as the signing secret for simplicity
 * @throws Error if secret is not configured
 */
function getSigningSecret(): string {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("ENCRYPTION_KEY not configured for request signing");
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

    // Get request body
    const body = await request.text();

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
