import { Capacitor } from '@capacitor/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  calls: [] as string[],
  error: null as { name?: string; message: string } | null,
  verified: [] as unknown[],
  expiresAt: 0,
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      signInWithPasskey: () => {
        auth.calls.push('signInWithPasskey');
        return Promise.resolve({ error: auth.error });
      },
      registerPasskey: () => {
        auth.calls.push('registerPasskey');
        return Promise.resolve({ error: auth.error });
      },
      passkey: {
        startAuthentication: () => {
          auth.calls.push('startAuthentication');
          return Promise.resolve({
            data: {
              challenge_id: 'ch1',
              // "hello" and "abc" in base64url.
              options: {
                challenge: 'aGVsbG8',
                allowCredentials: [],
                userVerification: 'preferred',
              },
              expires_at: auth.expiresAt,
            },
            error: null,
          });
        },
        verifyAuthentication: (params: unknown) => {
          auth.verified.push(params);
          return Promise.resolve({ data: {}, error: auth.error });
        },
        list: () =>
          Promise.resolve({
            data: [
              { id: 'p1', friendly_name: 'iPhone', created_at: '2026-10-10T00:00:00Z' },
              { id: 'p2', created_at: '2026-10-11T00:00:00Z' },
            ],
            error: null,
          }),
        delete: ({ passkeyId }: { passkeyId: string }) => {
          auth.calls.push(`delete:${passkeyId}`);
          return Promise.resolve({ error: null });
        },
      },
    },
  }),
}));

const {
  deletePasskey,
  listPasskeys,
  passkeyAutofill,
  passkeyAutofillAvailable,
  passkeysAvailable,
  passkeysEnabled,
  signInWithPasskey,
} = await import('@/lib/passkeys');
const { appleSignInEnabled } = await import('@/lib/apple-sign-in');

function withWebAuthn() {
  Object.defineProperty(window, 'PublicKeyCredential', {
    value: () => undefined,
    configurable: true,
  });
}

beforeEach(() => {
  auth.calls = [];
  auth.error = null;
  auth.verified = [];
  auth.expiresAt = Date.now() / 1000 + 300;
});

afterEach(() => {
  vi.unstubAllEnvs();
  Reflect.deleteProperty(window, 'PublicKeyCredential');
});

describe('the switches', () => {
  it('keep passkeys off unless VITE_PASSKEYS is set', () => {
    withWebAuthn();
    expect(passkeysEnabled()).toBe(false);
    expect(passkeysAvailable()).toBe(false);
    vi.stubEnv('VITE_PASSKEYS', '1');
    expect(passkeysEnabled()).toBe(true);
    expect(passkeysAvailable()).toBe(true);
  });

  it('keep passkeys away from a browser without WebAuthn, switch or no', () => {
    vi.stubEnv('VITE_PASSKEYS', '1');
    expect(passkeysAvailable()).toBe(false);
  });

  it('keep passkeys out of the store app, whose page is not thesciclub.com', () => {
    withWebAuthn();
    vi.stubEnv('VITE_PASSKEYS', '1');
    const native = vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    expect(passkeysAvailable()).toBe(false);
    native.mockRestore();
    expect(passkeysAvailable()).toBe(true);
  });

  it('keep Apple off unless VITE_APPLE_SIGN_IN is set', () => {
    expect(appleSignInEnabled()).toBe(false);
    vi.stubEnv('VITE_APPLE_SIGN_IN', '1');
    expect(appleSignInEnabled()).toBe(true);
  });
});

describe('signing in with a passkey', () => {
  it('does not even ask Supabase when the switch is off', async () => {
    withWebAuthn();
    const result = await signInWithPasskey();
    expect(result.ok).toBe(false);
    expect(auth.calls).toEqual([]);
  });

  it('is ok when the ceremony is', async () => {
    vi.stubEnv('VITE_PASSKEYS', '1');
    withWebAuthn();
    expect(await signInWithPasskey()).toEqual({ ok: true });
  });

  it('is quiet when the browser’s own sheet is cancelled', async () => {
    vi.stubEnv('VITE_PASSKEYS', '1');
    withWebAuthn();
    auth.error = { name: 'NotAllowedError', message: 'cancelled' };
    expect(await signInWithPasskey()).toEqual({ ok: false, error: '' });
  });
});

const bytes = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0)).buffer;

