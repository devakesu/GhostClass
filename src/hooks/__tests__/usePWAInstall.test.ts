import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// usePWAInstall uses module-level state (_earlyPrompt). We isolate each test
// by resetting that state via window event dispatch and by using vi.resetModules()
// where needed. For most cases we import the hook directly.
import { usePWAInstall } from '@/hooks/usePWAInstall';

describe('usePWAInstall', () => {
  // Helper: build a minimal BeforeInstallPromptEvent mock
  const makePromptEvent = (outcome: 'accepted' | 'dismissed' = 'accepted') => ({
    preventDefault: vi.fn(),
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome, platform: '' }),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns canInstall=false and isInstalled=false when no prompt is available', () => {
    const { result } = renderHook(() => usePWAInstall());
    // No beforeinstallprompt event has fired
    expect(result.current.canInstall).toBe(false);
    expect(result.current.isInstalled).toBe(false);
  });

  it('triggerInstall returns "unavailable" when there is no deferred prompt', async () => {
    const { result } = renderHook(() => usePWAInstall());
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.triggerInstall();
    });
    expect(outcome).toBe('unavailable');
  });

  it('updates canInstall when beforeinstallprompt fires after mount', async () => {
    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.canInstall).toBe(false);

    const fakeEvent = makePromptEvent();

    act(() => {
      window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), fakeEvent));
    });

    await waitFor(() => {
      expect(result.current.canInstall).toBe(true);
    });
  });

  it('triggerInstall returns "accepted" when the user accepts the prompt', async () => {
    const { result } = renderHook(() => usePWAInstall());
    const fakeEvent = makePromptEvent('accepted');

    act(() => {
      window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), fakeEvent));
    });

    await waitFor(() => expect(result.current.canInstall).toBe(true));

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.triggerInstall();
    });

    expect(outcome).toBe('accepted');
    // After install prompt, canInstall should be false
    expect(result.current.canInstall).toBe(false);
  });

  it('triggerInstall returns "dismissed" when the user dismisses the prompt', async () => {
    const { result } = renderHook(() => usePWAInstall());
    const fakeEvent = makePromptEvent('dismissed');

    act(() => {
      window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), fakeEvent));
    });

    await waitFor(() => expect(result.current.canInstall).toBe(true));

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.triggerInstall();
    });
    expect(outcome).toBe('dismissed');
  });

  it('sets isInstalled=true and canInstall=false when appinstalled fires', async () => {
    const { result } = renderHook(() => usePWAInstall());
    const fakeEvent = makePromptEvent();

    act(() => {
      window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), fakeEvent));
    });
    await waitFor(() => expect(result.current.canInstall).toBe(true));

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    await waitFor(() => {
      expect(result.current.isInstalled).toBe(true);
      expect(result.current.canInstall).toBe(false);
    });
  });

  it('detects already-installed state from display-mode media query', () => {
    // Override matchMedia to report standalone mode
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: query === '(display-mode: standalone)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.isInstalled).toBe(true);
    expect(result.current.canInstall).toBe(false);
  });

  it('cleans up appinstalled listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => usePWAInstall());
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('appinstalled', expect.any(Function));
  });
});
