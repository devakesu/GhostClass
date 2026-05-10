import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../route';
import { getAppCheck } from '@/lib/firebase/admin';

vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((data) => ({
      data,
      status: 200,
    })),
  },
}));

vi.mock('@/lib/firebase/admin', () => ({
  getAppCheck: vi.fn(),
}));

describe('GET /api/security/attestation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns failure when App Check token is missing', async () => {
    const req = {
      headers: {
        get: vi.fn().mockReturnValue(null),
      },
    } as any;

    const response = await GET(req) as any;

    expect(response.data.verified).toBe(false);
    expect(response.data.appCheckError).toBe('Missing App Check token');
  });

  it('verifies App Check token when provided', async () => {
    const authorizedAppId = "1:424804867878:android:015bb34927f1dd8e21abe7";
    const req = {
      headers: {
        get: vi.fn().mockImplementation((name) => {
          if (name === 'X-Firebase-AppCheck') return 'ac-token';
          return null;
        }),
      },
    } as any;

    const mockAppCheck = {
      verifyToken: vi.fn().mockResolvedValue({ appId: authorizedAppId }),
    };
    vi.mocked(getAppCheck).mockReturnValue(mockAppCheck as any);

    const response = await GET(req) as any;

    expect(response.data.verified).toBe(true);
    expect(response.data.appId).toBe(authorizedAppId);
    expect(response.data.appCheck).toBe(true);
  });

  it('handles App Check verification failure', async () => {
    const req = {
      headers: {
        get: vi.fn().mockImplementation((name) => {
          if (name === 'X-Firebase-AppCheck') return 'invalid-ac-token';
          return null;
        }),
      },
    } as any;

    const mockAppCheck = {
      verifyToken: vi.fn().mockRejectedValue(new Error('AC Token Invalid')),
    };
    vi.mocked(getAppCheck).mockReturnValue(mockAppCheck as any);

    const response = await GET(req) as any;

    expect(response.data.appCheck).toBe(false);
    expect(response.data.appCheckError).toBe('AC Token Invalid');
  });

  it('handles unauthorized App ID', async () => {
    const unauthorizedAppId = "1:wrong:android:id";
    const req = {
      headers: {
        get: vi.fn().mockImplementation((name) => {
          if (name === 'X-Firebase-AppCheck') return 'ac-token';
          return null;
        }),
      },
    } as any;

    const mockAppCheck = {
      verifyToken: vi.fn().mockResolvedValue({ appId: unauthorizedAppId }),
    };
    vi.mocked(getAppCheck).mockReturnValue(mockAppCheck as any);

    const response = await GET(req) as any;

    expect(response.data.verified).toBe(false);
    expect(response.data.criticalRisk).toBe(true);
    expect(response.data.appCheckError).toBe('Unauthorized App ID');
  });

  it('handles case where App Check verifier is unavailable', async () => {
     const req = {
      headers: {
        get: vi.fn().mockImplementation((name) => {
          if (name === 'X-Firebase-AppCheck') return 'ac-token';
          return null;
        }),
      },
    } as any;

    vi.mocked(getAppCheck).mockReturnValue(null as any);

    const response = await GET(req) as any;

    expect(response.data.appCheckError).toBe('App Check verifier unavailable');
  });
});
