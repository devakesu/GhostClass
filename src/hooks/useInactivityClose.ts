"use client";

import { useEffect, useRef } from "react";

/**
 * Closes the standalone PWA after it has been backgrounded continuously for
 * longer than `timeoutMs` (default: 30 minutes).
 *
 * Mechanism
 * ---------
 * Uses the Page Visibility API (`visibilitychange` event):
 *   - Hidden  → start a countdown timer.
 *   - Visible → cancel the timer (user came back in time).
 *   - Timer fires while still hidden → call `window.close()`.
 *
 * Only active in standalone / installed PWA mode so it never affects the
 * regular browser tab experience.
 */

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

function isStandalonePWA(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function useInactivityClose(timeoutMs = DEFAULT_TIMEOUT_MS): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof document === "undefined" || !isStandalonePWA()) return;

    const clearTimer = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // App went to background — start the countdown only if one isn't
        // already running (guards against duplicate hidden events).
        if (timerRef.current === null) {
          timerRef.current = setTimeout(() => {
            window.close();
          }, timeoutMs);
        }
      } else {
        // App came back to foreground — cancel countdown.
        clearTimer();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    // Handle the case where the hook mounts while the document is already
    // hidden (e.g. app resumed in background).
    handleVisibilityChange();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearTimer();
    };
  }, [timeoutMs]);
}
