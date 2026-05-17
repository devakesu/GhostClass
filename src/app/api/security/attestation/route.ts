import { NextResponse } from "next/server";
import { verifyAppCheckToken } from "@/lib/security/app-check";

export const dynamic = 'force-dynamic';

function isVersionOlder(current: string, target: string): boolean {
  const currentParts = current.split('.').map(e => parseInt(e, 10) || 0);
  const targetParts = target.split('.').map(e => parseInt(e, 10) || 0);

  const [c0 = 0, c1 = 0, c2 = 0] = currentParts;
  const [t0 = 0, t1 = 0, t2 = 0] = targetParts;

  if (c0 < t0) return true;
  if (c0 > t0) return false;
  if (c1 < t1) return true;
  if (c1 > t1) return false;
  if (c2 < t2) return true;
  if (c2 > t2) return false;

  return false;
}

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

  const minVersion = process.env.MIN_APP_VERSION || "3.0.8";
  let latestVersion = process.env.NEXT_PUBLIC_APP_VERSION || "3.0.8";

  if (isVersionOlder(latestVersion, minVersion)) {
    latestVersion = minVersion;
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
    latestVersion,
    minVersion,
    type: "security",
    timestamp: new Date().toISOString(),
  });
}
