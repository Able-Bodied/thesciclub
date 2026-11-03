import { useId, useState } from 'react';
import { findFilterPlace, setFilterPlace, useFilterPlace } from '@/lib/filter-place';
import type { NearHomeStatus } from '@/lib/near-home';

/**
 * "Within 20 miles of San Jose", a slider from 5 miles to 200, and one stop
 * past that for any distance (the owner, 2026-10-20). Change, beside the
 * city, measures from another city, state or ZIP code instead (the owner,
 * 2026-11-03; filter-place.ts), for Events, Peers and Organizations at once.
 */

export const MIN_MILES = 5;
export const MAX_MILES = 200;
const STEP = 5;
/** The stop past MAX_MILES that means any distance. */
const ANY = MAX_MILES + STEP;

export function distanceLabel(miles: number | null, city: string | null): string {
  if (miles === null) return 'Any distance';
  return city ? `Within ${miles} miles of ${city}` : `Within ${miles} miles`;
}

const LINK = 'min-h-[36px] font-bold text-[0.8125rem] text-emphasis underline underline-offset-2';

export function DistanceFilter({
  miles,
  city,
  status,
  onChange,
  things = 'events',
  note = 'From the middle of your city. Online events count from their host’s city.',
}: {
  miles: number | null;
  city: string | null;
  status: NearHomeStatus;
  onChange: (miles: number | null) => void;
  /** What every distance shows of, while nothing can be measured. */
  things?: string;
  /** Under the slider, once distances are working. */
  note?: string;
}) {
  const id = useId();
  const chosen = useFilterPlace();
  const from = chosen?.label ?? city;
  const label = distanceLabel(miles, from);
  const [editing, setEditing] = useState(false);
  const [typed, setTyped] = useState('');
  const [looking, setLooking] = useState(false);
  const [notFound, setNotFound] = useState(false);

  async function look() {
    if (!typed.trim() || looking) return;
    setLooking(true);
    setNotFound(false);
    const place = await findFilterPlace(typed);
    setLooking(false);
    if (!place) {
      setNotFound(true);
      return;
    }
    setFilterPlace(place);
    setEditing(false);
    setTyped('');
  }

  return (
    <section className="mb-4">
      <h3 className="mb-2 font-extrabold font-head text-[0.71875rem] text-grey uppercase tracking-[0.13em]">
        Distance
      </h3>
      <p className="flex flex-wrap items-center gap-x-2">
        <label htmlFor={id} className="font-bold text-[0.9375rem] text-ink">
          {label}
        </label>
        {miles !== null && !editing ? (
          <button
            type="button"
            onClick={() => {
              setEditing(true);
            }}
            className={LINK}
            data-target="small"
          >
            Change
          </button>
        ) : null}
      </p>
      {editing ? (
        <form
          className="mt-2 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void look();
          }}
        >
          <input
            // biome-ignore lint/a11y/noAutofocus: opened by a tap on Change, to type into.
            autoFocus
            aria-label="City, state or ZIP code"
            placeholder="City, state or ZIP code"
            autoComplete="off"
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value);
              setNotFound(false);
            }}
            className="min-h-[44px] min-w-0 flex-1 rounded-[11px] border-[1.6px] border-line bg-paper px-3 text-[0.9375rem] text-ink outline-none focus:border-emphasis"
          />
          <button
            type="submit"
            disabled={looking || !typed.trim()}
            className="min-h-[44px] rounded-[11px] bg-action px-4 font-bold font-head text-[0.875rem] text-white disabled:opacity-50"
          >
            {looking ? 'Finding…' : 'Use'}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setTyped('');
              setNotFound(false);
            }}
            className={LINK}
            data-target="small"
          >
            Cancel
          </button>
          {notFound ? (
            <p role="alert" className="w-full text-[0.8125rem] text-destructive leading-[1.45]">
              Could not find that place. Try a city and state, such as Portland, OR, or a ZIP code.
            </p>
          ) : null}
        </form>
      ) : null}
      {chosen && !editing ? (
        <button
          type="button"
          onClick={() => {
            setFilterPlace(null);
          }}
          className={LINK}
          data-target="small"
        >
          {city ? `Back to ${city}` : 'Back to home'}
        </button>
      ) : null}
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
        {status === 'error'
          ? 'Could not check distances just now, so every distance shows.'
          : chosen
            ? `From the middle of ${chosen.label}.`
            : status === 'unplaced'
              ? city
                ? `${city} isn't on our map yet, so ${things} at every distance show for now. It's added overnight.`
                : 'Add your city in Me, Your details, to see what is near you. Until then, every distance shows.'
              : note}
      </p>
    </section>
  );
}
