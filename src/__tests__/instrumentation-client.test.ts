import { describe, it, expect, vi, afterEach } from 'vitest';

const mockCaptureRouterTransitionStart = vi.hoisted(() => vi.fn());

vi.mock('@sentry/nextjs', () => ({
  init: vi.fn(),
  replayIntegration: vi.fn(() => ({})),
  captureRouterTransitionStart: mockCaptureRouterTransitionStart,
}));

describe('instrumentation-client', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('onRouterTransitionStart', () => {
    it('calls captureRouterTransitionStart when the method exists on Sentry', async () => {
      const { onRouterTransitionStart } = await import('../instrumentation-client');

      onRouterTransitionStart();

      expect(mockCaptureRouterTransitionStart).toHaveBeenCalledTimes(1);
    });

    it('does not throw when captureRouterTransitionStart is absent from Sentry', async () => {
      // Re-import under a mock that omits captureRouterTransitionStart to exercise
      // the optional-chain short-circuit in onRouterTransitionStart.
      vi.resetModules();
      vi.doMock('@sentry/nextjs', () => ({
        init: vi.fn(),
        replayIntegration: vi.fn(() => ({})),
        captureRouterTransitionStart: undefined,
      }));

      const { onRouterTransitionStart } = await import('../instrumentation-client');

      expect(() => onRouterTransitionStart()).not.toThrow();
      expect(mockCaptureRouterTransitionStart).not.toHaveBeenCalled();
    });
  });
});
