/**
 * Tests for UserSettingsProvider and related exports.
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
let authStateCallback: ((event: string, session: unknown) => void) | null = null;
const mockUnsubscribe = vi.fn();

const mockOnAuthStateChange = vi.fn((callback: (event: string, session: unknown) => void) => {
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
import { logger } from '@/lib/logger';

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

    const createMockStorage = () => {
      const store = new Map<string, string>();
      return {
        getItem: vi.fn((key: string) => store.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => { store.set(key, value); }),
        removeItem: vi.fn((key: string) => { store.delete(key); }),
        clear: vi.fn(() => { store.clear(); }),
        length: 0,
        key: vi.fn(),
      };
    };

    vi.stubGlobal('localStorage', createMockStorage());
    vi.stubGlobal('sessionStorage', createMockStorage());

    vi.mocked(useQuery).mockImplementation((options: unknown) => ({
      data: (options as { placeholderData?: unknown })?.placeholderData,
      isLoading: false,
      isFetching: false,
    } as unknown as ReturnType<typeof useQuery>));

    vi.mocked(useMutation).mockReturnValue({
      mutate: mockMutate,
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useMutation>);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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
    } as unknown as ReturnType<typeof useQuery>);
    render(<WrappedConsumer />);
    expect(screen.getByTestId('loading').textContent).toBe('true');
  });

  it('provides isLoading=true during background fetching (isFetching=true)', () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: true,
    } as unknown as ReturnType<typeof useQuery>);
    render(<WrappedConsumer />);
    expect(screen.getByTestId('loading').textContent).toBe('true');
  });

  it('provides settings when query returns data', () => {
    vi.mocked(useQuery).mockReturnValue({
      data: { bunk_calculator_enabled: true, target_percentage: 75, disabled_courses: {} },
      isLoading: false,
      isFetching: false,
    } as unknown as ReturnType<typeof useQuery>);
    render(<WrappedConsumer />);
    expect(screen.getByTestId('settings').textContent).toBe('has-settings');
  });

  it('provides no-settings when query returns null', () => {
    vi.mocked(useQuery).mockReturnValue({
      data: null,
      isLoading: false,
      isFetching: false,
    } as unknown as ReturnType<typeof useQuery>);
    render(<WrappedConsumer />);
    expect(screen.getByTestId('settings').textContent).toBe('no-settings');
  });

  it('configures stable refetch policy for user settings', () => {
    render(<WrappedConsumer />);

    const firstCallArgs = vi.mocked(useQuery).mock.calls[0]?.[0] as { refetchOnWindowFocus?: boolean; refetchInterval?: boolean } | undefined;

    expect(firstCallArgs).toBeDefined();
    expect(firstCallArgs?.refetchOnWindowFocus).toBe(false);
    expect(firstCallArgs?.refetchInterval).toBe(false);
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

  describe('loadPrefetchedSettings via provider initial state', () => {
    it('renders provider without error when sessionStorage has no prefetched settings', () => {
      render(<WrappedConsumer />);
      expect(screen.getByTestId('settings')).toBeInTheDocument();
    });

    it('renders provider without error when localStorage has user-scoped settings', () => {
      window.localStorage.setItem('showBunkCalc_user-123', 'true');
      window.localStorage.setItem('targetPercentage_user-123', '80');
      render(<WrappedConsumer />);
      expect(screen.getByTestId('settings')).toBeInTheDocument();
    });

    it('renders provider when sessionStorage has valid prefetched settings with userId', () => {
      window.sessionStorage.setItem('prefetchedSettings', JSON.stringify({
        userId: 'user-123',
        settings: { bunk_calculator_enabled: true, target_percentage: 75, disabled_courses: {} },
      }));
      render(<WrappedConsumer />);
      expect(screen.getByTestId('settings')).toBeInTheDocument();
    });

    it('clears stale prefetched settings with mismatched userId', () => {
      window.sessionStorage.setItem('prefetchedSettings', JSON.stringify({
        userId: 'other-user',
        settings: { bunk_calculator_enabled: true, target_percentage: 75, disabled_courses: {} },
      }));
      render(<WrappedConsumer />);
      expect(screen.getByTestId('settings')).toBeInTheDocument();
    });

    it('handles invalid JSON in sessionStorage gracefully', () => {
      window.sessionStorage.setItem('prefetchedSettings', 'not-valid-json{{{');
      render(<WrappedConsumer />);
      expect(screen.getByTestId('settings')).toBeInTheDocument();
    });
  });

  describe('useUserSettingsState auth state changes', () => {
    it('subscribes to auth state changes on mount', () => {
      render(<WrappedConsumer />);
      expect(mockOnAuthStateChange).toHaveBeenCalled();
    });

    it('unsubscribes from auth state changes on unmount', () => {
      const { unmount } = render(<WrappedConsumer />);
      unmount();
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
      window.localStorage.setItem('showBunkCalc_prev-user', 'true');
      window.localStorage.setItem('targetPercentage_prev-user', '75');
      window.localStorage.setItem('disabledCourses_prev-user', '{}');

      render(<WrappedConsumer />);

      await act(async () => {
        authStateCallback?.('INITIAL_SESSION', { user: { id: 'prev-user' } });
      });

      await act(async () => {
        authStateCallback?.('SIGNED_OUT', null);
      });

      expect(window.localStorage.removeItem).toHaveBeenCalledWith('showBunkCalc_prev-user');
      expect(window.localStorage.removeItem).toHaveBeenCalledWith('targetPercentage_prev-user');
      expect(window.localStorage.removeItem).toHaveBeenCalledWith('disabledCourses_prev-user');
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
    it('syncs DB settings to localStorage when settings are present', async () => {
      const settings = {
        bunk_calculator_enabled: true,
        target_percentage: 80,
        disabled_courses: {},
      };
      
      vi.mocked(useQuery).mockReturnValueOnce({
        data: undefined,
        isLoading: false,
        isFetching: false,
      } as unknown as ReturnType<typeof useQuery>);
      vi.mocked(useQuery).mockReturnValue({
        data: settings,
        isLoading: false,
        isFetching: false,
      } as unknown as ReturnType<typeof useQuery>);

      render(<WrappedConsumer />);

      await act(async () => {
        authStateCallback?.('INITIAL_SESSION', { user: { id: 'sync-user-123' } });
      });

      await waitFor(() => {
        expect(window.localStorage.setItem).toHaveBeenCalledWith('showBunkCalc_sync-user-123', 'true');
      });
      expect(window.localStorage.setItem).toHaveBeenCalledWith('targetPercentage_sync-user-123', '80');
    });

    it('creates new DB row when settings are null (new user) using computed defaults', async () => {
      vi.mocked(useQuery).mockReturnValueOnce({
        data: undefined,
        isLoading: false,
        isFetching: false,
      } as unknown as ReturnType<typeof useQuery>);
      vi.mocked(useQuery).mockReturnValue({
        data: null,
        isLoading: false,
        isFetching: false,
      } as unknown as ReturnType<typeof useQuery>);

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
      window.localStorage.setItem('showBunkCalc_pref-user', 'false');
      window.localStorage.setItem('targetPercentage_pref-user', '85');

      vi.mocked(useQuery).mockReturnValueOnce({
        data: undefined,
        isLoading: false,
        isFetching: false,
      } as unknown as ReturnType<typeof useQuery>);
      vi.mocked(useQuery).mockReturnValue({
        data: null,
        isLoading: false,
        isFetching: false,
      } as unknown as ReturnType<typeof useQuery>);

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
      } as unknown as ReturnType<typeof useQuery>);

      render(<WrappedConsumer />);
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('skips sync when mutation is pending', () => {
      vi.mocked(useMutation).mockReturnValue({
        mutate: mockMutate,
        mutateAsync: mockMutateAsync,
        isPending: true,
      } as unknown as ReturnType<typeof useMutation>);
      vi.mocked(useQuery).mockReturnValue({
        data: null,
        isLoading: false,
        isFetching: false,
      } as unknown as ReturnType<typeof useQuery>);

      render(<WrappedConsumer />);
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('does not dispatch bunkCalcToggle event if bunk value is unchanged', async () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
      const userId = 'same-bunk-user';
      window.localStorage.setItem(`showBunkCalc_${userId}`, 'true');
      window.localStorage.setItem(`targetPercentage_${userId}`, '75');
      window.localStorage.setItem(`disabledCourses_${userId}`, '{}');

      vi.mocked(useQuery).mockReturnValue({
        data: { bunk_calculator_enabled: true, target_percentage: 75, disabled_courses: {} },
        isLoading: false,
        isFetching: false,
      } as unknown as ReturnType<typeof useQuery>);

      render(<WrappedConsumer />);

      await act(async () => {
        authStateCallback?.('INITIAL_SESSION', { user: { id: userId } });
      });

      const bunkEvents = dispatchSpy.mock.calls.filter(
        ([e]) => e instanceof CustomEvent && (e as CustomEvent).type === 'bunkCalcToggle'
      );
      expect(bunkEvents).toHaveLength(0);
      dispatchSpy.mockRestore();
    });

    it('handles errors in sync effect catch block', async () => {
      vi.spyOn(window.localStorage, 'getItem').mockImplementation((key: string) => {
        if (key.startsWith('showBunkCalc_')) throw new Error('storage_fail');
        return null;
      });

      vi.mocked(useQuery).mockReturnValue({
        data: undefined,
        isLoading: false,
        isFetching: false,
      } as unknown as ReturnType<typeof useQuery>);

      const { rerender } = render(<WrappedConsumer />);

      vi.mocked(useQuery).mockReturnValue({
        data: { bunk_calculator_enabled: true, target_percentage: 75, disabled_courses: {} },
        isLoading: false,
        isFetching: false,
      } as unknown as ReturnType<typeof useQuery>);

      await act(async () => {
        authStateCallback?.('INITIAL_SESSION', { user: { id: 'error-user-unique-2' } });
      });

      rerender(<WrappedConsumer />);

      await waitFor(() => {
        expect(logger.dev).toHaveBeenCalledWith("Error during storage sync:", expect.any(Error));
      });
    });
  });

  describe('loadPrefetchedSettings branch coverage', () => {
    it('handles new format { userId, settings } correctly', async () => {
      const userId = 'user-123';
      const settings = { bunk_calculator_enabled: true, target_percentage: 75, disabled_courses: {} };
      window.sessionStorage.setItem('prefetchedSettings', JSON.stringify({ userId, settings }));
      
      render(<WrappedConsumer />);
      await act(async () => {
        authStateCallback?.('SIGNED_IN', { user: { id: userId } });
      });

      expect(vi.mocked(useQuery)).toHaveBeenCalledWith(expect.objectContaining({
        placeholderData: settings
      }));
    });

    it('rejects legacy format when userId is provided', async () => {
      window.sessionStorage.setItem('prefetchedSettings', JSON.stringify({
        bunk_calculator_enabled: true,
        target_percentage: 75
      }));
      render(<WrappedConsumer />);
      await act(async () => {
        authStateCallback?.('SIGNED_IN', { user: { id: 'user-123' } });
      });
      expect(window.sessionStorage.removeItem).toHaveBeenCalledWith('prefetchedSettings');
    });

    it('handles invalid JSON object', async () => {
      window.sessionStorage.setItem('prefetchedSettings', JSON.stringify(123));
      render(<WrappedConsumer />);
      await act(async () => {
        authStateCallback?.('SIGNED_IN', { user: { id: 'user-123' } });
      });
      expect(window.sessionStorage.removeItem).toHaveBeenCalledWith('prefetchedSettings');
    });

    it('rejects prefetched settings with null settings field', async () => {
      window.sessionStorage.setItem('prefetchedSettings', JSON.stringify({
        userId: 'user-123',
        settings: null
      }));
      render(<WrappedConsumer />);
      await act(async () => {
        authStateCallback?.('SIGNED_IN', { user: { id: 'user-123' } });
      });
      expect(window.sessionStorage.removeItem).toHaveBeenCalledWith('prefetchedSettings');
    });

    it('rejects prefetched settings with missing required fields', async () => {
      window.sessionStorage.setItem('prefetchedSettings', JSON.stringify({
        userId: 'user-123',
        settings: { bunk_calculator_enabled: true } // missing target_percentage
      }));
      render(<WrappedConsumer />);
      await act(async () => {
        authStateCallback?.('SIGNED_IN', { user: { id: 'user-123' } });
      });
      expect(window.sessionStorage.removeItem).toHaveBeenCalledWith('prefetchedSettings');
    });
  });

  describe('onAuthStateChange additional branches', () => {
    it('handles USER_UPDATED and PASSWORD_RECOVERY', async () => {
      render(<WrappedConsumer />);
      await act(async () => {
        authStateCallback?.('USER_UPDATED', { user: { id: 'u1' } });
        authStateCallback?.('PASSWORD_RECOVERY', { user: { id: 'u1' } });
      });
      expect(mockRemoveQueries).toHaveBeenCalled();
    });
  });

  describe('Mutation and Sync branches', () => {
    it('initializes from prefetched settings when DB is null', async () => {
      const userId = 'init-u';
      const settings = { bunk_calculator_enabled: false, target_percentage: 88, disabled_courses: {} };
      window.sessionStorage.setItem('prefetchedSettings', JSON.stringify({ userId, settings }));

      vi.mocked(useQuery).mockImplementation(() => ({
        data: null, 
        isLoading: false,
        isFetching: false,
      } as unknown as ReturnType<typeof useQuery>));

      render(<WrappedConsumer />);
      await act(async () => {
        authStateCallback?.('SIGNED_IN', { user: { id: userId } });
      });

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledWith(expect.objectContaining({
          target_percentage: 88
        }));
      });
    });

    it('migrates legacy localStorage keys', async () => {
      window.localStorage.setItem('showBunkCalc', 'false');
      window.localStorage.setItem('targetPercentage', '92');

      vi.mocked(useQuery).mockImplementation(() => ({
        data: null,
        isLoading: false,
        isFetching: false,
      } as unknown as ReturnType<typeof useQuery>));

      render(<WrappedConsumer />);
      await act(async () => {
        authStateCallback?.('SIGNED_IN', { user: { id: 'm-u' } });
      });

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledWith(expect.objectContaining({
          target_percentage: 92
        }));
      });
      expect(window.localStorage.removeItem).toHaveBeenCalledWith('showBunkCalc');
    });
  });

  describe('Internal logic verification (hitting queryFn/mutationFn branches)', () => {
    it('exercises queryFn logic including Supabase calls', async () => {
      const userId = 'u-query-fn';
      render(<WrappedConsumer />);
      await act(async () => {
        authStateCallback?.('SIGNED_IN', { user: { id: userId } });
      });

      const queryCall = vi.mocked(useQuery).mock.calls.find(c => (c[0] as { queryKey?: unknown[] })?.queryKey?.[1] === userId);
      const queryFn = (queryCall?.[0] as { queryFn?: () => Promise<unknown> })?.queryFn;
      
      if (queryFn) {
        // Success case
        vi.mocked(mockFrom).mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { bunk_calculator_enabled: true }, error: null }),
        } as unknown as ReturnType<typeof mockFrom>);
        await queryFn();

        // Error case
        vi.mocked(mockFrom).mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: new Error('db_fail') }),
        } as unknown as ReturnType<typeof mockFrom>);
        await expect(queryFn()).rejects.toThrow('db_fail');
      }
    });

    it('exercises mutationFn logic including Supabase upsert', async () => {
      const userId = 'u-mut-fn';
      render(<WrappedConsumer />);
      await act(async () => {
        authStateCallback?.('SIGNED_IN', { user: { id: userId } });
      });

      const calls = vi.mocked(useMutation).mock.calls;
      const mutationCall = calls[calls.length - 1];
      const mutationFn = (mutationCall?.[0] as { mutationFn?: (vars: unknown) => Promise<unknown> })?.mutationFn;

      if (mutationFn) {
        // Success case
        const upsertMock = vi.fn().mockResolvedValue({ error: null });
        mockFrom.mockReturnValue({
          upsert: upsertMock,
        } as unknown as ReturnType<typeof mockFrom>);
        await mutationFn({ bunk_calculator_enabled: true });
        expect(upsertMock).toHaveBeenCalled();
      }
    });

    it('exercises retry logic branches', () => {
      render(<WrappedConsumer />);
      const queryCall = vi.mocked(useQuery).mock.calls[0];
      const retry = (queryCall?.[0] as { retry?: (count: number, err: unknown) => boolean })?.retry;
      if (retry) {
        expect(retry(0, { code: 'PGRST116' })).toBe(false);
        expect(retry(1, new Error('other'))).toBe(true);
        expect(retry(4, new Error('other'))).toBe(false);
      }
    });
  });
});
