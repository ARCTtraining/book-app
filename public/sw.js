/**
 * Reading Log service worker.
 *
 * Hand-rolled rather than generated: the app is four static routes plus
 * localStorage, so the whole offline story is "keep the shell, keep the
 * hashed assets". Bump CACHE_VERSION to retire every old cache at once.
 */

const CACHE_VERSION = "v1";
const SHELL_CACHE = `reading-log-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `reading-log-assets-${CACHE_VERSION}`;

/** Routes and files worth having before the first offline launch. */
const SHELL_URLS = [
  "/",
  "/search",
  "/insights",
  "/settings",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Individually, so one 404 cannot fail the whole install.
      await Promise.all(
        SHELL_URLS.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {})
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
    return;
  }

  // Build output is content-hashed, so it can be trusted from cache forever.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // React Server Component payloads for client-side navigation. Never served
  // stale — a failure here makes Next fall back to a full navigation, which
  // the handler above answers from the shell cache.
  if (url.searchParams.has("_rsc")) return;

  event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
});

/**
 * Pages come from the network when it is there, so an updated build is picked
 * up on the next launch, and from the shell cache when it is not.
 */
async function networkFirstPage(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
    // Any route is better than the offline error page; the tab bar can reach
    // the rest of the app from whatever we do have.
    return cached || (await cache.match("/")) || Response.error();
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);

  return cached || network;
}
