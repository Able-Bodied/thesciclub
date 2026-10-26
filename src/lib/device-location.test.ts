import { Capacitor } from '@capacitor/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canLocate, deviceLocation } from '@/lib/device-location';

const plugin = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  getCurrentPosition: vi.fn(),
}));
vi.mock('@capacitor/geolocation', () => ({ Geolocation: plugin }));

const getCurrentPosition = vi.fn();
Object.defineProperty(navigator, 'geolocation', {
  value: { getCurrentPosition },
  configurable: true,
});

const WEB = { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 };
const COORDS = { latitude: 37.33, longitude: -121.89, accuracy: 12, altitude: null };
const HERE = { latitude: 37.33, longitude: -121.89, accuracy: 12 };

function onPlatform(platform: 'ios' | 'android' | 'web') {
  vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(platform !== 'web');
  vi.spyOn(Capacitor, 'getPlatform').mockReturnValue(platform);
}

function browserAnswers(answer: { coords?: object; code?: number }) {
  getCurrentPosition.mockImplementation((ok: (p: object) => void, fail: (e: object) => void) => {
    if (answer.coords) ok({ coords: answer.coords, timestamp: 0 });
    else fail({ code: answer.code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
  });
}

function pluginError(code: string) {
  return Object.assign(new Error('plugin'), { code });
}

afterEach(() => {
  vi.restoreAllMocks();
  getCurrentPosition.mockReset();
  for (const fn of Object.values(plugin)) fn.mockReset();
});

describe('in the iPhone app, through the plugin', () => {
  beforeEach(() => {
    onPlatform('ios');
    plugin.checkPermissions.mockResolvedValue({ location: 'prompt', coarseLocation: 'prompt' });
    plugin.requestPermissions.mockResolvedValue({ location: 'granted', coarseLocation: 'granted' });
    plugin.getCurrentPosition.mockResolvedValue({ timestamp: 0, coords: COORDS });
  });

  it('asks iOS once, then for an exact position, and never WebKit', async () => {
    expect(canLocate()).toBe(true);
    expect(await deviceLocation(WEB)).toEqual({ ok: true, position: HERE });
    expect(plugin.requestPermissions).toHaveBeenCalledWith({ permissions: ['location'] });
    const asked = plugin.getCurrentPosition.mock.calls[0]?.[0] as PositionOptions;
    expect(asked.enableHighAccuracy).toBe(true);
    expect(asked.timeout).toBeGreaterThan(0);
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('does not ask again once allowed', async () => {
    plugin.checkPermissions.mockResolvedValue({ location: 'granted', coarseLocation: 'granted' });
    expect((await deviceLocation(WEB)).ok).toBe(true);
    expect(plugin.requestPermissions).not.toHaveBeenCalled();
  });

  it('is denied when the member says no', async () => {
    plugin.requestPermissions.mockResolvedValue({ location: 'denied', coarseLocation: 'denied' });
    expect(await deviceLocation(WEB)).toEqual({ ok: false, failure: 'denied' });
    expect(plugin.getCurrentPosition).not.toHaveBeenCalled();
  });

  it('is denied, without asking, when it was refused before', async () => {
    plugin.checkPermissions.mockResolvedValue({ location: 'denied', coarseLocation: 'denied' });
    expect(await deviceLocation(WEB)).toEqual({ ok: false, failure: 'denied' });
    expect(plugin.requestPermissions).not.toHaveBeenCalled();
  });

  it('is denied when Location Services are off', async () => {
    plugin.checkPermissions.mockRejectedValue(pluginError('OS-PLUG-GLOC-0007'));
    expect(await deviceLocation(WEB)).toEqual({ ok: false, failure: 'denied' });
  });

  it('times out, or finds nothing', async () => {
    plugin.getCurrentPosition.mockRejectedValueOnce(pluginError('OS-PLUG-GLOC-0010'));
    expect(await deviceLocation(WEB)).toEqual({ ok: false, failure: 'timeout' });
    plugin.getCurrentPosition.mockRejectedValueOnce(pluginError('OS-PLUG-GLOC-0002'));
    expect(await deviceLocation(WEB)).toEqual({ ok: false, failure: 'unavailable' });
    plugin.getCurrentPosition.mockRejectedValueOnce(new Error('no plugin'));
    expect(await deviceLocation(WEB)).toEqual({ ok: false, failure: 'unavailable' });
  });
});

describe('in a browser', () => {
  beforeEach(() => {
    onPlatform('web');
  });

  it('asks the browser with the options given', async () => {
    browserAnswers({ coords: COORDS });
    expect(canLocate()).toBe(true);
    expect(await deviceLocation(WEB)).toEqual({ ok: true, position: HERE });
    expect(getCurrentPosition.mock.calls[0]?.[2]).toEqual(WEB);
    expect(plugin.checkPermissions).not.toHaveBeenCalled();
  });

  it('says denied, timeout or unavailable', async () => {
    browserAnswers({ code: 1 });
    expect(await deviceLocation(WEB)).toEqual({ ok: false, failure: 'denied' });
    browserAnswers({ code: 3 });
    expect(await deviceLocation(WEB)).toEqual({ ok: false, failure: 'timeout' });
    browserAnswers({ code: 2 });
    expect(await deviceLocation(WEB)).toEqual({ ok: false, failure: 'unavailable' });
  });

  it('has nothing to ask without location', async () => {
    const geolocation = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
    Reflect.deleteProperty(navigator, 'geolocation');
    try {
      expect(canLocate()).toBe(false);
      expect(await deviceLocation(WEB)).toEqual({ ok: false, failure: 'unavailable' });
    } finally {
      if (geolocation) Object.defineProperty(navigator, 'geolocation', geolocation);
    }
  });
});

describe('in the Android app', () => {
  it('uses the web view, as a browser does, never the plugin', async () => {
    onPlatform('android');
    browserAnswers({ coords: COORDS });
    expect(await deviceLocation(WEB)).toEqual({ ok: true, position: HERE });
    expect(getCurrentPosition.mock.calls[0]?.[2]).toEqual(WEB);
    for (const fn of Object.values(plugin)) expect(fn).not.toHaveBeenCalled();
  });
});
