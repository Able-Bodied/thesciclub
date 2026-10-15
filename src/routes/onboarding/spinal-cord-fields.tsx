import { useId } from 'react';
import { cn } from '@/lib/utils';
import { Chip } from '@/routes/onboarding/chrome';
import {
  asksCompleteness,
  COMPLETENESS,
  CONDITION_NAME_MAX,
  type Completeness,
  type ExactLevel,
  INJURY_TYPE_TEXT,
  INJURY_TYPES,
  type InjuryType,
  levelsForType,
  rangeForExact,
  SPINAL_CORD_CONDITIONS,
} from '@/types/domain';

/**
 * The spinal cord question, on one screen (the owner, 2026-10-14). The club is
 * for anybody with a spinal cord injury or condition, so it asks what kind
 * first, and only then the one thing that kind needs:
 *
 *   Paraplegia / Quadriplegia   the level, from a list cut to fit
 *   Central cord syndrome       the level in the neck; it is incomplete by
 *                               definition, so that is not asked
 *   Another condition           which, typed with suggestions (there are too
 *                               many for a list), and a level if they know one
 *
 * Everything appears below the choice, never on another screen. Changing the
 * choice clears what no longer fits it: a T6 is not a quad's level, and a
 * condition's name is not a para's. Onboarding and Your details both use it.
 */

export interface SpinalCordAnswer {
  injuryType: InjuryType | null;
  exactLevel: ExactLevel | null;
  /** Typed, so '' while blank. */
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
  if (answer.exactLevel && !levelsForType(next).includes(answer.exactLevel)) {
    patch.exactLevel = null;
  }
  if (next !== 'condition') patch.conditionName = '';
  if (next === 'central_cord') patch.completeness = 'Incomplete';
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

  return (
    <>
      <fieldset>
        <legend className={HEADING}>Which describes you best?</legend>
        <div className="flex flex-col gap-2">
          {INJURY_TYPES.map((option) => (
            <label
              key={option}
              className={cn(
                'flex min-h-[48px] cursor-pointer items-start gap-3 rounded-[13px] border-[1.6px] bg-paper px-3.5 py-3',
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
                className="mt-0.5 h-5 w-5 flex-none accent-[var(--color-action)]"
              />
              <span className="min-w-0">
                <span className="block font-bold text-[0.9375rem] text-ink">
                  {INJURY_TYPE_TEXT[option].title}
                </span>
                <span className="mt-0.5 block text-[0.8125rem] text-ink2 leading-[1.4]">
                  {INJURY_TYPE_TEXT[option].hint}
                </span>
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
              onChange({ conditionName: e.target.value });
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

      {type !== null ? (
        <div className="mt-5">
          <label htmlFor={`${id}-level`} className={HEADING}>
            {type === 'condition' ? 'Level, if you know it' : 'Level of injury'}
          </label>
          <select
            id={`${id}-level`}
            value={level ?? ''}
            onChange={(e) => {
              onChange({ exactLevel: (e.target.value || null) as ExactLevel | null });
            }}
            className={FIELD}
          >
            <option value="">{type === 'condition' ? 'No level' : 'Select a level'}</option>
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
