"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { isStandalonePWA } from "@/lib/pwa";

/**
 * Double-back-to-exit for standalone PWA.
 *
 * Behaviour
 * ---------
 * - Back press mid-app  → navigates back normally, no toast.
 * - Back press at root  → sentinel detected; toast shown and clean top re-pushed.
 * - Second back press within THRESHOLD_MS of the toast → window.close().
 * - Second back press after THRESHOLD_MS → treated as a fresh root press.
 *
 * Sentinel mechanism
 * ------------------
 * The hook marks the current (root) history entry by merging __gce:true into
 * it via `replaceState`, then pushes a clean "top" entry above it:
 *
 *   [...real history, <root __gce:true>, <top clean> ← user starts here]
 *
 * When the user navigates within the app, normal entries pile up above "top
 * clean". Back-pressing through those entries fires `popstate` with states
 * that have NO sentinel key → the handler ignores them entirely.
 *
 * When the user backs all the way to the __gce-marked root entry, `popstate`
 * fires with event.state containing __gce:true → toast is shown and a new
 * clean top is re-pushed so the next press within the threshold can also be
 * caught. The clean top is derived by stripping __gce from event.state, so
 * existing Next.js router metadata in history.state is always preserved.
 *
 * Only activates in standalone / installed PWA mode so it never interferes
 * with regular browser navigation.
 */

const THRESHOLD_MS = 2000;
const SENTINEL_KEY = "__gce";

/**
 * Module-level flag prevents double-initialization across React StrictMode /
 * HMR re-mount cycles. The module is shared across remounts within the same
 * app session, so a single boolean is sufficient. `vi.resetModules()` in
 * tests resets this automatically for each test run.
 */
let sentinelInitialized = false;

function getHistoryState(): Record<string, unknown> {
  return typeof history.state === "object" && history.state !== null
    ? (history.state as Record<string, unknown>)
    : {};
}

export function useBackToExit(): void {
  const firstBackTimeRef = useRef<number | null>(null);
  const toastIdRef = useRef<ReturnType<typeof toast> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !isStandalonePWA()) return;

    // Sentinel setup (runs exactly once per app session via sentinelInitialized):
    //   1. Merge __gce:true into the current (root) history entry — preserves
    //      any existing Next.js router state already in history.state.
    //   2. Push a clean "top" entry (root state minus __gce) above it.
    // Back from the clean top → popstate fires with root state (__gce:true) → detected!
    if (!sentinelInitialized) {
      sentinelInitialized = true;
      const rootState = getHistoryState();
      history.replaceState({ ...rootState, [SENTINEL_KEY]: true }, "", window.location.href);
      history.pushState(rootState, "", window.location.href);
    }

    const handlePopState = (event: PopStateEvent) => {
      // Ignore mid-app back presses — their state doesn't carry a true sentinel.
      // Strict === true check avoids accidental matches if __gce ever appears
      // with a falsy value in some other history entry.
      if (
        !event.state ||
        typeof event.state !== "object" ||
        (event.state as Record<string, unknown>)[SENTINEL_KEY] !== true
      ) {
        // If a mid-app back fires while the exit toast is showing, cancel the
        // pending exit. Only two *consecutive* root-level presses should close
        // the PWA — navigating away resets the countdown.
        if (toastIdRef.current !== null) {
          toast.dismiss(toastIdRef.current);
          toastIdRef.current = null;
        }
        firstBackTimeRef.current = null;
        return;
      }

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

      // First back at root (or threshold expired).
      // Derive a clean top state by stripping __gce from the sentinel entry
      // so Next.js router metadata is kept on the re-pushed entry.
      firstBackTimeRef.current = now;
      const { [SENTINEL_KEY]: _sentinel, ...cleanState } =
        event.state as Record<string, unknown>;
      history.pushState(cleanState, "", window.location.href);

      if (toastIdRef.current !== null) {
        toast.dismiss(toastIdRef.current);
      }

      toastIdRef.current = toast("Press back again to exit", {
        duration: THRESHOLD_MS,
        invert: true,
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
