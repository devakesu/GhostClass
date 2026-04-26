import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { withSecurity } from "@/lib/security/app-check";

/**
 * GET /api/security/nonce
 * 
 * Generates a one-time random nonce for Play Integrity / DeviceCheck attestation.
 * In a production environment, this nonce should be stored in a short-lived cache 
 * (e.g. Redis) and marked as used after the first attestation check.
 */
export const GET = withSecurity(async function GET() {
  try {
    // Generate 32 bytes of secure randomness
    const nonce = crypto.randomBytes(32).toString('base64url');
    
    return NextResponse.json({
      nonce,
      issued_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to generate security nonce:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
});
