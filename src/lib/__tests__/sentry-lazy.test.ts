import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the dynamic import of @sentry/nextjs
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

describe('Sentry Lazy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls captureException after importing @sentry/nextjs', async () => {
    const { captureSentryException } = await import('../sentry-lazy');
    const { captureException } = await import('@sentry/nextjs');
    
    const error = new Error('test');
    captureSentryException(error);
    
    // Since it's a promise (void import), we need to wait for it
    await new Promise(resolve => setTimeout(resolve, 0));
    
    expect(captureException).toHaveBeenCalledWith(error, undefined);
  });

  it('calls captureMessage after importing @sentry/nextjs', async () => {
    const { captureSentryMessage } = await import('../sentry-lazy');
    const { captureMessage } = await import('@sentry/nextjs');
    
    const message = 'test message';
    captureSentryMessage(message);
    
    await new Promise(resolve => setTimeout(resolve, 0));
    
    expect(captureMessage).toHaveBeenCalledWith(message, undefined);
  });
});
