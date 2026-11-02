import { isNative, isStandalone } from '@/lib/standalone';
import { getSupabase } from '@/lib/supabase';

/**
 * How a member is seeing the club, noted at most once a day on their first
 * press or keystroke (20261102000000), so a report of something looking wrong
 * can be matched to what they have, an old copy of the app is seen, and
 * Admin → Stats shows who could be helped onto the Home Screen.
 *
 * The parts are read here, and the browser's whole string is never sent.
 * Nothing about it may get in the member's way: every failure is silent, and
 * the next day tries again.
 */

export type Surface = 'browser' | 'home_screen' | 'app';

const KEY = 'club:device-check';
const DAY_MS = 24 * 60 * 60 * 1000;

/** The browser and its major version. Chrome on an iPhone says CriOS; Edge also says Chrome. */
export function browserOf(agent: string): { name: string | null; version: string | null } {
  const named: [string, RegExp][] = [
    ['Edge', /(?:Edg|EdgiOS|EdgA)\/(\d+)/],
    ['Samsung Internet', /SamsungBrowser\/(\d+)/],
    ['Opera', /(?:OPR|OPiOS)\/(\d+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/],
    ['Chrome', /(?:Chrome|CriOS)\/(\d+)/],
    ['Safari', /Version\/(\d+(?:\.\d+)?).*Safari\//],
  ];
  for (const [name, pattern] of named) {
    const version = pattern.exec(agent)?.[1];
    if (version) return { name, version };
  }
  return { name: null, version: null };
}

/** The operating system's name, without its version. */
export function osOf(agent: string, touchPoints = 0): string | null {
  if (/iPhone|iPod/.test(agent)) return 'iOS';
  if (agent.includes('iPad') || (agent.includes('Macintosh') && touchPoints > 1)) return 'iPadOS';
  if (agent.includes('Android')) return 'Android';
  if (agent.includes('Macintosh')) return 'macOS';
  if (agent.includes('Windows')) return 'Windows';
  if (agent.includes('CrOS')) return 'ChromeOS';
  if (agent.includes('Linux')) return 'Linux';
  return null;
}

export function surface(): Surface {
  if (isNative()) return 'app';
  return isStandalone() ? 'home_screen' : 'browser';
}

/** Null where nothing can be asked: an iPhone's browser, or the store app. */
export function notificationPermission(): 'allowed' | 'refused' | 'not_asked' | null {
  if (isNative() || !('Notification' in window) || !('PushManager' in window)) return null;
  if (Notification.permission === 'granted') return 'allowed';
  return Notification.permission === 'denied' ? 'refused' : 'not_asked';
}

function lastNoted(): number {
  try {
    return Number(localStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
}

function remember(at: number) {
  try {
    localStorage.setItem(KEY, String(at));
  } catch {
    // Private browsing: the database's own day still holds.
  }
}

async function note(): Promise<boolean> {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  // Not signed in yet: the next press asks again.
  if (!data.session) return false;
  const agent = navigator.userAgent;
  const { name, version } = browserOf(agent);
  await supabase.rpc('note_device', {
    p_surface: surface(),
    p_browser: name,
    p_browser_version: version,
    p_os: osOf(agent, navigator.maxTouchPoints),
    p_screen_width: window.screen.width,
    p_screen_height: window.screen.height,
    p_pixel_ratio: window.devicePixelRatio,
    p_color_scheme: getComputedStyle(document.documentElement).colorScheme.includes('dark')
      ? 'dark'
      : 'light',
    p_notifications: notificationPermission(),
    p_app_built: import.meta.env.VITE_APP_BUILT ?? null,
  });
  return true;
}

/** Started once from main.tsx, outside React. Listens until a member has been noted. */
export function startDeviceCheck(now: () => number = Date.now): () => void {
  let asking = false;
  function stop() {
    window.removeEventListener('pointerdown', onAction, true);
    window.removeEventListener('keydown', onAction, true);
  }
  function onAction() {
    if (asking) return;
    if (now() - lastNoted() < DAY_MS) {
      stop();
      return;
    }
    asking = true;
    note()
      .then((noted) => {
        if (!noted) return;
        remember(now());
        stop();
      })
      .catch(() => undefined)
      .finally(() => {
        asking = false;
      });
  }
  window.addEventListener('pointerdown', onAction, true);
  window.addEventListener('keydown', onAction, true);
  return stop;
}
