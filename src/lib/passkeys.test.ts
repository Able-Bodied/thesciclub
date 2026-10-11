import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  calls: [] as string[],
  error: null as { name?: string; message: string } | null,
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

const { deletePasskey, listPasskeys, passkeysAvailable, passkeysEnabled, signInWithPasskey } =
  await import('@/lib/passkeys');
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
