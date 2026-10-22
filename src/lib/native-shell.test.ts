import type * as CapacitorCore from '@capacitor/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  back: null as ((event: { canGoBack: boolean }) => void) | null,
  resume: null as (() => void) | null,
  calls: [] as string[],
  /** What the phone's Text Size reads as. */
  textSize: 1,
}));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: (name: string, listener: (event: { canGoBack: boolean }) => void) => {
      if (name === 'backButton') native.back = listener;
      if (name === 'resume') native.resume = listener as () => void;
      return Promise.resolve({ remove: () => Promise.resolve() });
    },
    minimizeApp: () => {
      native.calls.push('minimize');
      return Promise.resolve();
    },
  },
}));
vi.mock('@capacitor/browser', () => ({
  Browser: {
    open: ({ url }: { url: string }) => {
      native.calls.push(`browser ${url}`);
      return Promise.resolve();
    },
  },
}));
vi.mock('@capacitor/splash-screen', () => ({
  SplashScreen: {
    hide: () => {
      native.calls.push('splash hidden');
      return Promise.resolve();
    },
  },
}));
vi.mock('@capacitor/text-zoom', () => ({
  TextZoom: {
    getPreferred: () => {
      native.calls.push('text size read');
      return Promise.resolve({ value: native.textSize });
    },
  },
}));
vi.mock('@capacitor/core', async (importOriginal) => {
  const core = await importOriginal<typeof CapacitorCore>();
  return {
    ...core,
    SystemBars: {
      setStyle: ({ style }: { style: string }) => {
        native.calls.push(`bar ${style}`);
        return Promise.resolve();
      },
    },
  };
});

const { backStep, barStyle, linkTarget, startNativeShell, systemTextScale } = await import(
  '@/lib/native-shell'
);
const { Capacitor } = await import('@capacitor/core');

describe('where a link goes in the store app', () => {
  const app = 'capacitor://localhost';

  it('leaves the app’s own links, mail and phone numbers to the page', () => {
    expect(linkTarget('capacitor://localhost/chat', app)).toBeNull();
    expect(linkTarget('/events/1', app)).toBeNull();
    expect(linkTarget('mailto:hello@thesciclub.com', app)).toBeNull();
    expect(linkTarget('tel:+15555550100', app)).toBeNull();
    expect(linkTarget('https://localhost/me', 'https://localhost')).toBeNull();
  });

  it('keeps a thesciclub.com link inside the app', () => {
    expect(linkTarget('https://thesciclub.com/events/1?from=x#going', app)).toEqual({
      inside: '/events/1?from=x#going',
    });
    expect(linkTarget('https://www.thesciclub.com/chat', app)).toEqual({ inside: '/chat' });
  });

  it('opens any other site in the in-app browser', () => {
    expect(linkTarget('https://norcalsci.org/events', app)).toEqual({
      outside: 'https://norcalsci.org/events',
    });
  });
});

describe('Android’s back button', () => {
  it('closes a sheet, then goes back, then leaves', () => {
    expect(backStep(true, true)).toBe('close');
    expect(backStep(false, true)).toBe('back');
    expect(backStep(false, false)).toBe('leave');
  });
});

describe('the status bar', () => {
  it('has dark words on a light page and light words on a dark one', () => {
    expect(barStyle({ appearance: 'light' }, true)).toBe('LIGHT');
    expect(barStyle({ appearance: 'dark' }, false)).toBe('DARK');
    expect(barStyle({ appearance: 'system' }, true)).toBe('DARK');
    expect(barStyle({ appearance: 'system' }, false)).toBe('LIGHT');
    // /join is always light.
    expect(barStyle({ appearance: 'dark', forceLight: '' }, true)).toBe('LIGHT');
  });
});

