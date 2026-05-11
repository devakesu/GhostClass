import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useNotifications } from '../useNotifications';
import { createClient } from '@/lib/supabase/client';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
  useInfiniteQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useNotifications', () => {
  let mockSupabase: any;
  const mockQueryClient = {
    cancelQueries: vi.fn(),
    invalidateQueries: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup a chainable mock
    mockSupabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'user-123' } } } }),
      },
      from: vi.fn().mockImplementation(() => mockSupabase),
      select: vi.fn().mockImplementation(() => mockSupabase),
      eq: vi.fn().mockImplementation(() => mockSupabase),
      ilike: vi.fn().mockImplementation(() => mockSupabase),
      order: vi.fn().mockImplementation(() => mockSupabase),
      range: vi.fn().mockImplementation(() => mockSupabase),
      update: vi.fn().mockImplementation(() => mockSupabase),
      single: vi.fn().mockImplementation(() => mockSupabase),
      not: vi.fn().mockImplementation(() => mockSupabase),
      // Make it thenable to simulate Promise
      then: vi.fn().mockImplementation((onFulfilled) => {
        return Promise.resolve({ data: [], error: null, count: 0 }).then(onFulfilled);
      }),
    };

    vi.mocked(createClient).mockReturnValue(mockSupabase as any);
    vi.mocked(useQueryClient).mockReturnValue(mockQueryClient as any);

    // Default implementations for hooks
    vi.mocked(useQuery).mockReturnValue({ data: 0, isLoading: false } as any);
    vi.mocked(useInfiniteQuery).mockReturnValue({
      data: { pages: [{ data: [], nextPage: null }] },
      isLoading: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    } as any);
    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);
  });

  it('initializes with default state', () => {
    const { result } = renderHook(() => useNotifications());
    
    expect(result.current.actionNotifications).toEqual([]);
    expect(result.current.regularNotifications).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
    expect(result.current.isLoading).toBe(false);
  });

  it('separates action notifications from regular feed', () => {
    const actionNotif = { id: 1, topic: 'conflict', is_read: false };
    const regularNotif = { id: 2, topic: 'general', is_read: false };

    vi.mocked(useQuery).mockImplementation(({ queryKey }) => {
      if (queryKey?.[1] === 'actions') {
        return { data: [actionNotif], isLoading: false } as any;
      }
      return { data: 1, isLoading: false } as any; // unreadCount
    });

    vi.mocked(useInfiniteQuery).mockReturnValue({
      data: {
        pages: [
          { data: [actionNotif, regularNotif], nextPage: null }
        ]
      },
      isLoading: false,
    } as any);

    const { result } = renderHook(() => useNotifications());

    expect(result.current.actionNotifications).toEqual([actionNotif]);
    expect(result.current.regularNotifications).toEqual([regularNotif]);
    expect(result.current.unreadCount).toBe(1);
  });

  it('deduplicates notifications across pages', () => {
    const notif1 = { id: 1, topic: 'general' };
    
    vi.mocked(useInfiniteQuery).mockReturnValue({
      data: {
        pages: [
          { data: [notif1], nextPage: 1 },
          { data: [notif1], nextPage: null } // Duplicate
        ]
      },
      isLoading: false,
    } as any);

    const { result } = renderHook(() => useNotifications());

    expect(result.current.regularNotifications).toHaveLength(1);
    expect(result.current.regularNotifications[0].id).toBe(1);
  });

  it('only runs unread count query when countOnly is true', () => {
    renderHook(() => useNotifications(true, true));

    const useQueryCalls = vi.mocked(useQuery).mock.calls;
    
    const actionsQuery = useQueryCalls.find(call => call[0].queryKey?.[1] === 'actions');
    expect(actionsQuery?.[0].enabled).toBe(false);

    const unreadCountQuery = useQueryCalls.find(call => call[0].queryKey?.[1] === 'unreadCount');
    expect(unreadCountQuery?.[0].enabled).toBe(true);

    expect(vi.mocked(useInfiniteQuery)).toHaveBeenCalledWith(expect.objectContaining({
      enabled: false
    }));
  });

  it('calls mutation functions correctly', () => {
    const mockMutate = vi.fn();
    vi.mocked(useMutation).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as any);

    const { result } = renderHook(() => useNotifications());

    result.current.markAsRead(123);
    expect(mockMutate).toHaveBeenCalledWith({ id: 123, isRead: true });

    result.current.toggleRead(456, false);
    expect(mockMutate).toHaveBeenCalledWith({ id: 456, isRead: true });

    result.current.markAllAsRead();
    expect(mockMutate).toHaveBeenCalledWith({ isRead: true });
  });

  describe('query functions', () => {
    it('fetches action notifications from supabase', async () => {
      renderHook(() => useNotifications());
      
      const queryFn = vi.mocked(useQuery).mock.calls.find(call => call[0].queryKey?.[1] === 'actions')![0].queryFn as (...args: any[]) => any;
      
      mockSupabase.then.mockImplementationOnce((onFulfilled: any) => {
        return Promise.resolve({ data: [{ id: 1 }], error: null }).then(onFulfilled);
      });

      const data = await queryFn();
      
      expect(mockSupabase.from).toHaveBeenCalledWith('notification');
      expect(mockSupabase.ilike).toHaveBeenCalledWith('topic', '%conflict%');
      expect(data).toEqual([{ id: 1 }]);
    });

    it('fetches infinite feed with pagination', async () => {
      renderHook(() => useNotifications());
      
      const queryFn = vi.mocked(useInfiniteQuery).mock.calls[0][0].queryFn as (...args: any[]) => any;
      
      mockSupabase.then.mockImplementationOnce((onFulfilled: any) => {
        return Promise.resolve({ data: Array(20).fill({ id: 1 }), error: null }).then(onFulfilled);
      });

      const result = await queryFn({ pageParam: 0 });
      
      expect(mockSupabase.range).toHaveBeenCalledWith(0, 19);
      expect(result.nextPage).toBe(1);
    });

    it('fetches unread count using head-only query', async () => {
      renderHook(() => useNotifications());
      
      const queryFn = vi.mocked(useQuery).mock.calls.find(call => call[0].queryKey?.[1] === 'unreadCount')![0].queryFn as (...args: any[]) => any;
      
      mockSupabase.then.mockImplementationOnce((onFulfilled: any) => {
        return Promise.resolve({ count: 5, error: null }).then(onFulfilled);
      });

      const count = await queryFn();
      
      expect(mockSupabase.select).toHaveBeenCalledWith('*', expect.objectContaining({ head: true }));
      expect(count).toBe(5);
    });
  });

  describe('mutation logic', () => {
    it('updates status in supabase', async () => {
      renderHook(() => useNotifications());
      
      const mutationFn = vi.mocked(useMutation).mock.calls[0][0].mutationFn as (...args: any[]) => any;
      
      mockSupabase.then.mockImplementationOnce((onFulfilled: any) => {
        return Promise.resolve({ error: null }).then(onFulfilled);
      });

      await mutationFn({ id: 1, isRead: true });
      
      expect(mockSupabase.update).toHaveBeenCalledWith({ is_read: true });
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', 1);
    });

    it('handles query invalidation on settlement', () => {
      renderHook(() => useNotifications());
      
      const onSettled = vi.mocked(useMutation).mock.calls[0][0].onSettled as (...args: any[]) => any;
      onSettled();
      
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['notifications'] });
    });
  });
});
