import { ClubMark } from '@/components/club-mark';

/**
 * The first screen, matching the published demo: the mark, then the promise,
 * then what the club is.
 *
 * The logo carries "MEMBERS ONLY" on it, which is why the footer line beneath
 * the button is short — the badge has already said it.
 */
export function WelcomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="mx-auto flex h-dvh w-full max-w-[480px] flex-col bg-canvas">
      <div className="flex flex-1 flex-col justify-center overflow-y-auto px-[22px] py-8">
        <div className="flex justify-center">
          <ClubMark size={126} />
        </div>

        <h1 className="mt-9 text-center font-extrabold font-head text-[30px] text-ink leading-[1.14] tracking-[-0.03em]">
          Meet peers, mentors,
          <br />
          and find <em className="text-gold-dp not-italic">SCI events</em>.
        </h1>

        <p className="mt-4 text-center font-bold text-[15px] text-navy leading-[1.45]">
          An app built by people with SCI for people with SCI.
        </p>

        <p className="mt-3.5 text-center text-[14.2px] text-ink2 leading-[1.6]">
          A private community for people living with spinal cord injury. Ask the questions you can't
          ask anyone else, find the people who have already answered them, and get to something
          worth going to.
        </p>
      </div>

      <footer className="flex-none px-[18px] pt-3 pb-[max(22px,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onStart}
          className="flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-navy font-bold font-head text-[15px] text-white"
        >
          Join the club
        </button>
        <p className="mt-2.5 text-center text-[12.5px] text-grey">
          Members only. Nothing inside the club is public.
        </p>
      </footer>
    </div>
  );
}
