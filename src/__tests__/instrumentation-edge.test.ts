import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Sentry from '@sentry/nextjs';

vi.mock('@sentry/nextjs', () => ({
  init: vi.fn(),
}));

describe('Instrumentation Edge', () => {
  let initOptions: any;

  beforeEach(async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://test@sentry.io/1');
    vi.clearAllMocks();
    vi.resetModules();
    // Import the module once to trigger Sentry.init
    await import('../instrumentation-edge');
    initOptions = vi.mocked(Sentry.init).mock.calls[0][0];
  });

  it('initializes Sentry correctly', () => {
    expect(Sentry.init).toHaveBeenCalled();
    expect(initOptions.dsn).toBeDefined();
  });

  it('scrubs GA4 secrets from URLs in beforeBreadcrumb', () => {
    const beforeBreadcrumb = initOptions?.beforeBreadcrumb;
    expect(beforeBreadcrumb).toBeDefined();

    const breadcrumb = {
      data: {
        url: 'https://www.google-analytics.com/collect?v=2&api_secret=supersecret'
      }
    };
    const result = beforeBreadcrumb!(breadcrumb);
    expect(result.data.url).toContain('api_secret=%5BFiltered%5D');
  });

  it('ignores non-GA URLs in breadcrumbs', () => {
    const beforeBreadcrumb = initOptions?.beforeBreadcrumb;
    const url = 'https://example.com/api?api_secret=keep-me';
    const breadcrumb = { data: { url } };
    const result = beforeBreadcrumb!(breadcrumb);
    expect(result.data.url).toBe(url);
  });

  it('filters out network error types in beforeSend', () => {
    const beforeSend = initOptions?.beforeSend;
    expect(beforeSend).toBeDefined();

    const abortError = new Error('The request was aborted');
    const result = beforeSend!({}, { originalException: abortError });
    expect(result).toBeNull();

    const socketError = new Error('socket hang up');
    const result2 = beforeSend!({}, { originalException: socketError });
    expect(result2).toBeNull();

    const realError = new Error('Database crash');
    const result3 = beforeSend!({}, { originalException: realError });
    expect(result3).not.toBeNull();
  });

  it('scrubs auth and cookie headers in beforeSend', () => {
    const beforeSend = initOptions?.beforeSend;
    const event: any = {
      request: {
        headers: {
          'authorization': 'Bearer secret',
          'cookie': 'session=abc',
          'user-agent': 'browser'
        }
      }
    };
    const result = beforeSend!(event, {});
    expect(result.request.headers.authorization).toBeUndefined();
    expect(result.request.headers.cookie).toBeUndefined();
    expect(result.request.headers['user-agent']).toBe('browser');
  });

  it('scrubs GA4 secrets in beforeSendTransaction', () => {
    const beforeSendTransaction = initOptions?.beforeSendTransaction;
    expect(beforeSendTransaction).toBeDefined();

    const event: any = {
      spans: [
        { data: { 'http.url': 'https://google-analytics.com/collect?api_secret=123' } },
        { data: { 'url': 'https://google-analytics.com/collect?api_secret=456' } }
      ]
    };
    const result = beforeSendTransaction!(event);
    expect(result.spans[0].data['http.url']).toContain('%5BFiltered%5D');
    expect(result.spans[1].data['url']).toContain('%5BFiltered%5D');
  });

  it('handles invalid URLs gracefully', () => {
    const beforeBreadcrumb = initOptions?.beforeBreadcrumb;
    const breadcrumb = { data: { url: 'not-a-url' } };
    const result = beforeBreadcrumb!(breadcrumb);
    expect(result.data.url).toBe('not-a-url');
  });
});
