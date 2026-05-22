import { describe, it, expect, vi, beforeEach } from 'vitest';
import { performProfileSync } from '../sync';
import { getAdminClient } from '@/lib/supabase/admin';
import { egressFetch, redact } from '@/lib/utils.server';
import { calculateCurrentAcademicInfo } from '@/lib/logic/academic';
import { safeResponseJson } from '@/lib/json';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: vi.fn(),
}));

vi.mock('@/lib/utils.server', () => ({
  egressFetch: vi.fn(),
  redact: vi.fn((_type, val) => val),
}));

vi.mock('@/lib/crypto', () => ({
  encrypt: vi.fn((val) => ({ content: `enc_${val}`, iv: 'iv' })),
  decrypt: vi.fn((data: any) => data.content.replace('enc_', '')),
}));

vi.mock('@/lib/logic/academic', () => ({
  calculateCurrentAcademicInfo: vi.fn(),
}));

vi.mock('@/lib/json', () => ({
  safeResponseJson: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    dev: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('performProfileSync', () => {
  const mockToken = 'mock-token';
  const mockEzygoId = '12345';
  const mockAuthId = 'auth-67890';

  let mockSupabase: {
    from: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    or: ReturnType<typeof vi.fn>;
    is: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    data: any;
    error: any;
  };

  let lastTable = '';
  let lastSelect = '';

  beforeEach(() => {
    vi.clearAllMocks();
    lastTable = '';
    lastSelect = '';

    mockSupabase = {
      from: vi.fn().mockImplementation((table) => {
        lastTable = table;
        return mockSupabase;
      }),
      select: vi.fn().mockImplementation((sel) => {
        lastSelect = sel;
        return mockSupabase;
      }),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      data: null,
      error: null,
    };

    vi.mocked(getAdminClient).mockReturnValue(mockSupabase as unknown as ReturnType<typeof getAdminClient>);
    vi.mocked(calculateCurrentAcademicInfo).mockReturnValue({
      current_year: '2024-25',
      current_semester: 'odd',
    });
  });

  function createMockResponse(content: string, ok = true, status = 200): Response {
    return {
      ok,
      status,
      text: async () => content,
      json: async () => JSON.parse(content),
      clone: function() { return this; }
    } as unknown as Response;
  }

  it('performs a full profile sync successfully', async () => {
    // 1. Mock EzyGo Responses
    vi.mocked(egressFetch).mockImplementation(async (url: unknown) => {
      if (url === 'myprofile') {
        return createMockResponse('{"data": {"user_id": "12345", "username": "testuser", "full_name": "Test User"}}');
      }
      if (url === 'user/setting/default_semester') {
        return createMockResponse('Odd');
      }
      if (url === 'user/setting/default_academic_year') {
        return createMockResponse('2024-25');
      }
      if (url === 'institutionuser/courses/withusers') {
        return createMockResponse('[{"id": 101, "code": "CS101", "name": "Intro to CS", "usersubgroup": {"id": 201, "name": "Class A", "programme_config_group_id": 710, "usergroup": {"id": 301, "name": "Computer Science"}}}]');
      }
      if (url === 'institutionuser/myroles') {
        return createMockResponse('{"data": {"subgroupRoles": []}}');
      }
      return createMockResponse('', false, 404);
    });

    vi.mocked(safeResponseJson).mockImplementation(async (res: unknown) => {
      try {
        const text = await (res as Response).text();
        return JSON.parse(text);
      } catch {
        return null;
      }
    });

    // 2. Mock Supabase Responses
    mockSupabase.maybeSingle.mockResolvedValue({ data: null, error: null }); // existingUser
    mockSupabase.single.mockResolvedValue({ data: { id: 'uuid-123' }, error: null }); // classData

    const result = await performProfileSync(mockToken, mockEzygoId, mockAuthId);

    expect(result.id).toBe('12345');
    expect(result.profile.username).toBe('testuser');
    expect(result.profile.firstName).toBe('Test');
    expect(result.academic.semester).toBe('odd');
    expect(result.courses['CS101']).toBeDefined();
    expect(mockSupabase.upsert).toHaveBeenCalled();
  });

  it('handles EzyGo profile fetch failure', async () => {
    vi.mocked(egressFetch).mockResolvedValue(createMockResponse('', false, 500));

    await expect(performProfileSync(mockToken, mockEzygoId, mockAuthId)).rejects.toThrow('EzyGo Profile failed: 500');
  });

  it('handles missing EzyGo User ID', async () => {
    vi.mocked(egressFetch).mockImplementation(async (url: unknown) => {
      if (url === 'myprofile') {
        return createMockResponse('{"data": {}}');
      }
      return createMockResponse('{}');
    });
    vi.mocked(safeResponseJson).mockResolvedValue({});

    await expect(performProfileSync(mockToken, '', mockAuthId)).rejects.toThrow('Missing EzyGo User ID');
  });

  it('falls back to existing local data for phone, gender, and birth date', async () => {
    vi.mocked(egressFetch).mockImplementation(async (url: unknown) => {
      if (url === 'myprofile') {
        return createMockResponse('{"user_id": "12345"}');
      }
      return createMockResponse('{}');
    });
    vi.mocked(safeResponseJson).mockResolvedValue({ user_id: '12345' });

    mockSupabase.maybeSingle.mockResolvedValue({
      data: {
        first_name: 'LocalFirst',
        last_name: 'LocalLast',
        phone: 'enc_1234567890',
        phone_iv: 'iv',
        gender: 'enc_Male',
        gender_iv: 'iv',
        birth_date: 'enc_2000-01-01',
        birth_date_iv: 'iv',
      },
      error: null,
    });

    const result = await performProfileSync(mockToken, mockEzygoId, mockAuthId);

    expect(result.profile.firstName).toBe('LocalFirst');
    expect(result.profile.phone).toBe('1234567890');
    expect(result.profile.gender).toBe('Male');
    expect(result.profile.birthDate).toBe('2000-01-01');
  });

  it('handles course parsing errors gracefully', async () => {
    vi.mocked(egressFetch).mockImplementation(async (url: unknown) => {
      if (url === 'myprofile') {
        return createMockResponse('{"user_id": "12345"}');
      }
      if (url === 'institutionuser/courses/withusers') {
        return createMockResponse('INVALID_JSON');
      }
      return createMockResponse('{}');
    });
    
    vi.mocked(safeResponseJson).mockImplementation(async (res: unknown) => {
      const text = await (res as Response).text();
      if (text === 'INVALID_JSON') return null;
      try { return JSON.parse(text); } catch { return { user_id: '12345' }; }
    });

    const result = await performProfileSync(mockToken, mockEzygoId, mockAuthId);
    expect(result.courses).toEqual({});
  });

  it('performs a sync for the Even semester', async () => {
    vi.mocked(egressFetch).mockImplementation(async (url: unknown) => {
      if (url === 'myprofile') return createMockResponse('{"user_id": "12345"}');
      if (url === 'user/setting/default_semester') return createMockResponse('Even');
      return createMockResponse('{}');
    });
    vi.mocked(safeResponseJson).mockResolvedValue({ user_id: '12345' });

    const result = await performProfileSync(mockToken, mockEzygoId, mockAuthId);
    expect(result.academic.semester).toBe('even');
  });

  it('does not create a class from subgroupRoles when courses are empty', async () => {
    vi.mocked(egressFetch).mockImplementation(async (url: unknown) => {
      if (url === 'myprofile') return createMockResponse('{"user_id": "12345"}');
      if (url === 'institutionuser/courses/withusers') return createMockResponse('[]'); // No courses
      if (url === 'institutionuser/myroles') {
        return createMockResponse('{"data": {"subgroupRoles": [{"id": 999, "name": "Fallback Class"}]}}');
      }
      return createMockResponse('{}');
    });
    vi.mocked(safeResponseJson).mockImplementation(async (res: unknown) => {
      const text = await (res as Response).text();
      if (text.includes('subgroupRoles')) return { data: { subgroupRoles: [{ id: 999, name: 'Fallback Class' }] } };
      if (text === '[]') return [];
      return { user_id: '12345' };
    });

    mockSupabase.single.mockResolvedValue({ data: null, error: null });

    const result = await performProfileSync(mockToken, mockEzygoId, mockAuthId);
    expect(result.class).toBeNull();
  });

  it('handles upsert error', async () => {
    vi.mocked(egressFetch).mockImplementation(async (url: unknown) => {
      if (url === 'myprofile') return createMockResponse('{"user_id": "12345"}');
      return createMockResponse('{}');
    });
    vi.mocked(safeResponseJson).mockResolvedValue({ user_id: '12345' });

    // Mock the second upsert (to 'users' table) to fail
    mockSupabase.upsert.mockImplementation((data: unknown) => {
      const record = data as Record<string, unknown> | undefined;
      if (record && record.id === '12345') { // This is the users upsert
        return { error: new Error('Database Error') };
      }
      return mockSupabase; // For other upserts (classes, course_mappings)
    });

    await expect(performProfileSync(mockToken, mockEzygoId, mockAuthId)).rejects.toThrow('Database Error');
  });

  it('handles safeEzygoJson read failure', async () => {
    const warnSpy = vi.spyOn(logger, 'warn');
    vi.mocked(egressFetch).mockImplementation(async (url: unknown) => {
      if (url === 'user/setting/default_semester') {
        return {
          ok: true,
          status: 200,
          text: () => { throw new Error('Body Read Error'); }
        } as unknown as Response;
      }
      return createMockResponse('{}');
    });

    const result = await performProfileSync(mockToken, mockEzygoId, mockAuthId);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('safeEzygoJson: failed to read response body:'), expect.any(Error));
    expect(result.academic.semester).toBeNull();
  });

  it('handles empty EzyGo Profile JSON', async () => {
    vi.mocked(egressFetch).mockImplementation(async (url: unknown) => {
      if (url === 'myprofile') return createMockResponse('');
      return createMockResponse('{}');
    });
    vi.mocked(safeResponseJson).mockImplementation(async (res: unknown) => {
      if ((await (res as Response).text()) === '') return null;
      return {};
    });

    await expect(performProfileSync(mockToken, mockEzygoId, mockAuthId)).rejects.toThrow('EzyGo Profile returned empty or invalid JSON: 200');
  });

  it('handles coursesRes read failure in catch block', async () => {
    vi.mocked(egressFetch).mockImplementation(async (url: unknown) => {
      if (url === 'myprofile') return createMockResponse('{"user_id": "12345"}');
      if (url === 'institutionuser/courses/withusers') {
        return {
          ok: true,
          status: 200,
          clone: () => ({ text: () => Promise.reject(new Error('Clone Read Error')) })
        } as unknown as Response;
      }
      return createMockResponse('{}');
    });
    vi.mocked(safeResponseJson).mockResolvedValue({ user_id: '12345' });

    const result = await performProfileSync(mockToken, mockEzygoId, mockAuthId);
    expect(result.id).toBe('12345');
  });

  it('handles naked strings in safeEzygoJson', async () => {
    vi.mocked(egressFetch).mockImplementation(async (url: unknown) => {
      if (url === 'user/setting/default_semester') return createMockResponse('Odd');
      if (url === 'myprofile') return createMockResponse('{"user_id": "12345"}');
      return createMockResponse('{}');
    });
    vi.mocked(safeResponseJson).mockResolvedValue({ user_id: '12345' });

    const result = await performProfileSync(mockToken, mockEzygoId, mockAuthId);
    expect(result.academic.semester).toBe('odd');
  });

  it('resolves ezygoId from remote data if local is missing', async () => {
    vi.mocked(egressFetch).mockImplementation(async (url: unknown) => {
      if (url === 'myprofile') return createMockResponse('{"user_id": "remote-123"}');
      return createMockResponse('{}');
    });
    vi.mocked(safeResponseJson).mockResolvedValue({ user_id: 'remote-123' });

    const result = await performProfileSync(mockToken, '', mockAuthId);
    expect(result.id).toBe('remote-123');
  });

  it('resolves ezygoId from user.id if user_id is missing', async () => {
    vi.mocked(egressFetch).mockImplementation(async (url: unknown) => {
      if (url === 'myprofile') return createMockResponse('{"user": {"id": "nested-123"}}');
      return createMockResponse('{}');
    });
    vi.mocked(safeResponseJson).mockResolvedValue({ user: { id: 'nested-123' } });

    const result = await performProfileSync(mockToken, '', mockAuthId);
    expect(result.id).toBe('nested-123');
  });

  it('derives first and last name from full_name', async () => {
    vi.mocked(egressFetch).mockImplementation(async (url: unknown) => {
      if (url === 'myprofile') return createMockResponse('{"user_id": "123", "full_name": "John Quincy Adams"}');
      return createMockResponse('{}');
    });
    vi.mocked(safeResponseJson).mockResolvedValue({ user_id: '123', full_name: 'John Quincy Adams' });

    const result = await performProfileSync(mockToken, '123', mockAuthId);
    expect(result.profile.firstName).toBe('John');
    expect(result.profile.lastName).toBe('Quincy Adams');
  });

  it('uses sex and dob as fallbacks for gender and birthDate', async () => {
    vi.mocked(egressFetch).mockImplementation(async (url: unknown) => {
      if (url === 'myprofile') return createMockResponse('{"user_id": "123", "sex": "Female", "dob": "1995-05-05"}');
      return createMockResponse('{}');
    });
    vi.mocked(safeResponseJson).mockResolvedValue({ user_id: '123', sex: 'Female', dob: '1995-05-05' });

    const result = await performProfileSync(mockToken, '123', mockAuthId);
    expect(result.profile.gender).toBe('Female');
    expect(result.profile.birthDate).toBe('1995-05-05');
  });

  it('handles decryption failure gracefully', async () => {
    const { decrypt } = await import('@/lib/crypto');
    vi.mocked(decrypt).mockImplementation(() => { throw new Error('Decryption failed'); });

    vi.mocked(egressFetch).mockImplementation(async (url: unknown) => {
      if (url === 'myprofile') return createMockResponse('{"user_id": "12345"}');
      return createMockResponse('{}');
    });
    vi.mocked(safeResponseJson).mockResolvedValue({ user_id: '12345' });

    mockSupabase.maybeSingle.mockResolvedValue({
      data: {
        gender: 'bad-data',
        gender_iv: 'bad-iv',
      },
      error: null,
    });

    const result = await performProfileSync(mockToken, mockEzygoId, mockAuthId);
    expect(result.profile.gender).toBeNull();
  });

  it('falls back to existing class_id if no new class detected', async () => {
    vi.mocked(egressFetch).mockImplementation(async (url: unknown) => {
      if (url === 'myprofile') return createMockResponse('{"user_id": "12345"}');
      return createMockResponse('{}');
    });
    vi.mocked(safeResponseJson).mockImplementation(async (res: unknown) => {
      const text = await (res as Response).text();
      if (text.includes('subgroupRoles')) return { data: { subgroupRoles: [] } };
      return { user_id: '12345' };
    });

    mockSupabase.maybeSingle.mockResolvedValue({
      data: { class_id: 'existing-class-uuid' },
      error: null,
    });

    const result = await performProfileSync(mockToken, mockEzygoId, mockAuthId);
    expect(result.class?.id).toBe('existing-class-uuid');
  });

  it('handles blank strings in safeEzygoJson', async () => {
    vi.mocked(egressFetch).mockImplementation(async (url: unknown) => {
      if (url === 'user/setting/default_semester') return createMockResponse('   ');
      if (url === 'myprofile') return createMockResponse('{"user_id": "123"}');
      return createMockResponse('{}');
    });
    vi.mocked(safeResponseJson).mockResolvedValue({ user_id: '123' });

    const result = await performProfileSync(mockToken, '123', mockAuthId);
    expect(result.academic.semester).toBeNull();
  });

  it('skips course mapping if code is missing', async () => {
    vi.mocked(egressFetch).mockImplementation(async (url: unknown) => {
      if (url === 'myprofile') return createMockResponse('{"user_id": "123"}');
      if (url === 'institutionuser/courses/withusers') return createMockResponse('[{"id": 101, "name": "No Code"}]');
      return createMockResponse('{}');
    });
    vi.mocked(safeResponseJson).mockImplementation(async (res: unknown) => {
      const text = await (res as Response).text();
      if (text.includes('No Code')) return [{ id: 101, name: 'No Code' }];
      return { user_id: '123' };
    });

    const result = await performProfileSync(mockToken, '123', mockAuthId);
    expect(result.courses['101']).toBeDefined();
    // No code-based key should exist
  });

  it('handles null yearRaw', async () => {
    vi.mocked(egressFetch).mockImplementation(async (url: unknown) => {
      if (url === 'myprofile') return createMockResponse('{"user_id": "123"}');
      if (url === 'user/setting/default_academic_year') return createMockResponse('', false, 500);
      return createMockResponse('{}');
    });
    vi.mocked(safeResponseJson).mockResolvedValue({ user_id: '123' });

    const result = await performProfileSync(mockToken, '123', mockAuthId);
    expect(result.academic.year).toBeNull();
  });

  it('handles class upsert error (priority 1)', async () => {
    vi.mocked(egressFetch).mockImplementation(async (url: unknown) => {
      if (url === 'myprofile') return createMockResponse('{"user_id": "123"}');
      if (url === 'institutionuser/courses/withusers') {
        return createMockResponse('[{"id": 101, "code": "C1", "usersubgroup": {"id": 1, "name": "G1", "programme_config_group_id": 710, "usergroup": {"id": 1, "name": "Programme A"}}}]');
      }
      return createMockResponse('{}');
    });
    vi.mocked(safeResponseJson).mockImplementation(async (res: unknown) => {
      const text = await (res as Response).text();
      if (text.includes('G1')) return [{ id: 101, code: 'C1', usersubgroup: { id: 1, name: 'G1', programme_config_group_id: 710, usergroup: { id: 1, name: 'Programme A' } } }];
      return { user_id: '123' };
    });

    mockSupabase.single.mockResolvedValue({ data: null, error: { message: 'Upsert Failed' } });

    const result = await performProfileSync(mockToken, '123', mockAuthId);
    expect(result.class).toBeNull();
  });

  it('handles class upsert error (priority 2 fallback)', async () => {
    vi.mocked(egressFetch).mockImplementation(async (url: unknown) => {
      if (url === 'myprofile') return createMockResponse('{"user_id": "123"}');
      if (url === 'institutionuser/myroles') return createMockResponse('{"data": {"subgroupRoles": [{"id": 1, "name": "R1"}]}}');
      return createMockResponse('{}');
    });
    vi.mocked(safeResponseJson).mockImplementation(async (res: unknown) => {
      const text = await (res as Response).text();
      if (text.includes('R1')) return { data: { subgroupRoles: [{ id: 1, name: 'R1' }] } };
      return { user_id: '123' };
    });

    mockSupabase.single.mockResolvedValue({ data: null, error: { message: 'Upsert Failed' } });

    const result = await performProfileSync(mockToken, '123', mockAuthId);
    expect(result.class).toBeNull();
  });

  it('handles coursesRes not ok', async () => {
    vi.mocked(egressFetch).mockImplementation(async (url: unknown) => {
      if (url === 'myprofile') return createMockResponse('{"user_id": "123"}');
      if (url === 'institutionuser/courses/withusers') return createMockResponse('', false, 403);
      return createMockResponse('{}');
    });
    vi.mocked(safeResponseJson).mockResolvedValue({ user_id: '123' });

    const result = await performProfileSync(mockToken, '123', mockAuthId);
    expect(result.courses).toEqual({});
  });

  it('skips course mapping if id is missing', async () => {
    vi.mocked(egressFetch).mockImplementation(async (url: unknown) => {
      if (url === 'myprofile') return createMockResponse('{"user_id": "123"}');
      if (url === 'institutionuser/courses/withusers') return createMockResponse('[{"code": "C1", "name": "No ID"}]');
      return createMockResponse('{}');
    });
    vi.mocked(safeResponseJson).mockImplementation(async (res: unknown) => {
      const text = await (res as Response).text();
      if (text.includes('No ID')) return [{ code: 'C1', name: 'No ID' }];
      return { user_id: '123' };
    });

    const result = await performProfileSync(mockToken, '123', mockAuthId);
    expect(result.courses['C1']).toBeDefined();
    // No ID-based key should exist
  });

  it('skips class upsert when no display name is available (priority 1)', async () => {
    vi.mocked(egressFetch).mockImplementation(async (url: unknown) => {
      if (url === 'myprofile') return createMockResponse('{"user_id": "12345"}');
      if (url === 'institutionuser/courses/withusers') {
        // Course has programme_config_group_id but neither sub.name nor usergroup.name
        return createMockResponse('[{"id": 101, "code": "CS101", "usersubgroup": {"id": 1, "programme_config_group_id": 710, "usergroup": {"id": 301}}}]');
      }
      if (url === 'institutionuser/myroles') return createMockResponse('{"data": {"subgroupRoles": []}}');
      return createMockResponse('{}');
    });
    vi.mocked(safeResponseJson).mockImplementation(async (res: unknown) => {
      try {
        const text = await (res as Response).text();
        return JSON.parse(text);
      } catch { return null; }
    });

    mockSupabase.maybeSingle.mockResolvedValue({ data: null, error: null });
    mockSupabase.single.mockResolvedValue({ data: { id: 'fallback-uuid-710', name: '710' }, error: null });

    const result = await performProfileSync(mockToken, mockEzygoId, mockAuthId);
    expect(mockSupabase.single).toHaveBeenCalled();
    expect(result.class?.name).toBe('710');
  });



  it('redacts authId and ezygoId in Sentry on sync error', async () => {
    const { captureException } = await import('@sentry/nextjs');
    
    vi.mocked(egressFetch).mockImplementation(async (url: unknown) => {
      if (url === 'myprofile') return createMockResponse('{"user_id": "12345"}');
      return createMockResponse('{}');
    });
    vi.mocked(safeResponseJson).mockResolvedValue({ user_id: '12345' });

    // Mock upsert to fail
    mockSupabase.upsert.mockResolvedValue({ error: new Error('Upsert failed') });

    const testEzygoId = 'sensitive-ezygo-id';
    const testAuthId = 'sensitive-auth-id';

    // Mock redact to return a hash-like format
    vi.mocked(redact).mockImplementation((_type: string, value: string) => {
      return `h-${Buffer.from(value).toString('base64').slice(0, 8)}`;
    });

    await expect(performProfileSync(mockToken, testEzygoId, testAuthId)).rejects.toThrow('Upsert failed');

    // Verify Sentry was called with redacted IDs
    expect(vi.mocked(captureException)).toHaveBeenCalledOnce();
    const captureCall = vi.mocked(captureException).mock.calls[0];
    const opts = captureCall[1] as any;
    
    expect(opts.tags).toEqual({ type: 'sync_failed', component: 'sync_service' });
    expect(opts.extra.ezygoId).toMatch(/^h-/); // Should be redacted
    expect(opts.extra.authId).toMatch(/^h-/);  // Should be redacted
    
    // Verify the redacted values are NOT the original secrets
    expect(opts.extra.ezygoId).not.toBe(testEzygoId);
    expect(opts.extra.authId).not.toBe(testAuthId);
  });

  it('clones class when EzyGo returns empty and user has a class from a previous semester', async () => {
    // 1. Mock empty courses from EzyGo
    vi.mocked(egressFetch).mockImplementation(async (url: unknown) => {
      if (url === 'myprofile') return createMockResponse('{"user_id": "12345"}');
      if (url === 'institutionuser/courses/withusers') return createMockResponse('[]');
      return createMockResponse('{}');
    });
    vi.mocked(safeResponseJson).mockResolvedValue({ user_id: '12345' });

    // 2. Mock user to have a previous class and mock fetching that class details
    mockSupabase.maybeSingle.mockImplementation(async () => {
      if (lastTable === 'users') {
        if (lastSelect.includes('classes(sem, year)')) {
          // Parallel class query
          return { data: null, error: null };
        }
        // existingUser fetch
        return {
          data: { class_id: 'old-class-uuid' },
          error: null,
        };
      }
      if (lastTable === 'classes') {
        // fetch old class details
        return {
          data: {
            id: 'old-class-uuid',
            name: 'Computer Science - 2029',
            programme_config_group_id: 709,
            usersubgroup_name: 'CS1B2025-2029 Batch odd S1',
            sem: 'odd',
            year: '2023-24',
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });

    // Mock search for existing current semester class (returns empty)
    mockSupabase.data = [];

    // Mock insert of the new cloned class
    mockSupabase.single.mockResolvedValue({
      data: {
        id: 'cloned-class-uuid',
        name: 'Computer Science - 2029',
      },
      error: null,
    });

    const result = await performProfileSync(mockToken, mockEzygoId, mockAuthId);

    expect(result.class?.id).toBe('cloned-class-uuid');
    expect(mockSupabase.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        programme_config_group_id: 709,
        sem: 'odd', // from calculatedCurrentAcademicInfo odd
        year: '2024-25', // from calculatedCurrentAcademicInfo 2024-25
        name: 'Computer Science - 2029 odd 2024-25',
      }),
      { onConflict: 'programme_config_group_id, sem, year, name' },
    );
  });

  it('matches and updates class when official EzyGo data arrives', async () => {
    // 1. Mock EzyGo response returning course with subgroup
    vi.mocked(egressFetch).mockImplementation(async (url: unknown) => {
      if (url === 'myprofile') return createMockResponse('{"user_id": "12345"}');
      if (url === 'institutionuser/courses/withusers') {
        return createMockResponse(JSON.stringify([
          {
            id: 101,
            code: 'CS101',
            usersubgroup: {
              id: 9886,
              name: 'CS1B2025-2029 Batch even S2',
              end_year: '2029',
              programme_config_group_id: 709,
              academic_semester: 'even',
              academic_year: '2024-25',
              usergroup: {
                id: 65,
                name: 'Computer Science',
              },
            },
          },
        ]));
      }
      return createMockResponse('{}');
    });
    vi.mocked(safeResponseJson).mockImplementation(async (res: unknown) => {
      const text = await (res as Response).text();
      try {
        return JSON.parse(text);
      } catch {
        return { user_id: '12345' };
      }
    });

    // Mock existingUser to return the user's class, and subsequent query to return that class details
    mockSupabase.maybeSingle.mockImplementation(async () => {
      if (lastTable === 'users') {
        if (lastSelect.includes('classes(sem, year)')) {
          // Parallel class query
          return { data: null, error: null };
        }
        // existingUser fetch
        return {
          data: { class_id: 'cloned-class-uuid' },
          error: null,
        };
      }
      if (lastTable === 'classes') {
        // fetch cloned class details
        return {
          data: {
            id: 'cloned-class-uuid',
            name: 'Computer Science - 2029',
            programme_config_group_id: 709,
            usersubgroup_name: 'CS1B2025-2029 Batch odd S1',
            sem: 'even',
            year: '2024-25',
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });

    // Mock update
    mockSupabase.update.mockReturnThis();

    const result = await performProfileSync(mockToken, mockEzygoId, mockAuthId);

    // Verify it matches the cloned class and returns its ID
    expect(result.class?.id).toBe('cloned-class-uuid');
    // Verify it updates it with the new official subgroup name
    expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({
      name: 'CS1B2025-2029 Batch even S2',
      external_group_id: 9886,
    }));
  });

  it('keeps EzyGo default academic context as source of truth even when course cohort differs', async () => {
    // 1. Mock EzyGo response returning default settings as "odd" and "2024-25"
    // and course subgroup with "even" and "2024-25"
    vi.mocked(egressFetch).mockImplementation(async (url: unknown) => {
      if (url === 'myprofile') return createMockResponse('{"user_id": "12345"}');
      if (url === 'user/setting/default_semester') return createMockResponse('Odd');
      if (url === 'user/setting/default_academic_year') return createMockResponse('2024-25');
      if (url === 'institutionuser/courses/withusers') {
        return createMockResponse(JSON.stringify([
          {
            id: 101,
            code: 'CS101',
            usersubgroup: {
              id: 9886,
              name: 'CS1B2025-2029 Batch even S2',
              end_year: '2029',
              programme_config_group_id: 709,
              academic_semester: 'even',
              academic_year: '2024-25',
              usergroup: {
                id: 65,
                name: 'Computer Science',
              },
            },
          },
        ]));
      }
      return createMockResponse('{}');
    });

    vi.mocked(safeResponseJson).mockImplementation(async (res: unknown) => {
      const text = await (res as Response).text();
      try {
        return JSON.parse(text);
      } catch {
        return { user_id: '12345' };
      }
    });

    // 2. Mock Supabase Responses
    mockSupabase.maybeSingle.mockResolvedValue({ data: null, error: null }); // existingUser
    mockSupabase.single.mockResolvedValue({ data: { id: 'cloned-class-uuid', name: 'CS1B2025-2029 Batch even S2' }, error: null }); // classData

    const result = await performProfileSync(mockToken, mockEzygoId, mockAuthId);

    // Verify returned academic context follows EzyGo default settings (source of truth)
    expect(result.academic.current_semester).toBe('odd');
    expect(result.academic.current_year).toBe('2024-25');

    // Verify no self-heal semester update was triggered
    const calls = vi.mocked(egressFetch).mock.calls;
    const postCall = calls.find(c => c[0] === 'user/setting/default_semester' && c[1]?.method === 'POST');
    expect(postCall).toBeUndefined();
  });
});
