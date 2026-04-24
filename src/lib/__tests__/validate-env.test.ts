/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateEnvironment } from '../validate-env';

describe('validate-env utility', () => {
  beforeEach(() => {
    vi.stubGlobal('console', {
      error: vi.fn(),
      warn: vi.fn(),
      log: vi.fn(),
    });
    vi.stubEnv('NODE_ENV', 'development');
    // Set minimal required vars to avoid early errors
    vi.stubEnv('ENCRYPTION_KEY', 'a'.repeat(64));
    vi.stubEnv('CRON_SECRET', 'secret');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'pk_test_123');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.com');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    vi.stubEnv('BREVO_API_KEY', 'brevo_key');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site_key');
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret_key');
    vi.stubEnv('NEXT_PUBLIC_APP_NAME', 'GhostClass');
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '1.0.0');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://ghostclass.app');
    vi.stubEnv('NEXT_PUBLIC_APP_DOMAIN', 'ghostclass.app');
    vi.stubEnv('NEXT_PUBLIC_APP_EMAIL', '@ghostclass.app');
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'https://api.ghostclass.app');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('fails if SENTRY_REPLAY_RATE is invalid', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_REPLAY_RATE', 'invalid-number');
    expect(() => validateEnvironment()).toThrow('Environment validation failed');
    
    vi.stubEnv('NEXT_PUBLIC_SENTRY_REPLAY_RATE', '1.5');
    expect(() => validateEnvironment()).toThrow('Environment validation failed');
    
    vi.stubEnv('NEXT_PUBLIC_SENTRY_REPLAY_RATE', '-0.1');
    expect(() => validateEnvironment()).toThrow('Environment validation failed');
  });

  it('warns if HOSTNAME=0.0.0.0 in production with local domain', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('HOSTNAME', '0.0.0.0');
    vi.stubEnv('NEXT_PUBLIC_APP_DOMAIN', 'localhost');
    vi.stubEnv('SENTRY_HASH_SALT', 'some-salt');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'sk_'.repeat(20));
    vi.stubEnv('NEXT_PUBLIC_ANDROID_PACKAGE_NAME', 'com.test');
    vi.stubEnv('FIREBASE_APP_ID_ANDROID', '1:bin:android');
    vi.stubEnv('PLAY_INTEGRITY_PROJECT_NUMBER', '12345');
    
    validateEnvironment();
    
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('SECURITY: HOSTNAME=0.0.0.0'));
  });

  it('fails if GOOGLE_SERVICE_ACCOUNT_JSON is malformed', () => {
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_JSON', '{ "incomplete": "json" }');
    expect(() => validateEnvironment()).toThrow('Environment validation failed');
    
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_JSON', 'not-json-at-all');
    expect(() => validateEnvironment()).toThrow('Environment validation failed');
  });

  it('passes with all optional vars correctly configured', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_REPLAY_RATE', '0.5');
    vi.stubEnv('NEXT_PUBLIC_ATTENDANCE_TARGET_MIN', '75');
    vi.stubEnv('AUTH_LOCK_TTL', '20');
    vi.stubEnv('RATE_LIMIT_REQUESTS', '10');
    vi.stubEnv('RATE_LIMIT_WINDOW', '60');
    vi.stubEnv('SYNC_RATE_LIMIT_REQUESTS', '12');
    vi.stubEnv('SYNC_RATE_LIMIT_WINDOW', '20');
    vi.stubEnv('CONTACT_RATE_LIMIT_REQUESTS', '8');
    vi.stubEnv('CONTACT_RATE_LIMIT_WINDOW', '15');
    vi.stubEnv('AUTH_RATE_LIMIT_REQUESTS', '5');
    vi.stubEnv('AUTH_RATE_LIMIT_WINDOW', '60');
    vi.stubEnv('PROXY_RATE_LIMIT_REQUESTS', '120');
    vi.stubEnv('PROXY_RATE_LIMIT_WINDOW', '60');
    vi.stubEnv('REQUEST_SIGNATURE_MAX_AGE', '600');
    
    expect(() => validateEnvironment()).not.toThrow();
  });

  it('fails if numeric optional vars are out of range', () => {
    vi.stubEnv('NEXT_PUBLIC_ATTENDANCE_TARGET_MIN', '101');
    expect(() => validateEnvironment()).toThrow('Environment validation failed');
    
    vi.stubEnv('AUTH_LOCK_TTL', '10'); // min 15
    expect(() => validateEnvironment()).toThrow('Environment validation failed');
    
    vi.stubEnv('SYNC_RATE_LIMIT_REQUESTS', '0'); // min 1
    expect(() => validateEnvironment()).toThrow('Environment validation failed');

    vi.stubEnv('RATE_LIMIT_REQUESTS', '0'); // min 1
    expect(() => validateEnvironment()).toThrow('Environment validation failed');

    vi.stubEnv('PROXY_RATE_LIMIT_REQUESTS', '0'); // min 1
    expect(() => validateEnvironment()).toThrow('Environment validation failed');
  });

  it('bypasses validation on client-side execution', () => {
    vi.stubGlobal('window', {});
    expect(() => validateEnvironment()).not.toThrow();
    // console.error shouldn't have been called even if env was empty
    vi.stubEnv('ENCRYPTION_KEY', '');
    expect(() => validateEnvironment()).not.toThrow();
  });
});