function withAutofill(get: (options: CredentialRequestOptions) => Promise<Credential | null>) {
  Object.defineProperty(window, 'PublicKeyCredential', {
    value: Object.assign(() => undefined, {
      isConditionalMediationAvailable: () => Promise.resolve(true),
    }),
    configurable: true,
  });
  Object.defineProperty(navigator, 'credentials', { value: { get }, configurable: true });
}

const picked = {
  id: 'cred',
  rawId: bytes('abc'),
  type: 'public-key',
  authenticatorAttachment: 'platform',
  getClientExtensionResults: () => ({}),
  response: {
    clientDataJSON: bytes('abc'),
    authenticatorData: bytes('abc'),
    signature: bytes('abc'),
    userHandle: bytes('abc'),
  },
} as unknown as Credential;

describe('a passkey offered in the email box', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'credentials');
  });

  it('is offered only where the browser can, and the switch is on', async () => {
    withAutofill(() => Promise.resolve(null));
    expect(await passkeyAutofillAvailable()).toBe(false);
    vi.stubEnv('VITE_PASSKEYS', '1');
    expect(await passkeyAutofillAvailable()).toBe(true);
    withWebAuthn();
    expect(await passkeyAutofillAvailable()).toBe(false);
  });

  it('asks quietly, then signs in with the one picked', async () => {
    vi.stubEnv('VITE_PASSKEYS', '1');
    const asked: CredentialRequestOptions[] = [];
    withAutofill((options) => {
      asked.push(options);
      return Promise.resolve(picked);
    });
    expect(await passkeyAutofill(new AbortController().signal)).toEqual({ ok: true });
    expect(asked[0]?.mediation).toBe('conditional');
    expect(new Uint8Array(asked[0]?.publicKey?.challenge as ArrayBuffer)).toEqual(
      new Uint8Array(bytes('hello')),
    );
    expect(auth.verified).toEqual([
      {
        challengeId: 'ch1',
        credential: {
          id: 'cred',
          rawId: 'YWJj',
          type: 'public-key',
          response: {
            clientDataJSON: 'YWJj',
            authenticatorData: 'YWJj',
            signature: 'YWJj',
            userHandle: 'YWJj',
          },
          clientExtensionResults: {},
          authenticatorAttachment: 'platform',
        },
      },
    ]);
  });

  it('stops without a word when the sign-in screen goes', async () => {
    vi.stubEnv('VITE_PASSKEYS', '1');
    const controller = new AbortController();
    withAutofill(
      (options) =>
        new Promise((_, reject) => {
          options.signal?.addEventListener('abort', () => {
            reject(new DOMException('gone', 'AbortError'));
          });
          controller.abort();
        }),
    );
    expect(await passkeyAutofill(controller.signal)).toEqual({ ok: true });
    expect(auth.verified).toEqual([]);
  });

  it('asks again before the challenge runs out', async () => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_PASSKEYS', '1');
    auth.expiresAt = Date.now() / 1000 + 60;
    let round = 0;
    withAutofill((options) => {
      round++;
      if (round === 2) return Promise.resolve(picked);
      return new Promise((_, reject) => {
        options.signal?.addEventListener('abort', () => {
          reject(new DOMException('stale', 'AbortError'));
        });
      });
    });
    const done = passkeyAutofill(new AbortController().signal);
    await vi.advanceTimersByTimeAsync(46_000);
    expect(await done).toEqual({ ok: true });
    expect(auth.calls.filter((c) => c === 'startAuthentication')).toHaveLength(2);
    vi.useRealTimers();
  });

  it('says so when the passkey is refused', async () => {
    vi.stubEnv('VITE_PASSKEYS', '1');
    withAutofill(() => Promise.resolve(picked));
    auth.error = { message: 'webauthn_verification_failed' };
    const result = await passkeyAutofill(new AbortController().signal);
    expect(result.ok).toBe(false);
  });
});

describe('managing passkeys', () => {
  it('lists them with a name, and a plain one when there is none', async () => {
    expect(await listPasskeys()).toEqual({
      ok: true,
      passkeys: [
        { id: 'p1', name: 'iPhone', createdAt: '2026-10-10T00:00:00Z' },
        { id: 'p2', name: 'Passkey', createdAt: '2026-10-11T00:00:00Z' },
      ],
    });
  });

  it('removes one by id', async () => {
    expect(await deletePasskey('p1')).toEqual({ ok: true });
    expect(auth.calls).toEqual(['delete:p1']);
  });
});
