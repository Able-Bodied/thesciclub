import { Link } from 'react-router-dom';
import { ClubMark } from '@/components/club-mark';
import { NewTabLink } from '@/routes/onboarding/steps';

/**
 * The first screen: the mark, the promise, then what the club is. The logo already says
 * "MEMBERS ONLY", so the footer line stays short.
 *
 * Centred with `my-auto`, not `justify-center`: a flex box centring content taller than itself
 * puts the overflow above the top, out of scroll's reach (the owner, 2026-10-01).
 *
 * The badge and gaps shrink with window height (badge 96-196px; 96px is the brand README minimum)
 * to fit a 550px laptop window; on phones 740px tall or less, 64-120px (the owner, 2026-11-03).
 * Text never shrinks: legibility over looks. When it still overflows, the scrollbar is hidden,
 * safe only because the box holds no controls and both buttons sit in the footer.
 */
export function WelcomeScreen({
  onJoin,
  onSignIn,
  joiningOpen = false,
  registered = null,
}: {
  onJoin: () => void;
  onSignIn: () => void;
  /** Anybody can join right now (20261014000000): nobody needs an invite to ask for. */
  joiningOpen?: boolean;
  /** Just registered for a public event (src/lib/event-audience.ts). */
  registered?: { organizer?: string } | null;
}) {
  return (
    <main className="mx-auto flex h-dvh w-full max-w-[480px] flex-col bg-canvas">
      {/* The same words whoever registered: never whether an address is a
          member's. A registration is not an invite (20261022230000). */}
      {registered ? (
        <div
          role="status"
          className="mx-[18px] mt-[max(14px,env(safe-area-inset-top))] flex-none rounded-[13px] border-gold border-l-4 bg-gold-lt px-3.5 py-3 text-[0.875rem] text-ink leading-[1.45]"
        >
          {/* Kept simple (the owner, 2026-10-24): the form already said the
              host's own registration may be needed. */}
          <b className="font-extrabold font-head">You're on our list.</b> Join the club to see who's
          coming and join the group chat.
        </div>
      ) : null}
      <div className="scrollbar-hidden flex flex-1 flex-col overflow-y-auto px-[22px] py-[clamp(12px,4dvh,32px)] [@media(max-height:740px)]:py-2.5">
        <div className="my-auto">
          {/* The club's name above everything, SCI in gold (the owner,
              2026-11-03). */}
          <h1 className="mb-[clamp(12px,3dvh,24px)] [@media(max-height:740px)]:mb-2 text-center font-extrabold font-display text-[2.125rem] text-ink leading-[1.1] tracking-[-0.01em]">
            The <span className="text-gold-dp">SCI</span> Club
          </h1>

          <div className="flex justify-center">
            <ClubMark
              size={126}
              className="h-[clamp(96px,22dvh,196px)] w-auto [@media(max-height:740px)]:h-[clamp(64px,12dvh,120px)]"
            />
          </div>

          <h2 className="mt-[clamp(16px,4dvh,36px)] [@media(max-height:740px)]:mt-3 text-center font-extrabold font-display text-[1.875rem] text-ink leading-[1.14] tracking-[-0.01em]">
            Meet peers, mentors,
            <br />
            and find <em className="text-gold-dp not-italic">SCI events</em>.
          </h2>

          <p className="mt-4 [@media(max-height:740px)]:mt-2 text-center font-bold text-[0.9375rem] text-emphasis leading-[1.45]">
            An app built by people with SCI for people with SCI.
          </p>

          <p className="mt-3.5 [@media(max-height:740px)]:mt-2 text-center text-[0.8875rem] text-ink2 leading-[1.6]">
            A private community for people living with spinal cord injury. Ask the questions you
            can't ask anyone else, find the people who have already answered them, and get to
            something worth going to.
          </p>
        </div>
      </div>

      <footer className="flex-none px-[18px] pt-3 pb-[max(22px,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onJoin}
          className="flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-action font-bold font-head text-[0.9375rem] text-white"
        >
          Join the club
        </button>
        <button
          type="button"
          onClick={onSignIn}
          className="mt-2 flex min-h-[44px] w-full items-center justify-center rounded-[13px] border-[1.6px] border-emphasis font-bold font-head text-[0.9375rem] text-emphasis"
        >
          I already have an account
        </button>
        <p className="mt-2.5 text-center text-[0.78125rem] text-grey">
          <b className="font-bold">Members only.</b> Nothing inside the club is public.
        </p>
        {/* The request page for somebody with no invite (the owner, 2026-10-28); the blocked
            screen offers the same. */}
        {joiningOpen ? null : (
          <p className="mt-1.5 text-center text-[0.78125rem] text-grey">
            No invite yet?{' '}
            <Link
              to="/request-invite"
              className="font-bold text-emphasis underline decoration-2 underline-offset-2"
            >
              Request an invite
            </Link>
          </p>
        )}
        {/* On the first screen, so the terms are readable before anything is
            asked of anybody. */}
        <p className="mt-1.5 text-center text-[0.78125rem] text-grey">
          <NewTabLink href="/privacy">Privacy Policy</NewTabLink> ·{' '}
          <NewTabLink href="/terms">Terms of Service</NewTabLink>
        </p>
      </footer>
    </main>
  );
}
