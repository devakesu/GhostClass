import { NextResponse } from "next/server";
import { getJwks } from "@/lib/security/jwks";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const revalidate = 3600; // Cache for 1 hour

/**
 * GET /api/.well-known/jwks.json
 * 
 * Returns the JSON Web Key Set (JWKS) containing the public RSA keys 
 * used by clients (like the Flutter mobile app) to verify and wrap 
 * session keys for JWE encryption.
 */
export async function GET() {
  try {
    const jwks = await getJwks();
    
    return NextResponse.json(jwks, {
      headers: {
        "Content-Type": "application/jwk-set+json",
        "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    logger.error("JWKS endpoint failed:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
