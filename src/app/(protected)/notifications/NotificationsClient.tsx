// src/app/(protected)/notifications/NotificationsClient.tsx
"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useNotifications, Notification } from "@/hooks/notifications/useNotifications";
import { useUser } from "@/hooks/users/user";
import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { CaptureContext } from "@sentry/core";

// Lazy Sentry helpers – deferred import keeps the Sentry SDK (~250 KB) out of the initial bundle.
const captureSentryException = (error: unknown, context?: CaptureContext) => {
  void import("@sentry/nextjs")
    .then(({ captureException }) => captureException(error, context))
    .catch((importError) => {
      console.error("[Sentry] Failed to load SDK for captureException:", importError);
      console.error("[Sentry] Original error:", error);
    });
};
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { 
  CheckCheck, BellOff, Loader2, RefreshCcw, 
  AlertTriangle, Info, CalendarClock, AlertCircle 
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn, redact } from "@/lib/utils";
import { Loading } from "@/components/loading";
import { useSyncOnMount } from "@/hooks/use-sync-on-mount";

const getNotificationIcon = (topic?: string) => {
  if (topic?.includes("sync")) return { icon: RefreshCcw, color: "text-green-500", bg: "bg-green-500/10" };
  if (topic?.includes("conflict")) return { icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-500/10" };
  if (topic?.includes("attendance")) return { icon: CalendarClock, color: "text-blue-500", bg: "bg-blue-500/10" };
  return { icon: Info, color: "text-primary", bg: "bg-primary/10" };
};

const NotificationCard = ({ 
  n, 
  onMarkRead, 
  isReading 
}: { 
  n: Notification; 
  onMarkRead: (id: number) => void; 
  isReading: boolean;
}) => {
  const { icon: Icon, color, bg } = getNotificationIcon(n.topic);

  return (
    <div
      onClick={() => !n.is_read && onMarkRead(n.id)}
      onKeyDown={(e) => !n.is_read && (e.key === 'Enter' || e.key === ' ') && onMarkRead(n.id)}
      role="button"
      tabIndex={!n.is_read ? 0 : -1}
      className={cn(
        "group relative flex gap-4 p-4 rounded-2xl border transition-all duration-200 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-primary mb-2",
        !n.is_read ? "bg-card border-border/60 shadow-sm hover:shadow-md cursor-pointer" : "bg-transparent border-transparent opacity-70"
      )}
    >
      {!n.is_read && <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-primary" />}
      
      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5", bg)}>
        <Icon className={cn("h-5 w-5", color)} aria-hidden="true" />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start gap-2 mb-1">
          <h4 className={cn("text-sm font-semibold leading-tight wrap-break-word", !n.is_read ? "text-foreground" : "text-muted-foreground")}>
            {n.title}
          </h4>
          <span className="text-[10px] text-muted-foreground/50 whitespace-nowrap font-medium shrink-0">
            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
          </span>
        </div>
        <p className={cn("text-xs leading-relaxed wrap-break-word", !n.is_read ? "text-muted-foreground" : "text-muted-foreground/70")}>
          {n.description}
        </p>
      </div>
      
      {!n.is_read && isReading && (
         <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <Loader2 className="h-3 w-3 text-primary animate-spin" aria-label="Loading" />
         </div>
      )}
    </div>
  );
};

// Virtual item type to include headers
type VirtualItem = 
  | { type: 'header'; id: string; label: string }
  | { type: 'notification'; id: number; data: Notification };

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const { data: user } = useUser();
  const parentRef = useRef<HTMLDivElement>(null);
  
  // Use mountId-based sync logic (now managed inside useSyncOnMount)

  const { 
    actionNotifications, 
    regularNotifications, 
    unreadCount,
    isLoading, 
    markAsRead, 
    markAllAsRead,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useNotifications(true);

  const [readingId, setReadingId] = useState<number | null>(null);

  // Sync attendance data on mount; deduplication handled by the hook.
  const { isSyncing, syncCompleted } = useSyncOnMount({
    username: user?.username,
    userId: user?.id,
    sentryLocation: "NotificationsClient",
    sentryTag: "notification_sync",
    onPartialSync: async () => {
      toast.warning("Partial Sync Completed", {
        description: "Some notifications couldn't be synced. Your notification list may be incomplete.",
      });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onSuccess: async () => {
      toast.info("Notifications Updated", { description: "New attendance data found." });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  // BUILD VIRTUAL LIST WITH HEADERS
  const virtualItems = useMemo<VirtualItem[]>(() => {
    const items: VirtualItem[] = [];

    // Add Action Required section
    if (actionNotifications.length > 0) {
      items.push({ type: 'header', id: 'action-header', label: 'ACTION REQUIRED' });
      actionNotifications.forEach(n => {
        items.push({ type: 'notification', id: n.id, data: n });
      });
    }

    // Add Recent Activity section
    if (regularNotifications.length > 0) {
      items.push({ type: 'header', id: 'recent-header', label: 'RECENT ACTIVITY' });
      regularNotifications.forEach(n => {
        items.push({ type: 'notification', id: n.id, data: n });
      });
    }

    return items;
  }, [actionNotifications, regularNotifications]);

  // VIRTUALIZER WITH DYNAMIC HEIGHT ESTIMATION
  const rowVirtualizer = useVirtualizer({
    count: virtualItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
    const item = virtualItems[index];

    if (item.type === "header") {
      return 57; // pt-6 (24px) + pb-3 (12px) + content (~21px)
    }

      // Notification card height
      const notification = item.data;
      const description = notification.description ?? "";

      // More accurate base heights based on actual card layout
      const baseHeightShort = 80;  // Single-line description
      const baseHeightMedium = 95; // 2-line description
      
      // Calculate approximate extra height for longer descriptions
      const extraPer100Chars = 12;
      const maxExtra = 60;
      const extraHeight = description.length > 80
        ? Math.min(maxExtra, Math.ceil((description.length - 80) / 100) * extraPer100Chars)
        : 0;

      const baseHeight = description.length > 80 ? baseHeightMedium : baseHeightShort;
      const marginBottom = 8; // mb-2 (2 * 4px)

      return baseHeight + extraHeight + marginBottom;
    },
    // Use actual DOM measurements when available to correct the estimates.
    measureElement: (el) => el.getBoundingClientRect().height,
    // Use a larger overscan to reduce visible layout shifts when estimates are adjusted
    overscan: 10,
  });

  // INFINITE SCROLL
  useEffect(() => {
    const [lastItem] = [...rowVirtualizer.getVirtualItems()].reverse();

    if (!lastItem) return;

    if (
      lastItem.index >= virtualItems.length - 1 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage();
    }
  }, [
    hasNextPage,
    fetchNextPage,
    virtualItems.length,
    isFetchingNextPage,
    rowVirtualizer,
  ]);

  // MARK READ HANDLER
  const handleMarkRead = useCallback(async (id: number) => {
      if (readingId === id) return;
      
      setReadingId(id);
      try { 
          await markAsRead(id);
          
          // Force immediate remeasure by scrolling to current position
          // This prevents glitches when items move between sections
          requestAnimationFrame(() => {
            const currentScroll = parentRef.current?.scrollTop || 0;
            rowVirtualizer.measure();
            if (parentRef.current) {
              parentRef.current.scrollTop = currentScroll;
            }
          });
      } catch (error) { 
          if (process.env.NODE_ENV === 'development') {
            logger.error("Failed to mark notification read", error);
          }
          toast.error("Could not update notification");
          captureSentryException(error, {
              tags: { type: "mark_notification_read", location: "NotificationsClient/handleMarkRead" },
              extra: { notification_id: id, action: "mark_read", userId: redact("id", String(user?.id)) }
          });
      } finally { 
          setReadingId(null); 
      }
  }, [markAsRead, readingId, rowVirtualizer, user?.id]);

  // Block rendering until user is available, data has loaded, and initial sync has completed.
  if (!user?.id || isLoading || isSyncing || !syncCompleted) return <Loading />;

  const isEmpty = virtualItems.length === 0;

  return (
    <div ref={parentRef} className="min-h-screen bg-background relative overflow-auto">
      <header className="sticky top-0 z-20 w-full backdrop-blur-xl bg-background/80 border-b border-border/40">
        <div className="container mx-auto max-w-2xl px-4 pt-6 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">Notifications 
              {unreadCount > 0 && <span className="ml-2 bg-primary/10 text-primary text-[11px] font-bold px-1.5 py-0.5 rounded-full" aria-label={`${unreadCount} unread notifications`}>{unreadCount}</span>}
            </h1>
          </div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => markAllAsRead()} className="text-xs text-muted-foreground hover:text-primary">
              <CheckCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Mark all read
            </Button>
          )}
        </div>
      </header>

      <main className="container mx-auto max-w-2xl">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-20 w-20 rounded-full bg-muted/30 flex items-center justify-center mb-4">
              <BellOff className="h-9 w-9 text-muted-foreground/50" aria-hidden="true"/>
            </div>
            <h3 className="text-lg font-medium">All caught up!</h3>
            <p className="text-sm text-muted-foreground max-w-62.5 mt-1">You have no new notifications.</p>
          </div>
        ) : (
          <div
            key={`${actionNotifications.length}-${regularNotifications.length}`}
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const item = virtualItems[virtualRow.index];

              return (
                <div
                  key={item.type === 'header' ? item.id : `notification-${item.id}`}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="px-4"
                >
                  {item.type === 'header' ? (
                  // SECTION HEADER
                  <div className={cn(
                    "flex items-center gap-2 px-1",
                    item.label === 'ACTION REQUIRED' ? "text-amber-500 pt-6 pb-3" : "text-muted-foreground pt-6 pb-3"
                  )}>
                    {item.label === 'ACTION REQUIRED' && <AlertCircle className="h-4 w-4" aria-hidden="true" />}
                    <h3 className="text-xs font-bold uppercase tracking-wider">{item.label}</h3>
                  </div>
                ) : (
                  // NOTIFICATION CARD
                  <NotificationCard
                    n={item.data}
                    onMarkRead={handleMarkRead}
                    isReading={readingId === item.id}
                  />
                )}
                </div>
              );
            })}
          </div>
        )}

        {isFetchingNextPage && (
          <div className="py-4 flex justify-center w-full">
            <div className="flex items-center gap-2 text-muted-foreground text-xs animate-pulse">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading more...
            </div>
          </div>
        )}
      </main>
    </div>
  );
}