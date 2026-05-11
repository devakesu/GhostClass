"use client";

import { createClient } from "@/lib/supabase/client";
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import * as Sentry from "@sentry/nextjs";

export interface Notification {
  id: number;
  title: string;
  description?: string;
  topic: string;
  is_read: boolean;
  created_at: string;
  auth_user_id: string;
}

interface FetchResponse {
  data: Notification[];
  nextPage: number | null;
}

/**
 * React Query hook for fetching user notifications with action-based prioritization.
 * Separates urgent conflict notifications from general feed.
 * Implements infinite scroll pagination for the general feed.
 * 
 * @param enabled - Whether queries should run (default: true)
 * @param countOnly - When true, only the lightweight unread-count query runs; the action
 *   conflict query and infinite feed query (both with 30 s polling) are skipped. Use this
 *   in contexts that only need the badge number (e.g. the navbar) to avoid firing two
 *   unnecessary Supabase requests on every protected page.
 * @returns Object containing action notifications, paginated feed, and utility functions
 * 
 * Features:
 * - Priority query for unread conflicts (auto-refresh every 30s)
 * - Lightweight head-only unread count (accurate total; refreshed on explicit invalidation)
 * - Infinite scroll pagination for general feed (15 items per page)
 * - Mark as read with cache invalidation after server confirmation
 * - Automatic cache invalidation
 * 
 * @example
 * ```tsx
 * // Full notifications page
 * const { actionNotifications, allNotifications, markAsRead } = useNotifications();
 * // Navbar badge only — skips action + feed queries and their 30 s polling
 * const { unreadCount } = useNotifications(true, true);
 * ```
 */
