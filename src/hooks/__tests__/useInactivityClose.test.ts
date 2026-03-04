import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setStandaloneMode(isStandalone: boolean) {
  const original = window.matchMedia;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: isStandalone && query === '(display-mode: standalone)',
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

function fireVisibilityChange(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useInactivityClose', () => {
  let useInactivityClose: typeof import('@/hooks/useInactivityClose').useInactivityClose;
  let restoreMatchMedia: () => void;
  let closeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();

    restoreMatchMedia = setStandaloneMode(true);
    closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});

    const mod = await import('@/hooks/useInactivityClose');
    useInactivityClose = mod.useInactivityClose;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    restoreMatchMedia();
    closeSpy.mockRestore();
    // Reset hidden to false
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  });

  // -------------------------------------------------------------------------
  // Standalone guard
  // -------------------------------------------------------------------------

  it('does nothing when not in standalone mode', () => {
    restoreMatchMedia();
    restoreMatchMedia = setStandaloneMode(false);

    renderHook(() => useInactivityClose());
    fireVisibilityChange(true);
    vi.advanceTimersByTime(30 * 60 * 1000 + 1);

    expect(closeSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Background → timeout → close
  // -------------------------------------------------------------------------

  it('closes the app after the default 30 min timeout when backgrounded', () => {
    renderHook(() => useInactivityClose());

    fireVisibilityChange(true);
    vi.advanceTimersByTime(30 * 60 * 1000 - 1);
    expect(closeSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('respects a custom timeoutMs', () => {
    renderHook(() => useInactivityClose(5000));

    fireVisibilityChange(true);
    vi.advanceTimersByTime(4999);
    expect(closeSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Return to foreground cancels timer
  // -------------------------------------------------------------------------

  it('cancels the timer when the app returns to foreground', () => {
    renderHook(() => useInactivityClose());

    fireVisibilityChange(true);
    vi.advanceTimersByTime(10 * 60 * 1000); // 10 min into background

    fireVisibilityChange(false); // user returns
    vi.advanceTimersByTime(30 * 60 * 1000); // advance well past timeout

    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('restarts the timer on a subsequent background event', () => {
    renderHook(() => useInactivityClose(5000));

    fireVisibilityChange(true);
    vi.advanceTimersByTime(3000);
    fireVisibilityChange(false); // back to foreground — timer cancelled

    fireVisibilityChange(true); // backgrounded again
    vi.advanceTimersByTime(4999);
    expect(closeSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  it('removes visibilitychange listener on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => useInactivityClose());

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    removeSpy.mockRestore();
  });

  it('clears the timer on unmount before it fires', () => {
    const { unmount } = renderHook(() => useInactivityClose(5000));

    fireVisibilityChange(true); // schedules timer on this instance
    unmount();                   // cleanup should cancel it

    vi.advanceTimersByTime(10000); // well past the 5 s timeout
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('does not close after unmount even if backgrounded', () => {
    const { unmount } = renderHook(() => useInactivityClose(5000));
    unmount();

    fireVisibilityChange(true);
    vi.advanceTimersByTime(10000);

    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('starts timer immediately if document is already hidden on mount', () => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });

    renderHook(() => useInactivityClose(5000));

    vi.advanceTimersByTime(4999);
    expect(closeSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('does not schedule duplicate timers on repeated hidden events', () => {
    renderHook(() => useInactivityClose(5000));

    fireVisibilityChange(true); // first hidden — starts timer
    fireVisibilityChange(true); // second hidden — must not start a second timer

    vi.advanceTimersByTime(5000);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
