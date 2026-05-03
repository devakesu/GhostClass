import { NextResponse } from "next/server";
import { withSecurity } from "@/lib/security/app-check";
import { headers } from "next/headers";

export const dynamic = 'force-dynamic';

/**
 * Returns the decoded attestation details for the current request.
 * This is used by the mobile app to show build transparency details.
 */
export const GET = withSecurity(async (req) => {
  const headerList = await headers();
  const appCheckToken = headerList.get("X-Firebase-AppCheck");
  const playIntegrityToken = headerList.get("X-Play-Integrity");

  // withSecurity already performs the verification and returns the integrity verdict 
  // if we were to intercept it. But here we can just re-verify or rely on the fact 
  // that withSecurity would have blocked it if it was invalid (if enforcement is on).
  
  // To get the details back to the app, we need to return what was verified.
  // We can call verifyAppCheckToken directly here to get the results.
  const { verifyAppCheckToken } = await import("@/lib/security/app-check");
  const result = await verifyAppCheckToken(req);

  return NextResponse.json({
    verified: result.isValid,
    appCheck: !!appCheckToken,
    playIntegrity: !!playIntegrityToken,
    details: result.integrity,
    timestamp: new Date().toISOString(),
  });
});
