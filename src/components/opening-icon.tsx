import { Loader2 } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { TAP_AGAIN_AFTER_MS } from '@/lib/redirect-tap';

/**
 * A button's icon, swapped for a turning circle for a moment after each tap
 * that leaves for Apple, so the wait reads as loading (the owner, 2026-10-20).
 *
 * CSS delays only, no state to undo: closing Apple's page in the iPhone Home
 * Screen app leaves this page frozen, and a spinner waiting for a timer or an
 * event would turn forever (redirect-tap.ts). `taps` restarts it.
 */
export function OpeningIcon({ taps, children }: { taps: number; children: ReactNode }) {
  if (taps === 0) return <>{children}</>;
  return (
    <span
      key={taps}
      className="relative inline-flex"
      style={{ '--opening-for': `${TAP_AGAIN_AFTER_MS}ms` } as CSSProperties}
    >
      <span className="opening-icon inline-flex">{children}</span>
      <Loader2 aria-hidden="true" className="opening-spinner absolute inset-0 h-full w-full" />
    </span>
  );
}
