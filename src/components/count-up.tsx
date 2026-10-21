import { useLayoutEffect, useRef, useState } from 'react';
import { motionReduced } from '@/lib/accessibility';

const DURATION = 800;

/** No matchMedia means a test or an old browser: skip the count. */
function stillPlease(): boolean {
  return typeof window.matchMedia !== 'function' || motionReduced();
}

/**
 * A number that counts up to itself, after React Bits' Count Up, redrawn
 * without its motion library. From zero the first time, from the last number
 * after that. Script-driven, so the CSS kill switch cannot stop it: it checks
 * Reduce motion itself. A screen reader hears only the final number.
 */
export function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  // Where the count is now, so a new value carries on from there.
  const at = useRef(0);

  // Before paint, so the final number never flashes before the count starts.
  useLayoutEffect(() => {
    const start = at.current;
    if (start === value || stillPlease()) {
      at.current = value;
      setShown(value);
      return;
    }
    setShown(start);
    let frame = 0;
    const began = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - began) / DURATION);
      const eased = 1 - (1 - t) ** 3;
      at.current = Math.round(start + (value - start) * eased);
      setShown(at.current);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [value]);

  if (shown === value) return <>{value}</>;
  return (
    <>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true" className="tabular-nums">
        {shown}
      </span>
    </>
  );
}
