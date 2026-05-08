import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAppCheck } from '../firebase/admin';
import * as admin from 'firebase-admin';
import { logger } from '../logger';

vi.mock('firebase-admin', () => {
  const mockApp = {
    // Add methods if needed
  };
  const mockAppCheck = {
    verifyToken: vi.fn(),
  };
  
  return {
    apps: [],
    app: vi.fn(() => mockApp),
    initializeApp: vi.fn(() => mockApp),
    appCheck: vi.fn(() => mockAppCheck),
    credential: {
      cert: vi.fn(),
    },
  };
});

vi.mock('../logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('firebase-admin', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    // @ts-ignore
    admin.apps = [];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getAppCheck', () => {
    it('returns null if GOOGLE_SERVICE_ACCOUNT_JSON is missing', () => {
      delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
      const verifier = getAppCheck();
      expect(verifier).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('GOOGLE_SERVICE_ACCOUNT_JSON not configured'));
    });

    it('initializes firebase and returns verifier when credentials are provided', async () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: 'test-project' });
      
      const verifier = getAppCheck();
      
      expect(verifier).not.toBeNull();
      expect(admin.initializeApp).toHaveBeenCalled();
      
      const mockVerifyToken = vi.mocked(admin.appCheck().verifyToken);
      mockVerifyToken.mockResolvedValueOnce({ appId: 'test-app', token: 'mock-token' } as any);

      const result = await verifier!.verifyToken('token');
      expect(result.appId).toBe('test-app');
    });

    it('uses existing firebase app if already initialized', () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: 'test-project' });
      // @ts-ignore
      admin.apps = [{ name: 'default' }];
      
      getAppCheck();
      
      expect(admin.app).toHaveBeenCalled();
      expect(admin.initializeApp).not.toHaveBeenCalled();
    });

    it('handles base64 encoded credentials', () => {
      const credentials = { project_id: 'test-project' };
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON = Buffer.from(JSON.stringify(credentials)).toString('base64');
      
      getAppCheck();
      
      expect(admin.credential.cert).toHaveBeenCalledWith(credentials);
    });

    it('returns null if initialization fails', () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON = 'invalid-json';
      
      const verifier = getAppCheck();
      
      expect(verifier).toBeNull();
      expect(logger.error).toHaveBeenCalled();
    });

    it('returns null if token verification fails catastrophically', async () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: 'test-project' });
      // @ts-ignore
      admin.apps = [{ name: 'default' }];
      vi.mocked(admin.app).mockImplementationOnce(() => { throw new Error('Fatal'); });
      
      const verifier = getAppCheck();
      expect(verifier).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('initialization failed'), expect.any(Error));
    });

    it('rethrows and logs error on token verification failure', async () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: 'test-project' });
      const verifier = getAppCheck();
      
      const mockVerifyToken = vi.mocked(admin.appCheck().verifyToken);
      mockVerifyToken.mockRejectedValueOnce(new Error('Invalid Token'));

      await expect(verifier!.verifyToken('token')).rejects.toThrow('Invalid Token');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('verification failed'), expect.any(Error));
    });
  });
});
