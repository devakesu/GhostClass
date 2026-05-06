import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../route';
import { getAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

// Mock withSecurity to just call the handler directly
vi.mock('@/lib/security/app-check', () => ({
  withSecurity: (handler: any) => handler,
}));

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((data, init) => ({
      data,
      status: init?.status || 200,
    })),
  },
}));

describe('POST /api/user/accept-terms', () => {
  const mockSupabaseAdmin = {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: vi.fn().mockImplementation((onFulfilled) => {
        return Promise.resolve({ error: null }).then(onFulfilled);
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAdminClient).mockReturnValue(mockSupabaseAdmin as any);
  });

  it('returns 401 if Authorization header is missing', async () => {
    const req = {
      headers: {
        get: vi.fn().mockReturnValue(null),
      },
    } as any;

    const response = await POST(req, {}) as any;

    expect(response.status).toBe(401);
    expect(response.data.error).toBe('Unauthorized');
  });

  it('returns 401 if session is invalid', async () => {
    const req = {
      headers: {
        get: vi.fn().mockReturnValue('Bearer invalid-token'),
      },
    } as any;

    mockSupabaseAdmin.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('Invalid') });

    const response = await POST(req, {}) as any;

    expect(response.status).toBe(401);
    expect(response.data.error).toBe('Invalid session');
  });

  it('successfully updates terms for an authorized user', async () => {
    const req = {
      headers: {
        get: vi.fn().mockReturnValue('Bearer valid-token'),
      },
      json: vi.fn().mockResolvedValue({ version: '1.0' }),
    } as any;

    mockSupabaseAdmin.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'user-123' } }, error: null });
    
    // Reset then for success
    mockSupabaseAdmin.then.mockImplementationOnce((onFulfilled: any) => {
        return Promise.resolve({ error: null }).then(onFulfilled);
    });

    const response = await POST(req, {}) as any;

    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);
    expect(mockSupabaseAdmin.update).toHaveBeenCalledWith(expect.objectContaining({ terms_version: '1.0' }));
    expect(mockSupabaseAdmin.eq).toHaveBeenCalledWith('auth_id', 'user-123');
  });

  it('returns 400 if version is missing', async () => {
    const req = {
      headers: {
        get: vi.fn().mockReturnValue('Bearer valid-token'),
      },
      json: vi.fn().mockResolvedValue({}),
    } as any;

    mockSupabaseAdmin.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'user-123' } }, error: null });

    const response = await POST(req, {}) as any;

    expect(response.status).toBe(400);
    expect(response.data.error).toBe('Version is required');
  });

  it('returns 400 if version format is invalid', async () => {
    const req = {
      headers: {
        get: vi.fn().mockReturnValue('Bearer valid-token'),
      },
      json: vi.fn().mockResolvedValue({ version: '!!!' }),
    } as any;

    mockSupabaseAdmin.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'user-123' } }, error: null });

    const response = await POST(req, {}) as any;

    expect(response.status).toBe(400);
    expect(response.data.error).toBe('Invalid version format');
  });

  it('returns 500 if database update fails', async () => {
    const req = {
      headers: {
        get: vi.fn().mockReturnValue('Bearer valid-token'),
      },
      json: vi.fn().mockResolvedValue({ version: '1.0' }),
    } as any;

    mockSupabaseAdmin.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'user-123' } }, error: null });
    
    mockSupabaseAdmin.then.mockImplementationOnce((onFulfilled: any) => {
        return Promise.resolve({ error: new Error('DB Error') }).then(onFulfilled);
    });

    const response = await POST(req, {}) as any;

    expect(response.status).toBe(500);
    expect(response.data.error).toBe('Failed to update terms acceptance');
    expect(logger.error).toHaveBeenCalled();
  });

  it('handles malformed JSON body', async () => {
    const req = {
      headers: {
        get: vi.fn().mockReturnValue('Bearer valid-token'),
      },
      json: vi.fn().mockRejectedValue(new Error('Parse Error')),
    } as any;

    mockSupabaseAdmin.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'user-123' } }, error: null });

    const response = await POST(req, {}) as any;

    expect(response.status).toBe(400);
    expect(response.data.error).toBe('Invalid request body');
    expect(logger.warn).toHaveBeenCalled();
  });
});
