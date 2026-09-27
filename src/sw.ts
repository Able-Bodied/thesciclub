/**
 * The service worker, written by hand since notifications needed a place to go.
 *
 * Until 2026-09-27 VitePWA generated this (`generateSW`) and there was nowhere
 * to put a `push` handler. It is `injectManifest` now, and the first four
 * statements below are exactly what the generated one did — read `dist/sw.js`
 * from an older build to see them minified. Dropping any of them changes
 * something that worked without saying so:
 *
 * - `skipWaiting` + `clientsClaim` are what `registerType: 'autoUpdate'` means.
 *   Without them a new deploy waits until every tab of the old one is closed,
 *   and an installed app is almost never closed.
 * - `precacheAndRoute` is the offline shell.
 * - The navigation route serves `index.html` for every path, which is what
 *   makes `/chat` open offline rather than only `/`. It is the service worker's
 *   version of the SPA redirect in netlify.toml.
 *
 * Built as an IIFE (see vite.config.ts) so it registers as a classic script;
 * module service workers arrived late on iOS and this is for iPhones.
 *
 * The decisions about what a notification says live in `lib/push/payload.ts`,
 * which is pure and tested. This file only hands events to it.
 */

/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { pickWindow, readPushPayload, safePath } from './lib/push/payload';

declare const self: ServiceWorkerGlobalScope;

void self.skipWaiting();
clientsClaim();
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

self.addEventListener('push', (event) => {
  // Always a notification, whatever arrived — see the payload file's header.
  const { title, options } = readPushPayload(event.data?.text(), self.location.origin);
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const origin = self.location.origin;
  const data = event.notification.data as { url?: unknown } | null;
  const path = safePath(data?.url, origin);

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const index = pickWindow(windows, path, origin);
      const target = index === null ? undefined : windows[index];
      if (!target) {
        await self.clients.openWindow(path);
        return;
      }
      const focused = await target.focus();
      // `navigate` only works on a window this worker controls; `clientsClaim`
      // above makes that every window after the first load. A full navigation
      // rather than an in-app route change, which is fine for a tap from the
      // lock screen: the app is being brought forward, not used.
      if (safePath(focused.url, origin) !== path) await focused.navigate(path);
    })(),
  );
});
