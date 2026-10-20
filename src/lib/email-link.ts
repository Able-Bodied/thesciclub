/**
 * The club's emailed links, which open thesciclub.com/auth/confirm.html.
 *
 * Supabase's own links went to its project address on supabase.co, a random
 * name under a different domain from the sender, and the owner's confirmation
 * through Hide My Email landed in spam (2026-10-19). The templates in
 * supabase/templates/ now link here with the link's token_hash, and this
 * redeems it with Supabase's verify endpoint.
 *
 * It does not sign in itself. It reloads the destination with the address
 * Supabase's own redirect would have had, `#access_token=…` or `#error=…`, so
 * the client takes it through the same door: url-session.ts still refuses a
 * link for another account, recovery-link.ts still hears PASSWORD_RECOVERY,
 * and every page still reads an expired link as it did.
 */

export type EmailLinkType = 'email' | 'recovery' | 'email_change';

/** Where each kind goes when the link names nowhere usable. */
const FALLBACK: Record<EmailLinkType, string> = {
  email: '/join?confirmed=1',
  recovery: '/reset-password',
  email_change: '/me?email=changed',
};

/** The `type` Supabase's own redirect writes, which supabase-js reads. */
const REDIRECT_TYPE: Record<EmailLinkType, string> = {
  email: 'signup',
  recovery: 'recovery',
  email_change: 'email_change',
};

export interface EmailLink {
  type: EmailLinkType;
  tokenHash: string;
  /** A path on this site, with its query. */
  to: string;
}

function isType(value: string | null): value is EmailLinkType {
  return value === 'email' || value === 'recovery' || value === 'email_change';
}

/** Only this site: anybody can write a link with `next` set to somewhere else. */
function sameSite(next: string | null, origin: string): string | null {
  if (!next) return null;
  try {
    const url = new URL(next, origin);
    if (url.origin !== origin) return null;
    if (url.pathname === '/' && !url.search) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

export function readEmailLink(search: string, origin: string): EmailLink | null {
  const params = new URLSearchParams(search);
  const type = params.get('type');
  const tokenHash = params.get('token_hash');
  if (!isType(type) || !tokenHash) return null;
  return { type, tokenHash, to: sameSite(params.get('next'), origin) ?? FALLBACK[type] };
}

interface VerifyAnswer {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  msg?: string;
  message?: string;
  error?: string;
  error_code?: string;
  error_description?: string;
}

/** The address fragment Supabase's redirect would have carried. */
export function fragmentFor(link: EmailLink, ok: boolean, answer: VerifyAnswer): string {
  const fields: Record<string, string> = {};
  if (ok && answer.access_token && answer.refresh_token) {
    fields.access_token = answer.access_token;
    fields.expires_at = String(answer.expires_at ?? '');
    fields.expires_in = String(answer.expires_in ?? '');
    fields.refresh_token = answer.refresh_token;
    fields.token_type = answer.token_type ?? 'bearer';
    fields.type = REDIRECT_TYPE[link.type];
  } else if (ok) {
    // One of a changed address's two links: the other is still to open.
    fields.message = answer.msg ?? answer.message ?? '';
  } else {
    fields.error = 'access_denied';
    fields.error_code = answer.error_code ?? answer.error ?? 'unexpected_failure';
    fields.error_description =
      answer.msg ??
      answer.error_description ??
      answer.message ??
      'Email link is invalid or has expired';
  }
  return `#${new URLSearchParams(fields)}`;
}

/** Redeemed once per token, so a second render cannot spend it again. */
const redeeming = new Map<string, Promise<string>>();

/**
 * The outcome, for the tab, until it is used: a release can reload the page
 * between spending the link and leaving (src/lib/stay-current.ts), and the
 * reload would find the link spent.
 */
const OUTCOME_KEY = 'club:email-link:';

function keptOutcome(tokenHash: string): string | null {
  try {
    const to = sessionStorage.getItem(OUTCOME_KEY + tokenHash);
    sessionStorage.removeItem(OUTCOME_KEY + tokenHash);
    return to;
  } catch {
    return null;
  }
}

function keepOutcome(tokenHash: string, to: string): void {
  try {
    sessionStorage.setItem(OUTCOME_KEY + tokenHash, to);
  } catch {
    // Storage blocked: a reload here says the link no longer works.
  }
}

/**
 * Spends the link and says where to go. Throws only when Supabase could not
 * be reached, which leaves the link unspent for another try.
 */
export function redeemEmailLink(
  link: EmailLink,
  supabaseUrl: string,
  key: string,
  send: typeof fetch = fetch,
): Promise<string> {
  const known = redeeming.get(link.tokenHash);
  if (known) return known;
  const work = (async () => {
    const kept = keptOutcome(link.tokenHash);
    if (kept) return kept;
    const response = await send(`${supabaseUrl}/auth/v1/verify`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: link.type, token_hash: link.tokenHash }),
    });
    const answer = (await response.json().catch(() => ({}))) as VerifyAnswer;
    const to = `${link.to}${fragmentFor(link, response.ok, answer)}`;
    keepOutcome(link.tokenHash, to);
    return to;
  })();
  redeeming.set(link.tokenHash, work);
  work.catch(() => redeeming.delete(link.tokenHash));
  return work;
}
