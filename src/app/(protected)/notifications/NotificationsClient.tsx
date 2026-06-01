// src/app/(protected)/notifications/NotificationsClient.tsx
"use client";
import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useNotifications, Notification } from "@/hooks/notifications/useNotifications";
import { useUser } from "@/hooks/users/user";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { useNotificationVirtualizer, VirtualItem } from "@/hooks/notifications/use-notification-virtualizer";
import { captureSentryException } from "@/lib/sentry-lazy";
import { Button } from "@/components/ui/button";
import { 
  CheckCheck, BellOff, Loader2, RefreshCcw, 
  AlertTriangle, Info, CalendarClock, AlertCircle 
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
  onMarkRead: (id: number, currentStatus: boolean) => void; 
  isReading: boolean;
}) => {
  const { icon: Icon, color, bg } = getNotificationIcon(n.topic);

  return (
    <div
      onClick={() => onMarkRead(n.id, n.is_read)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onMarkRead(n.id, n.is_read)}
      role="button"
      tabIndex={0}
      className={cn(
        "group relative flex gap-4 p-4 rounded-2xl border transition-all duration-200 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-primary mb-2 cursor-pointer",
        !n.is_read ? "bg-card border-border/60 shadow-sm hover:shadow-md" : "bg-transparent border-transparent opacity-70 hover:opacity-100 hover:bg-secondary/5"
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
      
      {isReading && (
         <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <Loader2 className="h-3 w-3 text-primary animate-spin" aria-label="Updating status..." />
         </div>
      )}
    </div>
  );
};


export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const { data: user } = useUser();
  const parentRef = useRef<HTMLDivElement>(null);
  
  // Use mountId-based sync logic (now managed inside useSyncOnMount)

  // Sync attendance data on mount; deduplication handled by the hook.
  const { isSyncing, syncSettled, syncFailed } = useSyncOnMount({
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
    onSuccess: async (data) => {
      if ((data.deletions ?? 0) + (data.updates ?? 0) > 0) {
        toast.info("Notifications Updated", { description: "New attendance data found." });
      }
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const { 
    actionNotifications, 
    regularNotifications, 
    unreadCount,
    isLoading, 
    toggleRead,
    markAllAsRead,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useNotifications(true);

  const [readingId, setReadingId] = useState<number | null>(null);

  // BUILD VIRTUAL LIST WITH HEADERS (Matches Mobile: Action Required -> Unread -> Earlier)
  const virtualItems = useMemo<VirtualItem[]>(() => {
    const items: VirtualItem[] = [];

    // 1. ACTION REQUIRED (Unread Conflicts)
    const unreadActions = actionNotifications.filter((n: Notification) => !n.is_read);
    if (unreadActions.length > 0) {
      items.push({ type: 'header', id: 'action-header', label: 'ACTION REQUIRED' });
      unreadActions.forEach((n: Notification) => {
        items.push({ type: 'notification', id: n.id, data: n });
      });
    }

    // 2. UNREAD (Unread Regular)
    const unreadRegular = regularNotifications.filter((n: Notification) => !n.is_read);
    if (unreadRegular.length > 0) {
      items.push({ type: 'header', id: 'unread-header', label: 'UNREAD' });
      unreadRegular.forEach((n: Notification) => {
        items.push({ type: 'notification', id: n.id, data: n });
      });
    }

    // 3. EARLIER (All Read Notifications)
    const readNotifications = regularNotifications.filter((n: Notification) => n.is_read);
    if (readNotifications.length > 0) {
      items.push({ type: 'header', id: 'earlier-header', label: 'EARLIER' });
      readNotifications.forEach((n: Notification) => {
        items.push({ type: 'notification', id: n.id, data: n });
      });
    }

    return items;
  }, [actionNotifications, regularNotifications]);

  // ─── VIRTUALIZER ───────────────────────────────────────────────────────────
  
  const rowVirtualizer = useNotificationVirtualizer({
    virtualItems,
    parentRef,
  });

  // SCROLL HANDLER FOR INFINITE SCROLL
  const handleScroll = useCallback(() => {
    // Check both container and window scroll
    const container = parentRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const windowScrollTop = window.scrollY;
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;

    // Use whichever scroll position is greater (container vs window)
    const isNearBottom = 
      (scrollHeight - scrollTop - clientHeight < 400) || 
      (documentHeight - windowScrollTop - windowHeight < 400);
    
    if (isNearBottom) {
      if (hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ATTACH GLOBAL SCROLL LISTENER
  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // TOGGLE READ HANDLER
  const handleToggleRead = useCallback(async (id: number, currentStatus: boolean) => {
      if (readingId === id) return;
      
      setReadingId(id);
      try { 
          await toggleRead(id, currentStatus);
          toast.success(currentStatus ? "Marked as unread" : "Marked as read");
          
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
            logger.error("Failed to toggle notification status", error);
          }
          toast.error("Could not update notification");
          captureSentryException(error, {
              tags: { type: "toggle_notification_read", location: "NotificationsClient/handleToggleRead" },
              extra: { notification_id: id, action: "toggle_read", userId: redact("id", String(user?.id)) }
          });
      } finally { 
          setReadingId(null); 
      }
  }, [toggleRead, readingId, rowVirtualizer, user?.id]);

  // Block rendering only on auth/data readiness; sync runs in the background.
  if (!user?.id || isLoading) return <Loading />;

  const isEmpty = virtualItems.length === 0;

  return (
    <div 
      ref={parentRef} 
      onScroll={() => handleScroll()}
      className="bg-background relative overflow-auto flex flex-col h-full"
    >
      <header className="sticky top-0 z-20 w-full backdrop-blur-xl bg-background/80 border-b border-border/40">
        <div className="container mx-auto max-w-2xl px-4 md:px-6 pt-4 md:pt-6 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              Notifications 
              {unreadCount > 0 && <span className="bg-primary/10 text-primary text-[11px] font-bold px-1.5 py-0.5 rounded-full" aria-label={`${unreadCount} unread notifications`}>{unreadCount}</span>}
              {isSyncing && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-medium text-blue-600 dark:text-blue-400 animate-pulse">
                  <Loader2 size={10} className="animate-spin" />
                  <span>Syncing</span>
                </div>
              )}
              {syncSettled && syncFailed && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                  <AlertCircle size={10} />
                  <span>Showing cached data</span>
                </div>
              )}
            </h1>
          </div>
          {unreadCount > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-xs text-muted-foreground hover:text-primary"
                  aria-label="Mark all as read"
                >
                  <CheckCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Mark all read
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Mark all as read?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will mark all current notifications as read. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => {
                    markAllAsRead();
                    toast.success("Marked all as read");
                  }}>
                    Mark all read
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </header>

      <main className="container mx-auto max-w-2xl flex-1 flex flex-col px-4 md:px-6 pt-4 md:pt-6">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
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
              let headerToneClass = 'text-muted-foreground';

              if (item.type === 'header') {
                if (item.label === 'ACTION REQUIRED') {
                  headerToneClass = 'text-amber-500';
                } else if (item.label === 'UNREAD') {
                  headerToneClass = 'text-blue-500';
                }
              }

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
                    <div className={cn(
                      "flex items-center gap-2 px-1 pt-6 pb-3",
                      headerToneClass
                    )}>
                      {item.label === 'ACTION REQUIRED' && <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />}
                      <h3 className="text-[11px] font-black uppercase tracking-widest">{item.label}</h3>
                    </div>
                  ) : (
                    <NotificationCard
                      n={item.data}
                      onMarkRead={handleToggleRead}
                      isReading={readingId === item.id}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* LOADING INDICATOR AT BOTTOM */}
        {isFetchingNextPage && (
          <div className="h-10 flex items-center justify-center py-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs animate-pulse">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading more...
            </div>
          </div>
        )}

        {!hasNextPage && !isEmpty && !isLoading && (
          <div className="py-8 flex flex-col items-center justify-center text-center opacity-50">
            <div className="h-px w-12 bg-border mb-4" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              End of notifications
            </p>
          </div>
        )}
      </main>
    </div>
  );
}