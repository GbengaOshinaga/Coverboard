// Coverboard service worker — minimal, present for installability only.
//
// It deliberately does NOT cache pages or API responses. Coverboard is an
// authenticated HR product, and caching navigations/responses risks serving
// stale leave data — or, worse, content from a previous account on a shared
// device. The presence of a fetch handler is what lets browsers offer the
// install prompt; everything is deferred to the network.
//
// If offline support is wanted later, add a cache strategy scoped to immutable
// static assets only (e.g. /_next/static/*), never to authenticated routes.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // No-op: defer to the network. Handler presence enables installability.
});
