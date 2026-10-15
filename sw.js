const cacheName = "job-match-agent-install-v1";

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (key) {
        return key.indexOf("job-match-agent-install-") === 0 && key !== cacheName;
      }).map(function (key) {
        return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// Keep the installed app online-first so new platform updates appear immediately.
self.addEventListener("fetch", function (event) {
  if (event.request.method === "GET") {
    event.respondWith(fetch(event.request));
  }
});
