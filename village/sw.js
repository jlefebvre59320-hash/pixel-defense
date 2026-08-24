/* Village — service worker.
   Le jeu tient en une poignée de fichiers : on les met tous en cache à
   l'installation et on sert le cache en priorité. Une fois la page ouverte
   une fois, le village se rouvre sans réseau.

   Le numéro de version ci-dessous est la seule chose à changer pour publier
   une mise à jour : un nouveau nom de cache remplace l'ancien, supprimé à
   l'activation. */
const CACHE = "village-v1";

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./js/config.js",
  "./js/world.js",
  "./js/iso.js",
  "./js/art.js",
  "./js/sim.js",
  "./js/render.js",
  "./js/storage.js",
  "./js/audio.js",
  "./js/ui.js",
  "./js/main.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});
