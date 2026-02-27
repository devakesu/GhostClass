/// <reference lib="webworker" />

import { Serwist } from "serwist";
// Strategy classes for different caching behaviors
import { CacheFirst, StaleWhileRevalidate } from "serwist";
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
  // Wait for all clients to close before activating new service worker.
  // This prevents breaking changes from affecting active users mid-session.
  // User-initiated updates are handled via the SKIP_WAITING postMessage flow
  // in sw-register.tsx (the "App updated — tap to refresh" toast).
  skipWaiting: false,
  // Claim all open clients immediately on SW activation.
  // Without this, the SW-controlled PWA window opened right after install
  // is not claimed by the new SW, causing a blank page on first open.
  clientsClaim: true,
  runtimeCaching: [
    // NOTE: No document/navigation handler here intentionally.
    //
    // All protected pages use `export const dynamic = 'force-dynamic'`, which means
    // every page response is a fresh server-render with no cacheable HTML.
    // Adding a NetworkFirst (or any) handler for documents breaks Next.js
    // streaming SSR: the SW buffers the full response before caching, so
    // the Suspense streaming chunks (sent after the initial shell) never
    // arrive in the browser — resulting in a blank content area that only
    // resolves on manual refresh.
    //
    // Navigations go straight to the network; only static assets are cached.
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
//
// Note: No API endpoints (/api/backend/**, /api/profile, etc.) are added to
// runtimeCaching. Attendance and profile data are always fetched from the
// network — caching user-specific authenticated responses would risk PII leakage
// across sessions on shared devices.
self.addEventListener("activate", (event) => {
  (event as ExtendableEvent).waitUntil(
    Promise.all([
      // Purge deprecated "attendance-data" runtime cache (PII leak prevention)
      caches.delete("attendance-data"),
      // Purge the "pages" cache — document caching was removed because it
      // broke Next.js streaming SSR. Any previously cached page HTML is now
      // stale and should be cleared so users don't get stuck.
      caches.delete("pages"),
    ])
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
