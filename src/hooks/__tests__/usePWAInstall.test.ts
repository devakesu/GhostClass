import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Helper to create a fake BeforeInstallPromptEvent (must be a real Event instance
// for jsdom's dispatchEvent type check to pass).
function makeFakePrompt(outcome: 'accepted' | 'dismissed') {
  return Object.assign(new Event('beforeinstallprompt'), {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome, platform: '' }),
    platforms: [] as string[],
  });
}

// The module uses module-level listeners; we reset them between tests via
// re-importing with vi.resetModules().
describe('usePWAInstall', () => {
  let usePWAInstall: typeof import('@/hooks/usePWAInstall').usePWAInstall;

  beforeEach(async () => {
    vi.resetModules();
    // Re-import fresh module so module-level state is reset
    const mod = await import('@/hooks/usePWAInstall');
    usePWAInstall = mod.usePWAInstall;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns canInstall=false and isInstalled=false when no prompt has fired', () => {
    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.canInstall).toBe(false);
    expect(result.current.isInstalled).toBe(false);
  });

  it('detects installed state via display-mode:standalone media query', async () => {
    vi.resetModules();
    // Override matchMedia to return standalone=true
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(display-mode: standalone)',
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    const { usePWAInstall: hook } = await import('@/hooks/usePWAInstall');
    const { result } = renderHook(() => hook());
    expect(result.current.isInstalled).toBe(true);
    expect(result.current.canInstall).toBe(false);

    // Restore default matchMedia mock
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('returns canInstall=true after beforeinstallprompt fires post-mount', async () => {
    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.canInstall).toBe(false);

    await act(async () => {
      window.dispatchEvent(makeFakePrompt('accepted'));
    });

    expect(result.current.canInstall).toBe(true);
  });

  it('triggerInstall returns "unavailable" when no prompt is available', async () => {
    const { result } = renderHook(() => usePWAInstall());
    let outcome!: 'accepted' | 'dismissed' | 'unavailable';
    await act(async () => { outcome = await result.current.triggerInstall(); });
    expect(outcome).toBe('unavailable');
  });

  it('triggerInstall returns "accepted" when user accepts the install dialog', async () => {
    const { result } = renderHook(() => usePWAInstall());

    await act(async () => {
      window.dispatchEvent(makeFakePrompt('accepted'));
    });

    let outcome!: 'accepted' | 'dismissed' | 'unavailable';
    await act(async () => { outcome = await result.current.triggerInstall(); });
    expect(outcome).toBe('accepted');
    // After install, canInstall should be false (prompt consumed)
    expect(result.current.canInstall).toBe(false);
  });

  it('triggerInstall returns "dismissed" when user cancels the install dialog', async () => {
    const { result } = renderHook(() => usePWAInstall());

    await act(async () => {
      window.dispatchEvent(makeFakePrompt('dismissed'));
    });

    let outcome!: 'accepted' | 'dismissed' | 'unavailable';
    await act(async () => { outcome = await result.current.triggerInstall(); });
    expect(outcome).toBe('dismissed');
  });

  it('updates isInstalled and clears canInstall when appinstalled fires', async () => {
    const { result } = renderHook(() => usePWAInstall());

    await act(async () => {
      window.dispatchEvent(makeFakePrompt('accepted'));
    });

    expect(result.current.canInstall).toBe(true);

    await act(async () => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    await waitFor(() => {
      expect(result.current.isInstalled).toBe(true);
      expect(result.current.canInstall).toBe(false);
    });
  });

  it('notifies all mounted hook instances when beforeinstallprompt fires', async () => {
    const { result: result1 } = renderHook(() => usePWAInstall());
    const { result: result2 } = renderHook(() => usePWAInstall());

    await act(async () => {
      window.dispatchEvent(makeFakePrompt('accepted'));
    });

    expect(result1.current.canInstall).toBe(true);
    expect(result2.current.canInstall).toBe(true);
  });

  it('removes subscriber on unmount so future firings are not received', async () => {
    const { result, unmount } = renderHook(() => usePWAInstall());

    unmount();

    await act(async () => {
      window.dispatchEvent(makeFakePrompt('accepted'));
    });

    // canInstall was false before unmount; dispatching after unmount should not change it
    expect(result.current.canInstall).toBe(false);
  });

  it('receives re-emitted beforeinstallprompt after previous prompt was consumed', async () => {
    const { result } = renderHook(() => usePWAInstall());

    // First firing
    await act(async () => { window.dispatchEvent(makeFakePrompt('accepted')); });
    expect(result.current.canInstall).toBe(true);

    // Consume the prompt
    await act(async () => { await result.current.triggerInstall(); });
    expect(result.current.canInstall).toBe(false);

    // Browser re-emits after consuming — hook must pick it up via persistent subscriber
    await act(async () => { window.dispatchEvent(makeFakePrompt('dismissed')); });
    expect(result.current.canInstall).toBe(true);
  });
});
