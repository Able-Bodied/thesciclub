import { getSupabase } from '@/lib/supabase';

/**
 * The link in an invite email, `/join?invite=<token>`, and what becomes of it.
 *
 * The token has to outlive the page: the person may be sent off to confirm an
 * email address, or round Google's or Apple's sign-in, before there is a
 * session to claim it with. So the moment /join loads it is kept in
 * localStorage, and it is let go once `claim_invite` has answered true or the
 * member row exists. The database stores only its hash.
 */

export const INVITE_TOKEN_KEY = 'sciclub.inviteToken';
export const INVITE_PARAM = 'invite';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Keeps the token the address carries, if any. Returns the one now held. */
export function captureInviteToken(search: string): string | null {
  const token = new URLSearchParams(search).get(INVITE_PARAM)?.trim();
  if (token) storage()?.setItem(INVITE_TOKEN_KEY, token);
  return heldInviteToken();
}

export function heldInviteToken(): string | null {
  const held = storage()?.getItem(INVITE_TOKEN_KEY);
  if (!held) return null;
  return held;
}

export function forgetInviteToken(): void {
  storage()?.removeItem(INVITE_TOKEN_KEY);
}

/**
 * The address the held invite was sent to, for the join form to fill in: a typo
 * there is a confirmation email that goes nowhere.
 *
 * `invite_address_for_token` answers null for every token that is not a live,
 * unclaimed invite and says which of them it was to nobody. A failed call is
 * null too: this is a convenience, and the address can always be typed.
 */
export async function heldInviteAddress(): Promise<string | null> {
  const token = heldInviteToken();
  if (!token) return null;
  const result = await getSupabase().rpc('invite_address_for_token', { token });
  if (result.error) return null;
  const address: unknown = result.data;
  return typeof address === 'string' && address !== '' ? address : null;
}

/**
 * Claims the held invite for the signed-in account.
 *
 * `claim_invite` answers false for every kind of refusal and says which of
 * them it was to nobody, so neither does this. A failed call (offline) keeps
 * the token for the next try; only an answer lets it go.
 */
export async function claimHeldInvite(): Promise<'none' | 'claimed' | 'refused' | 'failed'> {
  const token = heldInviteToken();
  if (!token) return 'none';
  // Taken whole: rpc() types its payload as `any`.
  const result = await getSupabase().rpc('claim_invite', { token });
  if (result.error) return 'failed';
  forgetInviteToken();
  return (result.data as unknown) === true ? 'claimed' : 'refused';
}
