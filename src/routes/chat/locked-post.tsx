import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClubMark } from '@/components/club-mark';
import { fetchQrCodeDetails, QR_PARAM } from '@/lib/qr-codes';

/** Line widths of the made-up post. */
const LINES = ['w-full', 'w-[92%]', 'w-full', 'w-[78%]', 'w-[86%]', 'w-[54%]'];

/**
 * A link to a post, opened signed out (the owner, 2026-10-31): a post behind
 * blur, and the way in. The blur covers made-up shapes, never the post: words
 * sent to the browser could be read past any blur, and the club is private.
 */
export function LockedPost({ door }: { door: string }) {
  // A link an administrator shared to let people in (20261116200000), so
  // somebody who came by it knows they may join, and is asked to help answer
  // (the owner, 2026-11-16: "Help answer inside theSCIClub and contribute to
  // our knowledge base").
  const [inviter, setInviter] = useState<string | null>(null);
  useEffect(() => {
    const code = new URLSearchParams(door.split('?')[1] ?? '').get(QR_PARAM);
    if (!code) return;
    let live = true;
    void fetchQrCodeDetails(code).then((details) => {
      if (live && details?.admits) setInviter(details.inviterName);
    });
    return () => {
      live = false;
    };
  }, [door]);
  return (
    <main className="mx-auto min-h-dvh w-full max-w-[560px] bg-canvas pb-[max(28px,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between px-[18px] pt-[max(16px,env(safe-area-inset-top))] pb-3">
        <Link to={door} aria-label="The SCI Club">
          <ClubMark size={44} className="h-11 w-auto" />
        </Link>
      </header>

      <div className="grid px-[18px] pt-2">
        <div
          aria-hidden="true"
          data-testid="locked-post-shapes"
          className="rounded-[16px] border border-line bg-paper p-4 blur-[6px] [grid-area:1/1]"
        >
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 flex-none rounded-full bg-grey/40" />
            <div className="flex-1">
              <div className="h-3.5 w-2/5 rounded-full bg-grey/50" />
              <div className="mt-2 h-3 w-1/4 rounded-full bg-grey/30" />
            </div>
          </div>
          <div className="mt-5 h-5 w-4/5 rounded-full bg-grey/50" />
          {LINES.map((width) => (
            <div key={width} className={`mt-3.5 h-3.5 rounded-full bg-grey/30 ${width}`} />
          ))}
          <div className="mt-5 h-40 rounded-[12px] bg-grey/20" />
          <div className="mt-4 flex gap-3">
            <div className="h-8 w-16 rounded-full bg-grey/30" />
            <div className="h-8 w-16 rounded-full bg-grey/30" />
            <div className="h-8 w-16 rounded-full bg-grey/30" />
          </div>
        </div>

        <section className="z-10 mx-3 my-16 self-center rounded-[16px] border border-line bg-paper px-5 py-6 text-center shadow-lg [grid-area:1/1]">
          <h1 className="font-extrabold font-display text-[1.3125rem] text-ink leading-tight">
            {inviter
              ? 'Help answer inside The SCI Club'
              : 'Please sign in or join to see this post'}
          </h1>
          <p className="mt-2 text-[0.875rem] text-ink2 leading-[1.5]">
            {inviter
              ? 'Join to see it and contribute to our knowledge base. The club is a private community for people with spinal cord injury.'
              : "It's in The SCI Club, a private community for people with spinal cord injury."}
          </p>
          <Link
            to={door}
            className="mt-5 flex min-h-[48px] items-center justify-center rounded-[13px] bg-gold font-bold font-head text-[0.9375rem] text-on-gold"
          >
            Join the club
          </Link>
          <p className="mt-2 text-[0.8125rem] text-ink2">
            Already a member?{' '}
            <Link to={door} className="inline-block py-2 font-bold text-emphasis underline">
              Sign in
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
