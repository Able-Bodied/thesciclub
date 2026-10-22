import { Capacitor } from '@capacitor/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SITE_ORIGIN, siteOrigin } from '@/lib/site-origin';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('siteOrigin', () => {
  it('is the page’s own origin on the website, previews and local included', () => {
    expect(siteOrigin()).toBe(window.location.origin);
  });

  it('is thesciclub.com in the store app, never capacitor://localhost', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    expect(siteOrigin()).toBe('https://thesciclub.com');
    expect(SITE_ORIGIN).toBe('https://thesciclub.com');
  });
});
