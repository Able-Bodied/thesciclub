import { Capacitor } from '@capacitor/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CF_BEACON_SRC, countedPage, countVisit, resetCountVisit } from '@/lib/web-analytics';

const EVENT = '/e/0b8f3a52-1c7e-4c1e-9d4e-2f6a7b8c9d0e';
const PRIVACY = { pathname: '/privacy', search: '', hash: '' };
const SESSION = 'sb-erijdvqnxavwezsbbojv-auth-token';

function beacon(): HTMLScriptElement | null {
  return document.head.querySelector(`script[src="${CF_BEACON_SRC}"]`);
}

describe('which pages Cloudflare may count', () => {
  it('counts the public pages with nothing in the address', () => {
    for (const path of [EVENT, `${EVENT}/register`, '/privacy', '/terms', '/join']) {
      expect(countedPage(path, '', ''), path).toBe(true);
    }
    expect(countedPage('/join', '?next=%2Fhome', '')).toBe(true);
  });

  // Invite links, QR codes and sign-in returns carry codes in the address.
  it('never counts an address with a code in it', () => {
    expect(countedPage('/join', '?invite=secret', '')).toBe(false);
    expect(countedPage('/join', '?next=%2Fhome&qr=ABCD', '')).toBe(false);
    expect(countedPage('/join', '?next=%2Fchat%2Ft%2Fx', '')).toBe(false);
    expect(countedPage('/join', '', '#access_token=x')).toBe(false);
    expect(countedPage(EVENT, '?x=1', '')).toBe(false);
  });

  it('never counts the pages for signing in, or the club itself', () => {
    for (const path of [
      '/auth/confirm.html',
      '/reset-password',
      '/app-sign-in',
      '/home',
      '/chat',
      '/events/0b8f3a52-1c7e-4c1e-9d4e-2f6a7b8c9d0e',
      '/e/not-an-id',
    ]) {
      expect(countedPage(path, '', ''), path).toBe(false);
    }
  });
});

describe('loading the script', () => {
  beforeEach(() => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_SUPABASE_URL', 'https://erijdvqnxavwezsbbojv.supabase.co');
    resetCountVisit();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    beacon()?.remove();
    localStorage.clear();
  });

  it('loads once, with the token and in-app navigation off', () => {
    countVisit(PRIVACY, 'tok');
    countVisit(PRIVACY, 'tok');
    expect(document.head.querySelectorAll(`script[src="${CF_BEACON_SRC}"]`)).toHaveLength(1);
    expect(JSON.parse(beacon()?.dataset.cfBeacon ?? '{}')).toEqual({ token: 'tok', spa: false });
  });

  it('loads nothing for a signed-in member', () => {
    localStorage.setItem(SESSION, '{}');
    countVisit(PRIVACY, 'tok');
    expect(beacon()).toBeNull();
  });

  it('loads nothing in the store app, without a token, or outside a build', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    countVisit(PRIVACY, 'tok');
    expect(beacon()).toBeNull();
    vi.restoreAllMocks();
    countVisit(PRIVACY, '');
    expect(beacon()).toBeNull();
    vi.stubEnv('PROD', false);
    countVisit(PRIVACY, 'tok');
    expect(beacon()).toBeNull();
  });

  it('loads nothing on a page with a code in its address', () => {
    countVisit({ pathname: '/join', search: '?invite=secret', hash: '' }, 'tok');
    expect(beacon()).toBeNull();
  });
});
