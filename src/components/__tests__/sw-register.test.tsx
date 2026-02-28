import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — use vi.hoisted() so factory closures can reference these fns,
// since vi.mock() factories are hoisted above top-level const declarations.
// ---------------------------------------------------------------------------

const { mockToast, mockLoggerDev, mockLoggerError } = vi.hoisted(() => ({
  mockToast: vi.fn(),
  mockLoggerDev: vi.fn(),
  mockLoggerError: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: mockToast }));

vi.mock('@/lib/logger', () => ({
  logger: { dev: mockLoggerDev, error: mockLoggerError },
}));

// Mock the side-effect import so it doesn't execute module-level browser code
vi.mock('@/hooks/usePWAInstall', () => ({}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal event-target-like object that tracks listeners and
 * supports manual event emission via `_emit()`.
 */
function makeEventSource() {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  return {
    addEventListener(event: string, cb: (...args: unknown[]) => void, _opts?: unknown) {
      listeners.set(event, [...(listeners.get(event) ?? []), cb]);
    },
    removeEventListener(event: string, cb: (...args: unknown[]) => void) {
      listeners.set(event, (listeners.get(event) ?? []).filter((f) => f !== cb));
    },
    _emit(event: string, ...args: unknown[]) {
      // Spread to avoid mutation issues if a listener removes itself
      [...(listeners.get(event) ?? [])].forEach((f) => f(...args));
    },
  };
}

function makeSWEnv() {
  const installingWorker = Object.assign(makeEventSource(), {
    state: 'installing' as string,
    postMessage: vi.fn(),
  });
  const waitingWorker = Object.assign(makeEventSource(), {
    state: 'waiting' as string,
    postMessage: vi.fn(),
  });
  const registration = Object.assign(makeEventSource(), {
    scope: 'http://localhost/',
    installing: null as typeof installingWorker | null,
    waiting: null as typeof waitingWorker | null,
    update: vi.fn().mockResolvedValue(undefined),
  });
  const swContainer = Object.assign(makeEventSource(), {
    controller: null as object | null,
    register: vi.fn().mockResolvedValue(registration),
  });
  return { installingWorker, waitingWorker, registration, swContainer };
}

// ---------------------------------------------------------------------------
// Component under test (static import — mocks above must be declared first)
// ---------------------------------------------------------------------------

import { ServiceWorkerRegister } from '@/components/sw-register';

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('ServiceWorkerRegister', () => {
  let reloadSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    // Enable SW registration in development so the dev-guard is bypassed
    vi.stubEnv('NEXT_PUBLIC_ENABLE_SW_IN_DEV', 'true');
    // Make the document appear fully loaded so handleLoad() fires immediately
    Object.defineProperty(document, 'readyState', { configurable: true, value: 'complete' });
    // Stub window.location.reload
    reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...window.location, reload: reloadSpy },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  // -------------------------------------------------------------------------
  // Guard: development mode without explicit opt-in
  // -------------------------------------------------------------------------

  it('skips SW registration in development when NEXT_PUBLIC_ENABLE_SW_IN_DEV is not "true"', async () => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_SW_IN_DEV', 'false');

    const { swContainer } = makeSWEnv();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: swContainer,
    });

    render(<ServiceWorkerRegister />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(swContainer.register).not.toHaveBeenCalled();
    expect(mockLoggerDev).toHaveBeenCalledWith(
      expect.stringContaining('disabled in development'),
      expect.anything(),
    );
  });

  // -------------------------------------------------------------------------
  // Registration timing
  // -------------------------------------------------------------------------

  it('registers after the 3-second delay when document is already loaded', async () => {
    const { swContainer } = makeSWEnv();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: swContainer,
    });

    render(<ServiceWorkerRegister />);

    // No registration yet before the timer fires
    expect(swContainer.register).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(swContainer.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it('waits for the window load event before starting the 3-second timer', async () => {
    Object.defineProperty(document, 'readyState', { configurable: true, value: 'loading' });

    const { swContainer } = makeSWEnv();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: swContainer,
    });

    render(<ServiceWorkerRegister />);

    // Time passes but no load event — no registration
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(swContainer.register).not.toHaveBeenCalled();

    // Fire load, then wait for the 3-second timer
    await act(async () => {
      window.dispatchEvent(new Event('load'));
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(swContainer.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it('does not register if unmounted before the 3-second timer fires', async () => {
    const { swContainer } = makeSWEnv();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: swContainer,
    });

    const { unmount } = render(<ServiceWorkerRegister />);
    unmount(); // cleanup clears the timeout

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(swContainer.register).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Registration outcomes
  // -------------------------------------------------------------------------

  it('logs success with logger.dev after successful registration', async () => {
    const { swContainer } = makeSWEnv();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: swContainer,
    });

    render(<ServiceWorkerRegister />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(mockLoggerDev).toHaveBeenCalledWith(
      'Service worker registered successfully',
      expect.anything(),
    );
  });

  it('logs error with logger.error when SW registration throws', async () => {
    const error = new Error('registration failed');
    const { swContainer } = makeSWEnv();
    swContainer.register.mockRejectedValue(error);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: swContainer,
    });

    render(<ServiceWorkerRegister />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(mockLoggerError).toHaveBeenCalledWith(
      'Service worker registration failed',
      expect.objectContaining({ error }),
    );
  });

  // -------------------------------------------------------------------------
  // Update detection
  // -------------------------------------------------------------------------

  it('shows the update toast when a new SW reaches "installed" with an existing controller', async () => {
    const { installingWorker, registration, swContainer } = makeSWEnv();
    swContainer.controller = {}; // existing controller → this is an update, not a first install
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: swContainer,
    });

    render(<ServiceWorkerRegister />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    await act(async () => {
      registration.installing = installingWorker;
      registration._emit('updatefound');
      installingWorker.state = 'installed';
      installingWorker._emit('statechange');
    });

    expect(mockToast).toHaveBeenCalledWith(
      'App updated — tap to refresh',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Refresh' }),
      }),
    );
  });

  it('does not show the update toast on first install (no existing controller)', async () => {
    const { installingWorker, registration, swContainer } = makeSWEnv();
    swContainer.controller = null; // no controller → first install
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: swContainer,
    });

    render(<ServiceWorkerRegister />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    await act(async () => {
      registration.installing = installingWorker;
      registration._emit('updatefound');
      installingWorker.state = 'installed';
      installingWorker._emit('statechange');
    });

    expect(mockToast).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Update flow: Refresh button
  //
  // Helper to get to the point where the update toast is shown and the Refresh
  // button's onClick is available for testing.
  // -------------------------------------------------------------------------

  async function triggerUpdateReady(
    registration: ReturnType<typeof makeSWEnv>['registration'],
    swContainer: ReturnType<typeof makeSWEnv>['swContainer'],
    installingWorker: ReturnType<typeof makeSWEnv>['installingWorker'],
  ): Promise<() => void> {
    swContainer.controller = {};
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: swContainer,
    });
    render(<ServiceWorkerRegister />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    await act(async () => {
      registration.installing = installingWorker;
      registration._emit('updatefound');
      installingWorker.state = 'installed';
      installingWorker._emit('statechange');
    });
    // Return the Refresh button onClick from the toast call
    return mockToast.mock.calls[0][1].action.onClick as () => void;
  }

  it('sends SKIP_WAITING to the waiting worker when Refresh is clicked', async () => {
    const { installingWorker, waitingWorker, registration, swContainer } = makeSWEnv();
    const onClick = await triggerUpdateReady(registration, swContainer, installingWorker);

    registration.waiting = waitingWorker;
    act(() => {
      onClick();
    });

    expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('reloads via statechange→activated fallback when controllerchange does not fire (clientsClaim: false)', async () => {
    const { installingWorker, waitingWorker, registration, swContainer } = makeSWEnv();
    const onClick = await triggerUpdateReady(registration, swContainer, installingWorker);

    registration.waiting = waitingWorker;
    act(() => {
      onClick();
    });

    // controllerchange does NOT fire — new SW activated without claiming clients
    // The statechange→activated listener should trigger the reload instead
    await act(async () => {
      waitingWorker.state = 'activated';
      waitingWorker._emit('statechange');
    });

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('reloads via controllerchange when that event fires after SKIP_WAITING', async () => {
    const { installingWorker, waitingWorker, registration, swContainer } = makeSWEnv();
    const onClick = await triggerUpdateReady(registration, swContainer, installingWorker);

    registration.waiting = waitingWorker;
    act(() => {
      onClick();
    });

    await act(async () => {
      swContainer._emit('controllerchange');
    });

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('prevents double-reload when both controllerchange and statechange→activated fire', async () => {
    const { installingWorker, waitingWorker, registration, swContainer } = makeSWEnv();
    const onClick = await triggerUpdateReady(registration, swContainer, installingWorker);

    registration.waiting = waitingWorker;
    act(() => {
      onClick();
    });

    // Both events fire — the refreshing guard must prevent two reloads
    await act(async () => {
      swContainer._emit('controllerchange');
      waitingWorker.state = 'activated';
      waitingWorker._emit('statechange');
    });

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('reloads immediately when Refresh is clicked and registration.waiting is null (already activated)', async () => {
    const { installingWorker, registration, swContainer } = makeSWEnv();
    const onClick = await triggerUpdateReady(registration, swContainer, installingWorker);

    // Waiting worker has already finished activating by the time user clicks
    registration.waiting = null;
    act(() => {
      onClick();
    });

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Periodic update check
  // -------------------------------------------------------------------------

  it('sets up an hourly interval that calls registration.update()', async () => {
    const { registration, swContainer } = makeSWEnv();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: swContainer,
    });

    render(<ServiceWorkerRegister />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(registration.update).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    });

    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it('logs a dev message when the periodic update check fails', async () => {
    const { registration, swContainer } = makeSWEnv();
    registration.update.mockRejectedValue(new Error('network'));
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: swContainer,
    });

    render(<ServiceWorkerRegister />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    });

    expect(mockLoggerDev).toHaveBeenCalledWith(
      'Service worker update check failed',
      expect.anything(),
    );
  });

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  it('clears the hourly update interval on unmount', async () => {
    const { registration, swContainer } = makeSWEnv();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: swContainer,
    });

    const { unmount } = render(<ServiceWorkerRegister />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    unmount();
    vi.clearAllMocks();

    // Advancing one more hour after unmount must not trigger any further update
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    });

    expect(registration.update).not.toHaveBeenCalled();
  });
});
