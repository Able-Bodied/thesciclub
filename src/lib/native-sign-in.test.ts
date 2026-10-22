import { Capacitor } from '@capacitor/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The store app's own Apple and Google sign-in, with the plugin and Supabase
 * stood in for. What matters: the nonce Apple or Google is given is the hash
 * of the one Supabase is given; a closed sheet says nothing; Apple's first
 * and only name is kept; Apple's code goes to apple-token.
 */

const plugin = vi.hoisted(() => ({
  initialize: vi.fn((_options: unknown) => Promise.resolve()),
  login: vi.fn((_options: unknown): Promise<unknown> => Promise.resolve({})),
  logout: vi.fn((_options: unknown) => Promise.resolve()),
}));

interface Answer {
  data: { user: { user_metadata: Record<string, unknown> } };
  error: { message: string; code?: string } | null;
}

const supabase = vi.hoisted(() => ({
  signInWithIdToken: vi.fn(
    (_args: unknown): Promise<Answer> =>
      Promise.resolve({ data: { user: { user_metadata: {} } }, error: null }),
  ),
  linkIdentity: vi.fn((_args: unknown) =>
    Promise.resolve({ error: null as { message: string; code?: string } | null }),
  ),
  updateUser: vi.fn((_args: unknown) => Promise.resolve({ error: null })),
  invoke: vi.fn((_name: string, _options: unknown) => Promise.resolve({ error: null })),
}));

vi.mock('@capgo/capacitor-social-login', () => ({ SocialLogin: plugin }));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      signInWithIdToken: supabase.signInWithIdToken,
      linkIdentity: supabase.linkIdentity,
      updateUser: supabase.updateUser,
    },
    functions: { invoke: supabase.invoke },
  }),
}));

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function appleAnswer(profile: { givenName?: string; familyName?: string } = {}) {
  return {
    provider: 'apple',
    result: {
      idToken: 'apple-id-token',
      authorizationCode: 'apple-code',
      accessToken: null,
      profile: { user: '001.a', email: null, givenName: '', familyName: '', ...profile },
    },
  };
}

const GOOGLE_ANSWER = {
  provider: 'google',
  result: {
    responseType: 'online',
    idToken: 'google-id-token',
    accessToken: { token: 'google-access' },
    profile: { email: 'a@gmail.com' },
  },
};

const IOS_CLIENT = '123456789012-abcdefghij.apps.googleusercontent.com';

async function load() {
  vi.resetModules();
  return import('@/lib/native-sign-in');
}

let native: { mockRestore: () => void }[] = [];

function inTheApp(platform = 'ios') {
  native = [
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true),
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue(platform),
  ];
}

beforeEach(() => {
  for (const fn of Object.values(plugin)) fn.mockClear();
  for (const fn of Object.values(supabase)) fn.mockClear();
  plugin.login.mockImplementation(() => Promise.resolve(appleAnswer()));
  supabase.signInWithIdToken.mockImplementation(() =>
    Promise.resolve({ data: { user: { user_metadata: {} } }, error: null }),
  );
  supabase.linkIdentity.mockImplementation(() => Promise.resolve({ error: null }));
});

afterEach(() => {
  for (const spy of native) spy.mockRestore();
  native = [];
  vi.unstubAllEnvs();
});

describe('which ways in the app offers', () => {
  it('none on the website', async () => {
    const { nativeWaysIn } = await load();
    vi.stubEnv('VITE_GOOGLE_IOS_CLIENT_ID', IOS_CLIENT);
    expect(nativeWaysIn()).toEqual({ apple: false, google: false });
  });

  it('Apple on an iPhone, and Google only once its iOS client is set', async () => {
    inTheApp('ios');
    const { nativeWaysIn } = await load();
    expect(nativeWaysIn()).toEqual({ apple: true, google: false });
    vi.stubEnv('VITE_GOOGLE_IOS_CLIENT_ID', 'not-a-client');
    expect(nativeWaysIn()).toEqual({ apple: true, google: false });
    vi.stubEnv('VITE_GOOGLE_IOS_CLIENT_ID', IOS_CLIENT);
    expect(nativeWaysIn()).toEqual({ apple: true, google: true });
  });

  it('none on Android yet', async () => {
    inTheApp('android');
    vi.stubEnv('VITE_GOOGLE_IOS_CLIENT_ID', IOS_CLIENT);
    const { nativeWaysIn } = await load();
    expect(nativeWaysIn()).toEqual({ apple: false, google: false });
  });
});

