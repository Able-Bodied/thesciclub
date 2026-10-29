import { ChevronLeft } from 'lucide-react';
import { Children, isValidElement, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

/**
 * The frame the legal pages sit in.
 *
 * Outside the shell and outside `RequireMember`: somebody joining reads them
 * before they have an account, and store reviewers with none at all. Its own
 * `main`, so a route change still has somewhere to put focus.
 *
 * The way out goes to `/`, which sends a member to Home and anybody else to
 * the welcome screen. Not `navigate(-1)`: onboarding opens these in a new
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
  // Every Section, in order, for Contents (the owner, 2026-10-28).
  const sections = Children.toArray(children).flatMap((child) =>
    isValidElement<{ title: string }>(child) && child.type === Section ? [child.props.title] : [],
  );
  // A link to one section (/terms#…) opens at it; the router does not.
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
  }, [hash]);
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto min-h-dvh w-full max-w-[680px] bg-canvas px-[18px] pt-3 pb-[max(32px,env(safe-area-inset-bottom))] outline-none"
    >
      <Link
        to="/"
        data-target="small"
        className="-ml-1.5 inline-flex min-h-[36px] items-center gap-0.5 py-1.5 font-semibold text-[0.875rem] text-emphasis"
      >
        <ChevronLeft className="h-4 w-4" />
        The SCI Club
      </Link>
      <h1 className="mt-3 font-extrabold font-display text-[1.75rem] text-ink leading-tight tracking-[-0.01em]">
        {title}
      </h1>
      <p className="mt-1.5 text-[0.8125rem] text-grey">Last updated {updated}</p>
      {sections.length > 1 ? <Contents titles={sections} /> : null}
      <div className="mt-5 text-[0.9375rem] text-ink2 leading-[1.6]">{children}</div>
    </main>
  );
}

/** A section's address on its page, as /terms#losing-your-membership. */
export function sectionId(title: string): string {
  return title
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** The Terms' "Losing your membership", linked from Me's Standing card. */
export const LOSING_MEMBERSHIP_ID = sectionId('Losing your membership');

/** A link to each section, under the title. */
function Contents({ titles }: { titles: string[] }) {
  return (
    <nav
      aria-labelledby="legal-contents"
      className="mt-5 rounded-[14px] border border-line bg-paper p-4"
    >
      <h2 id="legal-contents" className="font-extrabold font-head text-[1rem] text-ink">
        Contents
      </h2>
      <ol className="mt-2 list-decimal pl-5 text-[0.875rem] sm:columns-2 sm:gap-x-8">
        {titles.map((title) => (
          <li key={title} className="break-inside-avoid">
            <a
              href={`#${sectionId(title)}`}
              className="inline-flex min-h-[36px] items-center font-semibold text-emphasis underline decoration-emphasis/30 underline-offset-2 hover:decoration-emphasis"
            >
              {title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section id={sectionId(title)} className="mt-7 scroll-mt-4 first:mt-0">
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

export function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="mt-2.5 list-decimal space-y-1.5 pl-5">{children}</ol>;
}

/** A boxed section ahead of the rest, such as what changed. */
export function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[14px] border border-line bg-paper p-4">
      <h2 className="font-extrabold font-head text-[1.125rem] text-ink leading-snug">{title}</h2>
      {children}
    </section>
  );
}

/** A link to a page outside the club. */
export function OutsideLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="font-semibold text-emphasis underline">
      {children}
    </a>
  );
}

/** The address every question about the legal pages goes to. */
export const CONTACT_EMAIL = 'hello@thesciclub.com';

export function ContactEmail({ subject }: { subject?: string }) {
  const query = subject ? `?subject=${encodeURIComponent(subject)}` : '';
  return (
    <a href={`mailto:${CONTACT_EMAIL}${query}`} className="font-semibold text-emphasis underline">
      {CONTACT_EMAIL}
    </a>
  );
}
