import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockInit = vi.fn();
const mockReplayIntegration = vi.fn(() => ({ name: 'replay' }));
const mockCaptureRouterTransitionStart = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  init: (...args: any[]) => mockInit(...args),
  replayIntegration: () => mockReplayIntegration(),
  captureRouterTransitionStart: (...args: any[]) => mockCaptureRouterTransitionStart(...args),
}));

describe('instrumentation-client coverage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('initializes Sentry in development with default replay rate', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    await import('../instrumentation-client');
    
    expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
      tracesSampleRate: 1,
      replaysSessionSampleRate: 0.1,
    }));
  });

  it('initializes Sentry in production with env replay rate', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_REPLAY_RATE', '0.5');
    await import('../instrumentation-client');
    
    expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0.5,
      integrations: expect.arrayContaining([{ name: 'replay' }]),
    }));
  });

  it('initializes Sentry in production with zero replay rate', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_REPLAY_RATE', '0');
    await import('../instrumentation-client');
    
    expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
      replaysSessionSampleRate: 0,
      integrations: [],
    }));
  });

  it('initializes Sentry in production with missing replay rate (defaults to 0)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_REPLAY_RATE', undefined as any);
    await import('../instrumentation-client');
    
    expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
      replaysSessionSampleRate: 0,
    }));
  });

  it('covers onRouterTransitionStart', async () => {
    const { onRouterTransitionStart } = await import('../instrumentation-client');
    onRouterTransitionStart('/test', 'push');
    expect(mockCaptureRouterTransitionStart).toHaveBeenCalledWith('/test', 'push');
  });
});
