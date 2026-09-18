import { ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * Back, to a named screen.
 *
 * Deliberately a Link with a fixed destination rather than `navigate(-1)`,
 * which is what the member profile uses. That screen is reachable from two
 * places, so history is the only honest answer to "back" there and the label
 * has to be worked out. These are reachable from one — the Invites card on Me
 * — so naming the destination is both true and sturdier: `navigate(-1)` on a
 * deep link or a refresh leaves the app entirely while the label still says Me.
 */
export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      data-target="small"
      className="-ml-1.5 inline-flex min-h-[36px] items-center gap-0.5 py-1.5 font-semibold text-[0.875rem] text-navy"
    >
      <ChevronLeft className="h-4 w-4" />
      {label}
    </Link>
  );
}
