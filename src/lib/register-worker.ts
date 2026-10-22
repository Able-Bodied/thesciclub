import { isNative } from '@/lib/standalone';

/**
 * The service worker, after the first screen: it precaches the whole app,
 * which on a first visit competes with the screen's own reads. Load, then
 * the first idle moment (or 5 s), is late enough and costs nothing after the
 * first visit, when a worker is already in control.
 *
 * Never in the store app: its files are already on the phone, and a new
 * version comes from the store.
 */
export function registerWorker(): void {
  if (isNative() || !('serviceWorker' in navigator)) return;
  const register = () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  };
  const whenIdle = () => {
    if (typeof (window.requestIdleCallback as unknown) === 'function') {
      window.requestIdleCallback(register, { timeout: 5000 });
    } else {
      setTimeout(register, 3000);
    }
  };
  if (navigator.serviceWorker.controller) register();
  else if (document.readyState === 'complete') whenIdle();
  else window.addEventListener('load', whenIdle, { once: true });
}
