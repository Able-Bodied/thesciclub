import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { APP_STORE_ID, appCouldOpen, bannerArgument } from '@/lib/app-handoff';
import { heldHandoff } from '@/lib/home-screen-handoff';
import { SITE_ORIGIN } from '@/lib/site-origin';

/** How often the banner takes up the Home Screen code, which is renewed every ten minutes. */
const REREAD_MS = 60_000;

/**
 * Keeps Safari's App Store banner (index.html) handing the app this page,
 * and, for somebody signed in, the code their tab keeps for the Home Screen
 * app (app-handoff.ts): Open in the banner then lands in the app signed in,
 * where they were. Only in an iPhone browser; the tag is left as it is
 * anywhere else.
 */
export function AppStoreBanner(): null {
  const { pathname, search } = useLocation();
  const [tick, setTick] = useState(0);
  const [applies] = useState(() => appCouldOpen());

  useEffect(() => {
    if (!applies) return;
    const timer = window.setInterval(() => {
      setTick((n) => n + 1);
    }, REREAD_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [applies]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: tick is how the renewed code is read again.
  useEffect(() => {
    if (!applies) return;
    const tag = document.querySelector('meta[name="apple-itunes-app"]');
    if (!tag) return;
    const argument = bannerArgument(SITE_ORIGIN, `${pathname}${search}`, heldHandoff());
    tag.setAttribute('content', `app-id=${APP_STORE_ID}, app-argument=${argument}`);
  }, [applies, pathname, search, tick]);

  return null;
}
