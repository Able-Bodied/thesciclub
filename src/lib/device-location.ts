import { Capacitor } from '@capacitor/core';
import { isNative } from '@/lib/standalone';

/**
 * Where this device is, asked once when a member taps for it. In the iPhone
 * app it goes through the geolocation plugin: WKWebView's own
 * navigator.geolocation asks a second time, as "localhost". Everywhere else,
 * Android's app too (MainActivity grants the web view coarse only), it is
 * the browser's. Never stored here.
 */

export interface DevicePosition {
  latitude: number;
  longitude: number;
  accuracy: number;
}
export type LocationFailure = 'denied' | 'unavailable' | 'timeout';
export type LocationResult =
  | { ok: true; position: DevicePosition }
  | { ok: false; failure: LocationFailure };

// The map shows an exact dot; a cold GPS can take a while.
const IOS_OPTIONS = { enableHighAccuracy: true, timeout: 15000 };

function inIosApp(): boolean {
  return isNative() && Capacitor.getPlatform() === 'ios';
}

/** Whether there is anything to ask: false in a browser without location. */
export function canLocate(): boolean {
  return inIosApp() || 'geolocation' in navigator;
}

// The plugin's error codes (its README, Errors): refused, Location Services
// off, restricted by Screen Time.
const PLUGIN_DENIED = new Set(['OS-PLUG-GLOC-0003', 'OS-PLUG-GLOC-0007', 'OS-PLUG-GLOC-0008']);
const PLUGIN_TIMEOUT = 'OS-PLUG-GLOC-0010';

function pluginFailure(error: unknown): LocationFailure {
  const code =
    typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : '';
  if (typeof code !== 'string') return 'unavailable';
  if (PLUGIN_DENIED.has(code)) return 'denied';
  return code === PLUGIN_TIMEOUT ? 'timeout' : 'unavailable';
}

async function fromPlugin(): Promise<LocationResult> {
  try {
    const { Geolocation } = await import('@capacitor/geolocation');
    let { location } = await Geolocation.checkPermissions();
    if (location !== 'granted' && location !== 'denied') {
      ({ location } = await Geolocation.requestPermissions({ permissions: ['location'] }));
    }
    if (location !== 'granted') return { ok: false, failure: 'denied' };
    const { coords } = await Geolocation.getCurrentPosition(IOS_OPTIONS);
    const { latitude, longitude, accuracy } = coords;
    return { ok: true, position: { latitude, longitude, accuracy } };
  } catch (error) {
    return { ok: false, failure: pluginFailure(error) };
  }
}

function fromBrowser(options: PositionOptions): Promise<LocationResult> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve({ ok: false, failure: 'unavailable' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const { latitude, longitude, accuracy } = coords;
        resolve({ ok: true, position: { latitude, longitude, accuracy } });
      },
      (error) => {
        const failure =
          error.code === error.PERMISSION_DENIED
            ? 'denied'
            : error.code === error.TIMEOUT
              ? 'timeout'
              : 'unavailable';
        resolve({ ok: false, failure });
      },
      options,
    );
  });
}

/** `web` is what the browser is asked with; the iPhone app asks its own way. */
export function deviceLocation(web: PositionOptions): Promise<LocationResult> {
  return inIosApp() ? fromPlugin() : fromBrowser(web);
}
