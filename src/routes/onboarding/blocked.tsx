import { ShieldCheck } from 'lucide-react';
import type { QrCodeDetails } from '@/lib/qr-codes';
import { AskForInvite } from '@/routes/onboarding/sign-in-steps';
import { InviteRequestPanel } from '@/routes/request-invite/request-panel';

/**
 * The address is not on the list: refused at sign-up, before any email
 * (20261012040000), or confirmed and then found not invited, as Google and
 * Apple are after their round trip.
 *
 * Written as a closed door rather than as an error, because it is one. It names
 * the organizations who can open it, so somebody who wants in knows exactly
 * what to do next — a dead end with no route out of it is the thing that makes
 * an invite-only product feel like a snub rather than a club.
 *
 * "Ask somebody you know for an invite" was removed (the owner, 2026-10-10).
 * This screen keeps the consultation link only.
 *
 * ---------------------------------------------------------------------------
 * The list is read, not written here
 * ---------------------------------------------------------------------------
 * It used to be three hardcoded rows. That was wrong the moment Wheel with Me
 * stopped being able to issue invites: this screen would have kept telling a
 * newly injured person to contact a foundation that cannot add them, at the
 * worst possible moment to be sent to the wrong place.
 *
 * `can_invite` is the one fact that decides who belongs here, so the screen
 * asks the database for it: invite_request_choices() (20261029030000), which
 * also gives each organization's org admins by first name. Tapping one opens
 * the request form right here, with the refused address filled in (the
 * owner, 2026-10-28: "save them a click").
 *
 * When the query fails there is no fallback list, deliberately. The sentence
 * above it still says a member organization or a mentor has to invite the address,
 * and "Sign out and try another email" still works — a shorter true page beats a complete
 * one that might name the wrong body.
 */

export function BlockedScreen({
  onTryAnother,
  email,
  signedIn = true,
  fromCode = null,
}: {
  /** Signs them out (when signed in) and goes back to the doors. */
  onTryAnother: () => void;
  /** The address they signed in with, so they can see which one was refused. */
  email: string | null;
  /** False when the join form was refused: there is no account to sign out of. */
  signedIn?: boolean;
  /** An administrator's QR code they came by (20261014020000): who to ask. */
  fromCode?: QrCodeDetails | null;
}) {
  return (
    <main className="mx-auto flex h-dvh w-full max-w-[480px] flex-col bg-canvas">
      <div className="flex-1 overflow-y-auto px-[18px] pt-12">
        <div className="grid h-14 w-14 place-items-center rounded-[18px] bg-gold-lt text-gold-dp">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="mt-4 font-extrabold font-display text-[1.5625rem] text-ink leading-tight tracking-[-0.01em]">
          This email isn't on the list
        </h1>
        <p className="mt-2.5 text-[0.8875rem] text-ink2 leading-[1.52]">
          {email ? <b className="text-ink">{email}</b> : 'This account'} has not been invited.
        </p>
        {/* Only while joining is closed: open, the code would have let them
            in, so whatever refused them is not something to ask about. */}
        {fromCode && !fromCode.joiningOpen && !fromCode.admits ? (
          <p className="mt-3 rounded-[14px] border border-line bg-paper p-3.5 text-[0.9375rem] text-ink leading-[1.52]">
            <AskForInvite who={fromCode} />
          </p>
        ) : null}
        <InviteRequestPanel initialEmail={email ?? ''} />

        {/* No consultation call here for now (the owner, 2026-10-25); it may
            come back, with CONSULTATION_URL as on the welcome screen. */}

        {fromCode && !fromCode.joiningOpen && !fromCode.admits ? null : (
          <p className="mt-4 text-[0.78125rem] text-grey leading-[1.5]">
            An organization's QR code or link lets you in only until it expires or is turned off.
            Otherwise someone has to invite your email address.
          </p>
        )}
      </div>

      <footer className="flex-none px-[18px] pt-3 pb-[max(22px,env(safe-area-inset-bottom))]">
        {/* Above the way out, which is what they say to do (the owner, 2026-10-28). */}
        <p className="mb-3 text-[0.8125rem] text-ink2 leading-[1.5]">
          {signedIn
            ? 'You may have joined with another email. If you were invited, open the link in your invitation while signed in, or sign in with the address it was sent to.'
            : 'If you were invited, use the address your invitation was sent to, or open the link in your invitation and join from there.'}
        </p>
        <button
          type="button"
          onClick={onTryAnother}
          className="flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-gold font-bold font-head text-on-gold text-[0.9375rem]"
        >
          {signedIn ? 'Sign out and try another email' : 'Try another email'}
        </button>
      </footer>
    </main>
  );
}
