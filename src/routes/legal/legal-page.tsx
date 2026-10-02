import { ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * The frame the Privacy Policy and the Terms of Service sit in.
 *
 * Outside the shell and outside `RequireMember`, because the people who most
 * need to read them have no account yet: somebody on the phone step, and the
 * carrier reviewers who check the text-message registration against them.
 * Its own `main`, as onboarding has, so a route change still has somewhere to
 * put focus.
 *
 * The way out goes to `/`, which sends a member to Home and anybody else to
 * the welcome screen. Not `navigate(-1)`: the phone step opens these in a new
 * tab, where there is nothing behind them.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto min-h-dvh w-full max-w-[680px] bg-canvas px-[18px] pt-3 pb-[max(32px,env(safe-area-inset-bottom))] outline-none"
    >
      <Link
        to="/"
        data-target="small"
        className="-ml-1.5 inline-flex min-h-[36px] items-center gap-0.5 py-1.5 font-semibold text-[0.875rem] text-navy"
      >
        <ChevronLeft className="h-4 w-4" />
        The SCI Club
      </Link>
      <h1 className="mt-3 font-extrabold font-display text-[1.75rem] text-ink leading-tight tracking-[-0.01em]">
        {title}
      </h1>
      <p className="mt-1.5 text-[0.8125rem] text-grey">Last updated {updated}</p>
      <div className="mt-5 text-[0.9375rem] text-ink2 leading-[1.6]">{children}</div>
    </main>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7 first:mt-0">
      <h2 className="font-extrabold font-head text-[1.125rem] text-ink leading-snug">{title}</h2>
      {children}
    </section>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-2.5">{children}</p>;
}

export function List({ children }: { children: React.ReactNode }) {
  return <ul className="mt-2.5 list-disc space-y-1.5 pl-5">{children}</ul>;
}

/** The address every question about either page goes to. */
export const CONTACT_EMAIL = 'info@ablebodied.org';

export function ContactEmail() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-navy underline">
      {CONTACT_EMAIL}
    </a>
  );
}
