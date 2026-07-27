/*
 * Retirement worker for OpenPBL versions that previously registered /sw.js.
 *
 * The current application does not use offline caching. Browsers with a
 * legacy registration can update to this worker and then remove it instead
 * of requesting a missing script on every visit.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    self.clients.claim().then(() => self.registration.unregister()),
  );
});
