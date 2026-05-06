import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyDeviceCheckToken } from '../device-check';
import { logger } from '@/lib/logger';
import { SignJWT, importPKCS8 } from 'jose';

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

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

vi.mock('jose', () => {
  const SignJWT = vi.fn().mockImplementation(function() {
    return {
      setProtectedHeader: vi.fn().mockReturnThis(),
      setIssuer: vi.fn().mockReturnThis(),
      setIssuedAt: vi.fn().mockReturnThis(),
      setExpirationTime: vi.fn().mockReturnThis(),
      sign: vi.fn().mockResolvedValue('mocked-jwt'),
    };
  });

  return {
    SignJWT,
    importPKCS8: vi.fn().mockResolvedValue('mocked-key'),
  };
});

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('verifyDeviceCheckToken', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.APPLE_DEVICE_CHECK_KEY_ID;
    delete process.env.APPLE_TEAM_ID;
    delete process.env.APPLE_BUNDLE_ID;
    delete process.env.APPLE_DEVICE_CHECK_PRIVATE_KEY_B64;
    delete process.env.ENFORCE_DEVICE_CHECK;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns invalid if token is missing', async () => {
    const result = await verifyDeviceCheckToken('');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Missing DeviceCheck token');
  });

  it('skips verification if credentials are missing and not enforced', async () => {
    const result = await verifyDeviceCheckToken('some-token');
    expect(result.isValid).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Missing required Apple credentials'));
  });

  it('returns invalid if credentials are missing and enforced', async () => {
    process.env.ENFORCE_DEVICE_CHECK = 'true';
    const result = await verifyDeviceCheckToken('some-token');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Server configuration error');
  });

  it('successfully validates a token with Apple API', async () => {
    process.env.APPLE_DEVICE_CHECK_KEY_ID = 'key-id';
    process.env.APPLE_TEAM_ID = 'team-id';
    process.env.APPLE_BUNDLE_ID = 'bundle-id';
    process.env.APPLE_DEVICE_CHECK_PRIVATE_KEY_B64 = Buffer.from('private-key').toString('base64');
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ valid: true, some: 'data' }),
      text: async () => JSON.stringify({ valid: true, some: 'data' }),
    });

    const result = await verifyDeviceCheckToken('valid-token');
    
    expect(result.isValid).toBe(true);
    expect(result.verdict).toEqual({ valid: true, some: 'data' });
  });

  it('returns invalid if Apple API returns 401', async () => {
    process.env.APPLE_DEVICE_CHECK_KEY_ID = 'key-id';
    process.env.APPLE_TEAM_ID = 'team-id';
    process.env.APPLE_BUNDLE_ID = 'bundle-id';
    process.env.APPLE_DEVICE_CHECK_PRIVATE_KEY_B64 = Buffer.from('private-key').toString('base64');
    
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    const result = await verifyDeviceCheckToken('invalid-token');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Device integrity check failed (authentication)');
  });

  it('returns invalid if Apple API returns 400', async () => {
    process.env.APPLE_DEVICE_CHECK_KEY_ID = 'key-id';
    process.env.APPLE_TEAM_ID = 'team-id';
    process.env.APPLE_BUNDLE_ID = 'bundle-id';
    process.env.APPLE_DEVICE_CHECK_PRIVATE_KEY_B64 = Buffer.from('private-key').toString('base64');
    
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'Bad Request',
    });

    const result = await verifyDeviceCheckToken('invalid-token');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Invalid device token');
  });

  it('handles other Apple API errors', async () => {
    process.env.APPLE_DEVICE_CHECK_KEY_ID = 'key-id';
    process.env.APPLE_TEAM_ID = 'team-id';
    process.env.APPLE_BUNDLE_ID = 'bundle-id';
    process.env.APPLE_DEVICE_CHECK_PRIVATE_KEY_B64 = Buffer.from('private-key').toString('base64');
    
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const result = await verifyDeviceCheckToken('some-token');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Device integrity verification failed');
  });

  it('enforces validation if ENFORCE_DEVICE_CHECK is true', async () => {
    process.env.APPLE_DEVICE_CHECK_KEY_ID = 'key-id';
    process.env.APPLE_TEAM_ID = 'team-id';
    process.env.APPLE_BUNDLE_ID = 'bundle-id';
    process.env.APPLE_DEVICE_CHECK_PRIVATE_KEY_B64 = Buffer.from('private-key').toString('base64');
    process.env.ENFORCE_DEVICE_CHECK = 'true';
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ valid: false }),
      text: async () => JSON.stringify({ valid: false }),
    });

    const result = await verifyDeviceCheckToken('invalid-token');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Device validation failed');
  });

  it('handles JWT creation failure', async () => {
    process.env.APPLE_DEVICE_CHECK_KEY_ID = 'key-id';
    process.env.APPLE_TEAM_ID = 'team-id';
    process.env.APPLE_BUNDLE_ID = 'bundle-id';
    process.env.APPLE_DEVICE_CHECK_PRIVATE_KEY_B64 = Buffer.from('private-key').toString('base64');
    
    vi.mocked(SignJWT).mockImplementationOnce(() => {
      throw new Error('JWT Error');
    });

    const result = await verifyDeviceCheckToken('some-token');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Device integrity verification failed');
  });

  it('handles importPKCS8 failure', async () => {
    process.env.APPLE_DEVICE_CHECK_KEY_ID = 'key-id';
    process.env.APPLE_TEAM_ID = 'team-id';
    process.env.APPLE_BUNDLE_ID = 'bundle-id';
    process.env.APPLE_DEVICE_CHECK_PRIVATE_KEY_B64 = Buffer.from('private-key').toString('base64');
    
    vi.mocked(importPKCS8).mockRejectedValueOnce(new Error('Import Error'));

    const result = await verifyDeviceCheckToken('some-token');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Device integrity verification failed');
  });
});
