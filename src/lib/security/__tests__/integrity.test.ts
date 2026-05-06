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
    mockDecode.mockResolvedValueOnce({ data: {} });

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
    });

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
    });

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
    });

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
    });

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
    });

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
    });

    const result = await verifyPlayIntegrity(mockToken, 'expected-nonce');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Integrity handshake replay detected');
  });

  it('handles exceptions from Play Integrity API', async () => {
    const mockDecode = vi.mocked(google.playintegrity('v1').v1.decodeIntegrityToken);
    mockDecode.mockRejectedValueOnce(new Error('API failure'));

    const result = await verifyPlayIntegrity(mockToken);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Integrity verification failed');
    expect(result.reason).toContain('API failure');
  });
});
