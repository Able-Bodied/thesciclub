import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { type PluginListenerHandle, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { SITE_ORIGIN } from '@/lib/site-origin';

/**
 * The store app's native pieces: the splash, the status bar, Android's back
 * button and links to other sites. Loaded only in the app (NativeShell), so
 * the website never downloads the plugins.
 */

export type LinkTarget = { inside: string } | { outside: string } | null;

const CLUB_ORIGINS = new Set([SITE_ORIGIN, 'https://www.thesciclub.com']);

/**
 * Where a tapped link goes. The club's own address stays in the app; any
 * other site opens in the in-app browser, never in place of the club. Null
 * leaves it to the page: the app's own links, mailto: and tel:.
 */
export function linkTarget(href: string, appOrigin: string): LinkTarget {
  let url: URL;
  try {
    url = new URL(href, appOrigin);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.origin === appOrigin) return null;
  if (CLUB_ORIGINS.has(url.origin)) return { inside: `${url.pathname}${url.search}${url.hash}` };
  return { outside: url.href };
}

/** Android's back: closes an open sheet first, then goes back, then leaves. */
export function backStep(sheetOpen: boolean, canGoBack: boolean): 'close' | 'back' | 'leave' {
  if (sheetOpen) return 'close';
  return canGoBack ? 'back' : 'leave';
}

/** Light words on a dark page, dark on a light one, as accessibility.tsx paints it. */
export function barStyle(root: DOMStringMap, systemDark: boolean): SystemBarsStyle {
  if (root.forceLight !== undefined) return SystemBarsStyle.Light;
  const dark = root.appearance === 'dark' || (root.appearance !== 'light' && systemDark);
  return dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light;
}

function quietly(work: Promise<unknown>): void {
  work.catch(() => undefined);
}

export function startNativeShell(navigate: (to: string | number) => void): () => void {
  const listeners: Promise<PluginListenerHandle>[] = [];

  listeners.push(
    App.addListener('backButton', ({ canGoBack }) => {
      const sheet = document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
      const step = backStep(sheet, canGoBack);
      // Every sheet closes on Escape (useDialogFocus).
      if (step === 'close') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      else if (step === 'back') navigate(-1);
      else quietly(App.minimizeApp());
    }),
  );

  function onClick(event: MouseEvent) {
    if (event.defaultPrevented || event.button !== 0) return;
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const target = linkTarget(anchor.href, window.location.origin);
    if (!target) return;
    event.preventDefault();
    if ('inside' in target) navigate(target.inside);
    else quietly(Browser.open({ url: target.outside }));
  }
  // Capture, so it is decided before any handler on the link itself.
  document.addEventListener('click', onClick, true);

  const scheme = window.matchMedia('(prefers-color-scheme: dark)');
  function paintBar() {
    quietly(
      SystemBars.setStyle({ style: barStyle(document.documentElement.dataset, scheme.matches) }),
    );
  }
  const watch = new MutationObserver(paintBar);
  watch.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-appearance', 'data-force-light'],
  });
  scheme.addEventListener('change', paintBar);
  paintBar();

  // The first screen is drawn: the splash can go.
  quietly(SplashScreen.hide({ fadeOutDuration: 200 }));

  return () => {
    document.removeEventListener('click', onClick, true);
    watch.disconnect();
    scheme.removeEventListener('change', paintBar);
    for (const listener of listeners) quietly(listener.then((handle) => handle.remove()));
  };
}
