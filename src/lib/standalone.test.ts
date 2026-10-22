import { Capacitor } from '@capacitor/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isNative, isStandalone } from '@/lib/standalone';

function displayModeIs(standalone: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: standalone && query.includes('standalone') })),
  );
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'standalone');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'androidBridge');
});

describe('isStandalone', () => {
  it('on an iPhone, believes Safari: a tab is a tab even when display-mode says standalone', () => {
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: false });
    displayModeIs(true);
    expect(isStandalone()).toBe(false);
  });

  it('on an iPhone, the Home Screen app is standalone whatever display-mode says', () => {
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
    displayModeIs(false);
    expect(isStandalone()).toBe(true);
  });

  it('elsewhere, follows display-mode', () => {
    displayModeIs(true);
    expect(isStandalone()).toBe(true);
    displayModeIs(false);
    expect(isStandalone()).toBe(false);
  });
});

describe('isNative', () => {
  it('is false on the website', () => {
    expect(isNative()).toBe(false);
  });

  it('is true inside the store app, whose bridge Capacitor finds', () => {
    Object.defineProperty(window, 'androidBridge', { configurable: true, value: {} });
    expect(isNative()).toBe(true);
  });

  it("asks Capacitor's own isNativePlatform", () => {
    const asked = vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    expect(isNative()).toBe(true);
    expect(asked).toHaveBeenCalled();
  });
});
