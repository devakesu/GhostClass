import crypto from "crypto";

// Compute default maxAge once at module initialization for performance
// Can be overridden via REQUEST_SIGNATURE_MAX_AGE environment variable
const DEFAULT_MAX_AGE = Number(process.env.REQUEST_SIGNATURE_MAX_AGE) || 600;

/**
 * Signs a request payload with Ed25519 asymmetric signature
 * @param payload Request payload (should be JSON stringified)
 * @param timestamp Unix timestamp in seconds
 * @returns Signature string (hex encoded)
 */
export function signRequest(payload: string, timestamp: number): string {
  const privateKey = getPrivateKey();
  const message = `${timestamp}.${payload}`;
  
  // Use Ed25519 asymmetric signing
  return crypto.sign(undefined, Buffer.from(message), privateKey).toString("hex");
}

/**
 * Verifies request signature using Ed25519 public key
 * @param payload Original request payload (JSON stringified)
 * @param timestamp Request timestamp
 * @param signature Provided signature (hex encoded)
 * @param maxAge Maximum age of request in seconds (default: 600 = 10 minutes)
 * @returns true if signature is valid and not expired
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

    const publicKey = getPublicKey();
    const message = `${timestamp}.${payload}`;
    const signatureBuffer = Buffer.from(signature, "hex");

    // Verify using Ed25519 public key
    return crypto.verify(undefined, Buffer.from(message), publicKey, signatureBuffer);
  } catch (_error) {
    return false;
  }
}

/**
 * Gets the private key for signing.
 * @throws Error if REQUEST_PRIVATE_KEY is not configured
 */
function getPrivateKey(): string {
  const key = process.env.REQUEST_PRIVATE_KEY;
  if (!key) {
    throw new Error("REQUEST_PRIVATE_KEY must be configured for request signing");
  }
  return key;
}

/**
 * Gets the public key for verification.
 * @throws Error if REQUEST_PUBLIC_KEY is not configured
 */
function getPublicKey(): string {
  const key = process.env.REQUEST_PUBLIC_KEY;
  if (!key) {
    throw new Error("REQUEST_PUBLIC_KEY must be configured for request signature verification");
  }
  return key;
}

/**
 * Extracts signature components from request headers
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
