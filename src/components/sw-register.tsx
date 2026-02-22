"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

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
  // Track if registration is in progress to prevent duplicate intervals
  // across component remounts (e.g., during SPA navigation)
  const registrationInProgressRef = useRef(false);
  const updateIntervalIdRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
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

    // Wait for page to load before registering to avoid impacting initial page load performance
    const handleLoad = async () => {
      // Check if component is still mounted
      if (!isMounted) return;

      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        // Check again after async operation
        if (!isMounted) return;

        logger.dev("Service worker registered successfully", {
          context: "ServiceWorkerRegister",
          scope: registration.scope,
        });

        // Listen for updates to the service worker
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              // New service worker is installed and waiting to activate.
              logger.dev("New service worker available", {
                context: "ServiceWorkerRegister",
              });

              // Notify the user that an update is ready.
              // The action sends a SKIP_WAITING message to the waiting SW,
              // which triggers activation; controllerchange fires when the
              // new SW takes control, at which point we reload for a clean state.
              let refreshing = false;
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
                  onClick: () => {
                    if (registration.waiting) {
                      registration.waiting.postMessage({ type: "SKIP_WAITING" });
                    } else {
                      // Waiting worker already activated; reload directly.
                      window.location.reload();
                    }
                  },
                },
              });
            }
          });
        });

        // Check for updates periodically (every hour)
        // Only create interval if one doesn't already exist
        if (!updateIntervalIdRef.current) {
          updateIntervalIdRef.current = setInterval(() => {
            if (!isMounted) return;
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
    };

    window.addEventListener("load", handleLoad);

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
