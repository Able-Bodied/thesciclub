import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { readEmailLink, redeemEmailLink } from '@/lib/email-link';

/**
 * Where every emailed link opens (src/lib/email-link.ts): confirming an
 * address, resetting a password, approving a changed address. It spends the
 * link and reloads the page the link was for, carrying the outcome.
 */
export default function AuthConfirmPage() {
  const [link] = useState(() => readEmailLink(window.location.search, window.location.origin));
  const [failed, setFailed] = useState(false);

  const redeem = useCallback(() => {
    if (!link) return;
    setFailed(false);
    const url = import.meta.env.VITE_SUPABASE_URL as string;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    redeemEmailLink(link, url, key)
      .then((to) => {
        // A load, not navigate(): the client reads the outcome as it starts.
        window.location.replace(to);
      })
      .catch(() => {
        setFailed(true);
      });
  }, [link]);

  useEffect(() => {
    redeem();
  }, [redeem]);

  if (!link) {
    return (
      <Frame title="This link is not complete">
        Part of it may have been lost on the way. Open it again from the email, or ask for a new one
        from the sign-in screen.
        <Link
          to="/join"
          className="mt-6 flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-gold font-bold font-head text-on-gold text-[0.9375rem]"
        >
          Go to sign in
        </Link>
      </Frame>
    );
  }

  if (failed) {
    return (
      <Frame title="Could not check your link">
        The connection dropped. The link has not been used, so it can be tried again.
        <button
          type="button"
          onClick={redeem}
          className="mt-6 flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-gold font-bold font-head text-on-gold text-[0.9375rem]"
        >
          Try again
        </button>
      </Frame>
    );
  }

  return (
    <Frame title="One moment">
      <span role="status" className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Checking your link.
      </span>
    </Frame>
  );
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex h-dvh w-full max-w-[480px] flex-col bg-canvas px-[18px] pt-12">
      <h1 className="font-extrabold font-display text-[1.5625rem] text-ink leading-tight tracking-[-0.01em]">
        {title}
      </h1>
      <div className="mt-2.5 text-[0.8875rem] text-ink2 leading-[1.52]">{children}</div>
    </main>
  );
}
