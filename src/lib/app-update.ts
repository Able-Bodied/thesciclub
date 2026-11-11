import { Capacitor } from '@capacitor/core';
import { useEffect, useState } from 'react';
import { SITE_ORIGIN } from '@/lib/site-origin';

/**
 * Whether this copy of the iPhone app is too old to use (the owner,
 * 2026-11-11). public/app-update.json names the oldest version that still
 * works; raise it and every older copy asks to be updated.
 *
 * Read from the website, never the database, so it still reaches old copies
 * if the database ever moves. Anything unreadable lets the app open.
 */

export const APP_UPDATE_URL = `${SITE_ORIGIN}/app-update.json`;
export const APP_STORE_URL = 'itms-apps://apps.apple.com/app/id6825594961';

/** Whether `version` is older than `oldest`, comparing 1.2.10 as numbers. */
export function isOlder(version: string, oldest: string): boolean {
  const parse = (v: string) => v.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(version);
  const b = parse(oldest);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff < 0;
  }
  return false;
}

async function oldestWorking(): Promise<string | null> {
  const response = await fetch(APP_UPDATE_URL, { cache: 'no-store' });
  if (!response.ok) return null;
  const { ios } = (await response.json()) as { ios?: unknown };
  return typeof ios === 'string' ? ios : null;
}

async function installedVersion(): Promise<string> {
  const { App } = await import('@capacitor/app');
  return (await App.getInfo()).version;
}

export async function updateRequired({
  version = installedVersion,
  oldest = oldestWorking,
}: {
  version?: () => Promise<string>;
  oldest?: () => Promise<string | null>;
} = {}): Promise<boolean> {
  try {
    const [mine, needed] = await Promise.all([version(), oldest()]);
    return needed !== null && isOlder(mine, needed);
  } catch {
    return false;
  }
}

/** Checked on opening and on every return to the iPhone app. Never on the website. */
export function useUpdateRequired(): boolean {
  const [required, setRequired] = useState(false);
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'ios') return;
    let live = true;
    const check = () => {
      if (document.visibilityState === 'hidden') return;
      void updateRequired().then((answer) => {
        if (live) setRequired(answer);
      });
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return required;
}
