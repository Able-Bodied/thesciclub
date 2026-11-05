import { useEffect, useRef } from 'react';
import { cardsShown } from '@/lib/page-speed';

/**
 * Put where a screen's cards are drawn with their data (the owner,
 * 2026-11-04): page speed times how long they took (src/lib/page-speed.ts).
 *
 * Once per mount. A kept tab runs its effects again each time it is shown,
 * with its cards already there; that is not a load, so it is not timed. A
 * reload shows the placeholders again, which unmounts this, and the next
 * cards are timed afresh.
 */
export function CardsShown() {
  const reported = useRef(false);
  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    cardsShown();
  }, []);
  return null;
}
