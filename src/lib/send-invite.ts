import { getSupabase } from '@/lib/supabase';

/**
 * Emails an invite's one-time link, through the `send-invite` edge function.
 *
 * The function decides who may send and when (not yours → 404, sent under a
 * minute ago → 429, and so on); this only turns its answers into sentences.
 * Sending again makes a new link and ends the old one, which is why "Resend"
 * is the same call as the first send.
 */
export type SendInviteResult = { ok: true } | { ok: false; error: string; status?: number };

const BY_STATUS: Record<number, string> = {
  401: 'Sign in again, then try once more.',
  404: 'That invite is not there any more.',
  409: 'That invite is no longer waiting, so there is nothing to send.',
  422: 'That invite has no email address. Invite them by email instead.',
  429: 'A link went to them less than a minute ago. Give it a minute.',
  502: 'The email service did not take it. Try again in a minute.',
};

/**
 * What to say when the invite was added and only the email failed. Said so
 * plainly because the person at the form has already spent a slot and may be
 * about to add the same address again.
 */
export const SEND_FAILED = 'The invite is on the list, but the email did not go out. Use Resend.';

export const addedButNotSent = (reason: string): string =>
  `The invite is on the list, but the email did not go out. ${reason}`;

export async function sendInvite(inviteId: string): Promise<SendInviteResult> {
  // Not destructured: the client types the result's data as `any`.
  const result = await getSupabase().functions.invoke('send-invite', {
    body: { invite_id: inviteId },
  });
  const failure: unknown = result.error;
  if (!failure) return { ok: true };
  // A non-2xx carries the Response as `context`; a network failure has none.
  const context = (failure as { context?: unknown }).context;
  const status =
    typeof context === 'object' && context !== null && 'status' in context
      ? Number(context.status)
      : undefined;
  return {
    ok: false,
    error:
      (status === undefined ? undefined : BY_STATUS[status]) ??
      'The email service could not be reached. Try again in a minute.',
    ...(status === undefined ? {} : { status }),
  };
}
