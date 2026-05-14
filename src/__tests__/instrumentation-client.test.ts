import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Sentry from '@sentry/nextjs';

vi.mock('@sentry/nextjs', () => ({
  init: vi.fn(),
  replayIntegration: vi.fn(() => ({ name: 'Replay' })),
  captureRouterTransitionStart: vi.fn(),
}));

describe('Instrumentation Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('initializes Sentry correctly without replay in dev', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_REPLAY_RATE', '0');
    
    await import('../instrumentation-client');
    
    expect(Sentry.init).toHaveBeenCalled();
    const options = vi.mocked(Sentry.init).mock.calls[0][0] as any;
    expect(options.integrations).toHaveLength(1); // Default replay rate is 0.1 in dev
    expect(options.tracesSampleRate).toBe(1);
  });

  it('initializes Sentry with replay in prod if rate > 0', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_REPLAY_RATE', '0.1');
    
    await import('../instrumentation-client');
    
    const options = vi.mocked(Sentry.init).mock.calls[0][0] as any;
    expect(options.integrations).toHaveLength(1);
    expect(options.tracesSampleRate).toBe(0.1);
    expect(options.replaysSessionSampleRate).toBe(0.1);
    expect(options.replaysOnErrorSampleRate).toBe(0.5); // 0.1 * 5
  });

  it('caps replaysOnErrorSampleRate at 1', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_REPLAY_RATE', '0.5');
    
    await import('../instrumentation-client');
    
    const options = vi.mocked(Sentry.init).mock.calls[0][0] as any;
    expect(options.replaysOnErrorSampleRate).toBe(1);
  });

  it('captures router transitions', async () => {
    const { onRouterTransitionStart } = await import('../instrumentation-client');
    onRouterTransitionStart('/test', 'push');
    expect(Sentry.captureRouterTransitionStart).toHaveBeenCalledWith('/test', 'push');
  });
});
