import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acceptSessionFromUrl, noteSignInStarted, sessionStorageKey } from '@/lib/url-session';

const KEY = sessionStorageKey('https://abcdefgh.supabase.co');
const ME = '11111111-0000-0000-0000-000000000001';
const SENDER = '22222222-0000-0000-0000-000000000002';

/** A token as GoTrue issues it, as far as the payload goes. */
function token(sub: string): string {
  const part = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${part({ alg: 'HS256' })}.${part({ sub, role: 'authenticated' })}.signature`;
}

function signedIn(id: string) {
  localStorage.setItem(KEY, JSON.stringify({ access_token: token(id), user: { id } }));
}

const url = new URL('https://thesciclub.com/home#access_token=x');
const accept = acceptSessionFromUrl(KEY);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a sign-in arriving in the address', () => {
  it('uses the key supabase-js keeps the session under', () => {
    expect(KEY).toBe('sb-abcdefgh-auth-token');
  });

  it('is not one when the address carries no tokens or error', () => {
    expect(accept(url, {})).toBe(false);
    expect(accept(url, { next: '/home' })).toBe(false);
  });

  it('passes an error through, to be reported', () => {
    signedIn(ME);
    expect(accept(url, { error: 'access_denied', error_description: 'Denied' })).toBe(true);
  });

  it('is taken when nobody is signed in here: an email confirmation, a reset link', () => {
    expect(accept(url, { access_token: token(SENDER), refresh_token: 'r' })).toBe(true);
  });

  it('is taken for the account already signed in: a changed address confirmed', () => {
    signedIn(ME);
    expect(accept(url, { access_token: token(ME), refresh_token: 'r' })).toBe(true);
  });

  // Security scan 2026-10-17, F17: a link carrying somebody else's tokens
  // swapped the member's session for theirs without a word.
  it('is refused for another account over the one signed in, and the tokens leave the address', () => {
    signedIn(ME);
    const replace = vi.spyOn(window.history, 'replaceState');
    expect(accept(url, { access_token: token(SENDER), refresh_token: 'r' })).toBe(false);
    expect(replace).toHaveBeenCalledWith(window.history.state, '', '/home');
  });

  it('is taken for another account when this tab has just pressed Google or Apple', () => {
    signedIn(ME);
    noteSignInStarted();
    expect(accept(url, { access_token: token(SENDER), refresh_token: 'r' })).toBe(true);
    // Once: the next address is judged afresh.
    expect(accept(url, { access_token: token(SENDER), refresh_token: 'r' })).toBe(false);
  });

  it('is refused for another account when the button was pressed long ago', () => {
    signedIn(ME);
    noteSignInStarted(Date.now() - 31 * 60_000);
    expect(accept(url, { access_token: token(SENDER), refresh_token: 'r' })).toBe(false);
  });

  it('leaves a token it cannot read to the client, which refuses it', () => {
    signedIn(ME);
    expect(accept(url, { access_token: 'not-a-token', refresh_token: 'r' })).toBe(true);
  });
});
