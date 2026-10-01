import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Signed photograph URLs are kept across reloads (src/lib/chat/attachments.ts),
 * signed under one member's session. Signing out has to forget them, or the
 * next person on the phone is handed the last one's for up to an hour.
 */

const auth = vi.hoisted(() => ({ error: null as { message: string } | null }));

vi.mock('@/lib/push/notifications', () => ({ forgetThisDevice: () => Promise.resolve() }));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ auth: { signOut: () => Promise.resolve({ error: auth.error }) } }),
}));

const { signOut } = await import('@/lib/account');

const KEPT = 'thesciclub.signed-photos';

beforeEach(() => {
  auth.error = null;
  localStorage.setItem(
    KEPT,
    JSON.stringify({ 'seed/a.webp': { url: 'https://signed.test/a', until: Date.now() + 60_000 } }),
  );
});

describe('signOut', () => {
  it('forgets the photograph URLs kept for this member', async () => {
    expect(await signOut()).toEqual({ ok: true });
    expect(localStorage.getItem(KEPT)).toBeNull();
  });

  it('keeps them while the member is, in fact, still signed in', async () => {
    auth.error = { message: 'network down' };
    expect((await signOut()).ok).toBe(false);
    expect(localStorage.getItem(KEPT)).not.toBeNull();
  });
});
