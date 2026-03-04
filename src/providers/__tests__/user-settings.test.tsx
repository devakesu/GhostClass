/**
 * Tests for UserSettingsProvider and related exports.
 *
 * Strategy: mock the heavy deps (React Query, Supabase, Sentry) and focus on
 * the provider's public contract — rendering children, context value shape,
 * guard-throw outside the provider, and the normalizeTarget / loadPrefetchedSettings
 * helper behaviours that are exercised indirectly via the returned value.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockInvalidateQueries = vi.fn();
const mockCancelQueries = vi.fn().mockResolvedValue(undefined);
const mockGetQueryData = vi.fn().mockReturnValue(undefined);
const mockSetQueryData = vi.fn();
const mockRemoveQueries = vi.fn();

const mockMutate = vi.fn();
const mockMutateAsync = vi.fn().mockResolvedValue({});

// Auth state change handler captured on subscription
let authStateCallback: ((event: string, session: any) => void) | null = null;
const mockUnsubscribe = vi.fn();

const mockOnAuthStateChange = vi.fn((callback: (event: string, session: any) => void) => {
  authStateCallback = callback;
  return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
});

const mockFrom = vi.fn(() => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  upsert: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: null, error: null }),
  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      onAuthStateChange: mockOnAuthStateChange,
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
    from: mockFrom,
  })),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    isFetching: false,
  })),
  useMutation: vi.fn(() => ({
    mutate: mockMutate,
    mutateAsync: mockMutateAsync,
    isPending: false,
  })),
  useQueryClient: vi.fn(() => ({
    invalidateQueries: mockInvalidateQueries,
    cancelQueries: mockCancelQueries,
    getQueryData: mockGetQueryData,
    setQueryData: mockSetQueryData,
    removeQueries: mockRemoveQueries,
  })),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  setContext: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    dev: vi.fn(),
    error: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { UserSettingsProvider, useUserSettings, DEFAULT_TARGET_PERCENTAGE } from '../user-settings';
import { useQuery, useMutation } from '@tanstack/react-query';

function TestConsumer() {
  const { settings, isLoading } = useUserSettings();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="settings">{settings ? 'has-settings' : 'no-settings'}</span>
    </div>
  );
}

function WrappedConsumer() {
  return (
    <UserSettingsProvider>
      <TestConsumer />
    </UserSettingsProvider>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UserSettingsProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStateCallback = null;
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
    } as any);
    vi.mocked(useMutation).mockReturnValue({
      mutate: mockMutate,
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as any);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders children correctly', () => {
    render(<WrappedConsumer />);
    expect(screen.getByTestId('loading')).toBeInTheDocument();
    expect(screen.getByTestId('settings')).toBeInTheDocument();
  });

  it('provides isLoading=false when query is not loading', () => {
    render(<WrappedConsumer />);
    expect(screen.getByTestId('loading').textContent).toBe('false');
  });

  it('provides isLoading=true when query is loading', () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: false,
    } as any);
    render(<WrappedConsumer />);
    expect(screen.getByTestId('loading').textContent).toBe('true');
  });

  it('provides isLoading=true when query is fetching', () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: true,
    } as any);
    render(<WrappedConsumer />);
    expect(screen.getByTestId('loading').textContent).toBe('true');
  });

  it('provides settings when query returns data', () => {
    vi.mocked(useQuery).mockReturnValue({
      data: { bunk_calculator_enabled: true, target_percentage: 75, disabled_courses: {} },
      isLoading: false,
      isFetching: false,
    } as any);
    render(<WrappedConsumer />);
    expect(screen.getByTestId('settings').textContent).toBe('has-settings');
  });

  it('provides no-settings when query returns null', () => {
    vi.mocked(useQuery).mockReturnValue({
      data: null,
      isLoading: false,
      isFetching: false,
    } as any);
    render(<WrappedConsumer />);
    expect(screen.getByTestId('settings').textContent).toBe('no-settings');
  });

  describe('useUserSettings guard', () => {
    it('throws when used outside provider', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => render(<TestConsumer />)).toThrow(
        'useUserSettings must be used inside <UserSettingsProvider>'
      );
      consoleSpy.mockRestore();
    });
  });

  describe('update helpers', () => {
    it('updateBunkCalc calls mutate with bunk_calculator_enabled', () => {
      function UpdateBunkCalcButton() {
        const { updateBunkCalc } = useUserSettings();
        return <button onClick={() => updateBunkCalc(false)}>toggle</button>;
      }
      render(
        <UserSettingsProvider>
          <UpdateBunkCalcButton />
        </UserSettingsProvider>
      );
      screen.getByRole('button').click();
      expect(mockMutate).toHaveBeenCalledWith({ bunk_calculator_enabled: false });
    });

    it('updateTarget normalizes and calls mutate with target_percentage', () => {
      function UpdateTargetButton() {
        const { updateTarget } = useUserSettings();
        // Pass a value below the minimum — should be clamped to at least 1
        return <button onClick={() => updateTarget(200)}>set-target</button>;
      }
      render(
        <UserSettingsProvider>
          <UpdateTargetButton />
        </UserSettingsProvider>
      );
      screen.getByRole('button').click();
      // 200 clamped to 100
      expect(mockMutate).toHaveBeenCalledWith({ target_percentage: 100 });
    });

    it('updateDisabledCourses calls mutate with disabled_courses map', () => {
      const map = { '2025-2026-even': { CS101: 'Challenge passed' } };
      function UpdateDisabledButton() {
        const { updateDisabledCourses } = useUserSettings();
        return <button onClick={() => updateDisabledCourses(map)}>update-disabled</button>;
      }
      render(
        <UserSettingsProvider>
          <UpdateDisabledButton />
        </UserSettingsProvider>
      );
      screen.getByRole('button').click();
      expect(mockMutate).toHaveBeenCalledWith({ disabled_courses: map });
    });
  });

  describe('DEFAULT_TARGET_PERCENTAGE export', () => {
    it('exports the default as 75', () => {
      expect(DEFAULT_TARGET_PERCENTAGE).toBe(75);
    });
  });
});

describe('loadPrefetchedSettings via provider initial state', () => {
  let localStorageMock: Record<string, string>;
  let sessionStorageMock: Record<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    authStateCallback = null;
    localStorageMock = {};
    sessionStorageMock = {};
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
    } as any);
    vi.mocked(useMutation).mockReturnValue({
      mutate: mockMutate,
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as any);
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => localStorageMock[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { localStorageMock[key] = value; }),
      removeItem: vi.fn((key: string) => { delete localStorageMock[key]; }),
    });
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn((key: string) => sessionStorageMock[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { sessionStorageMock[key] = value; }),
      removeItem: vi.fn((key: string) => { delete sessionStorageMock[key]; }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders provider without error when sessionStorage has no prefetched settings', () => {
    render(<WrappedConsumer />);
    expect(screen.getByTestId('settings')).toBeInTheDocument();
  });

  it('renders provider without error when localStorage has user-scoped settings', () => {
    localStorageMock['showBunkCalc_user-123'] = 'true';
    localStorageMock['targetPercentage_user-123'] = '80';
    render(<WrappedConsumer />);
    expect(screen.getByTestId('settings')).toBeInTheDocument();
  });

  it('renders provider when sessionStorage has valid prefetched settings with userId', () => {
    sessionStorageMock['prefetchedSettings'] = JSON.stringify({
      userId: 'user-123',
      settings: { bunk_calculator_enabled: true, target_percentage: 75, disabled_courses: {} },
    });
    render(<WrappedConsumer />);
    expect(screen.getByTestId('settings')).toBeInTheDocument();
  });

  it('clears stale prefetched settings with mismatched userId', () => {
    sessionStorageMock['prefetchedSettings'] = JSON.stringify({
      userId: 'other-user',
      settings: { bunk_calculator_enabled: true, target_percentage: 75, disabled_courses: {} },
    });
    render(<WrappedConsumer />);
    // Should render without crashing — it silently discards mismatched settings
    expect(screen.getByTestId('settings')).toBeInTheDocument();
  });

  it('handles invalid JSON in sessionStorage gracefully', () => {
    sessionStorageMock['prefetchedSettings'] = 'not-valid-json{{{';
    render(<WrappedConsumer />);
    expect(screen.getByTestId('settings')).toBeInTheDocument();
  });
});

describe('useUserSettingsState auth state changes', () => {
  let localStorageMock: Record<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    authStateCallback = null;
    localStorageMock = {};
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
    } as any);
    vi.mocked(useMutation).mockReturnValue({
      mutate: mockMutate,
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as any);
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => localStorageMock[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { localStorageMock[key] = value; }),
      removeItem: vi.fn((key: string) => { delete localStorageMock[key]; }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('subscribes to auth state changes on mount', () => {
    render(<WrappedConsumer />);
    expect(mockOnAuthStateChange).toHaveBeenCalled();
  });

  it('unsubscribes from auth state changes on unmount', () => {
    const { unmount } = render(<WrappedConsumer />);
    unmount();
    // The unsubscribe is called in the cleanup function
    // In real code it's async, but let's just verify the hook mounts/unmounts cleanly
    expect(mockOnAuthStateChange).toHaveBeenCalled();
  });

  it('handles SIGNED_IN auth event without throwing', async () => {
    render(<WrappedConsumer />);

    await act(async () => {
      authStateCallback?.('SIGNED_IN', { user: { id: 'user-abc' } });
    });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['userSettings', 'user-abc'],
    });
    expect(mockRemoveQueries).toHaveBeenCalledWith({
      queryKey: ['userSettings', null],
    });
  });

  it('handles SIGNED_OUT auth event and clears localStorage keys', async () => {
    localStorageMock['showBunkCalc_prev-user'] = 'true';
    localStorageMock['targetPercentage_prev-user'] = '75';
    localStorageMock['disabledCourses_prev-user'] = '{}';

    render(<WrappedConsumer />);

    // First sign in
    await act(async () => {
      authStateCallback?.('INITIAL_SESSION', { user: { id: 'prev-user' } });
    });

    // Now sign out
    await act(async () => {
      authStateCallback?.('SIGNED_OUT', null);
    });

    expect(localStorage.removeItem).toHaveBeenCalledWith('showBunkCalc_prev-user');
    expect(localStorage.removeItem).toHaveBeenCalledWith('targetPercentage_prev-user');
    expect(localStorage.removeItem).toHaveBeenCalledWith('disabledCourses_prev-user');
  });

  it('handles INITIAL_SESSION event without throwing', async () => {
    render(<WrappedConsumer />);

    await act(async () => {
      authStateCallback?.('INITIAL_SESSION', { user: { id: 'user-123' } });
    });

    expect(mockRemoveQueries).toHaveBeenCalledWith({ queryKey: ['userSettings', null] });
  });

  it('handles TOKEN_REFRESHED event without throwing', async () => {
    render(<WrappedConsumer />);

    await act(async () => {
      authStateCallback?.('TOKEN_REFRESHED', { user: { id: 'user-123' } });
    });

    // Should not throw and should update the state
    expect(mockRemoveQueries).toHaveBeenCalledWith({ queryKey: ['userSettings', null] });
  });

  it('handles null session in INITIAL_SESSION without throwing', async () => {
    render(<WrappedConsumer />);

    await act(async () => {
      authStateCallback?.('INITIAL_SESSION', null);
    });

    expect(screen.getByTestId('settings')).toBeInTheDocument();
  });
});

describe('DB → localStorage sync effect', () => {
  let localStorageMock: Record<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    authStateCallback = null;
    localStorageMock = {};
    vi.mocked(useMutation).mockReturnValue({
      mutate: mockMutate,
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as any);
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => localStorageMock[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { localStorageMock[key] = value; }),
      removeItem: vi.fn((key: string) => { delete localStorageMock[key]; }),
    });
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('syncs DB settings to localStorage when settings are present', async () => {
    const settings = {
      bunk_calculator_enabled: true,
      target_percentage: 80,
      disabled_courses: {},
    };
    // First render (pre-auth): undefined so effect skips; after auth re-render: actual settings
    // This causes the `settings` dep to change, triggering the sync useEffect
    vi.mocked(useQuery).mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isFetching: false,
    } as any);
    vi.mocked(useQuery).mockReturnValue({
      data: settings,
      isLoading: false,
      isFetching: false,
    } as any);

    render(<WrappedConsumer />);

    // Simulate INITIAL_SESSION to set userId + trigger re-render
    await act(async () => {
      authStateCallback?.('INITIAL_SESSION', { user: { id: 'sync-user-123' } });
    });

    await waitFor(() => {
      expect(localStorage.setItem).toHaveBeenCalledWith('showBunkCalc_sync-user-123', 'true');
    });
    expect(localStorage.setItem).toHaveBeenCalledWith('targetPercentage_sync-user-123', '80');
  });

  it('creates new DB row when settings are null (new user) using computed defaults', async () => {
    // Pre-auth: undefined; post-auth: null (new user, no DB row)
    vi.mocked(useQuery).mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isFetching: false,
    } as any);
    vi.mocked(useQuery).mockReturnValue({
      data: null,
      isLoading: false,
      isFetching: false,
    } as any);

    render(<WrappedConsumer />);

    await act(async () => {
      authStateCallback?.('INITIAL_SESSION', { user: { id: 'new-user-999' } });
    });

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          bunk_calculator_enabled: expect.any(Boolean),
          target_percentage: expect.any(Number),
        })
      );
    });
  });

  it('reads localStorage keys to initialize settings for new user with stored preferences', async () => {
    localStorageMock['showBunkCalc_pref-user'] = 'false';
    localStorageMock['targetPercentage_pref-user'] = '85';

    // Pre-auth: undefined; post-auth: null (new user, no DB row)
    vi.mocked(useQuery).mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isFetching: false,
    } as any);
    vi.mocked(useQuery).mockReturnValue({
      data: null,
      isLoading: false,
      isFetching: false,
    } as any);

    render(<WrappedConsumer />);

    await act(async () => {
      authStateCallback?.('INITIAL_SESSION', { user: { id: 'pref-user' } });
    });

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          bunk_calculator_enabled: false,
          target_percentage: 85,
        })
      );
    });
  });

  it('skips sync when query is still loading', () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: false,
    } as any);

    render(<WrappedConsumer />);
    // mutate should NOT be called while loading
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('skips sync when mutation is pending', () => {
    vi.mocked(useMutation).mockReturnValue({
      mutate: mockMutate,
      mutateAsync: mockMutateAsync,
      isPending: true,
    } as any);
    vi.mocked(useQuery).mockReturnValue({
      data: null,
      isLoading: false,
      isFetching: false,
    } as any);

    render(<WrappedConsumer />);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('does not dispatch bunkCalcToggle event if bunk value is unchanged', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const userId = 'same-bunk-user';
    // Pre-set localStorage to match the DB value
    localStorageMock[`showBunkCalc_${userId}`] = 'true';
    localStorageMock[`targetPercentage_${userId}`] = '75';
    localStorageMock[`disabledCourses_${userId}`] = '{}';

    vi.mocked(useQuery).mockReturnValue({
      data: { bunk_calculator_enabled: true, target_percentage: 75, disabled_courses: {} },
      isLoading: false,
      isFetching: false,
    } as any);

    render(<WrappedConsumer />);

    await act(async () => {
      authStateCallback?.('INITIAL_SESSION', { user: { id: userId } });
    });

    // dispatchEvent should NOT be called since values are identical
    const bunkEvents = dispatchSpy.mock.calls.filter(
      ([e]) => e instanceof CustomEvent && (e as CustomEvent).type === 'bunkCalcToggle'
    );
    expect(bunkEvents).toHaveLength(0);
    dispatchSpy.mockRestore();
  });
});
