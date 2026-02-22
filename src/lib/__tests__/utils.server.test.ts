/**
 * Tests for server-only utilities: getClientIp and redact (HMAC-SHA256 version).
 *
 * The 'server-only' guard must be mocked so Vitest's jsdom environment doesn't
 * trigger the build-time-only restriction at runtime.
 */

// Must be hoisted before any module imports that transitively import server-only
vi.mock('server-only', () => ({}));

import { describe, it, expect, vi } from 'vitest';
import { getClientIp, redact } from '@/lib/utils.server';

// ---------------------------------------------------------------------------
// getClientIp — ported from utils.test.ts (moved alongside the implementation)
// ---------------------------------------------------------------------------

describe('getClientIp', () => {
  it('should return IP from cf-connecting-ip header', () => {
    const headers = new Headers();
    headers.set('cf-connecting-ip', '1.2.3.4');
    expect(getClientIp(headers)).toBe('1.2.3.4');
  });

  it('should return IP from x-real-ip header when cf-connecting-ip is not present', () => {
    const headers = new Headers();
    headers.set('x-real-ip', '5.6.7.8');
    expect(getClientIp(headers)).toBe('5.6.7.8');
  });

  it('should return IP from x-forwarded-for header when others are not present', () => {
    const headers = new Headers();
    headers.set('x-forwarded-for', '9.10.11.12, 192.168.1.1');
    expect(getClientIp(headers)).toBe('9.10.11.12');
  });

  it('should prioritize cf-connecting-ip over other headers', () => {
    const headers = new Headers();
    headers.set('cf-connecting-ip', '1.2.3.4');
    headers.set('x-real-ip', '5.6.7.8');
    headers.set('x-forwarded-for', '9.10.11.12');
    expect(getClientIp(headers)).toBe('1.2.3.4');
  });

  it('should prioritize x-real-ip over x-forwarded-for', () => {
    const headers = new Headers();
    headers.set('x-real-ip', '5.6.7.8');
    headers.set('x-forwarded-for', '9.10.11.12');
    expect(getClientIp(headers)).toBe('5.6.7.8');
  });

  it('should trim whitespace from IP addresses', () => {
    const headers = new Headers();
    headers.set('cf-connecting-ip', '  1.2.3.4  ');
    expect(getClientIp(headers)).toBe('1.2.3.4');
  });

  it('should handle x-forwarded-for with multiple IPs and trim', () => {
    const headers = new Headers();
    headers.set('x-forwarded-for', ' 9.10.11.12 , 192.168.1.1 ');
    expect(getClientIp(headers)).toBe('9.10.11.12');
  });

  it('should return dev fallback in development when no headers present', () => {
    // NODE_ENV is 'development' in Vitest (see vitest.config.ts)
    const headers = new Headers();
    const ip = getClientIp(headers);
    // Returns TEST_CLIENT_IP env var or "127.0.0.1" in development
    expect(ip).toBe('127.0.0.1');
  });
});

// ---------------------------------------------------------------------------
// redact — HMAC-SHA256 server implementation
// ---------------------------------------------------------------------------

describe('redact (server / HMAC-SHA256)', () => {
  it('should redact email addresses deterministically', () => {
    const email = 'user@example.com';
    const hash1 = redact('email', email);
    const hash2 = redact('email', email);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(12);
    expect(hash1).not.toContain('@');
    expect(hash1).not.toContain('example');
  });

  it('should redact IDs deterministically', () => {
    const id = '12345';
    const hash1 = redact('id', id);
    const hash2 = redact('id', id);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(12);
    expect(hash1).not.toContain('12345');
  });

  it('should produce different hashes for different types', () => {
    const value = 'test@example.com';
    expect(redact('email', value)).not.toBe(redact('id', value));
  });

  it('should produce different hashes for different values', () => {
    expect(redact('email', 'user1@example.com')).not.toBe(
      redact('email', 'user2@example.com'),
    );
  });

  it('should only contain hex characters', () => {
    const hash = redact('id', 'abc-123');
    expect(hash).toMatch(/^[0-9a-f]{12}$/);
  });
});
