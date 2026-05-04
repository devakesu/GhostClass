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

  const appCheck = getAppCheck();
  let appCheckVerified = false;
  let appCheckError: string | undefined;
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
    } catch (error: any) {
      appCheckError = error?.message || "App Check verification failed";
    }
  }

  let playIntegrityResult: {
    isValid: boolean;
    error?: string;
    reason?: string;
    action?: string;
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
    appCheck: appCheckVerified,
    appCheckError,
    appId,
    playIntegrity: !!playIntegrityToken,
    playIntegrityVerified: playIntegrityResult.isValid,
    playIntegrityError: playIntegrityResult.error,
    reason: playIntegrityResult.reason,
    action: playIntegrityResult.action,
    details: playIntegrityResult.verdict,
    timestamp: new Date().toISOString(),
  });
}
