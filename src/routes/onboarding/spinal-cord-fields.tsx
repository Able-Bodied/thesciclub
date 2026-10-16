import { useId, useState } from 'react';
import { cn } from '@/lib/utils';
import { Chip } from '@/routes/onboarding/chrome';
import {
  asksCompleteness,
  asksLevel,
  COMPLETENESS,
  CONDITION_NAME_MAX,
  type Completeness,
  type ExactLevel,
  INJURY_TYPE_TEXT,
  type InjuryType,
  levelsForType,
  OFFERED_INJURY_TYPES,
  OTHER_DISABILITIES,
  rangeForExact,
} from '@/types/domain';

/**
 * "Which describes you best?" and the one thing each answer needs (the owner,
 * 2026-10-15; first asked 2026-10-14):
 *
 *   Quadriplegic, High para, Low para   the level, from a list cut to fit,
 *                                       and complete or incomplete
 *   Other disability                    which, from a list, or "Other" and
 *                                       typed
 *   Relative/Spouse                     nothing more: a member with no level
 *
 * Everything appears below the choice, never on another screen. Changing the
 * choice clears what no longer fits it: a T6 is not a quad's level, and a
 * disability's name is not a para's. Onboarding and Your details both use it.
 */

export interface SpinalCordAnswer {
  injuryType: InjuryType | null;
  exactLevel: ExactLevel | null;
  /** Chosen or typed, so '' while blank. */
  conditionName: string;
  completeness: Completeness;
}

const HEADING =
  'mb-2 block font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]';
const FIELD =
  'w-full rounded-[13px] border-[1.6px] border-line bg-paper px-3.5 py-3 text-[1rem] text-ink outline-none focus:border-emphasis';

/** The "Other" in the disability list, which opens a box to type in. */
const TYPED = '__other';

function listed(name: string): boolean {
  return (OTHER_DISABILITIES as readonly string[]).includes(name);
}

/** What changing the kind does to the rest of the answer. */
export function withInjuryType(
  answer: SpinalCordAnswer,
  next: InjuryType,
): Partial<SpinalCordAnswer> {
  const patch: Partial<SpinalCordAnswer> = { injuryType: next };
  if (answer.exactLevel && (!asksLevel(next) || !levelsForType(next).includes(answer.exactLevel))) {
    patch.exactLevel = null;
  }
  if (next !== 'condition') patch.conditionName = '';
  if (!asksCompleteness(next))
    patch.completeness = next === 'central_cord' ? 'Incomplete' : 'Do not know';
  return patch;
}

export function SpinalCordFields({
  answer,
  onChange,
  browsedUnder = 'Members browsing by level will find you under',
}: {
  answer: SpinalCordAnswer;
  onChange: (patch: Partial<SpinalCordAnswer>) => void;
  /** The sentence before the range a level is browsed under. */
  browsedUnder?: string;
}) {
  const id = useId();
  const type = answer.injuryType;
  const levels = levelsForType(type);
  const level = answer.exactLevel;
  // A member who answered before 2026-10-15 may hold an answer no longer
  // offered (Paraplegia, Central cord syndrome): it stays on the list for them.
  const options: InjuryType[] =
    type && !(OFFERED_INJURY_TYPES as readonly InjuryType[]).includes(type)
      ? [...OFFERED_INJURY_TYPES, type]
      : [...OFFERED_INJURY_TYPES];
  // "Other" chosen with nothing typed yet, or a name typed that is not listed.
  const [typing, setTyping] = useState(
    answer.conditionName !== '' && !listed(answer.conditionName),
  );
  const disability = listed(answer.conditionName) ? answer.conditionName : typing ? TYPED : '';

  return (
    <>
      <fieldset>
        <legend className={HEADING}>Which describes you best?</legend>
        <div className="flex flex-col gap-2">
          {options.map((option) => (
            <label
              key={option}
              className={cn(
                'flex min-h-[48px] cursor-pointer items-center gap-3 rounded-[13px] border-[1.6px] bg-paper px-3.5 py-3',
                type === option ? 'border-action' : 'border-line',
              )}
            >
              <input
                type="radio"
                name={`${id}-type`}
                checked={type === option}
                onChange={() => {
                  setTyping(false);
                  onChange(withInjuryType(answer, option));
                }}
                className="h-5 w-5 flex-none accent-[var(--color-action)]"
              />
              <span className="font-bold text-[0.9375rem] text-ink">
                {INJURY_TYPE_TEXT[option].title}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {type === 'condition' ? (
        <div className="mt-5">
          <label htmlFor={`${id}-condition`} className={HEADING}>
            Which disability?
          </label>
          <select
            id={`${id}-condition`}
            value={disability}
            onChange={(e) => {
              const value = e.target.value;
              setTyping(value === TYPED);
              onChange({ conditionName: value === TYPED ? '' : value });
            }}
            className={FIELD}
          >
            <option value="">Choose one</option>
            {OTHER_DISABILITIES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value={TYPED}>Other</option>
          </select>
          {disability === TYPED ? (
            <>
              <label
                htmlFor={`${id}-condition-typed`}
                className="mt-3 block font-bold text-[0.8125rem] text-ink"
              >
                Which one?
              </label>
              <input
                id={`${id}-condition-typed`}
                value={answer.conditionName}
                maxLength={CONDITION_NAME_MAX}
                autoComplete="off"
                placeholder="In your own words"
                onChange={(e) => {
                  onChange({ conditionName: e.target.value });
                }}
                className={cn(FIELD, 'mt-1.5')}
              />
            </>
          ) : null}
        </div>
      ) : null}

      {asksLevel(type) ? (
        <div className="mt-5">
          <label htmlFor={`${id}-level`} className={HEADING}>
            Level of injury
          </label>
          <select
            id={`${id}-level`}
            value={level ?? ''}
            onChange={(e) => {
              onChange({ exactLevel: (e.target.value || null) as ExactLevel | null });
            }}
            className={FIELD}
          >
            <option value="">Select a level</option>
            {levels.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          {level && level !== 'Do not know' ? (
            <p className="mt-2 text-[0.78125rem] text-grey leading-[1.5]">
              {browsedUnder} {rangeForExact(level)}.
            </p>
          ) : null}
        </div>
      ) : null}

      {type !== null && asksCompleteness(type) ? (
        <fieldset className="mt-5">
          <legend className={HEADING}>Complete or incomplete?</legend>
          <div className="flex flex-wrap gap-2">
            {COMPLETENESS.map((value) => (
              <Chip
                key={value}
                selected={answer.completeness === value}
                onClick={() => {
                  onChange({ completeness: value });
                }}
              >
                {value}
              </Chip>
            ))}
          </div>
        </fieldset>
      ) : null}
    </>
  );
}
