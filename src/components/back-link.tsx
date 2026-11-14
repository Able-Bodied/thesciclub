import { ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * Back, to a named screen.
 *
 * A fixed destination keeps the label true after tab switches, shared links
 * or refreshes, when browser history may point at an unrelated screen.
 */
export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      data-target="small"
      className="-ml-1.5 inline-flex min-h-[36px] items-center gap-0.5 py-1.5 font-semibold text-[0.875rem] text-emphasis"
    >
      <ChevronLeft className="h-4 w-4" />
      {label}
    </Link>
  );
}
