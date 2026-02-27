/// <reference lib="webworker" />

import { Serwist } from "serwist";
// Strategy classes for different caching behaviors
import { CacheFirst, NetworkOnly, StaleWhileRevalidate } from "serwist";
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
  // Do NOT claim clients on activation.
  //
  // clientsClaim: true was re-introduced in v2.1.2 to attempt to fix a
  // blank-page issue, but it causes a different blank page: on subsequent
  // standalone PWA launches the SW is already installed and activates
  // mid-stream of Next.js Suspense SSR streaming (DashboardDataLoader),
  // aborting the in-flight response and producing a blank page.
  //
  // The NetworkOnly navigation handler below ensures SSR pages always load
  // from the network, so clientsClaim: false is safe — the SW never serves
  // stale cached HTML. Manual refresh always works because the SW is
  // already active by the time the user navigates.
  clientsClaim: false,
  // Disable navigation preload: Next.js uses streaming SSR (Suspense), and
  // navigation preload can produce duplicate or interleaved response streams
  // that interfere with chunk delivery.
  navigationPreload: false,
  runtimeCaching: [
    // CRITICAL — NetworkOnly for all navigation (document) requests.
    //
    // All protected pages use `export const dynamic = 'force-dynamic'`, which
    // means every page response is a fresh server-render. Without this rule,
    // Serwist's precache router intercepts the navigation fetch on standalone
    // PWA launches, finds no precache entry for the dynamic route, and falls
    // through with undefined — producing a blank page. Explicitly routing
    // navigations to the network ensures SSR pages always load correctly,
    // regardless of SW lifecycle state or precache contents.
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkOnly(),
    },
    // NOTE: No NetworkFirst/CacheFirst document handler below intentionally.
    //
    // All protected pages use `export const dynamic = 'force-dynamic'`, which means
    // every page response is a fresh server-render with no cacheable HTML.
    // Adding a NetworkFirst (or any caching) handler for documents breaks Next.js
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
