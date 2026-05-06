/**
 * Apple DeviceCheck Verification Module
 * 
 * Verifies DeviceCheck tokens from iOS devices.
 * DeviceCheck is Apple's equivalent to Google Play Integrity, providing
 * device attestation for iOS applications.
 * 
 * Reference:
 * - https://developer.apple.com/documentation/devicecheck
 * - https://developer.apple.com/documentation/appcheck/app_check_service_used_with_your_backend
 */

import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";
import crypto from "crypto";

export interface DeviceCheckVerifyResult {
  isValid: boolean;
  error?: string;
  verdict?: any;
}

/**
 * Verifies a DeviceCheck token from an iOS device
 * @param token - The DeviceCheck token to verify
 * @param nonce - The nonce used during token generation (for freshness validation)
 * @returns Result object with validation status
 */
export async function verifyDeviceCheckToken(
  token: string,
  nonce?: string,
): Promise<DeviceCheckVerifyResult> {
  if (!token) {
    return {
      isValid: false,
      error: "Missing DeviceCheck token",
    };
  }

  const keyId = process.env.APPLE_DEVICE_CHECK_KEY_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const bundleId = process.env.APPLE_BUNDLE_ID;

  // Require credentials for verification
  if (!keyId || !teamId || !bundleId) {
    logger.warn(
      "DeviceCheck verification skipped: Missing required Apple credentials (KEY_ID, TEAM_ID, BUNDLE_ID)",
    );
    // In development/missing config, allow the token if DeviceCheck is not enforced
    if (process.env.ENFORCE_DEVICE_CHECK === "true") {
      return {
        isValid: false,
        error: "Server configuration error",
      };
    }
    return { isValid: true };
  }

  const privateKeyB64 = process.env.APPLE_DEVICE_CHECK_PRIVATE_KEY_B64;
  if (!privateKeyB64) {
    logger.warn(
      "DeviceCheck verification skipped: Missing APPLE_DEVICE_CHECK_PRIVATE_KEY_B64",
    );
    if (process.env.ENFORCE_DEVICE_CHECK === "true") {
      return {
        isValid: false,
        error: "Server configuration error",
      };
    }
    return { isValid: true };
  }

  try {
    // Step 1: Create a JWT signed with the private key
    // This JWT is used to authenticate the verification request to Apple's API
    const jwt = await createDeviceCheckJWT(keyId, teamId, privateKeyB64);

    // Step 2: Verify the token with Apple's DeviceCheck API
    // Apple returns device details and attestation results
    const transactionId = nonce || crypto.randomBytes(16).toString("hex");

    const response = await fetch(
      "https://api.development.devicecheck.apple.com/v1/validate_device_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          device_token: token,
          transaction_id: transactionId,
          timestamp: Math.floor(Date.now() / 1000),
        }),
        signal: AbortSignal.timeout(10000), // 10 second timeout
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      logger.warn("Apple DeviceCheck API error:", {
        status: response.status,
        error: errorBody.substring(0, 100),
      });

      if (response.status === 401) {
        return {
          isValid: false,
          error: "Device integrity check failed (authentication)",
        };
      }

      if (response.status === 400) {
        return {
          isValid: false,
          error: "Invalid device token",
        };
      }

      throw new Error(
        `Apple DeviceCheck API returned ${response.status}`,
      );
    }

    // Step 3: Parse and validate the response
    // Apple's response includes attestation details about the device
    const data = await response.json();

    // Enforce device integrity based on environment flags
    if (process.env.ENFORCE_DEVICE_CHECK === "true") {
      // The response should indicate the device is trusted
      // Apple returns various attestation results we can validate
      if (!data.valid) {
        logger.warn("DeviceCheck: Device validation returned false");
        return {
          isValid: false,
          error: "Device validation failed",
          verdict: data,
        };
      }
    }

    logger.dev("DeviceCheck token validated successfully");
    return {
      isValid: true,
      verdict: data,
    };
  } catch (error: any) {
    logger.error("DeviceCheck verification error:", error.message);
    Sentry.captureException(error, {
      tags: { type: "device_check_failure" },
    });

    return {
      isValid: false,
      error: "Device integrity verification failed",
    };
  }
}

import { SignJWT, importPKCS8 } from "jose";

/**
 * Creates a JWT for authenticating with Apple's DeviceCheck API
 * Uses HMAC-based signing for simplicity (alternative: use full ES256 signing)
 * @param keyId - The key ID from Apple's developer account
 * @param teamId - The team ID from Apple
 * @param privateKeyB64 - Base64-encoded private key
 * @returns JWT token
 */
async function createDeviceCheckJWT(
  keyId: string,
  teamId: string,
  privateKeyB64: string,
): Promise<string> {
  try {
    const privateKeyPem = Buffer.from(privateKeyB64, "base64").toString("utf-8");
    const now = Math.floor(Date.now() / 1000);

    // Import the PKCS8 private key
    const key = await importPKCS8(privateKeyPem, "ES256");

    // Create and sign the JWT
    const jwt = await new SignJWT({
      iss: teamId,
      iat: now,
      exp: now + 3600, // Valid for 1 hour
    })
      .setProtectedHeader({
        alg: "ES256",
        kid: keyId,
      })
      .sign(key);

    return jwt;
  } catch (error) {
    logger.error("Failed to create DeviceCheck JWT:", error);
    throw new Error("JWT creation failed");
  }
}
