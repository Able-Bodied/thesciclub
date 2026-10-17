import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HINT_LIFE_MS, hintSignIn, sessionIdOf, watchSignIns } from '@/lib/sign-in-record';

type Listener = (event: string, session: { access_token: string } | null) => void;

/** An access token carrying only what this file reads. */
function token(sessionId: string): string {
  const payload = btoa(JSON.stringify({ session_id: sessionId, sub: 'dana' }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `header.${payload}.signature`;
}

/** A client whose auth events this file sends by hand, and whose rpc it answers. */
function fakeClient(
  answer: () => Promise<{ error: unknown }> = () => Promise.resolve({ error: null }),
) {
  const listeners: Listener[] = [];
  const rpc = vi.fn((_name: string, _args: unknown) => answer());
  const client = {
    auth: {
      onAuthStateChange: (listener: Listener) => {
        listeners.push(listener);
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
    },
    rpc,
  } as unknown as SupabaseClient;
  watchSignIns(client);
  return {
    rpc,
    send: async (event: string, sessionId: string | null) => {
      for (const listener of listeners)
        listener(event, sessionId ? { access_token: token(sessionId) } : null);
      // The report goes after the callback, then waits on the answer.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await Promise.resolve();
    },
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe('reporting each sign-in once', () => {
  it('reads the session id out of the access token', () => {
    expect(sessionIdOf({ access_token: token('s-1') } as never)).toBe('s-1');
    expect(sessionIdOf({ access_token: 'not-a-token' } as never)).toBeNull();
  });

  it('reports a new session, with no hint when none was left', async () => {
    const { rpc, send } = fakeClient();
    await send('SIGNED_IN', 's-1');
    expect(rpc).toHaveBeenCalledWith('record_sign_in', {
      provider_hint: null,
      via_home_screen: false,
    });
  });

  it('reports it once, however often the client says signed in', async () => {
    const { rpc, send } = fakeClient();
    await send('SIGNED_IN', 's-1');
    await send('SIGNED_IN', 's-1');
    await send('INITIAL_SESSION', 's-1');
    expect(rpc).toHaveBeenCalledTimes(1);
    await send('SIGNED_IN', 's-2');
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  // A session from before this went live, or one whose report failed, is
  // reported the next time the app opens.
  it('reports a session the app opens with, if it has not been', async () => {
    const { rpc, send } = fakeClient();
    await send('INITIAL_SESSION', 's-1');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('tries again after a failure', async () => {
    const { rpc, send } = fakeClient(() => Promise.resolve({ error: { message: 'offline' } }));
    await send('SIGNED_IN', 's-1');
    await send('INITIAL_SESSION', 's-1');
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('ignores refreshes and signing out', async () => {
    const { rpc, send } = fakeClient();
    await send('TOKEN_REFRESHED', 's-1');
    await send('SIGNED_OUT', null);
    await send('INITIAL_SESSION', null);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sends the hint left just before, and only once', async () => {
    const { rpc, send } = fakeClient();
    hintSignIn({ provider: 'google', homeScreen: true });
    await send('SIGNED_IN', 's-1');
    expect(rpc).toHaveBeenLastCalledWith('record_sign_in', {
      provider_hint: 'google',
      via_home_screen: true,
    });
    await send('SIGNED_IN', 's-2');
    expect(rpc).toHaveBeenLastCalledWith('record_sign_in', {
      provider_hint: null,
      via_home_screen: false,
    });
  });

  it('forgets a hint from a sign-in that never finished', async () => {
    const { rpc, send } = fakeClient();
    vi.useFakeTimers({ toFake: ['Date'] });
    hintSignIn({ provider: 'apple' });
    vi.setSystemTime(Date.now() + HINT_LIFE_MS + 1);
    await send('SIGNED_IN', 's-1');
    expect(rpc).toHaveBeenCalledWith('record_sign_in', {
      provider_hint: null,
      via_home_screen: false,
    });
  });
});
