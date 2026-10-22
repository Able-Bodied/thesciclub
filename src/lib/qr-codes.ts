import { describeError, describeThrown } from '@/lib/describe-error';
import { siteOrigin } from '@/lib/site-origin';
import { getSupabase } from '@/lib/supabase';

/**
 * An administrator's QR code, for conventions (20261014020000).
 *
 * The code opens /join?from=<code>. It gives credit, never entry: while
 * anybody can join, whoever joins from it is recorded as invited by that
 * administrator, with the code's event; while joining is closed, the join
 * screen says to ask them, with the email the code carries.
 *
 * Like an invite link's token (invite-token.ts), the code has to outlive the
 * page: a confirmation email or Google's round trip comes before there is an
 * account to credit. So it is kept in localStorage the moment /join loads, and
 * claimed for the account once it is signed in.
 */

export const QR_PARAM = 'from';
export const QR_CODE_KEY = 'sciclub.qrCode';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Keeps the code the address carries, if any. Returns the one now held. */
export function captureQrCode(search: string): string | null {
  const code = new URLSearchParams(search).get(QR_PARAM)?.trim();
  if (code) storage()?.setItem(QR_CODE_KEY, code);
  return heldQrCode();
}

export function heldQrCode(): string | null {
  const held = storage()?.getItem(QR_CODE_KEY);
  if (!held) return null;
  return held;
}

export function forgetQrCode(): void {
  storage()?.removeItem(QR_CODE_KEY);
}

/** What the code opens: the same address whether scanned or shared. */
export function qrJoinUrl(code: string, origin: string = siteOrigin()): string {
  return `${origin}/join?${new URLSearchParams({ [QR_PARAM]: code }).toString()}`;
}

export interface QrCodeDetails {
  inviterName: string;
  eventName: string | null;
  joiningOpen: boolean;
  /** Only while joining is closed: who to ask. */
  contactEmail: string | null;
}

/** Null for a code that is unknown, turned off, or whose maker is no longer an administrator. */
export async function fetchQrCodeDetails(code: string): Promise<QrCodeDetails | null> {
  try {
    const { data, error } = await getSupabase()
      .rpc('qr_code_details', { p_code: code })
      .maybeSingle();
    const row: unknown = data;
    if (error || !row || typeof row !== 'object') return null;
    const r = row as Record<string, unknown>;
    if (typeof r.inviter_name !== 'string') return null;
    return {
      inviterName: r.inviter_name,
      eventName: typeof r.event_name === 'string' ? r.event_name : null,
      joiningOpen: r.joining_open === true,
      contactEmail: typeof r.contact_email === 'string' ? r.contact_email : null,
    };
  } catch {
    return null;
  }
}

/**
 * Records the held code against the signed-in account. Credit is a nicety:
 * nothing waits on it, and a failed call (offline) keeps the code for the next
 * sign-in. Only an answer lets it go.
 */
export async function claimHeldQrCode(): Promise<void> {
  const code = heldQrCode();
  if (!code) return;
  try {
    const { error } = await getSupabase().rpc('claim_qr_code', { p_code: code });
    if (!error) forgetQrCode();
  } catch {
    // Kept for the next try.
  }
}

/* ------------------------------------------------------ the administrator */

export interface MyQrCode {
  id: string;
  code: string;
  eventName: string | null;
  contactEmail: string;
  createdAt: string;
  turnedOffAt: string | null;
}

interface MyQrCodeRow {
  id: string;
  code: string;
  event_name: string | null;
  contact_email: string;
  created_at: string;
  turned_off_at: string | null;
}

function fromRow(row: MyQrCodeRow): MyQrCode {
  return {
    id: row.id,
    code: row.code,
    eventName: row.event_name,
    contactEmail: row.contact_email,
    createdAt: row.created_at,
    turnedOffAt: row.turned_off_at,
  };
}

/** The signed-in administrator's own codes, newest first. */
export async function fetchMyQrCodes(): Promise<
  { ok: true; codes: MyQrCode[] } | { ok: false; error: string }
> {
  try {
    const { data, error } = await getSupabase()
      .from('qr_codes')
      .select('id, code, event_name, contact_email, created_at, turned_off_at')
      .order('created_at', { ascending: false });
    if (error) return { ok: false, error: describeError(error, 'Could not load your codes.') };
    return { ok: true, codes: (data as MyQrCodeRow[]).map(fromRow) };
  } catch (e) {
    return { ok: false, error: describeThrown(e, 'Could not load your codes.') };
  }
}

export async function createQrCode(
  eventName: string | null,
  contactEmail: string,
): Promise<{ ok: true; code: MyQrCode } | { ok: false; error: string }> {
  try {
    const { data, error } = await getSupabase()
      .rpc('admin_create_qr_code', { p_event_name: eventName, p_contact_email: contactEmail })
      .single();
    if (error) return { ok: false, error: describeError(error, 'The code was not made.') };
    return { ok: true, code: fromRow(data as MyQrCodeRow) };
  } catch (e) {
    return { ok: false, error: describeThrown(e, 'The code was not made.') };
  }
}

export async function turnOffQrCode(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { error } = await getSupabase().rpc('admin_turn_off_qr_code', { p_code_id: id });
    return error
      ? { ok: false, error: describeError(error, 'The code was not turned off.') }
      : { ok: true };
  } catch (e) {
    return { ok: false, error: describeThrown(e, 'The code was not turned off.') };
  }
}
