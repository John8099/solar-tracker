const CACHE_NAME = "sun-tracker-pwa-v2";
const APP_SHELL = [
  "/",
  "/dashboard",
  "/reports",
  "/manifest.webmanifest",
  "/icon.svg",
  "/apple-touch-icon.svg",
  "/pwa-register.js",
  "/offline.html",
];

const isCacheableRequest = (request) => {
  const url = new URL(request.url);

  return url.protocol === "http:" || url.protocol === "https:";
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !isCacheableRequest(event.request)) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const responseClone = response.clone();

        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone).catch(() => {});
        });

        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);

        if (cached) {
          return cached;
        }

        if (event.request.mode === "navigate") {
          return caches.match("/offline.html");
        }

        throw new Error("Network unavailable and no cache match.");
      }),
  );
});