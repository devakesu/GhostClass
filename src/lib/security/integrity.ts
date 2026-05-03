import { google } from "googleapis";
import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";


const getAuthorizedDigests = () => [
  process.env.PLAY_INTEGRITY_CERT_SHA256 || "PLACEHOLDER_SHA256_FINGERPRINT",
];

/**
 * Result of the integrity check
 */
export interface IntegrityResult {
  isValid: boolean;
  error?: string;
  verdict?: any;
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
    logger.error(
      "Play Integrity: Missing GOOGLE_SERVICE_ACCOUNT_JSON in environment",
    );
    // Fail-open in development if requested, otherwise block
    return process.env.NODE_ENV === "development"
      ? { isValid: true }
      : { isValid: false, error: "Server configuration error" };
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
      return { isValid: false, error: "Empty integrity verdict" };
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
    const isProd = process.env.NODE_ENV === "production";
    if (enforceRecognized && appIntegrity?.appRecognitionVerdict !== "PLAY_RECOGNIZED") {
      // In development/local testing, the app is often UNEVALUATED because it's not from the Play Store.
      // We skip this check group to allow developers to run the app with integrity active.
      if (!isProd) {
        logger.info(`Play Integrity: Skipping appRecognitionVerdict check (${appIntegrity?.appRecognitionVerdict}) in development.`);
      } else {
        logger.error(`Play Integrity Failure: appRecognitionVerdict is ${appIntegrity?.appRecognitionVerdict} (Enforced)`);
        return { isValid: false, error: "App not recognized by Play Store" };
      }
    }

    // B. App Licensing Verdict
    if (enforceLicensed && accountIntegrity?.appLicensingVerdict !== "LICENSED") {
      logger.error(`Play Integrity Failure: appLicensingVerdict is ${accountIntegrity?.appLicensingVerdict} (Enforced)`);
      return { isValid: false, error: "App not licensed for this user" };
    }

    // C. Certificate Digest Check
    if (enforceCert) {
      const certs = appIntegrity?.certificateSha256Digest || [];
      const hasAuthorizedCert = certs.some((cert: string) =>
        getAuthorizedDigests().includes(cert)
      );

      if (!hasAuthorizedCert) {
        if (!isProd) {
          logger.info(`Play Integrity: Skipping certificate check (No match for: ${certs.join(", ")}) in development.`);
        } else {
          logger.error(`Play Integrity Failure: Unauthorized certificate. Got: ${certs.join(", ")} (Enforced)`);
          return { isValid: false, error: "App signing certificate mismatch" };
        }
      }
    }

    // D. Device Integrity Levels
    const deviceVerdicts = deviceIntegrity?.deviceRecognitionVerdict || [];
    
    if (enforceBasic && !deviceVerdicts.includes("MEETS_BASIC_INTEGRITY")) {
      if (!isProd) {
        logger.info(`Play Integrity: Skipping BASIC_INTEGRITY check (${deviceVerdicts.join(", ")}) in development.`);
      } else {
        logger.error(`Play Integrity Failure: Device does not meet BASIC_INTEGRITY: ${deviceVerdicts.join(", ")} (Enforced)`);
        return { isValid: false, error: "Device failed basic integrity check" };
      }
    }

    if (enforceDevice && !deviceVerdicts.includes("MEETS_DEVICE_INTEGRITY")) {
      logger.error(`Play Integrity Failure: Device does not meet DEVICE_INTEGRITY: ${deviceVerdicts.join(", ")} (Enforced)`);
      return { isValid: false, error: "Device failed verified device check" };
    }

    if (enforceStrong && !deviceVerdicts.includes("MEETS_STRONG_INTEGRITY")) {
      logger.error(`Play Integrity Failure: Device does not meet STRONG_INTEGRITY: ${deviceVerdicts.join(", ")} (Enforced)`);
      return { isValid: false, error: "Device failed hardware-backed integrity check" };
    }
    
    // D. Nonce verification (Replay Protection)
    if (expectedNonce) {
      const receivedNonce = verdict.requestDetails?.nonce;
      if (receivedNonce !== expectedNonce) {
        return { isValid: false, error: "Integrity handshake replay detected" };
      }
    }

    return { isValid: true, verdict };
  } catch (error: any) {
    logger.error("Play Integrity: Verification exception:", error.message);
    if (error.response?.data) {
      logger.error("Play Integrity: API Error Details:", JSON.stringify(error.response.data));
    }
    Sentry.captureException(error, {
      tags: { type: "play_integrity_failure" },
    });
    return { isValid: false, error: "Integrity verification failed" };
  }
}
