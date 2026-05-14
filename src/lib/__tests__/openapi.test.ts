import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('openapi.ts', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('substitutes environment variables correctly', async () => {
    const mockContent = 'url: ${NEXT_PUBLIC_APP_URL}\nemail: ${NEXT_PUBLIC_APP_EMAIL}\ngithub: ${NEXT_PUBLIC_GITHUB_URL}';
    
    vi.doMock('fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('fs')>();
      return {
        ...actual,
        readFileSync: vi.fn().mockReturnValue(mockContent),
        default: {
          ...actual,
          readFileSync: vi.fn().mockReturnValue(mockContent),
        }
      };
    });

    vi.doMock('path', async (importOriginal) => {
      const actual = await importOriginal<typeof import('path')>();
      return {
        ...actual,
        join: vi.fn().mockReturnValue('fake-path'),
        default: {
          ...actual,
          join: vi.fn().mockReturnValue('fake-path'),
        }
      };
    });

    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://test.app');
    vi.stubEnv('NEXT_PUBLIC_APP_EMAIL', 'support@test.app');
    vi.stubEnv('NEXT_PUBLIC_GITHUB_URL', 'https://github.com/test');
    
    // Re-import the module
    const { resolveOpenApiSpec } = await import('../openapi');
    const spec = resolveOpenApiSpec();
    
    expect(spec).toBe('url: https://test.app\nemail: support@test.app\ngithub: https://github.com/test');
  });

  it('handles missing environment variables with empty strings', async () => {
    const mockContent = 'url: ${NEXT_PUBLIC_APP_URL}\nemail: ${NEXT_PUBLIC_APP_EMAIL}';
    
    vi.doMock('fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('fs')>();
      return {
        ...actual,
        readFileSync: vi.fn().mockReturnValue(mockContent),
        default: {
          ...actual,
          readFileSync: vi.fn().mockReturnValue(mockContent),
        }
      };
    });

    vi.doMock('path', async (importOriginal) => {
      const actual = await importOriginal<typeof import('path')>();
      return {
        ...actual,
        join: vi.fn().mockReturnValue('fake-path'),
        default: {
          ...actual,
          join: vi.fn().mockReturnValue('fake-path'),
        }
      };
    });

    // Use delete to simulate undefined env var
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_EMAIL;
    
    const { resolveOpenApiSpec } = await import('../openapi');
    const spec = resolveOpenApiSpec();
    
    expect(spec).toBe('url: \nemail: ');
  });
});