describe('starting the shell', () => {
  const navigate = vi.fn();
  let stop: () => void = () => undefined;

  beforeEach(() => {
    native.calls = [];
    native.back = null;
    native.resume = null;
    native.textSize = 1;
    navigate.mockClear();
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    document.documentElement.dataset.appearance = 'system';
    stop = startNativeShell(navigate);
  });

  afterEach(() => {
    stop();
    vi.restoreAllMocks();
    document.documentElement.style.removeProperty('--system-text-scale');
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('hides the splash and paints the status bar for the page', async () => {
    await vi.waitFor(() => {
      expect(native.calls).toEqual(['bar LIGHT', 'splash hidden']);
    });
  });

  it('moves every screen below the status bar, and stops when it stops', () => {
    expect(document.documentElement.dataset.nativeApp).toBe('');
    stop();
    expect(document.documentElement.dataset.nativeApp).toBeUndefined();
  });

  it('opens another site in the in-app browser instead of in place of the club', () => {
    document.body.innerHTML = '<a href="https://norcalsci.org/" target="_blank">NorCal SCI</a>';
    const link = document.querySelector('a');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link?.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(native.calls).toContain('browser https://norcalsci.org/');
  });

  it('follows a thesciclub.com link inside the app', () => {
    document.body.innerHTML = '<a href="https://thesciclub.com/events/7">An event</a>';
    document.querySelector('a')?.click();
    expect(navigate).toHaveBeenCalledWith('/events/7');
  });

  it('leaves the app’s own links alone', () => {
    document.body.innerHTML = '<a href="/me">Me</a>';
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.querySelector('a')?.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('closes an open sheet on back, before going anywhere', () => {
    document.body.innerHTML = '<div role="dialog" aria-modal="true"></div>';
    const heard = vi.fn();
    window.addEventListener('keydown', heard);
    native.back?.({ canGoBack: true });
    window.removeEventListener('keydown', heard);
    expect((heard.mock.calls[0]?.[0] as KeyboardEvent | undefined)?.key).toBe('Escape');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('goes back, and at the first screen puts the app away', () => {
    native.back?.({ canGoBack: true });
    expect(navigate).toHaveBeenCalledWith(-1);
    native.back?.({ canGoBack: false });
    expect(native.calls).toContain('minimize');
  });

  it('repaints the status bar when the member switches to dark', async () => {
    document.documentElement.dataset.appearance = 'dark';
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(native.calls).toContain('bar DARK');
  });
});

describe('the iPhone’s Text Size', () => {
  it('multiplies the club’s own sizes, and never makes text smaller', () => {
    expect(systemTextScale(0.82)).toBe(1);
    expect(systemTextScale(1)).toBe(1);
    expect(systemTextScale(1.2353)).toBe(1.24);
    expect(systemTextScale(3.1176)).toBe(3.12);
    expect(systemTextScale(Number.NaN)).toBe(1);
  });

  const root = document.documentElement;
  const scale = () => root.style.getPropertyValue('--system-text-scale');
  let stop: () => void = () => undefined;

  beforeEach(() => {
    native.calls = [];
    native.textSize = 1;
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  });

  afterEach(() => {
    stop();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    root.style.removeProperty('--system-text-scale');
  });

  it('is applied on an iPhone before the splash goes, and again on coming back', async () => {
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('ios');
    native.textSize = 1.47;
    stop = startNativeShell(vi.fn());
    await vi.waitFor(() => {
      expect(native.calls).toContain('splash hidden');
    });
    expect(native.calls.indexOf('text size read')).toBeLessThan(
      native.calls.indexOf('splash hidden'),
    );
    expect(scale()).toBe('1.47');

    native.textSize = 0.9;
    native.resume?.();
    await vi.waitFor(() => {
      expect(scale()).toBe('1');
    });
  });

  it('is left to Android, whose web view follows it already', async () => {
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
    native.textSize = 1.3;
    stop = startNativeShell(vi.fn());
    await vi.waitFor(() => {
      expect(native.calls).toContain('splash hidden');
    });
    expect(native.calls).not.toContain('text size read');
    expect(scale()).toBe('');
  });
});
