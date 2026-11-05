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

/** What a held invite link says about the person it went to (20261104000000). */
export interface InviteDetails {
  email: string;
  /** From the public-page registration it was sent from, if any. */
  name: string | null;
  phone: string | null;
  eventId: string | null;
  status: 'going' | 'interested' | null;
}

/**
 * As heldInviteAddress, with the name and phone the person gave when they
 * registered for an event, where the invite was sent from the guest list.
 * Falls back to the address alone if the newer call is not there yet.
 */
export async function heldInviteDetails(): Promise<InviteDetails | null> {
  const token = heldInviteToken();
  if (!token) return null;
  const result = await getSupabase().rpc('invite_details_for_token', { token });
  if (result.error) {
    const email = await heldInviteAddress();
    return email ? { email, name: null, phone: null, eventId: null, status: null } : null;
  }
  const rows: unknown = result.data;
  const row = (Array.isArray(rows) ? rows[0] : rows) as Record<string, unknown> | null | undefined;
  if (!row || typeof row.email !== 'string' || row.email === '') return null;
  const text = (value: unknown) =>
    typeof value === 'string' && value.trim() ? value.trim() : null;
  return {
    email: row.email,
    name: text(row.name),
    phone: text(row.phone),
    eventId: text(row.event_id),
    status: row.status === 'going' || row.status === 'interested' ? row.status : null,
  };
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
