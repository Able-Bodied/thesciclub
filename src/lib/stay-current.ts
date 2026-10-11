/**
 * Brings an installed app up to date after a deploy, without reinstalling.
 *
 * The service worker already takes over as soon as a new one arrives
 * (`skipWaiting` + `clientsClaim` in src/sw.ts). That left two gaps, and
 * members had to clear the app to get past them:
 *
 * - A browser looks for a new `sw.js` only when a page loads. An installed
 *   app comes back from the background without loading anything, so it
 *   could go days without looking. This asks on every return to the
 *   foreground, and every half hour while the app stays open.
 * - When the new worker took over, the screen kept running the old code
 *   until something reloaded it. This reloads, at a moment that loses
 *   nothing: at once if the app is in the background, or if it has only
 *   just come back and nobody has touched it yet; otherwise the next time
 *   it goes to the background, so a half-typed message is never thrown away.
 *
 * The first worker ever installed also takes over, and that is not an
 * update: a page with no worker in control when it opened does not reload.
 *
 * Started once from main.tsx, outside React, since it belongs to the page's
 * whole life.
 */

export const CHECK_EVERY_MS = 30 * 60 * 1000;

type Container = Pick<
  ServiceWorkerContainer,
  'controller' | 'getRegistration' | 'addEventListener' | 'removeEventListener'
>;

export function stayCurrent({
  container = 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
  reload = () => {
    window.location.reload();
  },
}: {
  container?: Container | undefined;
  reload?: () => void;
} = {}): () => void {
  if (!container) return () => undefined;
  const sw = container;

  let hadController = sw.controller !== null;
  // A newer version is in control and the screen has not caught up.
  let behind = false;
  // Pressed or typed since the app last came to the foreground.
  let touched = false;
  let reloading = false;

  function catchUp() {
    if (reloading) return;
    reloading = true;
    reload();
  }

  function check() {
    if (document.visibilityState === 'hidden') return;
    void sw
      .getRegistration()
      .then((registration) => registration?.update())
      // Offline, or the deploy is mid-flight: the next check will do.
      .catch(() => undefined);
  }

  function onControllerChange() {
    if (!hadController) {
      hadController = true;
      return;
    }
    behind = true;
    if (document.visibilityState === 'hidden' || !touched) catchUp();
  }

  function onVisibility() {
    if (document.visibilityState === 'hidden') {
      if (behind) catchUp();
      return;
    }
    touched = false;
    check();
  }

  function onTouch() {
    touched = true;
  }

  sw.addEventListener('controllerchange', onControllerChange);
  document.addEventListener('visibilitychange', onVisibility);
  // Capture, so a handler that stops the event does not hide it from here.
  window.addEventListener('pointerdown', onTouch, true);
  window.addEventListener('keydown', onTouch, true);
  const timer = window.setInterval(check, CHECK_EVERY_MS);

  return () => {
    sw.removeEventListener('controllerchange', onControllerChange);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pointerdown', onTouch, true);
    window.removeEventListener('keydown', onTouch, true);
    window.clearInterval(timer);
  };
}
