import { useId } from 'react';
import type { NearHomeStatus } from '@/lib/near-home';

/**
 * "Within 20 miles of San Jose", a slider from 5 miles to 100, and one stop
 * past that for any distance (the owner, 2026-10-20).
 */

export const MIN_MILES = 5;
export const MAX_MILES = 100;
const STEP = 5;
/** The stop past MAX_MILES that means any distance. */
const ANY = MAX_MILES + STEP;

export function distanceLabel(miles: number | null, city: string | null): string {
  if (miles === null) return 'Any distance';
  return city ? `Within ${miles} miles of ${city}` : `Within ${miles} miles`;
}

export function DistanceFilter({
  miles,
  city,
  status,
  onChange,
}: {
  miles: number | null;
  city: string | null;
  status: NearHomeStatus;
  onChange: (miles: number | null) => void;
}) {
  const id = useId();
  const label = distanceLabel(miles, city);

  return (
    <section className="mb-4">
      <h3 className="mb-2 font-extrabold font-head text-[0.71875rem] text-grey uppercase tracking-[0.13em]">
        Distance
      </h3>
      <label htmlFor={id} className="block font-bold text-[0.9375rem] text-ink">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={MIN_MILES}
        max={ANY}
        step={STEP}
        value={miles ?? ANY}
        aria-valuetext={label}
        onChange={(e) => {
          const value = Number(e.target.value);
          onChange(value >= ANY ? null : value);
        }}
        className="mt-2 h-11 w-full cursor-pointer accent-[var(--color-action)]"
      />
      <div className="flex justify-between text-[0.75rem] text-grey" aria-hidden="true">
        <span>{MIN_MILES} mi</span>
        <span>{MAX_MILES} mi</span>
        <span>Any</span>
      </div>
      <p className="mt-1.5 text-[0.78125rem] text-grey leading-[1.5]">
        {status === 'unplaced'
          ? city
            ? `${city} isn't on our map yet, so events at every distance show for now. It's added overnight.`
            : 'Add your city in Me, Your details, to see what is near you. Until then, every distance shows.'
          : status === 'error'
            ? 'Could not check distances just now, so every distance shows.'
            : 'From the middle of your city. Online events count from their host’s city.'}
      </p>
    </section>
  );
}
