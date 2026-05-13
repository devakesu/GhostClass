"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { isStandalonePWA } from "@/lib/pwa";

const THRESHOLD_MS = 2000;
const SENTINEL_KEY = "__gce";

let sentinelInitialized = false;

function getHistoryState(): Record<string, unknown> {
  return typeof history.state === "object" && history.state !== null
    ? (history.state as Record<string, unknown>)
    : {};
}

export function useBackToExit(): void {
  const firstBackTimeRef = useRef<number | null>(null);
  const toastIdRef = useRef<ReturnType<typeof toast> | null>(null);
  const exitArmedRef = useRef(false);
  const exitModeRef = useRef<"root" | "deep" | null>(null);
  const navDepthRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined" || !isStandalonePWA()) return;

    if (!sentinelInitialized) {
      sentinelInitialized = true;
      const rootState = getHistoryState();
      history.replaceState(
        { ...rootState, [SENTINEL_KEY]: true },
        "",
        window.location.href
      );
      history.pushState(rootState, "", window.location.href);
    }

    const clearState = () => {
      toastIdRef.current = null;
      firstBackTimeRef.current = null;
      navDepthRef.current = 0;
      exitArmedRef.current = false;
      exitModeRef.current = null;
    };

    const resetExitState = () => {
      if (toastIdRef.current !== null) {
        toast.dismiss(toastIdRef.current);
      }
      clearState();
    };

    const showExitToast = () => {
      if (toastIdRef.current !== null) {
        const previousToastId = toastIdRef.current;
        toastIdRef.current = null;
        toast.dismiss(previousToastId);
      }

      let newId: ReturnType<typeof toast> | null = null;
      const handleClear = () => {
        if (toastIdRef.current === newId) clearState();
      };

      newId = toast("Press back again to exit", {
        duration: THRESHOLD_MS,
        onDismiss: handleClear,
        onAutoClose: handleClear,
      });

      toastIdRef.current = newId;
    };

    const handleDeepExit = (now: number) => {
      const isDashboard = window.location.pathname.startsWith("/dashboard");
      if (isDashboard) {
        resetExitState();
        return;
      }

      if (exitModeRef.current === "root") resetExitState();

      if (exitArmedRef.current && exitModeRef.current === "deep" && firstBackTimeRef.current) {
        if (now - firstBackTimeRef.current < THRESHOLD_MS) {
          resetExitState();
          window.close();
          return;
        }
        resetExitState();
      }

      navDepthRef.current += 1;
      if (navDepthRef.current >= 2) {
        firstBackTimeRef.current = now;
        exitArmedRef.current = true;
        exitModeRef.current = "deep";
        showExitToast();
      }
    };

    const handleSentinelHit = (state: Record<string, unknown>, now: number) => {
      navDepthRef.current = 0;
      if (
        exitArmedRef.current &&
        exitModeRef.current === "root" &&
        firstBackTimeRef.current &&
        now - firstBackTimeRef.current < THRESHOLD_MS
      ) {
        resetExitState();
        window.close();
        return;
      }

      firstBackTimeRef.current = now;
      exitArmedRef.current = true;
      exitModeRef.current = "root";

      const cleanState = { ...state };
      Reflect.deleteProperty(cleanState, SENTINEL_KEY);
      
      history.pushState(cleanState, "", window.location.href);
      showExitToast();
    };

    const handlePopState = (event: PopStateEvent) => {
      const now = Date.now();
      const state = event.state as Record<string, unknown> | null;
      const hasSentinel = state && typeof state === "object" && Reflect.get(state, SENTINEL_KEY) === true;

      if (!hasSentinel) {
        handleDeepExit(now);
      } else {
        handleSentinelHit(state, now);
      }
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      resetExitState();
    };
  }, []);
}
