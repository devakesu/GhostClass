import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { act } from '@testing-library/react';

// Mock usePWAInstall so we control canInstall / triggerInstall
const mockTriggerInstall = vi.fn();
vi.mock('@/hooks/usePWAInstall', () => ({
  usePWAInstall: () => ({
    canInstall: true,
    isInstalled: false,
    triggerInstall: mockTriggerInstall,
  }),
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  m: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock lucide icons
vi.mock('lucide-react', () => ({
  Download: () => <span data-testid="download-icon" />,
  X: () => <span data-testid="x-icon" />,
}));

import { PWAInstallBanner } from '../pwa-install-banner';

const STORAGE_KEY = 'ghostclass_pwa_install_dismissed';

describe('PWAInstallBanner', () => {
  let localStorageMock: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn>; removeItem: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    localStorageMock = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    vi.stubGlobal('localStorage', localStorageMock);

    mockTriggerInstall.mockResolvedValue('accepted');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not show the banner before the delay elapses', () => {
    render(<PWAInstallBanner />);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('shows the banner after the show delay', async () => {
    render(<PWAInstallBanner />);
    await act(async () => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    expect(screen.getByText('Install GhostClass')).toBeInTheDocument();
  });

  it('stores "installed" in localStorage when user accepts the install prompt', async () => {
    mockTriggerInstall.mockResolvedValue('accepted');
    render(<PWAInstallBanner />);
    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    const installBtn = screen.getByRole('button', { name: /install ghostclass app/i });
    await act(async () => {
      fireEvent.click(installBtn);
    });

    expect(mockTriggerInstall).toHaveBeenCalled();
    expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEY, 'installed');
  });

  it('stores a timestamp when the native dialog is dismissed', async () => {
    mockTriggerInstall.mockResolvedValue('dismissed');
    render(<PWAInstallBanner />);
    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    const installBtn = screen.getByRole('button', { name: /install ghostclass app/i });
    await act(async () => {
      fireEvent.click(installBtn);
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEY, expect.stringMatching(/^\d+$/));
  });

  it('stores a timestamp when install is unavailable', async () => {
    mockTriggerInstall.mockResolvedValue('unavailable');
    render(<PWAInstallBanner />);
    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    const installBtn = screen.getByRole('button', { name: /install ghostclass app/i });
    await act(async () => {
      fireEvent.click(installBtn);
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEY, expect.stringMatching(/^\d+$/));
  });

  it('stores a timestamp and hides banner when dismiss (X) is clicked', async () => {
    render(<PWAInstallBanner />);
    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    const dismissBtn = screen.getByRole('button', { name: /dismiss install prompt/i });
    fireEvent.click(dismissBtn);

    expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEY, expect.stringMatching(/^\d+$/));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('does not show banner if localStorage says already installed', () => {
    localStorageMock.getItem.mockReturnValue('installed');
    render(<PWAInstallBanner />);
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('does not show banner if snooze period has not elapsed', () => {
    // Store a timestamp 1 hour ago (way less than 3-week snooze)
    const recentDismiss = (Date.now() - 60 * 60 * 1000).toString();
    localStorageMock.getItem.mockReturnValue(recentDismiss);
    render(<PWAInstallBanner />);
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('shows banner again when snooze period has elapsed', async () => {
    // Store a timestamp 4 weeks ago (beyond the 3-week snooze)
    const oldDismiss = (Date.now() - 28 * 24 * 60 * 60 * 1000).toString();
    localStorageMock.getItem.mockReturnValue(oldDismiss);
    render(<PWAInstallBanner />);
    await act(async () => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.getByRole('complementary')).toBeInTheDocument();
  });
});
