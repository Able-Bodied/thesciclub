import type { Session } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it } from 'vitest';
import { lastWayIn, rememberWayIn, wayInOf } from '@/lib/last-way-in';

function session(method: string, provider = 'email'): Session {
  const payload = btoa(JSON.stringify({ amr: [{ method }] }));
  return {
    access_token: `h.${payload}.s`,
    user: { app_metadata: { provider } },
  } as unknown as Session;
}

describe('the way somebody last signed in', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is what was just said, first of all', () => {
    expect(wayInOf(session('oauth', 'google'), 'apple')).toBe('apple');
  });

  it('reads a password from the token, even on an account begun with Google', () => {
    expect(wayInOf(session('password', 'google'), null)).toBe('email');
  });

  it('reads Google or Apple from the account when nothing was said', () => {
    expect(wayInOf(session('oauth', 'apple'), null)).toBe('apple');
  });

  it('leaves alone a way that says nothing, as a handoff code does', () => {
    rememberWayIn('apple');
    rememberWayIn(wayInOf(session('otp'), null));
    expect(lastWayIn()).toBe('apple');
  });

  it('copes with a token it cannot read', () => {
    expect(wayInOf({ access_token: 'x' } as unknown as Session, null)).toBeNull();
  });

  it('ignores anything else in the slot', () => {
    localStorage.setItem('club:way-in', 'carrier pigeon');
    expect(lastWayIn()).toBeNull();
  });
});
