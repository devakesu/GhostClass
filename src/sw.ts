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

// ---------------------------------------------------------------------------
// CRITICAL — Early-exit fetch handler for navigations and Sentry tunnel.
//
// Registered BEFORE Serwist's listeners so it fires first.  For matched
// requests we call `stopImmediatePropagation()` to prevent Serwist from
// calling `event.respondWith()`, then return without responding — the
// browser handles the request natively (direct network fetch).
//
// Why this matters:
//   • Navigations: Serwist's NetworkOnly handler does
//     `event.respondWith(fetch(req))`, which re-fetches inside the SW
//     context.  On Android Chrome standalone mode this can truncate
//     Next.js Suspense SSR streaming responses, producing a blank page
//     (header + footer only, no content).  Letting the browser handle
//     navigations natively avoids this entirely.
//   • Sentry tunnel (/monitoring): The Sentry SDK can generate 100+
//     POST requests per second during error/replay bursts.  Letting
//     each pass through Serwist's precache-check → runtime-cache-check
//     pipeline adds unnecessary SW main-thread work.  Bypassing Serwist
//     entirely eliminates that overhead.
// ---------------------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  // 1. Navigation requests — let browser handle SSR streaming natively
  if (event.request.mode === "navigate") {
    event.stopImmediatePropagation();
    return; // no respondWith() → browser fetches directly
  }

  // 2. Monitoring + API routes — bypass SW entirely.
  //    • Sentry tunnel (/monitoring): Avoid SW overhead during error/replay bursts
  //      by skipping precache/runtime-cache checks for high-volume telemetry.
  //    • API routes (/api/*): Bypass SW so the browser processes Set-Cookie headers
  //      natively. Responses proxied through a service worker may not have cookies
  //      stored by the browser's cookie jar (observed with the httpOnly CSRF
  //      token cookie). Regardless of each route's caching mode, /api/ responses
  //      must always go directly to the network so the browser handles cookies
  //      and caching itself.
  try {
    const url = new URL(event.request.url);
    if (url.pathname.startsWith("/monitoring") || url.pathname.startsWith("/api/")) {
      event.stopImmediatePropagation();
      return;
    }
  } catch {
    // Malformed URL — let Serwist handle it
  }
});

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
  // Navigation requests are now fully bypassed in the early-exit fetch
  // handler above, so the SW never touches SSR streaming at all.
  clientsClaim: false,
  // Disable navigation preload: Next.js uses streaming SSR (Suspense), and
  // navigation preload can produce duplicate or interleaved response streams
  // that interfere with chunk delivery.
  navigationPreload: false,
  runtimeCaching: [
    // DEFENSE-IN-DEPTH — NetworkOnly fallback for navigations.
    //
    // The early-exit fetch handler above uses stopImmediatePropagation()
    // to bypass Serwist for all navigations.  This rule exists purely as
    // a safety net: if a browser ever fails to honour stopImmediatePropagation()
    // on SW FetchEvent, this ensures navigations still go to the network
    // rather than being served from precache (which would produce a blank page).
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
