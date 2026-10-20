import { afterEach, describe, expect, it, vi } from 'vitest';
import { type EmailLink, readEmailLink, redeemEmailLink } from '@/lib/email-link';

const ORIGIN = 'https://thesciclub.com';
const SUPABASE = 'https://project.supabase.co';

function answer(status: number, body: unknown) {
  return vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
}

function hash(to: string): URLSearchParams {
  return new URLSearchParams(to.slice(to.indexOf('#') + 1));
}

let n = 0;
/** Each test its own token: redeeming is remembered per token. */
function link(type: EmailLink['type'], to = '/join?confirmed=1'): EmailLink {
  n += 1;
  return { type, tokenHash: `hash-${n}`, to };
}

afterEach(() => {
  sessionStorage.clear();
});

describe('readEmailLink', () => {
  it('reads the kind, the token and where it was for, as the template writes them', () => {
    const next = encodeURIComponent(`${ORIGIN}/join?confirmed=1&next=/events/7`);
    expect(readEmailLink(`?type=email&token_hash=abc&next=${next}`, ORIGIN)).toEqual({
      type: 'email',
      tokenHash: 'abc',
      to: '/join?confirmed=1&next=/events/7',
    });
  });

  it('goes to the page for its kind when no destination came with it', () => {
    expect(readEmailLink('?type=recovery&token_hash=abc', ORIGIN)?.to).toBe('/reset-password');
    expect(readEmailLink('?type=email_change&token_hash=abc', ORIGIN)?.to).toBe(
      '/me?email=changed',
    );
    // Supabase writes the site itself when the asked-for address is not allowed.
    expect(readEmailLink(`?type=email&token_hash=abc&next=${ORIGIN}`, ORIGIN)?.to).toBe(
      '/join?confirmed=1',
    );
  });

  it('never sends anybody to another site', () => {
    for (const next of ['https://evil.example/join', '//evil.example/x', 'javascript:alert(1)']) {
      expect(
        readEmailLink(`?type=email&token_hash=abc&next=${encodeURIComponent(next)}`, ORIGIN)?.to,
      ).toBe('/join?confirmed=1');
    }
  });

  it('is nothing without a known kind and a token', () => {
    expect(readEmailLink('?type=email', ORIGIN)).toBeNull();
    expect(readEmailLink('?type=magiclink&token_hash=abc', ORIGIN)).toBeNull();
    expect(readEmailLink('', ORIGIN)).toBeNull();
  });
});

describe('redeemEmailLink', () => {
  it('spends the token and hands the session on as Supabase’s redirect would', async () => {
    const send = answer(200, {
      access_token: 'at',
      refresh_token: 'rt',
      expires_in: 3600,
      expires_at: 1_800_000_000,
      token_type: 'bearer',
    });
    const to = await redeemEmailLink(link('recovery', '/reset-password'), SUPABASE, 'key', send);
    expect(send).toHaveBeenCalledWith(`${SUPABASE}/auth/v1/verify`, {
      method: 'POST',
      headers: { apikey: 'key', 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'recovery', token_hash: `hash-${n}` }),
    });
    expect(to.startsWith('/reset-password#')).toBe(true);
    expect(Object.fromEntries(hash(to))).toEqual({
      access_token: 'at',
      expires_at: '1800000000',
      expires_in: '3600',
      refresh_token: 'rt',
      token_type: 'bearer',
      type: 'recovery',
    });
  });

  it('calls a confirmed address a sign-up, as supabase-js expects', async () => {
    const send = answer(200, {
      access_token: 'at',
      refresh_token: 'rt',
      expires_in: 3600,
      token_type: 'bearer',
    });
    expect(hash(await redeemEmailLink(link('email'), SUPABASE, 'key', send)).get('type')).toBe(
      'signup',
    );
  });

  it('passes on a used or old link as the error the pages already read', async () => {
    const send = answer(403, {
      code: 403,
      error_code: 'otp_expired',
      msg: 'Email link is invalid or has expired',
    });
    const to = await redeemEmailLink(link('email'), SUPABASE, 'key', send);
    expect(to.startsWith('/join?confirmed=1#')).toBe(true);
    expect(Object.fromEntries(hash(to))).toEqual({
      error: 'access_denied',
      error_code: 'otp_expired',
      error_description: 'Email link is invalid or has expired',
    });
  });

  it('passes on the first of a changed address’s two links as a message', async () => {
    const msg =
      'Confirmation link accepted. Please proceed to confirm link sent to the other email';
    const to = await redeemEmailLink(
      link('email_change', '/me?email=changed'),
      SUPABASE,
      'key',
      answer(200, { code: '200', msg }),
    );
    expect(to).toBe(`/me?email=changed#${new URLSearchParams({ message: msg })}`);
  });

  it('spends a token once, however many times it is asked', async () => {
    const send = answer(200, { access_token: 'at', refresh_token: 'rt', expires_in: 1 });
    const one = link('email');
    const [a, b] = await Promise.all([
      redeemEmailLink(one, SUPABASE, 'key', send),
      redeemEmailLink(one, SUPABASE, 'key', send),
    ]);
    expect(a).toBe(b);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('keeps the outcome for a reload between spending the link and leaving', async () => {
    const one = link('email');
    const first = await redeemEmailLink(
      one,
      SUPABASE,
      'key',
      answer(200, { access_token: 'at', refresh_token: 'rt' }),
    );
    // A reload starts with nothing in memory: the same token, a fresh module.
    vi.resetModules();
    const again = await import('@/lib/email-link');
    const spent = answer(403, { error_code: 'otp_expired' });
    expect(await again.redeemEmailLink(one, SUPABASE, 'key', spent)).toBe(first);
    expect(spent).not.toHaveBeenCalled();
  });

  it('leaves the link unspent for another try when Supabase cannot be reached', async () => {
    const one = link('email');
    const down = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(redeemEmailLink(one, SUPABASE, 'key', down)).rejects.toThrow();
    const up = answer(403, { error_code: 'otp_expired' });
    await redeemEmailLink(one, SUPABASE, 'key', up);
    expect(up).toHaveBeenCalledTimes(1);
  });
});
