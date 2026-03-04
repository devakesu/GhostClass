import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockTriggerInstall = vi.fn();
const mockCanInstall = vi.fn();
const mockIsInstalled = vi.fn();

vi.mock('@/hooks/usePWAInstall', () => ({
  usePWAInstall: () => ({
    canInstall: mockCanInstall(),
    isInstalled: mockIsInstalled(),
    triggerInstall: mockTriggerInstall,
  }),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn() }),
}));

vi.mock('framer-motion', () => ({
  m: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement('div', props, children),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  LazyMotion: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  domAnimation: {},
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: any) =>
    React.createElement('button', { onClick, ...props }, children),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'ghostclass_pwa_install_dismissed';
const SNOOZE_DURATION_MS = 21 * 24 * 60 * 60 * 1000;

function setupLocalStorage(value: string | null) {
  const store: Record<string, string> = {};
  if (value !== null) store[STORAGE_KEY] = value;
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    _store: store,
  });
  return store;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PWAInstallBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockCanInstall.mockReturnValue(true);
    mockIsInstalled.mockReturnValue(false);
    mockTriggerInstall.mockResolvedValue('accepted');
    setupLocalStorage(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function importAndRender() {
    vi.resetModules();
    const { PWAInstallBanner } = await import('@/components/pwa-install-banner');
    const { container } = render(React.createElement(PWAInstallBanner));
    return container;
  }

  it('does not show banner immediately — waits for SHOW_DELAY_MS', async () => {
    await importAndRender();
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('shows banner after SHOW_DELAY_MS when canInstall=true and no storage entry', async () => {
    await importAndRender();
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(screen.getByRole('complementary')).toBeInTheDocument();
  });

  it('does not show banner when isInstalled=true', async () => {
    mockIsInstalled.mockReturnValue(true);
    await importAndRender();
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('does not show banner when canInstall=false', async () => {
    mockCanInstall.mockReturnValue(false);
    await importAndRender();
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('does not show banner when localStorage has "installed"', async () => {
    setupLocalStorage('installed');
    await importAndRender();
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('does not show banner when isInstalled=true even if localStorage is cleared (standalone mode)', async () => {
    // Simulates: user clears site data while app is already installed in standalone mode.
    // shouldShowBanner(isInstalled=true) must short-circuit and return false.
    mockIsInstalled.mockReturnValue(true);
    mockCanInstall.mockReturnValue(true); // canInstall=true would normally allow the banner
    setupLocalStorage(null); // localStorage has been cleared
    await importAndRender();
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('hides visible banner when isInstalled transitions to true mid-session', async () => {
    // Simulates: banner is showing, then the app transitions to standalone
    // (user adds via browser menu). The banner should hide immediately.
    vi.resetModules();
    const { PWAInstallBanner } = await import('@/components/pwa-install-banner');
    const { rerender } = render(React.createElement(PWAInstallBanner));

    // Banner shows after delay with canInstall=true, isInstalled=false
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(screen.getByRole('complementary')).toBeInTheDocument();

    // App transitions to standalone — isInstalled becomes true
    mockIsInstalled.mockReturnValue(true);
    rerender(React.createElement(PWAInstallBanner));

    // Banner must now be hidden
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('does not show banner when dismissed recently (within snooze period)', async () => {
    setupLocalStorage(String(Date.now() - 1000)); // 1 second ago
    await importAndRender();
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('shows banner again when snooze period has elapsed', async () => {
    setupLocalStorage(String(Date.now() - SNOOZE_DURATION_MS - 1000)); // just past snooze
    await importAndRender();
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(screen.getByRole('complementary')).toBeInTheDocument();
  });

  it('sets localStorage to "installed" and hides banner when install is accepted', async () => {
    mockTriggerInstall.mockResolvedValue('accepted');
    const store = setupLocalStorage(null);
    await importAndRender();

    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(screen.getByRole('complementary')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /install ghostclass app/i }));
    });

    expect(screen.queryByRole('complementary')).toBeNull();
    expect(store[STORAGE_KEY]).toBe('installed');
  });

  it('shows success toast and hides banner when install is accepted', async () => {
    mockTriggerInstall.mockResolvedValue('accepted');
    setupLocalStorage(null);
    // importAndRender calls vi.resetModules() — import sonner after that so
    // we share the same mock instance as the component.
    await importAndRender();
    const { toast } = await import('sonner');

    await act(async () => { vi.advanceTimersByTime(2500); });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /install ghostclass app/i }));
    });

    // Toast is shown after the install prompt is accepted
    expect((toast as unknown as { success: ReturnType<typeof vi.fn> }).success).toHaveBeenCalledWith(
      'GhostClass is installing!',
      expect.objectContaining({ description: 'Next time, open it from your home screen.' }),
    );
  });

  it('sets localStorage to a timestamp and hides banner when install is dismissed', async () => {
    mockTriggerInstall.mockResolvedValue('dismissed');
    const store = setupLocalStorage(null);
    const before = Date.now();
    await importAndRender();

    await act(async () => { vi.advanceTimersByTime(2500); });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /install ghostclass app/i }));
    });

    expect(screen.queryByRole('complementary')).toBeNull();
    const stored = parseInt(store[STORAGE_KEY], 10);
    expect(stored).toBeGreaterThanOrEqual(before);
    expect(stored).not.toBe(NaN);
  });

  it('snoozes (timestamp) and hides banner when X dismiss button is clicked', async () => {
    const store = setupLocalStorage(null);
    const before = Date.now();
    await importAndRender();

    await act(async () => { vi.advanceTimersByTime(2500); });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /dismiss install prompt/i }));
    });

    expect(screen.queryByRole('complementary')).toBeNull();
    const stored = parseInt(store[STORAGE_KEY], 10);
    expect(stored).toBeGreaterThanOrEqual(before);
    expect(store[STORAGE_KEY]).not.toBe('installed');
  });

  it('does not show banner when localStorage.getItem throws (shouldShowBanner catch)', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('storage denied'); },
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });
    await importAndRender();
    await act(async () => { vi.advanceTimersByTime(2500); });
    // shouldShowBanner catches the error and returns false → banner stays hidden
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('hides banner gracefully when localStorage.setItem throws during accepted install', async () => {
    mockTriggerInstall.mockResolvedValue('accepted');
    const getStore: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => getStore[key] ?? null,
      setItem: () => { throw new Error('storage denied'); },
      removeItem: vi.fn(),
      clear: vi.fn(),
    });
    await importAndRender();
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(screen.getByRole('complementary')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /install ghostclass app/i }));
    });
    // Banner hides despite the storage error
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('hides banner gracefully when localStorage.setItem throws during dismiss', async () => {
    const getStore: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => getStore[key] ?? null,
      setItem: () => { throw new Error('storage denied'); },
      removeItem: vi.fn(),
      clear: vi.fn(),
    });
    await importAndRender();
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(screen.getByRole('complementary')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /dismiss install prompt/i }));
    });
    // Banner hides despite the storage error
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('hides banner without writing to storage when triggerInstall returns "unavailable" (prompt threw)', async () => {
    // Simulate the native install prompt throwing — e.g. browser rate-limiting on mobile
    mockTriggerInstall.mockResolvedValue('unavailable');
    const store = setupLocalStorage(null);
    await importAndRender();

    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(screen.getByRole('complementary')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /install ghostclass app/i }));
    });

    // Banner must close
    expect(screen.queryByRole('complementary')).toBeNull();
    // No storage entry written — banner can re-appear when browser re-emits the event
    expect(store[STORAGE_KEY]).toBeUndefined();
  });
});
