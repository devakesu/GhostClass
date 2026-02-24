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
        plugins: [
          new ExpirationPlugin({
            maxEntries: 50,
            // Expire cached pages after 7 days so offline users are never served
            // content that is more than a week stale.
            maxAgeSeconds: 60 * 60 * 24 * 7,
          }),
        ],
      }),
    },
    {
      matcher: ({ request }) =>
        request.destination === "style" ||
        request.destination === "script" ||
        request.destination === "worker" ||
        request.destination === "font",
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
  ],
});

serwist.addEventListeners();

// On activation, purge the deprecated "attendance-data" runtime cache.
// Previous SW versions cached authenticated, user-specific responses in that
// cache using URL-only keys. Those entries must be removed to prevent PII from
// a previous user session being accessible to a different user on the same device.
self.addEventListener("activate", (event) => {
  (event as ExtendableEvent).waitUntil(
    caches.delete("attendance-data")
  );
});

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
