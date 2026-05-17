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
    vi.stubEnv('NEXT_PUBLIC_MIN_APP_VERSION', '1.0.0');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://ghostclass.app');
    vi.stubEnv('NEXT_PUBLIC_APP_DOMAIN', 'ghostclass.app');
    vi.stubEnv('NEXT_PUBLIC_APP_EMAIL', '@ghostclass.app');
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'https://api.ghostclass.app');
    vi.stubEnv('JWE_PRIVATE_KEY', 'a'.repeat(64));

    // Optional vars - set to valid defaults to avoid warnings
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://dsn@sentry.io/123');
    vi.stubEnv('SENTRY_HASH_SALT', 'some-salt');
    vi.stubEnv('APP_COMMIT_SHA', 'abcdef123456');
    vi.stubEnv('NEXT_PUBLIC_GA_ID', 'G-12345678');
    vi.stubEnv('GA_API_SECRET', 'a'.repeat(21));
    vi.stubEnv('NEXT_PUBLIC_GITHUB_URL', 'https://github.com');
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_JSON', JSON.stringify({
      project_id: 'test',
      private_key: 'test',
      client_email: 'test@test.com'
    }));
    vi.stubEnv('NEXT_PUBLIC_LEGAL_EMAIL', 'legal@ghostclass.io');
    vi.stubEnv('NEXT_PUBLIC_AUTHOR_NAME', 'GhostClass');
    vi.stubEnv('NEXT_PUBLIC_AUTHOR_URL', 'https://ghostclass.io');
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_JSON', JSON.stringify({
      project_id: 'test',
      private_key: 'test',
      client_email: 'test@test.com'
    }));
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
    // Set other production vars
    vi.stubEnv('SUPABASE_SECRET_KEY', 'sk_'.repeat(20));
    vi.stubEnv('FIREBASE_APP_ID_ANDROID', '1:bin:android');
    vi.stubEnv('NEXT_PUBLIC_ANDROID_PACKAGE_NAME', 'com.test');

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

  describe('Core Security and Infrastructure', () => {
    it('hits final branches for Turnstile and GA', () => {
      // Turnstile 'test' branch
      vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'test');
      vi.stubEnv('TURNSTILE_SECRET_KEY', 'test');
      expect(() => validateEnvironment()).not.toThrow();

      // Turnstile '0x' branch
      vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '0x' + 'a'.repeat(20));
      vi.stubEnv('TURNSTILE_SECRET_KEY', '0x' + 'a'.repeat(30));
      expect(() => validateEnvironment()).not.toThrow();
      
      // GA_API_SECRET trim branch
      vi.stubEnv('GA_API_SECRET', ' ' + 'a'.repeat(21) + ' ');
      expect(() => validateEnvironment()).not.toThrow();
    });

    it('hits final branches for isLocalDomain', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('HOSTNAME', '0.0.0.0');
      
      // Set other production vars to avoid throw
      vi.stubEnv('SUPABASE_SECRET_KEY', 'sk_'.repeat(20));
      vi.stubEnv('FIREBASE_APP_ID_ANDROID', '1:bin:android');
      vi.stubEnv('NEXT_PUBLIC_ANDROID_PACKAGE_NAME', 'com.test');
      
      // Test different loopback formats
      vi.stubEnv('NEXT_PUBLIC_APP_DOMAIN', '127.0.0.1');
      expect(() => validateEnvironment()).not.toThrow();
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('SECURITY: HOSTNAME=0.0.0.0'));

      vi.stubEnv('NEXT_PUBLIC_APP_DOMAIN', 'localhost');
      expect(() => validateEnvironment()).not.toThrow();
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('SECURITY: HOSTNAME=0.0.0.0'));
    });

    it('fails if mandatory variables are missing', () => {
      vi.stubEnv('ENCRYPTION_KEY', '');
      vi.stubEnv('CRON_SECRET', '');
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
      vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
      vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
      vi.stubEnv('BREVO_API_KEY', '');
      vi.stubEnv('SENDPULSE_CLIENT_ID', '');
      vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');
      vi.stubEnv('TURNSTILE_SECRET_KEY', '');
      vi.stubEnv('NEXT_PUBLIC_APP_NAME', '');
      vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '');
      vi.stubEnv('NEXT_PUBLIC_MIN_APP_VERSION', '');
      vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
      vi.stubEnv('NEXT_PUBLIC_APP_DOMAIN', '');
      vi.stubEnv('NEXT_PUBLIC_APP_EMAIL', '');
      vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', '');

      expect(() => validateEnvironment()).toThrow('Environment validation failed');
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('ENCRYPTION_KEY is required'));
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('CRON_SECRET is required'));
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('NEXT_PUBLIC_SUPABASE_URL is required'));
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('NEXT_PUBLIC_APP_NAME is required'));
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('NEXT_PUBLIC_MIN_APP_VERSION is required'));
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('NEXT_PUBLIC_APP_URL is required'));
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('NEXT_PUBLIC_APP_DOMAIN is required'));
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('NEXT_PUBLIC_APP_EMAIL is required'));
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('NEXT_PUBLIC_BACKEND_URL is required'));
    });

    it('fails if ENCRYPTION_KEY is malformed', () => {
      vi.stubEnv('ENCRYPTION_KEY', 'short');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
    });

    it('fails if both email providers are missing', () => {
      vi.stubEnv('BREVO_API_KEY', '');
      vi.stubEnv('SENDPULSE_CLIENT_ID', '');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
    });

    it('passes if only SendPulse is configured', () => {
      vi.stubEnv('BREVO_API_KEY', '');
      vi.stubEnv('SENDPULSE_CLIENT_ID', 'id');
      vi.stubEnv('SENDPULSE_CLIENT_SECRET', 'secret');
      expect(() => validateEnvironment()).not.toThrow();
    });
  });

  describe('Supabase Configuration', () => {
    it('validates development Supabase URL', () => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_DEV_URL', 'invalid-url');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
    });

    it('validates development Supabase keys', () => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_DEV_PUBLISHABLE_KEY', 'short');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
      
      vi.stubEnv('SUPABASE_DEV_SECRET_KEY', 'short');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
    });

    it('requires SUPABASE_SECRET_KEY in production', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('SUPABASE_SECRET_KEY', '');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
    });
  });

  describe('App Configuration and Domain', () => {
    it('validates NEXT_PUBLIC_APP_DOMAIN format', () => {
      vi.stubEnv('NEXT_PUBLIC_APP_DOMAIN', 'https://ghostclass.app'); // No protocol allowed
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
      
      vi.stubEnv('NEXT_PUBLIC_APP_DOMAIN', 'ghostclass.app/path'); // No path allowed
      expect(() => validateEnvironment()).toThrow('Environment validation failed');

      vi.stubEnv('NEXT_PUBLIC_APP_DOMAIN', 'invalid domain'); // No spaces
      expect(() => validateEnvironment()).toThrow('Environment validation failed');

      vi.stubEnv('NEXT_PUBLIC_APP_DOMAIN', 'nodot'); // Must have dot
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
    });

    it('validates NEXT_PUBLIC_APP_EMAIL format', () => {
      vi.stubEnv('NEXT_PUBLIC_APP_EMAIL', 'admin@ghostclass.app'); // Must start with @
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
    });

    it('validates NEXT_PUBLIC_APP_URL with warnings', () => {
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://ghostclass.app/'); // Trailing slash warning
      validateEnvironment();
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('trailing slash'));
    });
  });

  describe('Backend and Proxy Protocols', () => {
    it('requires HTTPS for backend in production', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://api.ghostclass.app');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
    });

    it('validates CF_PROXY_URL and secret', () => {
      vi.stubEnv('CF_PROXY_URL', 'ftp://proxy.com');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
      
      vi.stubEnv('CF_PROXY_URL', 'https://proxy.com');
      vi.stubEnv('CF_PROXY_SECRET', 'too-short');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
    });

    it('requires distinct secrets for CF and AWS', () => {
      const sameSecret = 'a'.repeat(32);
      vi.stubEnv('CF_PROXY_URL', 'https://cf.com');
      vi.stubEnv('CF_PROXY_SECRET', sameSecret);
      vi.stubEnv('AWS_SECONDARY_URL', 'https://aws.com');
      vi.stubEnv('AWS_SECONDARY_SECRET', sameSecret);
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
    });
  });

  describe('Turnstile and Security Monitoring', () => {
    it('fails if TURNSTILE_SITE_KEY is test key in production', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '1x00000000000000000000AA');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
    });

    it('fails if TURNSTILE_SECRET_KEY is test key in production', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('TURNSTILE_SECRET_KEY', '1x000000000000000000000000000000AA');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
    });
  });

  describe('Analytics and Miscellaneous', () => {
    it('validates GA_ID and secret', () => {
      vi.stubEnv('NEXT_PUBLIC_GA_ID', 'INVALID');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
      
      vi.stubEnv('NEXT_PUBLIC_GA_ID', 'G-12345678');
      vi.stubEnv('GA_API_SECRET', '');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');

      vi.stubEnv('GA_API_SECRET', 'short');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
    });

    it('validates boolean flags', () => {
      vi.stubEnv('NEXT_PUBLIC_ENABLE_SW_IN_DEV', 'maybe');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
    });

    it('validates TEST_CLIENT_IP', () => {
      vi.stubEnv('TEST_CLIENT_IP', 'not-an-ip');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
    });
  });

  it('bypasses validation on client-side execution', () => {
    vi.stubGlobal('window', {});
    expect(() => validateEnvironment()).not.toThrow();
    // console.error shouldn't have been called even if env was empty
    vi.stubEnv('ENCRYPTION_KEY', '');
    expect(() => validateEnvironment()).not.toThrow();
  });

  describe('Optional Proxies and Sentry', () => {
    it('validates NEXT_PUBLIC_APP_URL parse error', () => {
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'invalid-url');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('must be a valid absolute URL'));
    });

    it('validates NEXT_PUBLIC_APP_DOMAIN invalid characters', () => {
      vi.stubEnv('NEXT_PUBLIC_APP_DOMAIN', 'invalid_hostname!');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('contains invalid hostname characters'));
    });

    it('validates NEXT_PUBLIC_APP_DOMAIN bare domain check', () => {
      vi.stubEnv('NEXT_PUBLIC_APP_DOMAIN', 'ghostclass.io/path');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('must be a bare domain without path'));
    });

    it('validates NEXT_PUBLIC_APP_EMAIL format', () => {
      vi.stubEnv('NEXT_PUBLIC_APP_EMAIL', 'invalid-email');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('must start with "@"'));
    });

    it('validates NEXT_PUBLIC_BACKEND_URL parse error', () => {
      vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'invalid-url');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('must be a valid absolute URL'));
    });

    it('validates CF_PROXY_URL parse error', () => {
      vi.stubEnv('CF_PROXY_URL', 'invalid-url');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('CF_PROXY_URL must be a valid absolute URL'));
    });

    it('validates AWS_SECONDARY_URL and secret', () => {
      vi.stubEnv('AWS_SECONDARY_URL', 'ftp://proxy.com');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('AWS_SECONDARY_URL must use http or https protocol'));
    });

    it('validates AWS_SECONDARY_URL parse error', () => {
      vi.stubEnv('AWS_SECONDARY_URL', 'invalid-url');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('AWS_SECONDARY_URL must be a valid absolute URL'));
    });

    it('validates AWS_SECONDARY_SECRET missing', () => {
      vi.stubEnv('AWS_SECONDARY_URL', 'https://proxy.com');
      vi.stubEnv('AWS_SECONDARY_SECRET', '');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('AWS_SECONDARY_SECRET is required'));
    });

    it('validates AWS_SECONDARY_SECRET short', () => {
      vi.stubEnv('AWS_SECONDARY_URL', 'https://proxy.com');
      vi.stubEnv('AWS_SECONDARY_SECRET', 'too-short');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('AWS_SECONDARY_SECRET is too short'));
    });

    it('validates Supabase dev keys format', () => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_DEV_PUBLISHABLE_KEY', 'invalid');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('DEV_PUBLISHABLE_KEY looks invalid'));

      vi.stubEnv('SUPABASE_DEV_SECRET_KEY', 'invalid');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('DEV_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY looks invalid'));
    });

    it('warns if optional Sentry DSN is missing', () => {
      vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
      validateEnvironment();
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('error monitoring disabled'));
    });

    it('errors if SENTRY_HASH_SALT is missing in production', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('SENTRY_HASH_SALT', '');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('SENTRY_HASH_SALT is required in production'));
    });

    it('warns if SENTRY_HASH_SALT is missing in development', () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('SENTRY_HASH_SALT', '');
      validateEnvironment();
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('using development-only fallback'));
    });

    it('warns if APP_COMMIT_SHA is missing in production', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('APP_COMMIT_SHA', '');
      // Set required production vars to avoid throw
      vi.stubEnv('SUPABASE_SECRET_KEY', 'sk_'.repeat(20));
      vi.stubEnv('SENTRY_HASH_SALT', 'some-salt');
      vi.stubEnv('NEXT_PUBLIC_ANDROID_PACKAGE_NAME', 'com.test');
      vi.stubEnv('FIREBASE_APP_ID_ANDROID', '1:bin:android');

      validateEnvironment();
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('APP_COMMIT_SHA is not set'));
    });

    it('validates GA ID and API Secret strictly', () => {
      vi.stubEnv('NEXT_PUBLIC_GA_ID', 'INVALID');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('NEXT_PUBLIC_GA_ID appears invalid'));

      vi.stubEnv('NEXT_PUBLIC_GA_ID', 'G-12345678');
      vi.stubEnv('GA_API_SECRET', '');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('GA_API_SECRET is required'));

      vi.stubEnv('GA_API_SECRET', 'short');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('GA_API_SECRET appears invalid'));
    });

    it('validates rate limit numeric ranges strictly', () => {
      vi.stubEnv('SYNC_RATE_LIMIT_REQUESTS', '1001');
      vi.stubEnv('SYNC_RATE_LIMIT_WINDOW', '0');
      vi.stubEnv('CONTACT_RATE_LIMIT_REQUESTS', '1001');
      vi.stubEnv('CONTACT_RATE_LIMIT_WINDOW', '0');
      vi.stubEnv('AUTH_RATE_LIMIT_REQUESTS', '1001');
      vi.stubEnv('AUTH_RATE_LIMIT_WINDOW', '0');
      vi.stubEnv('PROXY_RATE_LIMIT_REQUESTS', '5001');
      vi.stubEnv('PROXY_RATE_LIMIT_WINDOW', '0');
      vi.stubEnv('RATE_LIMIT_REQUESTS', '1001');
      vi.stubEnv('RATE_LIMIT_WINDOW', '0');
      
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('SYNC_RATE_LIMIT_REQUESTS is invalid'));
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('SYNC_RATE_LIMIT_WINDOW is invalid'));
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('CONTACT_RATE_LIMIT_REQUESTS is invalid'));
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('CONTACT_RATE_LIMIT_WINDOW is invalid'));
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('AUTH_RATE_LIMIT_REQUESTS is invalid'));
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('AUTH_RATE_LIMIT_WINDOW is invalid'));
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('PROXY_RATE_LIMIT_REQUESTS is invalid'));
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('PROXY_RATE_LIMIT_WINDOW is invalid'));
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('RATE_LIMIT_REQUESTS is invalid'));
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('RATE_LIMIT_WINDOW is invalid'));
    });

    it('requires mandatory production security keys', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('SUPABASE_SECRET_KEY', 'sk_'.repeat(20));
      vi.stubEnv('NEXT_PUBLIC_ANDROID_PACKAGE_NAME', '');
      vi.stubEnv('FIREBASE_APP_ID_ANDROID', '');
      
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('NEXT_PUBLIC_ANDROID_PACKAGE_NAME is required'));
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('FIREBASE_APP_ID_ANDROID is required'));
    });

    it('fails if GOOGLE_SERVICE_ACCOUNT_JSON is missing when ENFORCE_APP_CHECK is true', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('ENFORCE_APP_CHECK', 'true');
      vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_JSON', '');
      expect(() => validateEnvironment()).toThrow('Environment validation failed');
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('GOOGLE_SERVICE_ACCOUNT_JSON is required when ENFORCE_APP_CHECK=true'));
    });

    it('warns if HOSTNAME=0.0.0.0 in production without proxy indicators', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('HOSTNAME', '0.0.0.0');
      vi.stubEnv('NEXT_PUBLIC_APP_DOMAIN', 'localhost'); // local domain = no proxy indicators
      // Set other required production vars
      vi.stubEnv('SUPABASE_SECRET_KEY', 'sk_'.repeat(20));
      vi.stubEnv('SENTRY_HASH_SALT', 'some-salt');
      vi.stubEnv('FIREBASE_APP_ID_ANDROID', '1:bin:android');
      vi.stubEnv('NEXT_PUBLIC_ANDROID_PACKAGE_NAME', 'com.test');
      vi.stubEnv('JWE_PRIVATE_KEY', 'a'.repeat(64));

      validateEnvironment();
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('SECURITY: HOSTNAME=0.0.0.0 in production'));
    });

    it('logs success in development', () => {
      vi.stubEnv('NODE_ENV', 'development');
      expect(() => validateEnvironment()).not.toThrow();
    });
  });
});
