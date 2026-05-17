import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processContactSubmission, contactSchema } from '../service';
import { sendEmail } from '@/lib/email';
import { renderContactAdminEmail, renderContactConfirmationEmail } from '@/lib/email-templates';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(),
}));

vi.mock('@/lib/email-templates', () => ({
  renderContactAdminEmail: vi.fn().mockReturnValue('admin-email-html'),
  renderContactConfirmationEmail: vi.fn().mockReturnValue('user-email-html'),
}));

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

vi.mock('@/lib/utils.server', () => ({
  redact: vi.fn((_type, val) => val),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('processContactSubmission', () => {
  const mockPayload = {
    name: 'Test User',
    email: 'test@example.com',
    subject: 'Test Subject',
    message: 'Test message content with at least 10 chars',
  };

  let mockSupabase: any;
  let mockSupabaseAdmin: any;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_EMAIL = 'ghostclass.app';

    mockSupabase = {};

    mockSupabaseAdmin = {
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'msg-123' }, error: null }),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };

    vi.mocked(sendEmail).mockResolvedValue({ success: true, provider: 'Brevo' });
  });

  it('successfully processes a contact submission', async () => {
    const result = await processContactSubmission(mockSupabase, mockSupabaseAdmin, mockPayload);
    
    expect(result.success).toBe(true);
    expect(result.id).toBe('msg-123');
    expect(mockSupabaseAdmin.insert).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Test User',
      email: 'test@example.com',
    }));
    expect(sendEmail).toHaveBeenCalledTimes(2); // Admin + User confirmation
    expect(renderContactAdminEmail).toHaveBeenCalled();
    expect(renderContactConfirmationEmail).toHaveBeenCalled();
  });

  it('passes the user email as replyTo for admin notifications', async () => {
    await processContactSubmission(mockSupabase, mockSupabaseAdmin, mockPayload);

    // First call is admin email
    expect(sendEmail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        replyTo: mockPayload.email,
      }),
    );
  });

  it('handles database insertion failure', async () => {
    mockSupabaseAdmin.single.mockResolvedValueOnce({ data: null, error: { message: 'DB Error' } });

    const result = await processContactSubmission(mockSupabase, mockSupabaseAdmin, mockPayload);
    
    expect(result.success).toBe(false);
    expect(result.error).toBe('DB Error');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('rolls back (deletes from DB) if admin email fails', async () => {
    vi.mocked(sendEmail).mockResolvedValueOnce({ success: false, error: 'Email Provider Down', provider: 'Brevo' });

    const result = await processContactSubmission(mockSupabase, mockSupabaseAdmin, mockPayload);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Admin email failed');
    expect(mockSupabaseAdmin.delete).toHaveBeenCalled();
    expect(mockSupabaseAdmin.eq).toHaveBeenCalledWith('id', 'msg-123');
  });

  it('continues if user confirmation email fails (non-fatal)', async () => {
    vi.mocked(sendEmail)
      .mockResolvedValueOnce({ success: true, provider: 'Brevo' }) // Admin email
      .mockRejectedValueOnce(new Error('SMTP Error')); // User email

    const result = await processContactSubmission(mockSupabase, mockSupabaseAdmin, mockPayload);
    
    expect(result.success).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to send user confirmation email'), expect.any(Error));
  });

  it('handles rollback failure gracefully', async () => {
    vi.mocked(sendEmail).mockResolvedValueOnce({ success: false, error: 'Email Failed', provider: 'Brevo' });
    mockSupabaseAdmin.eq.mockResolvedValueOnce({ error: { message: 'Delete Failed' } });

    const result = await processContactSubmission(mockSupabase, mockSupabaseAdmin, mockPayload);
    
    expect(result.success).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('CRITICAL: Rollback failed!'), expect.any(Object));
  });

  it('sanitizes message for email', async () => {
    const payloadWithNewlines = {
      ...mockPayload,
      message: 'Line 1\nLine 2\r\nLine 3',
    };

    await processContactSubmission(mockSupabase, mockSupabaseAdmin, payloadWithNewlines);
    
    expect(renderContactAdminEmail).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('Line 1<br />Line 2<br />Line 3'),
    }));
  });

  it('escapes HTML in name and subject', async () => {
    const maliciousPayload = {
      ...mockPayload,
      name: '<script>alert("xss")</script>',
      subject: '<b>Bold</b>',
    };

    await processContactSubmission(mockSupabase, mockSupabaseAdmin, maliciousPayload);
    
    expect(renderContactAdminEmail).toHaveBeenCalledWith(expect.objectContaining({
      name: expect.stringContaining('&lt;script&gt;'),
      subject: expect.stringContaining('&lt;b&gt;'),
    }));
  });

  it('throws error if NEXT_PUBLIC_APP_EMAIL is missing', async () => {
    delete process.env.NEXT_PUBLIC_APP_EMAIL;
    
    const result = await processContactSubmission(mockSupabase, mockSupabaseAdmin, mockPayload);
    expect(result.success).toBe(false);
    expect(result.error).toBe('NEXT_PUBLIC_APP_EMAIL is not configured');
  });

  it('correctly identifies a registered user', async () => {
    const result = await processContactSubmission(mockSupabase, mockSupabaseAdmin, mockPayload, { userId: 'user-456' });
    
    expect(result.success).toBe(true);
    expect(renderContactAdminEmail).toHaveBeenCalledWith(expect.objectContaining({
      userType: 'Registered User',
    }));
  });
});

describe('contactSchema', () => {
  it('validates a correct payload', () => {
    const result = contactSchema.safeParse({
      name: 'John Doe',
      email: 'john@example.com',
      subject: '  Subject with spaces  ',
      message: 'This is a long enough message.',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subject).toBe('Subject with spaces');
    }
  });

  it('rejects short messages', () => {
    const result = contactSchema.safeParse({
      name: 'John Doe',
      email: 'john@example.com',
      message: 'Short',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid names', () => {
    const result = contactSchema.safeParse({
      name: 'John123',
      email: 'john@example.com',
      message: 'Valid message content here.',
    });
    expect(result.success).toBe(false);
  });
});
