/// <reference lib="webworker" />

import { Serwist } from "serwist";
// Strategy classes for different caching behaviors
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from "serwist";
// Plugins used specifically for the image runtime caching strategy
import { CacheableResponsePlugin, ExpirationPlugin } from "serwist";

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: Array<{
    url: string;
    revision?: string;
  }>;
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Wait for all clients to close before activating new service worker
  // This prevents breaking changes from affecting active users
  skipWaiting: false,
  // Don't take control immediately to allow graceful updates
  clientsClaim: false,
  runtimeCaching: [
    {
      matcher: ({ request }) => request.destination === "document",
      handler: new NetworkFirst({
        cacheName: "pages",
        networkTimeoutSeconds: 15,
      }),
    },
    {
      matcher: ({ request }) =>
        request.destination === "style" ||
        request.destination === "script" ||
        request.destination === "worker",
      handler: new StaleWhileRevalidate({
        cacheName: "assets",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 200,
            maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
          }),
        ],
      }),
    },
    {
      matcher: ({ request }) => request.destination === "image",
      handler: new CacheFirst({
        cacheName: "images",
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({
            maxEntries: 100,
            maxAgeSeconds: 60 * 60 * 24 * 30,
          }),
        ],
      }),
    },
    {
      // API caching strategy: NetworkFirst for explicitly safe-to-cache GET /api requests.
      // - Mutation endpoints (POST/PUT/PATCH/DELETE) are excluded by the GET check
      //   and will always go through the network without caching.
      // - Use an allowlist approach to only cache static/public API endpoints that are
      //   guaranteed safe to cache, avoiding stale data for dynamic/user-specific endpoints.
      // - networkTimeoutSeconds: 10 ensures a hanging request (e.g. slow EzyGo/Supabase
      //   response) falls back to cached data instead of leaving the user waiting indefinitely.
      matcher: ({ request, url }) => {
        if (request.method !== "GET") {
          return false;
        }
        if (!url.pathname.startsWith("/api/")) {
          return false;
        }
        // Only cache API responses for explicitly allowlisted, safe-to-cache prefixes
        // to avoid serving stale data for user-specific or real-time endpoints.
        const cacheablePrefixes = ["/api/public/", "/api/static/"];
        if (cacheablePrefixes.some((path) => url.pathname.startsWith(path))) {
          return true;
        }
        // All other /api/ endpoints are treated as non-cacheable by this strategy.
        return false;
      },
      handler: new NetworkFirst({
        cacheName: "api",
        networkTimeoutSeconds: 10,
      }),
    },
    {
      // Offline-capable attendance data caching.
      // Caches GET responses from the EzyGo backend proxy (/api/backend/...) and
      // the user profile endpoint (/api/profile) so attendance records and course
      // data remain readable when the device is offline or the upstream is slow.
      //
      // Strategy: NetworkFirst with a 10 s timeout.
      //   - Online: always serves fresh data; cache is updated in the background.
      //   - Offline / timeout: falls back to the last cached response so the UI
      //     can still render attendance cards instead of showing an error screen.
      //
      // Security notes:
      //   - Only GET is matched, so mutations always hit the network.
      //   - Responses are scoped to the same origin (service worker boundary),
      //     so no cross-origin data leakage is possible.
      //   - ExpirationPlugin caps cached entries at 50 and purges them after 6 h,
      //     preventing stale session data surviving across multiple school days.
      matcher: ({ request, url }) => {
        if (request.method !== "GET") return false;
        return (
          url.pathname.startsWith("/api/backend/") ||
          url.pathname === "/api/profile"
        );
      },
      handler: new NetworkFirst({
        cacheName: "attendance-data",
        networkTimeoutSeconds: 10,
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({
            maxEntries: 50,
            maxAgeSeconds: 60 * 60 * 6, // 6 hours
          }),
        ],
      }),
    },
  ],
});

serwist.addEventListeners();

// Allow manual skip waiting via postMessage for user-initiated updates
// This enables a "New version available - Click to refresh" UI pattern
self.addEventListener("message", (event) => {
  (async () => {
    if (!(event.data && event.data.type === "SKIP_WAITING")) {
      return;
    }

    // Validate the message source before forcing activation
    const source = event.source;
    if (!source || !("id" in source)) {
      return;
    }

    try {
      const client = await self.clients.get((source as Client | WindowClient).id);
      if (!client) {
        return;
      }

      const clientUrl = new URL(client.url);
      if (clientUrl.origin !== self.location.origin) {
        // Ignore messages from cross-origin clients
        return;
      }

      self.skipWaiting();
    } catch {
      // In case of any error resolving the client, do not force activation
      return;
    }
  })().catch((error) => {
    // Log unexpected errors so they don't fail silently
    console.error("Unexpected error in SKIP_WAITING message handler:", error);
  });
});
