/**
 * The first screen. It has one job: say what this is and who it is for, so the
 * phone number on the next screen feels like joining something rather than
 * filling in a form.
 */
export function WelcomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="mx-auto flex h-dvh w-full max-w-[480px] flex-col bg-canvas">
      <div className="flex flex-1 flex-col justify-center overflow-y-auto px-6">
        <h1 className="font-extrabold font-head text-[32px] text-ink leading-[1.12] tracking-[-0.03em]">
          Meet peers, mentors,
          <br />
          and find <em className="text-gold-dp not-italic">SCI events</em>.
        </h1>
        <p className="mt-3.5 font-semibold text-[15px] text-ink2">
          An app built by people with SCI, for people with SCI.
        </p>
        <p className="mt-3 text-[14.2px] text-ink2 leading-[1.55]">
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
