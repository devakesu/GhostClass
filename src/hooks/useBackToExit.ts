"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Double-back-to-exit for standalone PWA.
 *
 * Behaviour
 * ---------
 * - Back press mid-app  → navigates back normally, no toast.
 * - Back press at root  → user hits the sentinel entry; toast shown.
 *                         Sentinel is re-pushed so the next back is catchable.
 * - Second back press within THRESHOLD_MS of the toast → window.close().
 * - Second back press after THRESHOLD_MS → treated as a fresh root press.
 *
 * Sentinel mechanism
 * ------------------
 * At mount, one "sentinel" history entry is pushed above the current page:
 *
 *   [...real history, <root page>, <sentinel ← user starts here>]
 *
 * Mid-app back presses pop real in-app entries — their `event.state` does
 * NOT contain the sentinel key, so the handler ignores them entirely.
 * When the user backs all the way to the sentinel entry, `event.state` DOES
 * contain the key → toast is shown and the sentinel is re-pushed so the next
 * press within the threshold can also be caught.
 *
 * Only activates in standalone / installed PWA mode so it never interferes
 * with regular browser navigation.
 */

const THRESHOLD_MS = 2000;
const SENTINEL_KEY = "__gce";

function isStandalonePWA(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function useBackToExit(): void {
  const firstBackTimeRef = useRef<number | null>(null);
  const toastIdRef = useRef<ReturnType<typeof toast> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !isStandalonePWA()) return;

    // Push the sentinel so the first back press from the root hits it instead
    // of immediately closing the PWA. Guard against double-invocation in React
    // StrictMode / HMR by only pushing if the current state isn't already ours.
    const currentState = history.state as Record<string, unknown> | null;
    if (!currentState || !(SENTINEL_KEY in currentState)) {
      history.pushState({ [SENTINEL_KEY]: true }, "", window.location.href);
    }

    const handlePopState = (event: PopStateEvent) => {
      // Ignore mid-app back presses — they don't have the sentinel state.
      if (!event.state || !event.state[SENTINEL_KEY]) return;

      const now = Date.now();

      if (firstBackTimeRef.current !== null && now - firstBackTimeRef.current < THRESHOLD_MS) {
        // Second back at root within threshold — close the PWA.
        if (toastIdRef.current !== null) {
          toast.dismiss(toastIdRef.current);
        }
        toastIdRef.current = null;
        firstBackTimeRef.current = null;
        window.close();
        return;
      }

      // First back at root (or threshold expired) — re-push sentinel so the
      // next press is also catchable, then show the toast.
      firstBackTimeRef.current = now;
      history.pushState({ [SENTINEL_KEY]: true }, "", window.location.href);

      if (toastIdRef.current !== null) {
        toast.dismiss(toastIdRef.current);
      }

      toastIdRef.current = toast("Press back again to exit", {
        duration: THRESHOLD_MS,
        onDismiss: () => {
          toastIdRef.current = null;
          firstBackTimeRef.current = null;
        },
        onAutoClose: () => {
          toastIdRef.current = null;
          firstBackTimeRef.current = null;
        },
      });
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      // Dismiss any active toast and reset refs so stale UI is never left
      // behind after unmount (e.g. during HMR or StrictMode double-effect).
      if (toastIdRef.current !== null) {
        toast.dismiss(toastIdRef.current);
        toastIdRef.current = null;
      }
      firstBackTimeRef.current = null;
    };
  }, []);
}
