import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../route';
import { getJwks } from '@/lib/security/jwks';
import { logger } from '@/lib/logger';

vi.mock('@/lib/security/jwks', () => ({
  getJwks: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((data, init) => ({
      data,
      status: init?.status || 200,
      headers: init?.headers || {},
    })),
  },
}));

describe('GET /api/.well-known/jwks.json', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns JWKS with correct headers', async () => {
    const mockJwks = { keys: [{ kid: '1', kty: 'RSA' }] };
    vi.mocked(getJwks).mockResolvedValue(mockJwks as any);

    const response = await GET() as any;

    expect(response.status).toBe(200);
    expect(response.data).toEqual(mockJwks);
    expect(response.headers['Content-Type']).toBe('application/jwk-set+json');
    expect(response.headers['Cache-Control']).toContain('public');
  });

  it('returns 500 if JWKS generation fails', async () => {
    vi.mocked(getJwks).mockRejectedValue(new Error('JWKS Error'));

    const response = await GET() as any;

    expect(response.status).toBe(500);
    expect(response.data.error).toBe('Internal Server Error');
    expect(logger.error).toHaveBeenCalled();
  });
});