export function useNotifications(enabled = true, countOnly = false) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const PAGE_SIZE = 20;

  // 1. PRIORITY QUERY: Fetch ALL Unread Notifications (Actions + Regular Unread)
  // This ensures all unread items are immediately visible regardless of their date.
  const { data: allUnreadData, isLoading: isUnreadLoading } = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return [];

      const { data, error } = await supabase
        .from("notification")
        .select("*")
        .eq("auth_user_id", session.user.id)
        .eq("is_read", false)        // ALL unread
        .order("created_at", { ascending: false });

      if (error) {
         Sentry.captureException(error, { tags: { type: "notification_fetch_unread" } });
         throw error;
      }
      return data as Notification[];
    },
    enabled: enabled && !countOnly,
    refetchInterval: 30000,
  });

  // 2. INFINITE FEED: Fetch Everything Else
  const {
    data: feedData,
    isLoading: isFeedLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<FetchResponse>({
    queryKey: ["notifications", "feed"],
    queryFn: async ({ pageParam = 0 }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return { data: [], nextPage: null };

      const from = (pageParam as number) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from("notification")
        .select("*")
        .eq("auth_user_id", session.user.id)
        // Removed conflict exclusion to ensure read conflicts show in earlier section
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) {
          Sentry.captureException(error, { tags: { type: "notification_fetch_feed" } });
          throw error;
      }

      const notifications = data as Notification[];
      const nextPage = notifications.length === PAGE_SIZE ? (pageParam as number) + 1 : null;

      return { data: notifications, nextPage };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    enabled: enabled && !countOnly,
    refetchInterval: 30000,
  });

  // 3. COMBINE & DEDUPLICATE (Memoized)
  const { actionNotifications, regularNotifications } = useMemo(() => {
      const allUnread = allUnreadData || [];
      const rawFeed = feedData?.pages.flatMap((page) => page.data) || [];
      
      // Separate unread into Actions (Conflicts) and Regular
      const actions = allUnread.filter(n => n.topic?.toLowerCase().includes("conflict"));
      const unreadRegular = allUnread.filter(n => !n.topic?.toLowerCase().includes("conflict"));

      // Deduplicate feed: items in feed might also be in allUnread
      const unreadIds = new Set(allUnread.map(n => String(n.id)));
      
      // Find read items from the feed to show in "EARLIER" section
      const readFromFeed: Notification[] = [];
      const seenIds = new Set<string>();
      
      for (const n of rawFeed) {
          const sid = String(n.id);
          if (!seenIds.has(sid) && !unreadIds.has(sid)) {
              seenIds.add(sid);
              readFromFeed.push(n);
          }
      }

      // regularNotifications contains all unread regular + read items from feed
      const regular = [...unreadRegular, ...readFromFeed];

      return { actionNotifications: actions, regularNotifications: regular };
  }, [allUnreadData, feedData]);

  // 3b. TOTAL UNREAD COUNT — head-only query (no refetchInterval; refreshed on
  //     explicit cache invalidation triggered by markAsRead / markAllAsRead).
  //     A dedicated query guarantees an accurate total even before all feed
  //     pages have been loaded via infinite scroll.
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["notifications", "unreadCount"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return 0;

      const { error, count } = await supabase
        .from("notification")
        .select("*", { count: "exact", head: true })
        .eq("auth_user_id", session.user.id)
        .eq("is_read", false);

      if (error) {
        Sentry.captureException(error, {
          tags: { type: "notification_unread_count_failure", location: "useNotifications/unreadCountQuery" },
        });
        return 0;
      }

      return count ?? 0;
    },
    enabled: enabled,
  });

  // 4. MUTATIONS
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, isRead }: { id?: number; isRead: boolean }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      let query = supabase
        .from("notification")
        .update({ is_read: isRead })
        .eq("auth_user_id", session.user.id);

      if (id) query = query.eq("id", id);
      else query = query.eq("is_read", !isRead);

      const { error } = await query;
      if (error) throw error;
    },
    onMutate: async ({ id, isRead }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["notifications"] });

      // Snapshot the previous values
      const previousUnread = queryClient.getQueryData<Notification[]>(["notifications", "unread"]);
      const previousFeed = queryClient.getQueryData<{ pages: FetchResponse[]; pageParams: any[] }>(["notifications", "feed"]);
      const previousUnreadCount = queryClient.getQueryData<number>(["notifications", "unreadCount"]);

      // 1. Optimistically update unread count
      if (id) {
        // Individual item toggle
        queryClient.setQueryData<number>(["notifications", "unreadCount"], (old = 0) => {
          return isRead ? Math.max(0, old - 1) : old + 1;
        });
      } else {
        // Mark all as read
        if (isRead) queryClient.setQueryData(["notifications", "unreadCount"], 0);
      }

      // 2. Optimistically update feed (all notifications)
      if (previousFeed) {
        queryClient.setQueryData(["notifications", "feed"], {
          ...previousFeed,
          pages: previousFeed.pages.map(page => ({
            ...page,
            data: page.data.map(n => {
              if (id) {
                return n.id === id ? { ...n, is_read: isRead } : n;
              } else {
                return n.is_read !== isRead ? { ...n, is_read: isRead } : n;
              }
            })
          }))
        });
      }

      // 3. Optimistically update unread query (Actions + Regular Unread)
      if (id) {
        const itemInUnread = previousUnread?.find(n => n.id === id);
        const itemInFeed = previousFeed?.pages.flatMap(p => p.data).find(n => n.id === id);
        const notification = itemInUnread || itemInFeed;

        if (isRead) {
          // Marking as read -> remove from unread list
          queryClient.setQueryData<Notification[]>(["notifications", "unread"], (old = []) => 
            old.filter(n => n.id !== id)
          );
        } else if (notification) {
          // Marking as unread -> add to unread list
          queryClient.setQueryData<Notification[]>(["notifications", "unread"], (old = []) => {
            const updated = [{ ...notification, is_read: false }, ...old.filter(n => n.id !== id)];
            return updated.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          });
        }
      } else if (isRead) {
        // Mark all as read -> clear unread
        queryClient.setQueryData(["notifications", "unread"], []);
      }

      return { previousUnread, previousFeed, previousUnreadCount };
    },
    onError: (err, variables, context: any) => {
      // Rollback on error
      if (context?.previousUnread) queryClient.setQueryData(["notifications", "unread"], context.previousUnread);
      if (context?.previousFeed) queryClient.setQueryData(["notifications", "feed"], context.previousFeed);
      if (context?.previousUnreadCount !== undefined) queryClient.setQueryData(["notifications", "unreadCount"], context.previousUnreadCount);

      Sentry.captureException(err, { 
        tags: { type: "notification_mark_read_failure", location: "useNotifications/markReadMutation" },
        extra: { notificationId: variables.id, isRead: variables.isRead }
      });
    },
    onSettled: () => {
      // Always refetch to ensure server sync
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  return {
    actionNotifications,   // Always Unread Conflicts
    regularNotifications,  // Everything else
    unreadCount,
    isLoading: isUnreadLoading || isFeedLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    markAsRead: (id: number) => updateStatusMutation.mutate({ id, isRead: true }),
    toggleRead: (id: number, currentStatus: boolean) => updateStatusMutation.mutate({ id, isRead: !currentStatus }),
    markAllAsRead: () => updateStatusMutation.mutate({ isRead: true }),
    isMarkingRead: updateStatusMutation.isPending
  };
}