import { NextResponse } from "next/server";
import { getAppCheck } from "@/lib/firebase/admin";
import { verifyPlayIntegrity } from "@/lib/security/integrity";

export const dynamic = 'force-dynamic';

/**
 * Returns the decoded attestation details for the current request.
 * This is used by the mobile app to show build transparency details.
 */
export async function GET(req: Request) {
  const headerList = req.headers;
  const appCheckToken = headerList.get("X-Firebase-AppCheck");
  const playIntegrityToken = headerList.get("X-Play-Integrity");
  const authorizedAppIds = [
    process.env.FIREBASE_APP_ID_ANDROID || "1:424804867878:android:015bb34927f1dd8e21abe7",
    process.env.FIREBASE_APP_ID_IOS || "1:424804867878:ios:43e6f61b15e0954321abe7",
  ];

  const appCheck = getAppCheck();
  let appCheckVerified = false;
  let appCheckError: string | undefined;
  let appCheckCriticalRisk = false;
  let appId: string | undefined;

  if (!appCheckToken) {
    appCheckError = "Missing App Check token";
  } else if (!appCheck) {
    appCheckError = "App Check verifier unavailable";
  } else {
    try {
      const decoded = await appCheck.verifyToken(appCheckToken);
      appCheckVerified = true;
      appId = decoded.appId;
      if (!authorizedAppIds.includes(appId)) {
        appCheckVerified = false;
        appCheckCriticalRisk = true;
        appCheckError = "Unauthorized App ID";
      }
    } catch (error: any) {
      appCheckError = error?.message || "App Check verification failed";
    }
  }

  let playIntegrityResult: {
    isValid: boolean;
    error?: string;
    reason?: string;
    action?: string;
    criticalRisk?: boolean;
    verdict?: any;
  } = {
    isValid: false,
    error: playIntegrityToken
      ? "Play Integrity verification unavailable"
      : "Missing Play Integrity token",
    verdict: null,
  };

  if (playIntegrityToken) {
    try {
      playIntegrityResult = await verifyPlayIntegrity(playIntegrityToken);
    } catch (error: any) {
      playIntegrityResult = {
        isValid: false,
        error: error?.message || "Play Integrity verification failed",
        verdict: null,
      };
    }
  }

  return NextResponse.json({
    verified: appCheckVerified && playIntegrityResult.isValid,
    criticalRisk: appCheckCriticalRisk || (playIntegrityResult.criticalRisk ?? false),
    appCheck: appCheckVerified,
    appCheckCriticalRisk,
    appCheckError,
    appId,
    playIntegrity: !!playIntegrityToken,
    playIntegrityVerified: playIntegrityResult.isValid,
    playIntegrityCriticalRisk: playIntegrityResult.criticalRisk ?? false,
    playIntegrityError: playIntegrityResult.error,
    reason: appCheckError || playIntegrityResult.reason || playIntegrityResult.error,
    action: appCheckCriticalRisk ?
      "Please reinstall the official GhostClass app from the app store." :
      (playIntegrityResult.action || "Please restart the app and try again."),
    details: playIntegrityResult.verdict,
    timestamp: new Date().toISOString(),
  });
}
