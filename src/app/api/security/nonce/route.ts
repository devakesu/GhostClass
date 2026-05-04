import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { logger } from '@/lib/logger';

/**
 * GET /api/security/nonce
 * 
 * Generates a one-time random nonce for Play Integrity / DeviceCheck attestation.
 * PUBLIC endpoint - does not require authentication.
 * Uses a stateless signed format: base64(random:timestamp:signature)
 */
export const GET = async function GET() {
  try {
    const secret = process.env.MOBILE_API_SECRET || 'fallback-security-secret';
    if (!process.env.MOBILE_API_SECRET) {
      logger.warn('Security: MOBILE_API_SECRET not set, using fallback for nonce signing');
    }

    const random = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now().toString();
    
    // Create HMAC signature
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${random}:${timestamp}`);
    const signature = hmac.digest('hex');

    // Combine into a single stateless token
    const nonce = Buffer.from(`${random}:${timestamp}:${signature}`).toString('base64url');
    
    return NextResponse.json({
      nonce,
      issued_at: new Date(parseInt(timestamp)).toISOString(),
    });
  } catch (error) {
    logger.error('Failed to generate security nonce:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
};
