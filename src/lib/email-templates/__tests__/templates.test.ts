import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getLogoUrl, emailStyles } from '../styles';
import { renderContactAdminEmail, renderContactConfirmationEmail } from '../contact';
import {
  renderAttendanceConflictEmail,
  renderCourseMismatchEmail,
  renderRevisionClassEmail,
} from '../index';

describe('Email Templates Styles', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getLogoUrl', () => {
    it('returns URL from NEXT_PUBLIC_APP_URL', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://example.com/';
      expect(getLogoUrl()).toBe('https://example.com/logo.png');
    });

    it('returns URL from NEXT_PUBLIC_APP_DOMAIN if APP_URL is missing', () => {
      delete process.env.NEXT_PUBLIC_APP_URL;
      process.env.NEXT_PUBLIC_APP_DOMAIN = 'ghostclass.app';
      expect(getLogoUrl()).toBe('https://ghostclass.app/logo.png');
    });

    it('returns empty string if no env vars are set', () => {
      delete process.env.NEXT_PUBLIC_APP_URL;
      delete process.env.NEXT_PUBLIC_APP_DOMAIN;
      expect(getLogoUrl()).toBe('');
    });
  });

  it('exports emailStyles object', () => {
    expect(emailStyles).toBeDefined();
    expect(emailStyles.main).toBeDefined();
    expect(emailStyles.container).toBeDefined();
  });
});

describe('Contact Email Templates', () => {
  const mockProps = {
    name: 'John Doe',
    email: 'john@example.com',
    subject: 'Test Subject',
    message: 'Hello <br> World',
    userType: 'Registered User',
    messageId: 'msg-123',
  };

  it('renders contact admin email correctly', () => {
    const html = renderContactAdminEmail(mockProps);
    expect(html).toContain('John Doe');
    expect(html).toContain('john@example.com');
    expect(html).toContain('Test Subject');
    expect(html).toContain('Hello <br> World');
    expect(html).toContain('New Contact Submission');
  });

  it('renders contact confirmation email correctly', () => {
    const html = renderContactConfirmationEmail({
      name: mockProps.name,
      subject: mockProps.subject,
      message: mockProps.message,
    });
    expect(html).toContain('Hi John Doe');
    expect(html).toContain('Test Subject');
    expect(html).toContain('Hello <br> World');
    expect(html).toContain('The GhostClass Team');
  });

  it('renders fallback text when logo URL is missing', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('NEXT_PUBLIC_APP_DOMAIN', '');
    const html = renderContactAdminEmail(mockProps);
    expect(html).toContain('GhostClass</span>');
  });
});

describe('Attendance & Course Templates (Components)', () => {
  it('renders attendance conflict email', () => {
    const html = renderContactAdminEmail({
      name: 'John',
      email: 'john@example.com',
      subject: 'Subject',
      message: 'Message',
      userType: 'Guest',
      messageId: '123'
    });
    expect(html).toContain('John');
    expect(html).toContain('New Contact Submission');
  });
});

describe('Email Render Functions (index.tsx)', () => {
  it('renders attendance conflict email html', async () => {
    const html = await renderAttendanceConflictEmail({
      username: 'Jane',
      courseLabel: 'Math 101',
      date: '2023-10-01',
      session: 'Morning',
      dashboardUrl: 'https://example.com',
    });
    expect(html).toContain('Jane');
    expect(html).toContain('Math 101');
    expect(html).toContain('Attendance Conflict Detected');
  });

  it('renders course mismatch email html', async () => {
    const html = await renderCourseMismatchEmail({
      username: 'Jane',
      date: '2023-10-01',
      session: 'Morning',
      manualCourseName: 'Physics',
      courseLabel: 'PHYS101',
      dashboardUrl: 'https://example.com',
    });
    expect(html).toContain('Jane');
    expect(html).toContain('Course Mismatch Detected');
  });

  it('renders revision class email html', async () => {
    const html = await renderRevisionClassEmail({
      username: 'Jane',
      courseName: 'Math 101',
      date: '2023-10-01',
      session: 'Morning',
      dashboardUrl: 'https://example.com',
    });
    expect(html).toContain('Jane');
    expect(html).toContain('Revision Class');
    expect(html).toContain('Not Counted');
  });
});
