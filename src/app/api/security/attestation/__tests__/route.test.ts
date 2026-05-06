import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../route';
import { getAppCheck } from '@/lib/firebase/admin';
import { verifyPlayIntegrity } from '@/lib/security/integrity';

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

vi.mock('@/lib/security/integrity', () => ({
  verifyPlayIntegrity: vi.fn(),
}));

describe('GET /api/security/attestation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns verification details when both tokens are missing', async () => {
    const req = {
      headers: {
        get: vi.fn().mockReturnValue(null),
      },
    } as any;

    const response = await GET(req) as any;

    expect(response.data.verified).toBe(false);
    expect(response.data.appCheckError).toBe('Missing App Check token');
    expect(response.data.playIntegrityError).toBe('Missing Play Integrity token');
  });

  it('verifies App Check and Play Integrity tokens when provided', async () => {
    const req = {
      headers: {
        get: vi.fn().mockImplementation((name) => {
          if (name === 'X-Firebase-AppCheck') return 'ac-token';
          if (name === 'X-Play-Integrity') return 'pi-token';
          return null;
        }),
      },
    } as any;

    const mockAppCheck = {
      verifyToken: vi.fn().mockResolvedValue({ appId: 'test-app-id' }),
    };
    vi.mocked(getAppCheck).mockReturnValue(mockAppCheck as any);

    vi.mocked(verifyPlayIntegrity).mockResolvedValue({
      isValid: true,
      verdict: { healthy: true },
    });

    const response = await GET(req) as any;

    expect(response.data.verified).toBe(true);
    expect(response.data.appId).toBe('test-app-id');
    expect(response.data.playIntegrityVerified).toBe(true);
    expect(response.data.details).toEqual({ healthy: true });
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

  it('handles Play Integrity verification failure', async () => {
    const req = {
      headers: {
        get: vi.fn().mockImplementation((name) => {
          if (name === 'X-Play-Integrity') return 'invalid-pi-token';
          return null;
        }),
      },
    } as any;

    vi.mocked(verifyPlayIntegrity).mockResolvedValue({
      isValid: false,
      error: 'PI Token Invalid',
      reason: 'Compromised device',
      action: 'Reinstall app',
    });

    const response = await GET(req) as any;

    expect(response.data.playIntegrityVerified).toBe(false);
    expect(response.data.playIntegrityError).toBe('PI Token Invalid');
    expect(response.data.reason).toBe('Compromised device');
  });

  it('handles Play Integrity internal exception', async () => {
    const req = {
      headers: {
        get: vi.fn().mockImplementation((name) => {
          if (name === 'X-Play-Integrity') return 'pi-token';
          return null;
        }),
      },
    } as any;

    vi.mocked(verifyPlayIntegrity).mockRejectedValue(new Error('Internal Crash'));

    const response = await GET(req) as any;

    expect(response.data.playIntegrityVerified).toBe(false);
    expect(response.data.playIntegrityError).toBe('Internal Crash');
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
