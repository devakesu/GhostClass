import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '../route';
import crypto from 'crypto';
import { logger } from '@/lib/logger';

vi.mock('@/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((data, init) => ({
      data,
      status: init?.status || 200,
    })),
  },
}));

describe('GET /api/security/nonce', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('generates a valid stateless nonce', async () => {
    process.env.MOBILE_API_SECRET = 'test-secret';
    
    const response = await GET() as any;

    expect(response.status).toBe(200);
    expect(response.data.nonce).toBeDefined();
    expect(response.data.issued_at).toBeDefined();
    
    // Verify nonce format
    const decoded = Buffer.from(response.data.nonce, 'base64url').toString('utf-8');
    const [random, timestamp, signature] = decoded.split(':');
    
    expect(random).toHaveLength(32); // 16 bytes hex
    expect(parseInt(timestamp)).toBeLessThanOrEqual(Date.now());
    expect(signature).toHaveLength(64); // sha256 hex
  });

  it('warns if MOBILE_API_SECRET is missing', async () => {
    delete process.env.MOBILE_API_SECRET;
    
    await GET();

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('MOBILE_API_SECRET not set'));
  });

  it('returns 500 on internal error', async () => {
    vi.spyOn(crypto, 'randomBytes').mockImplementationOnce(() => {
      throw new Error('Crypto Error');
    });

    const response = await GET() as any;

    expect(response.status).toBe(500);
    expect(response.data.error).toBe('Internal Server Error');
    expect(logger.error).toHaveBeenCalled();
  });
});
