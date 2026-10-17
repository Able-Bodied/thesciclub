import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App, { preloadScreen } from '@/App';
import { takeHandoff } from '@/lib/home-screen-handoff';
import { stayCurrent } from '@/lib/stay-current';
import '@/index.css';

stayCurrent();

// A screen's script is fetched when it is first opened (App.tsx). After a
// deploy the old file names are gone, and a page still running the old
// script would ask for one that no longer exists; reloading brings the new
// one. Once a minute at most, so a script that really is missing cannot loop.
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem('thesciclub.chunk-reload') ?? 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem('thesciclub.chunk-reload', String(Date.now()));
  } catch {
    // Storage blocked: reload anyway; the browser's own cache decides.
  }
  event.preventDefault();
  window.location.reload();
});

// The service worker, after the first screen: it precaches the whole app,
// which on a first visit competes with the screen's own reads. Load, then
// the first idle moment (or 5 s), is late enough and costs nothing after the
// first visit, when a worker is already in control.
if ('serviceWorker' in navigator) {
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

preloadScreen(window.location.pathname);

const root = document.getElementById('root');
if (!root) throw new Error('No #root element in index.html');
const mount = root;

function render() {
  createRoot(mount).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
}

// The iPhone Home Screen app's first open after being added from a signed-in
// Safari tab: signed in before the first screen (src/lib/home-screen-handoff.ts).
// Anywhere else takeHandoff answers at once; it is never waited on for long.
void Promise.race([
  takeHandoff().catch(() => 'refused'),
  new Promise((resolve) => {
    setTimeout(resolve, 8000);
  }),
]).then(render);
