import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyPlayIntegrity } from '../integrity';
import { google } from 'googleapis';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/logger', () => ({
  logger: {
    dev: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('googleapis', () => {
  const mockDecode = vi.fn();
  const mockPlayIntegrity = {
    v1: {
      decodeIntegrityToken: mockDecode,
    },
  };

  return {
    google: {
      auth: {
        JWT: vi.fn().mockImplementation(function() {
          return {};
        }),
      },
      playintegrity: vi.fn().mockReturnValue(mockPlayIntegrity),
    },
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('verifyPlayIntegrity', () => {
  const originalEnv = process.env;
  const mockToken = 'mock-integrity-token';
  const mockServiceAccount = JSON.stringify({
    client_email: 'test@example.com',
    private_key: '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = mockServiceAccount;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns invalid if GOOGLE_SERVICE_ACCOUNT_JSON is missing', async () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const result = await verifyPlayIntegrity(mockToken);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Server configuration error');
  });

  it('returns invalid if token payload is empty', async () => {
    const mockDecode = vi.mocked(google.playintegrity('v1').v1.decodeIntegrityToken);
    mockDecode.mockResolvedValueOnce({ data: {} } as any);

    const result = await verifyPlayIntegrity(mockToken);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Empty integrity verdict');
  });

  it('successfully validates a healthy verdict', async () => {
    const mockDecode = vi.mocked(google.playintegrity('v1').v1.decodeIntegrityToken);
    mockDecode.mockResolvedValueOnce({
      data: {
        tokenPayloadExternal: {
          appIntegrity: { appRecognitionVerdict: 'PLAY_RECOGNIZED' },
          deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] },
          accountIntegrity: { appLicensingVerdict: 'LICENSED' },
        },
      },
    } as any);

    const result = await verifyPlayIntegrity(mockToken);
    expect(result.isValid).toBe(true);
  });

  it('fails if app is not recognized and enforcement is on', async () => {
    process.env.PLAY_INTEGRITY_ENFORCE_PLAY_RECOGNIZED = 'true';
    const mockDecode = vi.mocked(google.playintegrity('v1').v1.decodeIntegrityToken);
    mockDecode.mockResolvedValueOnce({
      data: {
        tokenPayloadExternal: {
          appIntegrity: { appRecognitionVerdict: 'UNEVALUATED' },
        },
      },
    } as any);

    const result = await verifyPlayIntegrity(mockToken);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('App not recognized by Play Store');
  });

  it('fails if device does not meet device integrity and enforcement is on', async () => {
    process.env.PLAY_INTEGRITY_ENFORCE_DEVICE = 'true';
    const mockDecode = vi.mocked(google.playintegrity('v1').v1.decodeIntegrityToken);
    mockDecode.mockResolvedValueOnce({
      data: {
        tokenPayloadExternal: {
          deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_BASIC_INTEGRITY'] },
        },
      },
    } as any);

    const result = await verifyPlayIntegrity(mockToken);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Device failed verified device check');
  });

  it('validates signed nonce statelessly', async () => {
    // Generate a valid signed nonce
    const random = 'rand123';
    const timestamp = Date.now();
    const secret = 'test-secret';
    process.env.MOBILE_API_SECRET = secret;
    
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${random}:${timestamp}`);
    const signature = hmac.digest('hex');
    const nonce = Buffer.from(`${random}:${timestamp}:${signature}`).toString('base64url');

    const mockDecode = vi.mocked(google.playintegrity('v1').v1.decodeIntegrityToken);
    mockDecode.mockResolvedValueOnce({
      data: {
        tokenPayloadExternal: {
          requestDetails: { nonce },
          appIntegrity: { appRecognitionVerdict: 'PLAY_RECOGNIZED' },
          deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] },
        },
      },
    } as any);

    const result = await verifyPlayIntegrity(mockToken);
    expect(result.isValid).toBe(true);
  });

  it('fails if signed nonce is expired', async () => {
    const random = 'rand123';
    const timestamp = Date.now() - (10 * 60 * 1000); // 10 minutes ago
    const secret = 'test-secret';
    process.env.MOBILE_API_SECRET = secret;
    
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${random}:${timestamp}`);
    const signature = hmac.digest('hex');
    const nonce = Buffer.from(`${random}:${timestamp}:${signature}`).toString('base64url');

    const mockDecode = vi.mocked(google.playintegrity('v1').v1.decodeIntegrityToken);
    mockDecode.mockResolvedValueOnce({
      data: {
        tokenPayloadExternal: {
          requestDetails: { nonce },
        },
      },
    } as any);

    const result = await verifyPlayIntegrity(mockToken);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Integrity handshake invalid or expired');
  });

  it('fails if nonce does not match expectedNonce', async () => {
    const mockDecode = vi.mocked(google.playintegrity('v1').v1.decodeIntegrityToken);
    mockDecode.mockResolvedValueOnce({
      data: {
        tokenPayloadExternal: {
          requestDetails: { nonce: 'wrong-nonce' },
        },
      },
    } as any);

    const result = await verifyPlayIntegrity(mockToken, 'expected-nonce');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Integrity handshake replay detected');
  });

  it('handles base64 encoded GOOGLE_SERVICE_ACCOUNT_JSON', async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = Buffer.from(mockServiceAccount).toString('base64');
    const mockDecode = vi.mocked(google.playintegrity('v1').v1.decodeIntegrityToken);
    mockDecode.mockResolvedValueOnce({
      data: {
        tokenPayloadExternal: {
          appIntegrity: { appRecognitionVerdict: 'PLAY_RECOGNIZED' },
          deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] },
        },
      },
    } as any);

    const result = await verifyPlayIntegrity(mockToken);
    expect(result.isValid).toBe(true);
  });

  it('fails if basic integrity is enforced and missing', async () => {
    process.env.PLAY_INTEGRITY_ENFORCE_BASIC = 'true';
    const mockDecode = vi.mocked(google.playintegrity('v1').v1.decodeIntegrityToken);
    mockDecode.mockResolvedValueOnce({
      data: {
        tokenPayloadExternal: {
          deviceIntegrity: { deviceRecognitionVerdict: ['NONE'] },
        },
      },
    } as any);

    const result = await verifyPlayIntegrity(mockToken);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Device failed basic integrity check');
  });

  it('fails if strong integrity is enforced and missing', async () => {
    process.env.PLAY_INTEGRITY_ENFORCE_STRONG = 'true';
    const mockDecode = vi.mocked(google.playintegrity('v1').v1.decodeIntegrityToken);
    mockDecode.mockResolvedValueOnce({
      data: {
        tokenPayloadExternal: {
          deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] },
        },
      },
    } as any);

    const result = await verifyPlayIntegrity(mockToken);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Device failed hardware-backed integrity check');
  });

  it('fails if app licensing is enforced and missing', async () => {
    process.env.PLAY_INTEGRITY_ENFORCE_LICENSED = 'true';
    const mockDecode = vi.mocked(google.playintegrity('v1').v1.decodeIntegrityToken);
    mockDecode.mockResolvedValueOnce({
      data: {
        tokenPayloadExternal: {
          accountIntegrity: { appLicensingVerdict: 'UNLICENSED' },
        },
      },
    } as any);

    const result = await verifyPlayIntegrity(mockToken);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('App not licensed for this user');
  });

  it('validates certificate digest when enforced', async () => {
    process.env.PLAY_INTEGRITY_ENFORCE_SIGNING_CERT = 'true';
    process.env.PLAY_INTEGRITY_CERT_SHA256 = 'valid-cert';
    
    const mockDecode = vi.mocked(google.playintegrity('v1').v1.decodeIntegrityToken);
    mockDecode.mockResolvedValueOnce({
      data: {
        tokenPayloadExternal: {
          appIntegrity: { 
            appRecognitionVerdict: 'PLAY_RECOGNIZED',
            certificateSha256Digest: ['valid-cert'] 
          },
          deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] },
        },
      },
    } as any);

    const result = await verifyPlayIntegrity(mockToken);
    expect(result.isValid).toBe(true);
  });

  it('fails if certificate digest mismatch and enforced', async () => {
    process.env.PLAY_INTEGRITY_ENFORCE_SIGNING_CERT = 'true';
    process.env.PLAY_INTEGRITY_CERT_SHA256 = 'valid-cert';
    
    const mockDecode = vi.mocked(google.playintegrity('v1').v1.decodeIntegrityToken);
    mockDecode.mockResolvedValueOnce({
      data: {
        tokenPayloadExternal: {
          appIntegrity: { 
            appRecognitionVerdict: 'PLAY_RECOGNIZED',
            certificateSha256Digest: ['invalid-cert'] 
          },
        },
      },
    } as any);

    const result = await verifyPlayIntegrity(mockToken);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('App signing certificate mismatch');
  });

  it('fails if nonce is required but missing', async () => {
    process.env.ENFORCE_PLAY_INTEGRITY_NONCE = 'true';
    const mockDecode = vi.mocked(google.playintegrity('v1').v1.decodeIntegrityToken);
    mockDecode.mockResolvedValueOnce({
      data: {
        tokenPayloadExternal: {
          appIntegrity: { appRecognitionVerdict: 'PLAY_RECOGNIZED' },
          deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] },
        },
      },
    } as any);

    const result = await verifyPlayIntegrity(mockToken);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Missing integrity nonce');
  });

  it('logs detailed API error response', async () => {
    const mockDecode = vi.mocked(google.playintegrity('v1').v1.decodeIntegrityToken);
    const apiError: any = new Error('API failure');
    apiError.response = { data: { error: 'detailed error' } };
    mockDecode.mockRejectedValueOnce(apiError);

    await verifyPlayIntegrity(mockToken);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('API Error Details:'), expect.stringContaining('detailed error'));
  });

  it('returns false for malformed nonce (catch block)', async () => {
    // A nonce that is valid base64 and has a valid timestamp, but will cause timingSafeEqual to throw due to length mismatch
    const timestamp = Date.now();
    const nonce = Buffer.from(`rand:${timestamp}:short-sig`).toString('base64url');
    const mockDecode = vi.mocked(google.playintegrity('v1').v1.decodeIntegrityToken);
    mockDecode.mockResolvedValueOnce({
      data: {
        tokenPayloadExternal: {
          requestDetails: { nonce },
        },
      },
    } as any);

    const result = await verifyPlayIntegrity(mockToken);
    expect(result.isValid).toBe(false);
  });
});
