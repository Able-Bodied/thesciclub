import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APPLE_RETURN_PARAM } from '@/lib/apple-sign-in';
import { watchForAppleRefreshToken } from '@/lib/apple-web-token';

type Listener = (event: string, session: { provider_refresh_token?: string } | null) => void;

function fakeClient() {
  const listeners: Listener[] = [];
  const invoke = vi.fn((_name: string, _options: unknown) => Promise.resolve({ error: null }));
  const client = {
    auth: {
      onAuthStateChange: (listener: Listener) => {
        listeners.push(listener);
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
    },
    functions: { invoke },
  } as unknown as SupabaseClient;
  watchForAppleRefreshToken(client);
  return {
    invoke,
    send: async (event: string, session: { provider_refresh_token?: string } | null) => {
      for (const listener of listeners) listener(event, session);
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

function at(search: string) {
  window.history.replaceState(null, '', `/join${search}`);
}

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('keeping Apple’s refresh token after the website’s redirect', () => {
  it('reads the same return parameter apple-sign-in.ts adds', () => {
    expect(APPLE_RETURN_PARAM).toBe('apple');
  });

  it('sends the token Apple’s sign-in brought back, once', async () => {
    at('?apple=signin&next=%2Fhome');
    const { invoke, send } = fakeClient();
    await send('SIGNED_IN', { provider_refresh_token: 'rt-apple' });
    await send('INITIAL_SESSION', { provider_refresh_token: 'rt-apple' });
    expect(invoke.mock.calls).toEqual([['apple-token', { body: { refresh_token: 'rt-apple' } }]]);
  });

  it('sends it after linking Apple on Me too', async () => {
    at('?apple=linked');
    const { invoke, send } = fakeClient();
    await send('SIGNED_IN', { provider_refresh_token: 'rt-linked' });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('sends nothing back from Google, or with no provider token, or on a refresh', async () => {
    at('?google=signin');
    const google = fakeClient();
    await google.send('SIGNED_IN', { provider_refresh_token: 'rt-google' });
    at('?apple=signin');
    const plain = fakeClient();
    await plain.send('SIGNED_IN', {});
    await plain.send('TOKEN_REFRESHED', { provider_refresh_token: 'rt-apple' });
    expect(google.invoke).not.toHaveBeenCalled();
    expect(plain.invoke).not.toHaveBeenCalled();
  });
});
