import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const { mockToast, mockDismiss } = vi.hoisted(() => ({
  mockToast: vi.fn().mockReturnValue('toast-id-1'),
  mockDismiss: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(mockToast, { dismiss: mockDismiss }),
}));

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

/** Fire popstate with sentinel state (simulates user hitting the root/sentinel). */
function fireSentinelPopState() {
  window.dispatchEvent(new PopStateEvent('popstate', { state: { __gce: true } }));
}

/** Fire popstate with no sentinel state (simulates mid-app back navigation). */
function fireMidAppPopState() {
  window.dispatchEvent(new PopStateEvent('popstate', { state: { page: 'dashboard' } }));
}

function setPath(path: string) {
  history.replaceState(history.state, '', path);
}

describe('useBackToExit', () => {
  let useBackToExit: typeof import('@/hooks/useBackToExit').useBackToExit;
  let restoreMatchMedia: () => void;
  let pushStateSpy: ReturnType<typeof vi.spyOn>;
  let replaceStateSpy: ReturnType<typeof vi.spyOn>;
  let closeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();

    restoreMatchMedia = setStandaloneMode(true);
    pushStateSpy = vi.spyOn(history, 'pushState');
    replaceStateSpy = vi.spyOn(history, 'replaceState');
    closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});

    const mod = await import('@/hooks/useBackToExit');
    useBackToExit = mod.useBackToExit;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    restoreMatchMedia();
    pushStateSpy.mockRestore();
    replaceStateSpy.mockRestore();
    closeSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Standalone guard
  // -------------------------------------------------------------------------

  it('does nothing when not in standalone mode', () => {
    restoreMatchMedia();
    restoreMatchMedia = setStandaloneMode(false);

    renderHook(() => useBackToExit());

    expect(pushStateSpy).not.toHaveBeenCalled();
    fireSentinelPopState();
    expect(mockToast).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Sentinel push on mount
  // -------------------------------------------------------------------------

  it('marks root entry with sentinel (replaceState) and pushes clean top on mount', () => {
    renderHook(() => useBackToExit());
    // Root entry is marked with __gce via replaceState (preserves existing state)
    expect(replaceStateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ __gce: true }),
      '',
      expect.any(String),
    );
    // Clean top entry is pushed WITHOUT __gce so mid-app backs are not caught
    expect(pushStateSpy).toHaveBeenCalledWith(
      expect.not.objectContaining({ __gce: true }),
      '',
      expect.any(String),
    );
  });

  // -------------------------------------------------------------------------
  // Mid-app back press — ignored entirely
  // -------------------------------------------------------------------------

  it('does not show toast on a mid-app back press (non-sentinel state)', () => {
    renderHook(() => useBackToExit());
    pushStateSpy.mockClear();

    act(() => { fireMidAppPopState(); });

    expect(mockToast).not.toHaveBeenCalled();
    // Sentinel must not be re-pushed for mid-app navigation
    expect(pushStateSpy).not.toHaveBeenCalled();
  });

  it('does not show toast on a popstate with null state', () => {
    renderHook(() => useBackToExit());

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    });

    expect(mockToast).not.toHaveBeenCalled();
  });

  it('shows toast after the second qualifying non-dashboard back press', () => {
    renderHook(() => useBackToExit());

    act(() => {
      setPath('/tracking');
      fireMidAppPopState();
    });
    expect(mockToast).not.toHaveBeenCalled();

    act(() => {
      setPath('/tracking');
      fireMidAppPopState();
    });
    expect(mockToast).toHaveBeenCalledWith(
      'Press back again to exit',
      expect.objectContaining({ duration: 2000 }),
    );
  });

  it('closes on further qualifying non-dashboard back after toast is shown', () => {
    renderHook(() => useBackToExit());

    act(() => {
      setPath('/scores');
      fireMidAppPopState();
    });
    act(() => {
      setPath('/scores');
      fireMidAppPopState();
    });

    act(() => {
      vi.advanceTimersByTime(500);
      setPath('/scores');
      fireMidAppPopState();
    });

    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('requires two qualifying non-dashboard backs again after deep-mode threshold expires', () => {
    renderHook(() => useBackToExit());

    act(() => {
      setPath('/tracking');
      fireMidAppPopState();
    });
    act(() => {
      setPath('/tracking');
      fireMidAppPopState();
    });
    expect(mockToast).toHaveBeenCalledTimes(1);

    // Let deep-mode window expire, then press back once: should NOT re-show toast.
    act(() => {
      vi.advanceTimersByTime(2500);
      setPath('/tracking');
      fireMidAppPopState();
    });
    expect(mockToast).toHaveBeenCalledTimes(1);

    // Second qualifying back after expiry should show a fresh toast.
    act(() => {
      setPath('/tracking');
      fireMidAppPopState();
    });
    expect(mockToast).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // First sentinel hit — shows toast, re-pushes sentinel
  // -------------------------------------------------------------------------

  it('shows toast when user hits the sentinel (back at root)', () => {
    renderHook(() => useBackToExit());
    pushStateSpy.mockClear();

    act(() => { fireSentinelPopState(); });

    expect(mockToast).toHaveBeenCalledWith(
      'Press back again to exit',
      expect.objectContaining({ duration: 2000 }),
    );
  });

  it('re-pushes a clean top entry (no sentinel) after first hit so the next press is catchable', () => {
    renderHook(() => useBackToExit());
    pushStateSpy.mockClear();

    act(() => { fireSentinelPopState(); });

    // A new clean top is pushed WITHOUT __gce (derived from event.state minus sentinel)
    expect(pushStateSpy).toHaveBeenCalledWith(
      expect.not.objectContaining({ __gce: true }),
      '',
      expect.any(String),
    );
  });

  // -------------------------------------------------------------------------
  // Second sentinel hit within threshold → window.close()
  // -------------------------------------------------------------------------

  it('calls window.close() on second sentinel hit within 2 s', () => {
    renderHook(() => useBackToExit());
    mockToast.mockReturnValueOnce('toast-42');

    act(() => { fireSentinelPopState(); });
    act(() => {
      vi.advanceTimersByTime(500);
      fireSentinelPopState();
    });

    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('dismisses toast before closing on second sentinel hit', () => {
    renderHook(() => useBackToExit());
    mockToast.mockReturnValueOnce('toast-42');

    act(() => { fireSentinelPopState(); });
    act(() => {
      vi.advanceTimersByTime(500);
      fireSentinelPopState();
    });

    expect(mockDismiss).toHaveBeenCalledWith('toast-42');
  });

  // -------------------------------------------------------------------------
  // Second sentinel hit AFTER threshold → fresh first press
  // -------------------------------------------------------------------------

  it('treats a sentinel hit after the threshold as a new first press', () => {
    renderHook(() => useBackToExit());

    act(() => { fireSentinelPopState(); });
    expect(mockToast).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(2500);
      fireSentinelPopState();
    });

    expect(mockToast).toHaveBeenCalledTimes(2);
    expect(closeSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Mid-app press does NOT trigger close even after sentinel toast shown
  // -------------------------------------------------------------------------

  it('cancels the exit toast and resets state when a mid-app back fires while toast is showing', () => {
    mockToast.mockReturnValueOnce('toast-mid');
    renderHook(() => useBackToExit());

    act(() => { fireSentinelPopState(); }); // root hit — toast shown
    act(() => {
      vi.advanceTimersByTime(500);
      fireMidAppPopState(); // mid-app back — must cancel the countdown
    });

    expect(mockDismiss).toHaveBeenCalledWith('toast-mid');
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('does not close when sentinel → mid-app back → sentinel within threshold (mid-app resets countdown)', () => {
    renderHook(() => useBackToExit());

    act(() => { fireSentinelPopState(); }); // first root hit
    act(() => {
      vi.advanceTimersByTime(500);
      fireMidAppPopState();  // navigated away — resets countdown
    });
    act(() => {
      vi.advanceTimersByTime(100);
      fireSentinelPopState(); // root again, but countdown was reset — NOT a close
    });

    expect(closeSpy).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledTimes(2); // each root hit shows a fresh toast
  });

  // -------------------------------------------------------------------------
  // Toast callbacks reset state
  // -------------------------------------------------------------------------

  it('resets state when toast auto-closes', () => {
    renderHook(() => useBackToExit());

    act(() => { fireSentinelPopState(); });
    const { onAutoClose } = mockToast.mock.calls[0][1] as { onAutoClose: () => void };
    act(() => { onAutoClose(); });

    act(() => { fireSentinelPopState(); });
    expect(mockToast).toHaveBeenCalledTimes(2);
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('resets state when toast is manually dismissed', () => {
    renderHook(() => useBackToExit());

    act(() => { fireSentinelPopState(); });
    const { onDismiss } = mockToast.mock.calls[0][1] as { onDismiss: () => void };
    act(() => { onDismiss(); });

    act(() => { fireSentinelPopState(); });
    expect(mockToast).toHaveBeenCalledTimes(2);
    expect(closeSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  it('removes the popstate listener on unmount', () => {
    const removeListenerSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useBackToExit());

    unmount();

    expect(removeListenerSpy).toHaveBeenCalledWith('popstate', expect.any(Function));
    removeListenerSpy.mockRestore();
  });

  it('does not show toast after unmount', () => {
    const { unmount } = renderHook(() => useBackToExit());
    unmount();

    act(() => { fireSentinelPopState(); });
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('dismisses active toast on unmount', () => {
    mockToast.mockReturnValueOnce('toast-unmount');
    const { unmount } = renderHook(() => useBackToExit());

    act(() => { fireSentinelPopState(); }); // show toast
    expect(mockToast).toHaveBeenCalledTimes(1);

    unmount();
    expect(mockDismiss).toHaveBeenCalledWith('toast-unmount');
  });

  it('does not re-initialize sentinel on StrictMode re-mount (module-level flag guard)', () => {
    // First mount — initializes the sentinel (replaceState + pushState)
    const { unmount } = renderHook(() => useBackToExit());
    replaceStateSpy.mockClear();
    pushStateSpy.mockClear();

    unmount();

    // Second mount in the same module context (StrictMode / HMR re-mount).
    // sentinelInitialized is already true → no extra replaceState or pushState.
    renderHook(() => useBackToExit());

    expect(replaceStateSpy).not.toHaveBeenCalled();
    expect(pushStateSpy).not.toHaveBeenCalled();
  });
});
