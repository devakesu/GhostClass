import { NextResponse } from "next/server";
import { verifyAppCheckToken } from "@/lib/security/app-check";

export const dynamic = 'force-dynamic';

/**
 * Returns the decoded attestation details for the current request.
 * This is used by the mobile app to show build transparency details.
 */
export async function GET(req: Request) {
  const result = await verifyAppCheckToken(req);
  
  // Extract non-sensitive details for transparency
  let tokenDetails: Record<string, any> = {};
  if (result.integrity && typeof result.integrity === 'object') {
    const sensitiveKeys = ['iss', 'sub', 'aud', 'exp', 'iat', 'app_id'];
    tokenDetails = Object.keys(result.integrity)
      .filter(key => !sensitiveKeys.includes(key))
      .reduce((obj, key) => {
        obj[key] = (result.integrity as any)[key];
        return obj;
      }, {} as Record<string, any>);
      
    // Add issuer for context
    if ((result.integrity as any).iss) {
      tokenDetails.issuer = (result.integrity as any).iss;
    }
  }

  return NextResponse.json({
    verified: result.isValid,
    criticalRisk: result.criticalRisk || false,
    appCheck: result.isValid,
    appCheckCriticalRisk: result.criticalRisk || false,
    appCheckError: result.error,
    appId: (result.integrity as any)?.appId,
    details: tokenDetails,
    enforced: process.env.ENFORCE_APP_CHECK === "true",
    reason: result.reason || "Device verified successfully",
    action: result.isValid ? "No action required." : (result.action || "Please try again."),
    type: "security",
    timestamp: new Date().toISOString(),
  });
}
