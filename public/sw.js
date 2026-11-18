// Neurocosmos service worker — ağ öncelikli.
// Yalnızca sitenin kendi dosyaları (sayfa, kod, görseller) saklanır; internet
// yoksa son saklanan kopya açılır. Google tabloları, veritabanı istekleri,
// Netlify görevleri ve parça parça inen ses/video buraya hiç uğramaz:
// tarayıcı onları doğrudan internetten alır.
// (v2 her isteği, zaman damgalı tablo adresleri dahil, ayrı ayrı saklıyordu;
// saklama alanı her açılışta büyüyordu. v3 açılınca v2 silinir.)
const CACHE_NAME = "neurocosmos-cache-v3";
const CACHE_PREFIX = "neurocosmos-cache-";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (req.headers.has("range")) return;
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/.netlify/")) return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      fetch(req)
        .then((response) => {
          if (response.status === 200) {
            cache.put(req, response.clone());
          }
          return response;
        })
        .catch(() => cache.match(req).then((hit) => hit || Response.error()))
    )
  );
});
