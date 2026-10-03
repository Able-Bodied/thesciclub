import { type RefObject, useRef } from 'react';
import {
  cleanPart,
  type DatePart,
  type DateParts,
  type DateReading,
  partIsFull,
  splitWholeDate,
} from '@/lib/date-parts';
import { cn } from '@/lib/utils';

/**
 * A date as three typed boxes, used everywhere the app asks for one — see
 * `lib/date-parts.ts` for why boxes and not a calendar.
 *
 * Each box has a visible label of its own, so "tap Year" works in voice
 * control and a screen reader names it. The boxes grow to fill the row, as
 * large a target as the line allows, and wrap rather than shrink when text is
 * made larger.
 *
 * The cursor moves to the next box once one is full, at the owner's word
 * (2026-10-01): a box filled is a tap saved, and a tap costs most to somebody
 * using a mouth stick or a head pointer. The common worry with it is a voice
 * or switch user losing their place, so it moves only when typing forward
 * fills a box that can take no more (`partIsFull`) — never on a value that is
 * wrong, never on a month typed as a name, never when the cursor is mid-box —
 * and Backspace in an empty box goes back, so fixing a slip works both ways.
 */

const LABELS: Record<DatePart, string> = { month: 'Month', day: 'Day', year: 'Year' };

/** Room for "September", for two digits, for four. */
const BASIS: Record<DatePart, string> = {
  month: 'flex-[3_1_7.5em]',
  day: 'flex-[2_1_4.5em]',
  year: 'flex-[3_1_6em]',
};

export const BIRTHDAY_ORDER: readonly DatePart[] = ['month', 'day', 'year'];
/** The year first where the year alone is a whole answer. */
export const YEAR_FIRST_ORDER: readonly DatePart[] = ['year', 'month', 'day'];

export function DateFields({
  id,
  parts,
  onChange,
  reading,
  order,
  legend,
  labelledBy,
  hint,
  birthday = false,
  firstRef,
}: {
  /** Prefix for the boxes' ids: `${id}-month`, `${id}-day`, `${id}-year`. */
  id: string;
  parts: DateParts;
  onChange: (parts: DateParts) => void;
  /** The caller's `readDate` of `parts`; its problem is said here. */
  reading: DateReading;
  order: readonly DatePart[];
  /** Names the group for a screen reader when nothing visible already does. */
  legend?: string;
  /** The id of a visible heading that names the group. */
  labelledBy?: string;
  hint?: string;
  /** Lets the browser or a password manager fill all three from a saved birthday. */
  birthday?: boolean;
  firstRef?: RefObject<HTMLInputElement | null>;
}) {
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const hintId = `${id}-hint`;
  const problemId = `${id}-problem`;
  const problem = reading.kind === 'invalid' ? reading : null;
  const describedBy = [hint ? hintId : null, problem ? problemId : null].filter(Boolean).join(' ');

  function change(part: DatePart, index: number, input: HTMLInputElement) {
    const text = input.value;
    const whole = splitWholeDate(text);
    if (whole) {
      onChange(whole);
      return;
    }
    const next = cleanPart(part, text);
    onChange({ ...parts, [part]: next });
    const typedForward = next.length > parts[part].length && input.selectionStart === text.length;
    if (typedForward && partIsFull(part, next)) moveTo(index + 1);
  }

  /** Into a box with an answer already, that answer is selected, as `useAutoFocus` does. */
  function moveTo(index: number, caretAtEnd = false) {
    const box = boxes.current[index];
    if (!box) return;
    box.focus();
    if (caretAtEnd) box.setSelectionRange(box.value.length, box.value.length);
    else if (box.value) box.select();
  }

  return (
    <fieldset aria-labelledby={labelledBy}>
      {legend && !labelledBy ? <legend className="sr-only">{legend}</legend> : null}
      {hint ? (
        <p id={hintId} className="text-[0.8125rem] text-grey leading-[1.5]">
          {hint}
        </p>
      ) : null}
      {/* The gap does the spacing between rows when larger text wraps them;
          only a hint above needs room from the first. */}
      <div className={cn('flex flex-wrap gap-2.5', hint && 'mt-2.5')}>
        {order.map((part, index) => (
          <div key={part} className={BASIS[part]}>
            <label
              htmlFor={`${id}-${part}`}
              className="block font-semibold text-[0.875rem] text-ink"
            >
              {LABELS[part]}
            </label>
            <input
              ref={(el) => {
                boxes.current[index] = el;
                if (index === 0 && firstRef) firstRef.current = el;
              }}
              id={`${id}-${part}`}
              inputMode="numeric"
              autoComplete={birthday ? `bday-${part}` : 'off'}
              value={parts[part]}
              aria-invalid={problem?.part === part ? true : undefined}
              aria-describedby={describedBy || undefined}
              onChange={(e) => {
                change(part, index, e.target);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Backspace' && parts[part] === '' && index > 0) {
                  e.preventDefault();
                  moveTo(index - 1, true);
                }
              }}
              className="mt-1.5 w-full rounded-[13px] border-[1.6px] border-line bg-paper px-3.5 py-3 text-[1rem] outline-none transition-shadow focus:border-emphasis focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--navy)_18%,transparent)] aria-invalid:border-destructive"
            />
          </div>
        ))}
      </div>
      {problem ? (
        <p
          id={problemId}
          role="alert"
          className="mt-2 text-[0.8125rem] text-destructive leading-[1.45]"
        >
          {problem.problem}
        </p>
      ) : null}
    </fieldset>
  );
}
