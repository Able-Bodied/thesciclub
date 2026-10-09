import { ClubMark } from '@/components/club-mark';
import { NewTabLink } from '@/routes/onboarding/steps';

/**
 * The first screen, matching the published demo: the mark, then the promise,
 * then what the club is.
 *
 * The logo carries "MEMBERS ONLY" on it, which is why the footer line beneath
 * the button is short — the badge has already said it.
 *
 * ---------------------------------------------------------------------------
 * Centred by its own margins, not by the box
 * ---------------------------------------------------------------------------
 * The column above the buttons is centred vertically when there is room and
 * scrolls when there is not — a short window, a zoomed browser, the larger
 * text size. It used to be centred with `justify-center` on the scrolling
 * box, and a flex box that centres content taller than itself puts half the
 * overflow above the top, where no scroll can reach it: the owner saw the
 * scrollbar on 2026-10-01, and at one size more the top of the logo would
 * have been cut off. `my-auto` on the column does the same centring with
 * room to spare and, without it, starts the content at the top and lets it
 * scroll, which is what the other onboarding steps already do.
 *
 * ---------------------------------------------------------------------------
 * It fits a short window, and draws no scrollbar when it cannot
 * ---------------------------------------------------------------------------
 * With the Windows taskbar showing, a laptop browser is about 550px tall and
 * the column overflowed by 97px, so the box drew a scrollbar beside the
 * introduction (the owner, 2026-10-01). The badge and the gaps around it now
 * shrink with the window's height — the badge never below the 96px the brand
 * README sets as its minimum, never above its old 196px — so at the normal
 * text size it fits a 550px laptop window and every phone from 360px wide
 * held upright. The text does not shrink: the owner's rule is legibility
 * over looks.
 *
 * Below that, or at a larger text size, it still cannot fit, and the box
 * scrolls with its bar hidden (`scrollbar-hidden`). That is safe here and
 * would not be on a list: nothing in the box is a control, and both buttons
 * are in the footer, which never scrolls away.
 */
export function WelcomeScreen({ onJoin, onSignIn }: { onJoin: () => void; onSignIn: () => void }) {
  return (
    <main className="mx-auto flex h-dvh w-full max-w-[480px] flex-col bg-canvas">
      <div className="scrollbar-hidden flex flex-1 flex-col overflow-y-auto px-[22px] py-[clamp(12px,4dvh,32px)]">
        <div className="my-auto">
          <div className="flex justify-center">
            <ClubMark size={126} className="h-[clamp(96px,22dvh,196px)] w-auto" />
          </div>

          <h1 className="mt-[clamp(16px,4dvh,36px)] text-center font-extrabold font-display text-[1.875rem] text-ink leading-[1.14] tracking-[-0.01em]">
            Meet peers, mentors,
            <br />
            and find <em className="text-gold-dp not-italic">SCI events</em>.
          </h1>

          <p className="mt-4 text-center font-bold text-[0.9375rem] text-emphasis leading-[1.45]">
            An app built by people with SCI for people with SCI.
          </p>

          <p className="mt-3.5 text-center text-[0.8875rem] text-ink2 leading-[1.6]">
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
          Members only. Nothing inside the club is public.
        </p>
        {/* On the first screen, not only beside the boxes a press later: /join
            is the opt-in page the text-message registration names, and the
            carriers' reviewers look for the Privacy Policy linked from it
            (Twilio error 30908, rejected again 2026-10-09). */}
        <p className="mt-1.5 text-center text-[0.78125rem] text-grey">
          <NewTabLink href="/privacy">Privacy Policy</NewTabLink> ·{' '}
          <NewTabLink href="/terms">Terms of Service</NewTabLink>
        </p>
      </footer>
    </main>
  );
}
