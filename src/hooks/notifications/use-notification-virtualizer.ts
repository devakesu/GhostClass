import { useCallback } from "react";
import { useVirtualizerBridge } from "./virtualizer-bridge";
import { Notification } from "@/hooks/notifications/useNotifications";

export type VirtualItem = 
  | { type: 'header', id: string, label: string }
  | { type: 'notification', id: number, data: Notification };

/**
 * Custom hook to isolate TanStack Virtual logic from the React Compiler.
 * This helps avoid 'Compilation Skipped' warnings in main components.
 */
export function useNotificationVirtualizer({
  virtualItems,
  parentRef,
}: {
  virtualItems: VirtualItem[];
  parentRef: React.RefObject<HTMLDivElement | null>;
}) {
  const estimateSize = useCallback((index: number) => {
    if (index < 0 || index >= virtualItems.length) return 80;
    const item = virtualItems.at(index);
    if (!item) return 80;

    if (item.type === "header") {
      return 57; 
    }

    const notification = item.data;
    const description = typeof notification?.description === "string" ? notification.description : "";

    const baseHeightShort = 80;
    const baseHeightMedium = 95;
    
    const extraPer100Chars = 12;
    const maxExtra = 60;
    const extraHeight = description.length > 80
      ? Math.min(maxExtra, Math.ceil((description.length - 80) / 100) * extraPer100Chars)
      : 0;

    const baseHeight = description.length > 80 ? baseHeightMedium : baseHeightShort;
    const marginBottom = 8;

    return baseHeight + extraHeight + marginBottom;
  }, [virtualItems]);

  const getScrollElement = useCallback(() => parentRef.current, [parentRef]);

  return useVirtualizerBridge({
    count: virtualItems.length,
    getScrollElement,
    estimateSize,
    measureElement: (el: Element) => (el as HTMLElement).getBoundingClientRect().height,
    overscan: 10,
  });
}
