import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  calls: [] as { fn: string; args: unknown[] }[],
  error: null as { message: string; code?: string } | null,
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

const {
  cleanEmail,
  looksLikeEmail,
  resendConfirmation,
  sendPasswordReset,
  signInWithEmail,
  signUpWithEmail,
} = await import('@/lib/auth-email');

beforeEach(() => {
  auth.calls = [];
  auth.error = null;
  window.history.replaceState(null, '', '/join');
});

describe('addresses', () => {
  it('trims and lowercases, so the invite and the account compare equal', () => {
    expect(cleanEmail('  Dana@Example.COM ')).toBe('dana@example.com');
  });

  it('knows an address from a word', () => {
    expect(looksLikeEmail('dana@example.com')).toBe(true);
    expect(looksLikeEmail(' dana@example.com ')).toBe(true);
    expect(looksLikeEmail('dana@example')).toBe(false);
    expect(looksLikeEmail('dana example.com')).toBe(false);
    expect(looksLikeEmail('')).toBe(false);
  });
});

describe('signUpWithEmail', () => {
  it('has the confirmation link return to /join, remembering where they were headed', async () => {
    window.history.replaceState(null, '', '/join?next=%2Fchat%2Ft%2Fshared');
    const result = await signUpWithEmail(' Dana@Example.com', 'a long password');

    expect(result).toEqual({ ok: true });
    const { fn, args } = auth.calls[0] ?? { fn: '', args: [] as unknown[] };
    expect(fn).toBe('signUp');
    const request = args[0] as { email: string; options: { emailRedirectTo: string } };
    expect(request.email).toBe('dana@example.com');
    const redirect = new URL(request.options.emailRedirectTo);
    expect(redirect.pathname).toBe('/join');
    expect(redirect.searchParams.get('confirmed')).toBe('1');
    expect(redirect.searchParams.get('next')).toBe('/chat/t/shared');
  });

  it('gives a sentence when it is refused', async () => {
    auth.error = { message: 'Signups not allowed', code: 'signup_disabled' };
    const result = await signUpWithEmail('dana@example.com', 'a long password');
    expect(result.ok).toBe(false);
  });
});

describe('signInWithEmail', () => {
  it('is ok when Supabase is', async () => {
    expect(await signInWithEmail('Dana@example.com', 'pw')).toEqual({ ok: true });
    expect(auth.calls[0]).toEqual({
      fn: 'signInWithPassword',
      args: [{ email: 'dana@example.com', password: 'pw' }],
    });
  });

  it('gives one sentence for a wrong password and an unknown address', async () => {
    auth.error = { message: 'Invalid login credentials', code: 'invalid_credentials' };
    expect(await signInWithEmail('a@example.com', 'pw')).toEqual({
      ok: false,
      error: 'That email and password did not match.',
    });
  });

  it('flags an unconfirmed address, so the page can offer the link again', async () => {
    auth.error = { message: 'Email not confirmed', code: 'email_not_confirmed' };
    const result = await signInWithEmail('a@example.com', 'pw');
    expect(result).toMatchObject({ ok: false, unconfirmed: true });
  });
});

describe('sendPasswordReset', () => {
  it('has the link return to /reset-password', async () => {
    expect(await sendPasswordReset(' Dana@Example.com ')).toEqual({ ok: true });
    const { fn, args } = auth.calls[0] ?? { fn: '', args: [] as unknown[] };
    expect(fn).toBe('resetPasswordForEmail');
    expect(args[0]).toBe('dana@example.com');
    expect((args[1] as { redirectTo: string }).redirectTo).toMatch(/\/reset-password$/);
  });
});

describe('resendConfirmation', () => {
  it('asks for another signup link to the same address', async () => {
    expect(await resendConfirmation('Dana@Example.com')).toEqual({ ok: true });
    const { fn, args } = auth.calls[0] ?? { fn: '', args: [] as unknown[] };
    expect(fn).toBe('resend');
    expect(args[0]).toMatchObject({ type: 'signup', email: 'dana@example.com' });
  });
});
