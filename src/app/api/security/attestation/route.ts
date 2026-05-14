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
  let tokenDetails: Record<string, unknown> = {};
  let appIdVal: unknown = undefined;

  if (result.integrity && typeof result.integrity === 'object') {
    const payload = result.integrity as Record<string, unknown>;
    appIdVal = payload.appId;
    const sensitiveKeys = new Set(['iss', 'sub', 'aud', 'exp', 'iat', 'app_id']);
    tokenDetails = Object.fromEntries(
      Object.entries(payload).filter(([key]) => !sensitiveKeys.has(key))
    );
      
    // Add issuer for context
    if (typeof payload.iss === 'string') {
      tokenDetails.issuer = payload.iss;
    }
  }

  return NextResponse.json({
    verified: result.isValid,
    criticalRisk: result.criticalRisk || false,
    appCheck: result.isValid,
    appCheckCriticalRisk: result.criticalRisk || false,
    appCheckError: result.error,
    appId: appIdVal,
    details: tokenDetails,
    enforced: process.env.ENFORCE_APP_CHECK === "true",
    reason: result.reason || "Device verified successfully",
    action: result.isValid ? "No action required." : (result.action || "Please try again."),
    type: "security",
    timestamp: new Date().toISOString(),
  });
}