describe('Sign in with Apple', () => {
  it('sets the plugin up once, keeping Apple’s code unspent, and Google only with its client', async () => {
    inTheApp();
    const { signInWithAppleNatively } = await load();
    await signInWithAppleNatively();
    await signInWithAppleNatively();
    expect(plugin.initialize).toHaveBeenCalledTimes(1);
    expect(plugin.initialize).toHaveBeenCalledWith({ apple: { useProperTokenExchange: true } });
  });

  it('gives Apple the hash of the nonce and Supabase the nonce', async () => {
    inTheApp();
    const { signInWithAppleNatively } = await load();
    expect(await signInWithAppleNatively()).toEqual({ ok: true, name: null });
    const asked = plugin.login.mock.calls[0]?.[0] as { options: { nonce: string } };
    const given = supabase.signInWithIdToken.mock.calls[0]?.[0] as {
      provider: string;
      token: string;
      nonce: string;
    };
    expect(given.provider).toBe('apple');
    expect(given.token).toBe('apple-id-token');
    expect(asked.options.nonce).toBe(await sha256(given.nonce));
    expect(given.nonce).not.toBe(asked.options.nonce);
  });

  it('keeps the name Apple gives the first time, where the website’s sign-in keeps it', async () => {
    inTheApp();
    plugin.login.mockImplementation(() =>
      Promise.resolve(appleAnswer({ givenName: 'Dana', familyName: 'Ruiz' })),
    );
    const { signInWithAppleNatively } = await load();
    expect(await signInWithAppleNatively()).toEqual({ ok: true, name: 'Dana Ruiz' });
    expect(supabase.updateUser).toHaveBeenCalledWith({ data: { full_name: 'Dana Ruiz' } });
  });

  it('leaves a name the account already has', async () => {
    inTheApp();
    plugin.login.mockImplementation(() => Promise.resolve(appleAnswer({ givenName: 'Dana' })));
    supabase.signInWithIdToken.mockImplementation(() =>
      Promise.resolve({ data: { user: { user_metadata: { full_name: 'D. R.' } } }, error: null }),
    );
    const { signInWithAppleNatively } = await load();
    await signInWithAppleNatively();
    expect(supabase.updateUser).not.toHaveBeenCalled();
  });

  it('hands Apple’s code to apple-token, after the session exists', async () => {
    inTheApp();
    const { signInWithAppleNatively } = await load();
    await signInWithAppleNatively();
    await Promise.resolve();
    expect(supabase.invoke).toHaveBeenCalledWith('apple-token', { body: { code: 'apple-code' } });
    expect(supabase.signInWithIdToken.mock.invocationCallOrder[0]).toBeLessThan(
      supabase.invoke.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('says nothing when the sheet is closed, and why when it fails', async () => {
    inTheApp();
    const { signInWithAppleNatively, APPLE_NOT_SIGNED_IN } = await load();
    plugin.login.mockImplementation(() =>
      Promise.reject(Object.assign(new Error('canceled'), { code: 'USER_CANCELLED' })),
    );
    expect(await signInWithAppleNatively()).toEqual({ ok: false, error: null });
    plugin.login.mockImplementation(() => Promise.reject(new Error('1000')));
    expect(await signInWithAppleNatively()).toEqual({ ok: false, error: APPLE_NOT_SIGNED_IN });
    plugin.login.mockImplementation(() => Promise.resolve(appleAnswer()));
    supabase.signInWithIdToken.mockImplementation(() =>
      Promise.resolve({ data: { user: { user_metadata: {} } }, error: { message: 'nonce' } }),
    );
    expect(await signInWithAppleNatively()).toEqual({ ok: false, error: APPLE_NOT_SIGNED_IN });
    expect(supabase.invoke).not.toHaveBeenCalled();
  });

  it('links Apple to the signed-in member, and keeps its code', async () => {
    inTheApp();
    const { linkAppleNatively } = await load();
    expect(await linkAppleNatively()).toEqual({ ok: true, name: null });
    expect(supabase.linkIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'apple', token: 'apple-id-token' }),
    );
    expect(supabase.invoke).toHaveBeenCalledWith('apple-token', { body: { code: 'apple-code' } });
  });

  it('says when that Apple ID belongs to another member', async () => {
    inTheApp();
    supabase.linkIdentity.mockImplementation(() =>
      Promise.resolve({ error: { message: 'exists', code: 'identity_already_exists' } }),
    );
    const { linkAppleNatively, APPLE_TAKEN } = await load();
    expect(await linkAppleNatively()).toEqual({ ok: false, error: APPLE_TAKEN });
    expect(supabase.invoke).not.toHaveBeenCalled();
  });
});

describe('Google Sign-In', () => {
  beforeEach(() => {
    plugin.login.mockImplementation(() => Promise.resolve(GOOGLE_ANSWER));
  });

  it('is set up with the iOS client', async () => {
    inTheApp();
    vi.stubEnv('VITE_GOOGLE_IOS_CLIENT_ID', IOS_CLIENT);
    const { signInWithGoogleNatively } = await load();
    await signInWithGoogleNatively();
    expect(plugin.initialize).toHaveBeenCalledWith({
      apple: { useProperTokenExchange: true },
      google: { iOSClientId: IOS_CLIENT, mode: 'online' },
    });
  });

  it('always asks afresh, with the nonce’s hash, and passes the access token on', async () => {
    inTheApp();
    vi.stubEnv('VITE_GOOGLE_IOS_CLIENT_ID', IOS_CLIENT);
    const { signInWithGoogleNatively } = await load();
    expect(await signInWithGoogleNatively()).toEqual({ ok: true, name: null });
    const asked = plugin.login.mock.calls[0]?.[0] as {
      provider: string;
      options: { nonce: string; forcePrompt: boolean };
    };
    const given = supabase.signInWithIdToken.mock.calls[0]?.[0] as Record<string, string>;
    expect(asked.provider).toBe('google');
    expect(asked.options.forcePrompt).toBe(true);
    expect(given).toEqual({
      provider: 'google',
      token: 'google-id-token',
      nonce: given.nonce,
      access_token: 'google-access',
    });
    expect(asked.options.nonce).toBe(await sha256(given.nonce ?? ''));
    expect(plugin.logout).toHaveBeenCalledWith({ provider: 'google' });
  });

  it('says nothing when the sheet is closed', async () => {
    inTheApp();
    vi.stubEnv('VITE_GOOGLE_IOS_CLIENT_ID', IOS_CLIENT);
    plugin.login.mockImplementation(() =>
      Promise.reject(Object.assign(new Error('canceled'), { code: 'USER_CANCELLED' })),
    );
    const { signInWithGoogleNatively } = await load();
    expect(await signInWithGoogleNatively()).toEqual({ ok: false, error: null });
    expect(supabase.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('links Google with its access token', async () => {
    inTheApp();
    vi.stubEnv('VITE_GOOGLE_IOS_CLIENT_ID', IOS_CLIENT);
    const { linkGoogleNatively } = await load();
    expect(await linkGoogleNatively()).toEqual({ ok: true, name: null });
    expect(supabase.linkIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google', access_token: 'google-access' }),
    );
  });
});
