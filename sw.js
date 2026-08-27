/* Pixel Defense — service worker.
   Le jeu tient en une poignée de fichiers : on les met tous en cache à
   l'installation, et on sert le cache en priorité. Résultat : une fois la
   page ouverte une fois, le jeu démarre sans réseau, en avion comme dans le
   métro.

   Le numéro de version ci-dessous est la seule chose à changer pour publier
   une mise à jour : un nouveau nom de cache remplace l'ancien, qui est
   supprimé à l'activation. */
const CACHE = "pixel-defense-v2";

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./js/config.js",
  "./js/map.js",
  "./js/art.js",
  "./js/storage.js",
  "./js/audio.js",
  "./js/render.js",
  "./js/game.js",
  "./js/ui.js",
  "./js/main.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
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
      /* Fichier inconnu du cache (ajout après coup) : on le prend sur le
         réseau et on le range pour la prochaine fois. Hors ligne, on retombe
         sur la page d'accueil plutôt que sur une erreur du navigateur. */
      return fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});
