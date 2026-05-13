"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { useBackToExit } from "@/hooks/useBackToExit";
import { useInactivityClose } from "@/hooks/useInactivityClose";
// Side-effect import: ensures the usePWAInstall module-level listener is
// registered before `beforeinstallprompt` can fire, even on pages where
// PWAInstallBanner (the component that uses the hook) hasn't mounted yet.
// This preserves the deferred prompt so the custom install banner works
// even when Chrome fires the event on a public/login page.
import "@/hooks/usePWAInstall";

let refreshing = false;

function triggerSwUpdateReload(registration: ServiceWorkerRegistration): void {
  if (registration.waiting) {
    const waitingWorker = registration.waiting;
    waitingWorker.addEventListener("statechange", function onActivated() {
      if (waitingWorker.state === "activated") {
        waitingWorker.removeEventListener("statechange", onActivated);
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      }
    });
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  } else {
    window.location.reload();
  }
}

function handleWorkerStateChange(newWorker: ServiceWorker, registration: ServiceWorkerRegistration): void {
  if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
    logger.dev("New service worker available", {
      context: "ServiceWorkerRegister",
    });

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      },
      { once: true }
    );

    toast("App updated — tap to refresh", {
      description: "A new version of GhostClass is ready.",
      duration: Infinity,
      action: {
        label: "Refresh",
        onClick: () => triggerSwUpdateReload(registration),
      },
    });
  }
}

function setupUpdateListener(registration: ServiceWorkerRegistration): void {
  registration.addEventListener("updatefound", () => {
    const newWorker = registration.installing;
    if (!newWorker) return;
    newWorker.addEventListener("statechange", () => {
      handleWorkerStateChange(newWorker, registration);
    });
  });
}

async function performRegistration(
  getIsMounted: () => boolean,
  updateIntervalIdRef: React.MutableRefObject<NodeJS.Timeout | null>
) {
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });

    if (!getIsMounted()) return;

    logger.dev("Service worker registered successfully", {
      context: "ServiceWorkerRegister",
      scope: registration.scope,
    });

    setupUpdateListener(registration);

    if (!updateIntervalIdRef.current) {
      updateIntervalIdRef.current = setInterval(() => {
        if (!getIsMounted()) return;
        registration.update().catch((error) => {
          logger.dev("Service worker update check failed", {
            context: "ServiceWorkerRegister",
            error,
          });
        });
      }, 60 * 60 * 1000);
    }
  } catch (error) {
    logger.error("Service worker registration failed", {
      context: "ServiceWorkerRegister",
      error,
    });
  }
}

/**
 * Service Worker Registration Component
 * 
 * Handles registration and lifecycle management of the service worker
 * for Progressive Web App (PWA) functionality including offline support,
 * caching strategies, and background sync.
 * 
 * This component should be included in the root layout to ensure the
 * service worker is registered on all pages.
 */
export function ServiceWorkerRegister() {
  // Press back twice to exit in standalone PWA mode.
  useBackToExit();
  // Close the PWA after 30 min in the background.
  useInactivityClose();

  // Track if registration is in progress to prevent duplicate intervals
  // across component remounts (e.g., during SPA navigation)
  const registrationInProgressRef = useRef(false);
  const updateIntervalIdRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    refreshing = false;
    // Only register service worker in browser environment
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // In development, only register if explicitly enabled (NEXT_PUBLIC_ENABLE_SW_IN_DEV=true)
    // In production, service worker is always enabled and generated at build time
    const isDev = process.env.NODE_ENV === "development";
    if (isDev && process.env.NEXT_PUBLIC_ENABLE_SW_IN_DEV !== "true") {
      logger.dev(
        "Service worker is disabled in development. Enable with NEXT_PUBLIC_ENABLE_SW_IN_DEV=true",
        {
          context: "ServiceWorkerRegister",
        },
      );
      return;
    }

    // Prevent duplicate registration if one is already in progress
    if (registrationInProgressRef.current) {
      return;
    }

    registrationInProgressRef.current = true;
    let isMounted = true;

    // Register the SW immediately after load. The SW never touches navigation
    // responses (early-exit handler in sw.ts uses stopImmediatePropagation() for
    // all navigate-mode requests) and clientsClaim: false means it never claims
    // existing clients, so there is no risk of interfering with SSR streaming.
    const handleLoad = () => {
      if (!isMounted) return;
      void performRegistration(() => isMounted, updateIntervalIdRef);
    };

    if (document.readyState === "complete") {
      // If the page has already finished loading, run registration logic immediately.
      handleLoad();
    } else {
      window.addEventListener("load", handleLoad);
    }

    // Cleanup function
    return () => {
      isMounted = false;
      registrationInProgressRef.current = false;
      window.removeEventListener("load", handleLoad);
      if (updateIntervalIdRef.current) {
        clearInterval(updateIntervalIdRef.current);
        updateIntervalIdRef.current = null;
      }
    };
  }, []);

  // This component doesn't render anything
  return null;
}

export function __resetRefreshingForTests() {
  refreshing = false;
}
