import { describe, expect, it } from 'vitest';
import { makeNonce } from '@/lib/google-identity';

// Supabase hashes the nonce it is handed and compares it with the one in
// Google's token, which is whatever Google was handed. If these two drift, every
// sign-in through the widget is refused.
describe('the nonce', () => {
  it('gives Google the SHA-256 hex of the one Supabase is given', async () => {
    const { raw, hashed } = await makeNonce();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    const expected = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0'));
    expect(hashed).toBe(expected.join(''));
    // And a known value, so the test is not the code checking itself.
    const known = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('abc'));
    expect(Array.from(new Uint8Array(known), (b) => b.toString(16).padStart(2, '0')).join('')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('is new every time', async () => {
    const [a, b] = await Promise.all([makeNonce(), makeNonce()]);
    expect(a.raw).not.toBe(b.raw);
    expect(a.raw).toMatch(/^[0-9a-f]{64}$/);
  });
});
