import { Capacitor } from '@capacitor/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerWorker } from '@/lib/register-worker';

const register = vi.fn(() => Promise.resolve());

beforeEach(() => {
  register.mockClear();
  // A worker already in control registers at once, so nothing waits on load.
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { controller: {}, register },
  });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker');
  vi.restoreAllMocks();
});

describe('registering the service worker', () => {
  it('registers on the website', () => {
    registerWorker();
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it('never in the store app', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    registerWorker();
    expect(register).not.toHaveBeenCalled();
  });
});
