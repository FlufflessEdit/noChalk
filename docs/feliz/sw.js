/* Feliz service worker – v2.22
   Why: "vereinzelt können manche nicht beitreten" had one ugly cause that
   no amount of retry logic can fix: a device still running an OLD mix of
   files (browser cache). GitHub Pages serves everything with a 10-minute
   cache lifetime – long enough for a lesson, and a kid whose phone kept
   the tab or the cache from the last lesson played on a stale client.js
   while the host already ran the new host.js. Mismatched versions are
   exactly the kind of failure that only hits SOME devices.

   This worker guarantees, from its first install on:
   • index.html: always fresh from the network when online (offline: the
     last version from the cache).
   • files with a ?v=… version tag: cached once, never re-fetched while
     the tag stays the same – a new deploy brings a new tag, so a new
     file. Mixed old/new sets are impossible.
   • everything else on this origin (svg/, unversioned files):
     network-first with a cached fallback, plus a background refresh for
     the animal svgs (they change rarely and are fetched in bulk).
   • cross-origin requests (PeerJS CDN, fonts, Excel library) and
     non-GET requests: untouched, the browser handles them as before.
   WebSockets (the PeerJS broker) never pass through a service worker. */

const SW_CACHE = "feliz-v222";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== SW_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; /* POST etc.: never cache */
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; /* CDN / fonts: browser default */

  /* versioned assets → cache-first (immutable while the tag matches) */
  if (/[?&]v=\d+/.test(url.search)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SW_CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        } catch (e) {
          return hit || Response.error();
        }
      })(),
    );
    return;
  }

  /* animal svgs → stale-while-revalidate (fast, refreshed in background) */
  if (/\/svg\//.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SW_CACHE);
        const hit = await cache.match(req);
        const fresh = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => null);
        return hit || (await fresh) || Response.error();
      })(),
    );
    return;
  }

  /* everything else on this origin (index.html, unversioned files) →
     network-first, cache only as an offline fallback                */
  event.respondWith(
    (async () => {
      const cache = await caches.open(SW_CACHE);
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch (e) {
        const hit = await cache.match(req);
        if (hit) return hit;
        return Response.error();
      }
    })(),
  );
});
