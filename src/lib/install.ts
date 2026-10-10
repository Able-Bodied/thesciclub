import { useEffect, useState } from 'react';
import { isStandalone } from '@/lib/standalone';

/**
 * Putting the club on a phone's Home Screen (the owner, 2026-10-10, after a
 * nudge on another site): which browser this is, so the steps are the right
 * ones, and the browser's own install prompt where there is one.
 *
 * Only Chromium browsers on Android (and desktops) offer a prompt a page can
 * show (`beforeinstallprompt`). Every iPhone browser is WebKit underneath and
 * offers none: there, adding to the Home Screen is the Share sheet's "Add to
 * Home Screen", reached differently in each browser. An app's own browser
 * (Instagram's, Facebook's, Google's) cannot add anything at all, so the first
 * step there is to open the club in a real browser.
 */
export type InstallPlatform =
  | 'ios-safari'
  | 'ios-chrome'
  | 'ios-firefox'
  | 'ios-edge'
  | 'ios-other'
  | 'android'
  | 'in-app'
  | 'desktop';

/** Which steps apply, from the browser's own description of itself. Pure, for its test. */
export function installPlatform(userAgent: string, touchPoints = 0): InstallPlatform {
  if (/FBAN|FBAV|Instagram|LinkedInApp|Snapchat|Line\/|Twitter|GSA\//.test(userAgent)) {
    return 'in-app';
  }
  // iPadOS asks for the desktop site and says Macintosh; its touch points give
  // it away.
  const ios =
    /iPhone|iPad|iPod/.test(userAgent) || (userAgent.includes('Macintosh') && touchPoints > 1);
  if (ios) {
    if (userAgent.includes('CriOS')) return 'ios-chrome';
    if (userAgent.includes('FxiOS')) return 'ios-firefox';
    if (userAgent.includes('EdgiOS')) return 'ios-edge';
    if (userAgent.includes('Safari/')) return 'ios-safari';
    return 'ios-other';
  }
  if (userAgent.includes('Android')) return 'android';
  return 'desktop';
}

export function currentInstallPlatform(): InstallPlatform {
  return installPlatform(navigator.userAgent, navigator.maxTouchPoints);
}

/** A phone or tablet, where the nudge is shown; a desktop gets the steps on Me only. */
export function isHandheld(platform: InstallPlatform): boolean {
  return platform !== 'desktop';
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Caught as early as the module loads: Chrome fires it once, soon after the
// page loads, and a listener added later in a component misses it.
let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
function changed() {
  for (const listener of listeners) listener();
}
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Kept for our own button rather than Chrome's mini-infobar.
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    changed();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    changed();
  });
}

/** Whether the browser will show its own install prompt, and the way to ask it. */
export function useInstallPrompt(): {
  canPrompt: boolean;
  installed: boolean;
  prompt: () => Promise<boolean>;
} {
  const [, redraw] = useState(0);
  useEffect(() => {
    const listener = () => {
      redraw((n) => n + 1);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return {
    canPrompt: deferred !== null,
    installed: installed || isStandalone(),
    prompt: async () => {
      const event = deferred;
      if (!event) return false;
      deferred = null;
      changed();
      await event.prompt();
      const choice = await event.userChoice;
      return choice.outcome === 'accepted';
    },
  };
}

/** How long "not now" lasts. */
export const NUDGE_SNOOZE_DAYS = 14;
const SNOOZE_KEY = 'club:install-nudge-snoozed';

export function nudgeSnoozed(now = Date.now()): boolean {
  try {
    const at = Number(localStorage.getItem(SNOOZE_KEY));
    return Number.isFinite(at) && at > 0 && now - at < NUDGE_SNOOZE_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

export function snoozeNudge(now = Date.now()): void {
  try {
    localStorage.setItem(SNOOZE_KEY, String(now));
  } catch {
    // Private browsing: it comes back next visit, which is no harm.
  }
}

/** The steps for each browser, in the words its own menus use. */
export const INSTALL_STEPS: Record<InstallPlatform, { intro?: string; steps: string[] }> = {
  // The iPhone share sheet can hide "Add to Home Screen" behind View More, the
  // round down-arrow button at the right of its row of actions (the owner's
  // screenshots, 2026-10-10). Said in every iPhone browser's steps.
  'ios-safari': {
    steps: [
      'Tap Share, the square with an arrow pointing up, at the bottom of the screen (at the top on an iPad).',
      'If you see View More, the round button with a down arrow on the right, tap it. Then scroll down and choose “Add to Home Screen”.',
      'Tap Add, then open The SCI Club from your Home Screen.',
    ],
  },
  'ios-chrome': {
    steps: [
      'Tap Share, the square with an arrow, in the address bar at the top.',
      'Tap View More, the round button with a down arrow on the right. “Add to Home Screen” is at the bottom of the list that opens; choose it.',
      'Tap Add, then open The SCI Club from your Home Screen.',
    ],
  },
  'ios-firefox': {
    steps: [
      'Tap Share, the square with an arrow, at the top left beside the address.',
      'Tap View More, the round button with a down arrow on the right, then choose “Add to Home Screen”.',
      'Tap Add, then open The SCI Club from your Home Screen.',
    ],
  },
  'ios-edge': {
    steps: [
      'Tap the menu (•••) at the bottom of the screen, then Share.',
      'If you see View More, the round button with a down arrow on the right, tap it. Then choose “Add to Home Screen”.',
      'Tap Add, then open The SCI Club from your Home Screen.',
    ],
  },
  'ios-other': {
    intro: 'This browser may not offer it. Safari always does.',
    steps: [
      'Open thesciclub.com in Safari.',
      'Tap Share, then View More (the down arrow on the right) if you see it, then “Add to Home Screen”.',
      'Tap Add, then open The SCI Club from your Home Screen.',
    ],
  },
  android: {
    steps: [
      'Tap the menu (⋮) at the top right of the browser.',
      'Choose “Install app” or “Add to Home screen”.',
      'Tap Install, then open The SCI Club from your Home Screen.',
    ],
  },
  'in-app': {
    intro:
      'You are in another app’s browser, which cannot add the club to your Home Screen. Open it in your phone’s browser first.',
    steps: [
      'Tap the menu (••• or ⋮), usually at the top right.',
      'Choose “Open in browser”, “Open in Safari” or “Open in Chrome”.',
      'In the browser, open Me, then Settings, and follow the steps there.',
    ],
  },
  desktop: {
    steps: [
      'In Chrome or Edge, click the install icon at the right of the address bar.',
      'Or open the browser’s menu and choose “Install The SCI Club” (or Apps, then Install).',
      'Safari on a Mac: File, then “Add to Dock”.',
    ],
  },
};
