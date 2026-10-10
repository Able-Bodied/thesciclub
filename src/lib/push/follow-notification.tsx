import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { navigationRequest, PENDING } from '@/lib/push/payload';

/**
 * Opens the address of a notification that was pressed, inside the app.
 *
 * Two ways a press arrives (see NAVIGATE and PENDING in payload.ts): the
 * service worker asks a running app to go there, and the app answers so the
 * worker does not also reload it; or the app has just started from the press,
 * possibly on its first screen rather than the address, and asks the worker
 * whether a press is waiting for it.
 *
 * Mounted once, inside the router and above the routes.
 */
export function FollowNotification() {
  // Through a ref: outside a data router `navigate` changes with every screen,
  // and the listener (and the question to the worker) belongs to the app's
  // whole life, not to one screen.
  const go = useNavigate();
  const navigate = useRef(go);
  navigate.current = go;

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const container = navigator.serviceWorker;
    const origin = window.location.origin;

    function onMessage(event: MessageEvent) {
      const path = navigationRequest(event.data, origin);
      if (path === null) return;
      event.ports[0]?.postMessage({ ok: true });
      const now = `${window.location.pathname}${window.location.search}`;
      if (path !== now) void navigate.current(path);
    }

    container.addEventListener('message', onMessage);
    // Messages sent before the page was ready are held until this is called.
    container.startMessages();
    void container.ready
      .then((registration) => {
        registration.active?.postMessage({ type: PENDING });
      })
      .catch(() => undefined);
    return () => {
      container.removeEventListener('message', onMessage);
    };
  }, []);
  return null;
}
