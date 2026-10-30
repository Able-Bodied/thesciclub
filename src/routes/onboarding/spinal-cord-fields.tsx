import { useId } from 'react';
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
  isCentralCord,
  levelsForCondition,
  levelsForType,
  OFFERED_INJURY_TYPES,
  rangeForExact,
  SPINAL_CORD_CONDITIONS,
} from '@/types/domain';

/**
 * "Which describes you best?" and the one thing each answer needs (the owner,
 * 2026-10-15; first asked 2026-10-14):
 *
 *   Quadriplegic, High para, Low para   the level, from a list cut to fit,
 *                                       and complete or incomplete
 *   Spinal cord or nerve disorder       which, typed, with suggestions, and
 *                                       a level if it has one: "Not
 *                                       applicable" unless they choose
 *   Relative/Spouse                     nothing more: a member with no level
 *   Professional                        nothing more either
 *
 * Everything appears below the choice, never on another screen. Changing the
 * choice clears what no longer fits it: a T6 is not a quad's level, and a
 * condition's name is not a para's. Onboarding and Your details both use it.
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

/** What changing the kind does to the rest of the answer. */
export function withInjuryType(
  answer: SpinalCordAnswer,
  next: InjuryType,
): Partial<SpinalCordAnswer> {
  const patch: Partial<SpinalCordAnswer> = { injuryType: next };
  const fits =
    next === 'condition' ? levelsForCondition(answer.conditionName) : levelsForType(next);
  if (answer.exactLevel && (!asksLevel(next) || !fits.includes(answer.exactLevel))) {
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
  const condition = type === 'condition';
  const levels = condition ? levelsForCondition(answer.conditionName) : levelsForType(type);
  const level = answer.exactLevel;
  // A member who answered before 2026-10-15 may hold an answer no longer
  // offered (Paraplegia, Central cord syndrome): it stays on the list for them.
  const options: InjuryType[] =
    type && !(OFFERED_INJURY_TYPES as readonly InjuryType[]).includes(type)
      ? [...OFFERED_INJURY_TYPES, type]
      : [...OFFERED_INJURY_TYPES];

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
            Which condition?
          </label>
          <input
            id={`${id}-condition`}
            list={`${id}-conditions`}
            value={answer.conditionName}
            maxLength={CONDITION_NAME_MAX}
            autoComplete="off"
            placeholder="Start typing, or choose one"
            onChange={(e) => {
              const name = e.target.value;
              const patch: Partial<SpinalCordAnswer> = {
                conditionName: name,
                completeness: isCentralCord(name) ? 'Incomplete' : 'Do not know',
              };
              // A T6 is not a central cord's level.
              if (level && !levelsForCondition(name).includes(level)) patch.exactLevel = null;
              onChange(patch);
            }}
            className={FIELD}
          />
          <datalist id={`${id}-conditions`}>
            {SPINAL_CORD_CONDITIONS.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <p className="mt-1.5 text-[0.78125rem] text-grey leading-[1.5]">
            In your own words if it is not in the list.
          </p>
        </div>
      ) : null}

      {asksLevel(type) ? (
        <div className="mt-5">
          <label htmlFor={`${id}-level`} className={HEADING}>
            {condition ? 'Level, if it has one' : 'Level of injury'}
          </label>
          <select
            id={`${id}-level`}
            value={level ?? ''}
            onChange={(e) => {
              onChange({ exactLevel: (e.target.value || null) as ExactLevel | null });
            }}
            className={FIELD}
          >
            <option value="">{condition ? 'Not applicable' : 'Select a level'}</option>
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
