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
 * const { actionNotifications, allNotifications, markAsRead } = useNotifications();
 * ```
 */
export function useNotifications(enabled = true) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const PAGE_SIZE = 15;

  // 1. PRIORITY QUERY: Fetch ALL Unread Conflicts (Action Required)
  const { data: actionData, isLoading: isActionLoading } = useQuery({
    queryKey: ["notifications", "actions"],
    queryFn: async () => {
      // getSession() reads the JWT from local storage — no network call.
      // The Supabase query is RLS-protected; an invalid JWT is rejected by Postgres.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return [];

      const { data, error } = await supabase
        .from("notification")
        .select("*")
        .eq("auth_user_id", session.user.id)
        .ilike("topic", "conflict%") // Only conflicts
        .eq("is_read", false)        // Only unread
        .order("created_at", { ascending: false });

      if (error) {
         Sentry.captureException(error, { tags: { type: "notification_fetch_actions" } });
         throw error;
      }
      return data as Notification[];
    },
    enabled: enabled,
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
    enabled: enabled,
    refetchInterval: 30000,
  });

  // 3. COMBINE & DEDUPLICATE (Memoized)
  const { actionNotifications, regularNotifications } = useMemo(() => {
      const actions = actionData || [];
      const rawFeed = feedData?.pages.flatMap((page) => page.data) || [];
      
      const actionIds = new Set(actions.map(n => n.id));
      const regular = rawFeed.filter(n => !actionIds.has(n.id));

      return { actionNotifications: actions, regularNotifications: regular };
  }, [actionData, feedData]);

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
  const markReadMutation = useMutation({
    mutationFn: async (id?: number) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      let query = supabase
        .from("notification")
        .update({ is_read: true })
        .eq("auth_user_id", session.user.id);

      if (id) query = query.eq("id", id);
      else query = query.eq("is_read", false);

      const { error } = await query;
      if (error) throw error;
    },
    // Cancel in-flight queries to avoid stale overwrites once the mutation settles.
    // A full optimistic cache update is not implemented; the UI reflects the
    // latest server state after onSettled triggers a cache invalidation.
    onMutate: async () => {
        await queryClient.cancelQueries({ queryKey: ["notifications"] });
    },
    onError: (err, targetId) => {
        Sentry.captureException(err, { 
            tags: { type: "notification_mark_read_failure", location: "useNotifications/markReadMutation" },
            extra: { notificationId: targetId }
        });
        // Revert on error could be implemented here if using full optimistic state
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
    isLoading: isActionLoading || isFeedLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    markAsRead: (id?: number) => markReadMutation.mutate(id),
    markAllAsRead: () => markReadMutation.mutate(undefined),
    isMarkingRead: markReadMutation.isPending
  };
}