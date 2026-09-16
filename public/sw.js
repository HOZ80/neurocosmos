const CACHE_NAME = "neurocosmos-cache-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      fetch(event.request)
        .then((response) => {
          if (event.request.method === "GET" && response.status === 200) {
            cache.put(event.request, response.clone());
          }
          return response;
        })
        .catch(() => cache.match(event.request))
    )
  );
});
