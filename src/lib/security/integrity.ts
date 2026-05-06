import { google } from "googleapis";
import { logger } from "@/lib/logger";
import crypto from "crypto";

const getAuthorizedDigests = () => [
  process.env.PLAY_INTEGRITY_CERT_SHA256 || "PLACEHOLDER_SHA256_FINGERPRINT",
];

/**
 * Validates a stateless signed nonce.
 * Format: base64(random:timestamp:signature)
 */
function validateSignedNonce(nonce: string): boolean {
  try {
    const decoded = Buffer.from(nonce, 'base64url').toString('utf-8');
    const [random, timestampStr, signature] = decoded.split(':');
    
    if (!random || !timestampStr || !signature) return false;

    // 1. Check expiration (e.g., 5 minutes)
    const timestamp = parseInt(timestampStr);
    const now = Date.now();
    const ageMinutes = (now - timestamp) / 1000 / 60;
    
    if (ageMinutes < -1 || ageMinutes > 5) {
      logger.warn(`Security: Nonce expired (Age: ${ageMinutes.toFixed(2)}m)`);
      return false;
    }

    // 2. Verify HMAC
    const secret = process.env.MOBILE_API_SECRET || 'fallback-security-secret';
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${random}:${timestampStr}`);
    const expectedSignature = hmac.digest('hex');

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  } catch (_e) {
    return false;
  }
}

/**
 * Result of the integrity check
 */
export interface IntegrityResult {
  isValid: boolean;
  error?: string;
  reason?: string;
  action?: string;
  criticalRisk?: boolean;
  verdict?: any;
}

function failureResult(
  error: string,
  reason: string,
  action: string,
  verdict: any,
  criticalRisk = false,
): IntegrityResult {
  return { isValid: false, error, reason, action, criticalRisk, verdict };
}

/**
 * Verifies a Play Integrity token received from the mobile app.
 *
 * @param token The raw token from the app
 * @returns Object indicating if the device and app are authentic
 */
export async function verifyPlayIntegrity(
  token: string,
  expectedNonce?: string,
): Promise<IntegrityResult> {
  // 1. Check if we have credentials configured
  const authJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!authJson) {
    return { 
      isValid: false, 
      error: "Server configuration error",
      reason: "The server is missing necessary security credentials to verify Android devices.",
      action: "Please report this issue to GhostClass support.",
      criticalRisk: false,
    };
  }

  try {
    let config;
    if (authJson.startsWith("{")) {
      config = JSON.parse(authJson);
    } else {
      config = JSON.parse(Buffer.from(authJson, "base64").toString("utf-8"));
    }

    const auth = new google.auth.JWT({
      email: config.client_email,
      key: config.private_key,
      scopes: ["https://www.googleapis.com/auth/playintegrity"],
    });

    const playService = google.playintegrity({
      version: "v1",
      auth,
    });

    const packageName = process.env.NEXT_PUBLIC_ANDROID_PACKAGE_NAME || "com.devakesu.ghostclass";

    // 2. Decode the token
    // In the googleapis library, methods are often nested under the version property (v1)
    const response = await (playService as any).v1.decodeIntegrityToken({
      packageName,
      requestBody: {
        integrityToken: token,
      },
    });

    const verdict = response.data.tokenPayloadExternal;
    if (!verdict) {
      return failureResult(
        "Empty integrity verdict",
        "The Play Integrity system returned an empty or malformed result.",
        "Please check your internet connection and try again.",
        verdict,
      );
    }

    const { appIntegrity, deviceIntegrity, accountIntegrity } = verdict;

    // 3. Granular Enforcement Logic
    // These flags allow fine-tuned control over which integrity checks are mandatory.
    const enforceBasic = process.env.PLAY_INTEGRITY_ENFORCE_BASIC === "true";
    const enforceDevice = process.env.PLAY_INTEGRITY_ENFORCE_DEVICE === "true";
    const enforceStrong = process.env.PLAY_INTEGRITY_ENFORCE_STRONG === "true";
    const enforceLicensed = process.env.PLAY_INTEGRITY_ENFORCE_LICENSED === "true";
    const enforceRecognized = process.env.PLAY_INTEGRITY_ENFORCE_PLAY_RECOGNIZED === "true";
    const enforceCert = process.env.PLAY_INTEGRITY_ENFORCE_SIGNING_CERT === "true";

    // A. App Recognition Verdict
    if (enforceRecognized && appIntegrity?.appRecognitionVerdict !== "PLAY_RECOGNIZED") {
      logger.error(`Play Integrity Failure: appRecognitionVerdict is ${appIntegrity?.appRecognitionVerdict} (Enforced)`);
      return failureResult(
        "App not recognized by Play Store",
        "The app was not installed via the official Google Play Store.",
        "Please uninstall this version and reinstall GhostClass from the official Play Store.",
        verdict,
        true,
      );
    }

    // B. App Licensing Verdict
    if (enforceLicensed && accountIntegrity?.appLicensingVerdict !== "LICENSED") {
      logger.error(`Play Integrity Failure: appLicensingVerdict is ${accountIntegrity?.appLicensingVerdict} (Enforced)`);
      return failureResult(
        "App not licensed for this user",
        "The Google account on this device does not own this application.",
        "Please ensure you are signed into the Play Store with the account used to download the app.",
        verdict,
      );
    }

    // C. Certificate Digest Check
    if (enforceCert) {
      const certs = appIntegrity?.certificateSha256Digest || [];
      const hasAuthorizedCert = certs.some((cert: string) =>
        getAuthorizedDigests().includes(cert)
      );

      if (!hasAuthorizedCert) {
        logger.error(`Play Integrity Failure: Unauthorized certificate. Got: ${certs.join(", ")} (Enforced)`);
        return failureResult(
          "App signing certificate mismatch",
          "The application's digital signature does not match the official GhostClass release.",
          "This is a critical security risk. Please reinstall the app immediately from the Play Store.",
          verdict,
          true,
        );
      }
    }

    // D. Device Integrity Levels
    const deviceVerdicts = deviceIntegrity?.deviceRecognitionVerdict || [];
    
    if (enforceBasic && !deviceVerdicts.includes("MEETS_BASIC_INTEGRITY")) {
      logger.error(`Play Integrity Failure: Device does not meet BASIC_INTEGRITY: ${deviceVerdicts.join(", ")} (Enforced)`);
      return failureResult(
        "Device failed basic integrity check",
        "Your device failed basic system integrity checks. This often indicates a custom ROM or severe system modifications.",
        "GhostClass cannot run on this device configuration. Please use a certified Android device. If this issue persists, please contact support.",
        verdict,
      );
    }

    if (enforceDevice && !deviceVerdicts.includes("MEETS_DEVICE_INTEGRITY")) {
      logger.error(`Play Integrity Failure: Device does not meet DEVICE_INTEGRITY: ${deviceVerdicts.join(", ")} (Enforced)`);
      return failureResult(
        "Device failed verified device check",
        "Your device failed the verified device check. This usually means the device is rooted or has an unlocked bootloader.",
        "Please disable root access and lock your bootloader to use GhostClass. If this issue persists, please contact support.",
        verdict,
      );
    }

    if (enforceStrong && !deviceVerdicts.includes("MEETS_STRONG_INTEGRITY")) {
      logger.error(`Play Integrity Failure: Device does not meet STRONG_INTEGRITY: ${deviceVerdicts.join(", ")} (Enforced)`);
      return failureResult(
        "Device failed hardware-backed integrity check",
        "Your device does not meet strong, hardware-backed integrity requirements.",
        "GhostClass requires a secure device with a working Trusted Execution Environment (TEE). If this issue persists, please contact support.",
        verdict,
      );
    }
    
    // D. Nonce verification (Replay Protection)
    const receivedNonce = verdict.requestDetails?.nonce;
    
    if (expectedNonce) {
      if (receivedNonce !== expectedNonce) {
        return failureResult(
          "Integrity handshake replay detected",
          "The security handshake nonce did not match the expected value.",
          "Please restart the app and try again.",
          verdict,
        );
      }
    } else if (receivedNonce) {
      // If no explicit expectedNonce, validate the signed nonce statelessly
      const isNonceValid = validateSignedNonce(receivedNonce);
      if (!isNonceValid) {
        return failureResult(
          "Integrity handshake invalid or expired",
          "The security handshake token is malformed, expired, or was not issued by our server.",
          "Please restart the app and try again.",
          verdict,
        );
      }
    } else if (process.env.ENFORCE_PLAY_INTEGRITY_NONCE === "true") {
       return failureResult(
          "Missing integrity nonce",
          "The security handshake did not include a required cryptographic nonce.",
          "Please restart the app and try again.",
          verdict,
       );
    }

    return { isValid: true, verdict };
  } catch (error: any) {
    logger.error("Play Integrity: Verification exception:", error.message);
    if (error.response?.data) {
      logger.error("Play Integrity: API Error Details:", JSON.stringify(error.response.data));
    }
    return { 
      isValid: false, 
      error: "Integrity verification failed",
      reason: `An internal error occurred while verifying device integrity: ${error.message}`,
      action: "Please check your network and try again. If the issue persists after repeated attempts, please contact support."
    };
  }
}
