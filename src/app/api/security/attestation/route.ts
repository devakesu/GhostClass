import { NextResponse } from "next/server";
import { getAppCheck } from "@/lib/firebase/admin";

export const dynamic = 'force-dynamic';

/**
 * Returns the decoded attestation details for the current request.
 * This is used by the mobile app to show build transparency details.
 */
export async function GET(req: Request) {
  const headerList = req.headers;
  const appCheckToken = headerList.get("X-Firebase-AppCheck");
  const authorizedAppIds = [
    process.env.FIREBASE_APP_ID_ANDROID || "1:424804867878:android:015bb34927f1dd8e21abe7",
    process.env.FIREBASE_APP_ID_IOS || "1:424804867878:ios:43e6f61b15e0954321abe7",
  ];

  const appCheck = getAppCheck();
  let appCheckVerified = false;
  let appCheckError: string | undefined;
  let appCheckCriticalRisk = false;
  let appId: string | undefined;
  let tokenDetails: Record<string, any> = {};

  if (!appCheckToken) {
    appCheckError = "Missing App Check token";
  } else if (!appCheck) {
    appCheckError = "App Check verifier unavailable";
  } else {
    try {
      const decoded = await appCheck.verifyToken(appCheckToken);
      appCheckVerified = true;
      appId = decoded.appId;
      
      // Extract all non-sensitive claims from the decoded token for transparency.
      // We exclude standard JWT claims (iss, sub, aud, exp, iat) to focus on attestation data.
      if (decoded.token) {
        const sensitiveKeys = ['iss', 'sub', 'aud', 'exp', 'iat', 'app_id'];
        tokenDetails = Object.keys(decoded.token)
          .filter(key => !sensitiveKeys.includes(key))
          .reduce((obj, key) => {
            obj[key] = decoded.token![key];
            return obj;
          }, {} as Record<string, any>);

        // Add issuer for context (helps distinguish between Debug and Production providers)
        tokenDetails.issuer = decoded.token.iss;
      }
      
      if (!authorizedAppIds.includes(appId)) {
        appCheckVerified = false;
        appCheckCriticalRisk = true;
        appCheckError = "Unauthorized App ID";
      }
    } catch (error: any) {
      appCheckError = error?.message || "App Check verification failed";
    }
  }

  return NextResponse.json({
    verified: appCheckVerified,
    criticalRisk: appCheckCriticalRisk,
    appCheck: appCheckVerified,
    appCheckCriticalRisk,
    appCheckError,
    appId,
    details: tokenDetails,
    enforced: process.env.ENFORCE_APP_CHECK === "true",
    reason: appCheckError || "Device verified successfully",
    action: appCheckCriticalRisk ?
      "Please reinstall the official GhostClass app from the app store." :
      (appCheckVerified ? "No action required." : "Please ensure you have a stable internet connection."),
    timestamp: new Date().toISOString(),
  });
}
