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
import {
  NAVIGATE,
  PENDING,
  PENDING_FOR_MS,
  pickWindow,
  readPushPayload,
  safePath,
} from './lib/push/payload';
import { SHARE_CACHE, SHARE_MAX_FILES, SHARE_META, shareFileKey } from './lib/share-target';

declare const self: ServiceWorkerGlobalScope;

void self.skipWaiting();
clientsClaim();
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
// Not for an address that is a file. Opened in a tab, an image is a
// navigation too, and served index.html it became the app, which sent it to
// /join: the opt-in screenshots the carriers' reviewers open from the
// text-message registration (public/sms-opt-in/) did exactly that in any tab
// that had been to the club first. No route of the app has a dot in its last
// segment, so a path that ends in an extension goes to the network.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/\.[a-z0-9]+$/i] }),
);

// "Share to The SCI Club" (manifest share_target, Android). The share is a
// POST the app cannot read, so it is kept in a cache of its own, photographs
// and all, and the app is opened on /share, which reads it once. A 303, so
// the browser goes there with a GET and a refresh does not post again.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || url.pathname !== '/share-target') return;
  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData();
        const text = (name: string) => {
          const value = form.get(name);
          return typeof value === 'string' ? value : '';
        };
        const photos = form
          .getAll('photos')
          .filter(
            (value): value is File => value instanceof File && value.type.startsWith('image/'),
          )
          .slice(0, SHARE_MAX_FILES);
        await caches.delete(SHARE_CACHE);
        const cache = await caches.open(SHARE_CACHE);
        await Promise.all(
          photos.map((photo, index) =>
            cache.put(
              shareFileKey(index),
              new Response(photo, {
                headers: {
                  'Content-Type': photo.type,
                  'x-file-name': encodeURIComponent(photo.name),
                },
              }),
            ),
          ),
        );
        await cache.put(
          SHARE_META,
          new Response(
            JSON.stringify({
              title: text('title'),
              text: text('text'),
              url: text('url'),
              files: photos.length,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
      } catch {
        // Whatever could not be read is simply not there on /share.
      }
      return Response.redirect('/share', 303);
    })(),
  );
});

self.addEventListener('push', (event) => {
  // Always a notification, whatever arrived — see the payload file's header.
  const { title, options, badge } = readPushPayload(event.data?.text(), self.location.origin);
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      // The number on the app icon, without opening the app. Only where the
      // platform has it (a Home Screen app on iOS 16.4+, installed Chrome).
      badge === undefined || !('setAppBadge' in self.navigator)
        ? undefined
        : (badge > 0 ? self.navigator.setAppBadge(badge) : self.navigator.clearAppBadge()).catch(
            () => undefined,
          ),
    ]),
  );
});

// The last press, for a window that is only starting and asks for it. See
// PENDING in lib/push/payload.ts.
let pending: { path: string; at: number } | null = null;

/** Asks a running app to open `path` itself; true if it said it did. */
function askToOpen(client: Client, path: string): Promise<boolean> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      resolve(false);
    }, 1500);
    channel.port1.onmessage = () => {
      clearTimeout(timer);
      resolve(true);
    };
    client.postMessage({ type: NAVIGATE, path }, [channel.port2]);
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const origin = self.location.origin;
  const data = event.notification.data as { url?: unknown } | null;
  const path = safePath(data?.url, origin);
  pending = { path, at: Date.now() };
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const index = pickWindow(windows, path, origin);
      const target = index === null ? undefined : windows[index];
      if (!target) {
        // A starting app collects `pending` if it does not open at `path`.
        await self.clients.openWindow(path);
        return;
      }
      const focused = await target.focus();
      if (await askToOpen(focused, path)) {
        pending = null;
        return;
      }
      // An app too old to answer, or one still starting.
      if (safePath(focused.url, origin) !== path) await focused.navigate(path).catch(() => null);
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data as { type?: unknown } | null;
  if (data?.type !== PENDING || !(event.source instanceof Client)) return;
  const waiting = pending;
  pending = null;
  if (waiting && Date.now() - waiting.at < PENDING_FOR_MS) {
    event.source.postMessage({ type: NAVIGATE, path: waiting.path });
  }
});
