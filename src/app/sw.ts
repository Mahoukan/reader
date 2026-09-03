/// <reference lib="esnext" />
/// <reference lib="webworker" />

import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const bookPath = /\.(?:epub|pdf|cbz)$/i;
const applicationCaching: RuntimeCaching[] = [
  {
    matcher: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith("/api/"),
    handler: new NetworkOnly(),
  },
  {
    matcher: ({ request, sameOrigin, url }) =>
      sameOrigin && request.mode === "navigate" && !url.pathname.startsWith("/api/") && !bookPath.test(url.pathname),
    handler: new NetworkFirst({
      cacheName: "local-ebook-reader-navigation-v1",
      networkTimeoutSeconds: 4,
      plugins: [new ExpirationPlugin({ maxEntries: 8, maxAgeSeconds: 30 * 24 * 60 * 60 })],
    }),
  },
  {
    matcher: ({ request, sameOrigin, url }) =>
      sameOrigin &&
      !url.pathname.startsWith("/api/") &&
      !bookPath.test(url.pathname) &&
      ["script", "style", "worker", "font", "image", "manifest"].includes(request.destination),
    handler: new CacheFirst({
      cacheName: "local-ebook-reader-assets-v1",
      plugins: [new ExpirationPlugin({ maxEntries: 160, maxAgeSeconds: 90 * 24 * 60 * 60 })],
    }),
  },
];

const serwist = new Serwist({
  cacheId: "local-ebook-reader",
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: { cleanupOutdatedCaches: true },
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: applicationCaching,
  fallbacks: {
    entries: [{ url: "/index.html", matcher: ({ request }) => request.mode === "navigate" }],
  },
});

serwist.addEventListeners();
