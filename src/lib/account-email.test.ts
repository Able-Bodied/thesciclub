import type { User } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  calls: [] as { fn: string; args: unknown[] }[],
  error: null as { message: string } | null,
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: new Proxy(
      {},
      {
        get:
          (_target, fn: string) =>
          (...args: unknown[]) => {
            auth.calls.push({ fn, args });
            return Promise.resolve({ error: auth.error });
          },
      },
    ),
  }),
}));

const { addEmailAndPassword, changeEmail, readSignInDetails, resendEmailChange, waysIn } =
  await import('@/lib/account-email');

function user(overrides: Partial<User>): User {
  return {
    id: 'u1',
    aud: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const google = {
  identity_id: 'i1',
  id: 'g1',
  user_id: 'u1',
  provider: 'google',
  identity_data: { email: 'dana@gmail.com' },
};
const phone = { identity_id: 'i2', id: 'p1', user_id: 'u1', provider: 'phone' };

beforeEach(() => {
  auth.calls = [];
  auth.error = null;
  window.history.replaceState(null, '', '/me');
});

describe('readSignInDetails', () => {
  it('says a phone account has no email, and not even an unconfirmed one', () => {
    const details = readSignInDetails(user({ phone: '14085550112', identities: [phone] as never }));
    expect(details.email).toBeNull();
    expect(details.pendingEmail).toBeNull();
  });

  it('finds Google’s address when Google is linked but the account has no email', () => {
    const details = readSignInDetails(
      user({ phone: '14085550112', identities: [phone, google] as never }),
    );
    expect(details.email).toBeNull();
    expect(details.googleAddress).toBe('dana@gmail.com');
  });

  it('does not count an address that has not been confirmed', () => {
    const details = readSignInDetails(user({ email: 'dana@example.com' }));
    expect(details.email).toBeNull();
    expect(details.pendingEmail).toBe('dana@example.com');
  });

  it('keeps the current address while a new one waits for its link', () => {
    const details = readSignInDetails(
      user({
        email: 'old@example.com',
        email_confirmed_at: '2026-02-01T00:00:00Z',
        new_email: 'new@example.com',
      }),
    );
    expect(details.email).toBe('old@example.com');
    expect(details.pendingEmail).toBe('new@example.com');
  });
});

describe('waysIn', () => {
  it('does not count a phone number, which no longer signs anybody in', () => {
    const details = readSignInDetails(
      user({ phone: '1408', identities: [phone, google] as never }),
    );
    expect(waysIn(details)).toBe(1);
    expect(waysIn(details, 'google')).toBe(0);
  });

  it('counts a confirmed email as a way in beside Google', () => {
    const details = readSignInDetails(
      user({
        email: 'dana@example.com',
        email_confirmed_at: '2026-02-01T00:00:00Z',
        identities: [google] as never,
      }),
    );
    expect(waysIn(details, 'google')).toBe(1);
  });
});

describe('changing the address', () => {
  it('sends the new address, lowercased, with the link returning to Me', async () => {
    const result = await changeEmail(' Dana@Example.com ');
    expect(result).toEqual({ ok: true });
    const { fn, args } = auth.calls[0] ?? { fn: '', args: [] as unknown[] };
    expect(fn).toBe('updateUser');
    expect(args[0]).toEqual({ email: 'dana@example.com' });
    expect(args[1]).toEqual({ emailRedirectTo: `${window.location.origin}/me?email=changed` });
  });

  it('adds an email and a password in one call, for a phone account', async () => {
    await addEmailAndPassword('dana@example.com', 'a long password');
    expect(auth.calls[0]?.args[0]).toEqual({
      email: 'dana@example.com',
      password: 'a long password',
    });
  });

  it('reports a refusal as a sentence', async () => {
    auth.error = { message: 'A user with this email address has already been registered' };
    const result = await changeEmail('dana@example.com');
    expect(result.ok).toBe(false);
  });

  it('can send the link for a waiting address again', async () => {
    await resendEmailChange('dana@example.com');
    const { fn, args } = auth.calls[0] ?? { fn: '', args: [] as unknown[] };
    expect(fn).toBe('resend');
    expect(args[0]).toMatchObject({ type: 'email_change' });
  });
});
