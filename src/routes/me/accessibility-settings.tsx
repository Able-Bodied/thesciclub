import { useId } from 'react';
import {
  APPEARANCE_LABELS,
  APPEARANCES,
  type Appearance,
  MOTION_LABELS,
  MOTIONS,
  type Motion,
  TEXT_SIZE_LABELS,
  TEXT_SIZES,
  type TextSize,
  useAccessibility,
} from '@/lib/accessibility';
import { cn } from '@/lib/utils';

/**
 * Display settings, on the Me tab.
 *
 * Appearance, Higher contrast, Text size, Easier-to-read text, Underline
 * links, Bigger tap targets and Reduce motion (the last four added
 * 2026-10-20, in place of an overlay widget). Reduce motion came back once the
 * app had real motion to stop. Each one has to change something you can see;
 * a toggle that half-works is the overlay failure this screen exists to avoid.
 *
 * Every control here is a real button with a real pressed state, sized well
 * past the 44px target guideline, and changes apply immediately rather than
 * behind a Save. Somebody raising the text size because they cannot read the
 * screen should not then have to find a Save button they cannot read either.
 */

/**
 * One setting: a real `fieldset` whose `legend` is the setting's name.
 *
 * Not a div with `role="group"` and an aria-label. The native pair already
 * carries the grouping, and a screen reader announces the legend before each
 * button inside it — so "Reduce motion, On, pressed" rather than a bare "On"
 * that could belong to any of the three settings on this screen.
 */
function Row({
  title,
  hint,
  children,
}: {
  title: string;
  /** One line under the name, read out with it. */
  hint?: string;
  children: React.ReactNode;
}) {
  const hintId = useId();
  return (
    <fieldset
      aria-describedby={hint ? hintId : undefined}
      className="border-line border-b py-4 last:border-b-0"
    >
      {/* Floated, so the legend sits inside the padding like any heading. A
          plain legend is drawn on the fieldset's top edge, which put each
          setting's name hard against the line above it and left the padding
          as a gap under the name instead. */}
      <legend className="float-left w-full font-extrabold font-head text-[0.9375rem] text-ink">
        {title}
      </legend>
      {hint ? (
        <p id={hintId} className="clear-both pt-1 text-[0.8125rem] text-ink2">
          {hint}
        </p>
      ) : null}
      <div className="clear-both pt-2.5">{children}</div>
    </fieldset>
  );
}

/**
 * A two-state control rendered as a pair of buttons rather than a switch.
 *
 * A switch has one hit area that means two things and whose state is carried by
 * the position of a dot. Two labelled buttons say what each state is, are twice
 * the target, and cannot be toggled by accident on the way past — which matters
 * for anyone aiming with a head pointer or a mouth stick.
 */
function OnOff({ value, onChange }: { value: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="flex gap-2">
      {[
        { on: true, text: 'On' },
        { on: false, text: 'Off' },
      ].map((option) => (
        <button
          key={option.text}
          type="button"
          aria-pressed={value === option.on}
          onClick={() => {
            onChange(option.on);
          }}
          className={cn(
            'min-h-[48px] min-w-[88px] rounded-xl px-4 font-bold font-head text-[0.9375rem]',
            value === option.on
              ? 'bg-action text-white'
              : 'border-[1.6px] border-line bg-paper text-ink2',
          )}
        >
          {option.text}
        </button>
      ))}
    </div>
  );
}

export function AccessibilitySettings() {
  return (
    <section aria-labelledby="display-settings-heading" className="mt-6">
      <h2
        id="display-settings-heading"
        // mb-2.5, matching the other section headings on Me. It was mb-1
        // because a paragraph sat under it and carried the rest of the gap.
        className="mb-2.5 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]"
      >
        Display
      </h2>
      <DisplayControls />
    </section>
  );
}

/** The rows and Reset, without a heading: Me's section and the Display sheet. */
export function DisplayControls() {
  const { preferences, setPreference, reset } = useAccessibility();

  return (
    <>
      <div className="rounded-[17px] border border-line bg-paper px-3.5">
        {/* Match my device first, and the default: most people never open this
            screen, and their phone or computer already says which they
            prefer. Not "phone": the club is used on computers too (the
            owner, 2026-10-03). */}
        <Row title="Appearance">
          <div className="flex flex-wrap gap-2">
            {APPEARANCES.map((appearance: Appearance) => (
              <button
                key={appearance}
                type="button"
                aria-pressed={preferences.appearance === appearance}
                onClick={() => {
                  setPreference('appearance', appearance);
                }}
                className={cn(
                  'min-h-[48px] min-w-[88px] rounded-xl px-4 font-bold font-head text-[0.9375rem]',
                  preferences.appearance === appearance
                    ? 'bg-action text-white'
                    : 'border-[1.6px] border-line bg-paper text-ink2',
                )}
              >
                {APPEARANCE_LABELS[appearance]}
              </button>
            ))}
          </div>
        </Row>

        <Row title="Higher contrast" hint="Darker words and clearer edges.">
          <OnOff
            value={preferences.highContrast}
            onChange={(next) => {
              setPreference('highContrast', next);
            }}
          />
        </Row>

        <Row title="Text size">
          <div className="flex flex-wrap gap-2">
            {TEXT_SIZES.map((size: TextSize) => (
              <button
                key={size}
                type="button"
                aria-pressed={preferences.textSize === size}
                onClick={() => {
                  setPreference('textSize', size);
                }}
                className={cn(
                  'min-h-[48px] min-w-[88px] rounded-xl px-4 font-bold font-head',
                  // Each option is drawn at the size it applies, so the choice
                  // is legible without reading the label.
                  size === 'normal' && 'text-[0.9375rem]',
                  size === 'large' && 'text-[1.0625rem]',
                  size === 'larger' && 'text-[1.25rem]',
                  preferences.textSize === size
                    ? 'bg-action text-white'
                    : 'border-[1.6px] border-line bg-paper text-ink2',
                )}
              >
                {TEXT_SIZE_LABELS[size]}
              </button>
            ))}
          </div>
        </Row>

        <Row
          title="Easier-to-read text"
          hint="Plainer headings, and more space between letters, words and lines."
        >
          <OnOff
            value={preferences.readableText}
            onChange={(next) => {
              setPreference('readableText', next);
            }}
          />
        </Row>

        <Row title="Underline links">
          <OnOff
            value={preferences.underlineLinks}
            onChange={(next) => {
              setPreference('underlineLinks', next);
            }}
          />
        </Row>

        <Row title="Bigger tap targets">
          <OnOff
            value={preferences.largeTargets}
            onChange={(next) => {
              setPreference('largeTargets', next);
            }}
          />
        </Row>

        <Row title="Reduce motion" hint="Stops animations and smooth scrolling.">
          <div className="flex flex-wrap gap-2">
            {MOTIONS.map((motion: Motion) => (
              <button
                key={motion}
                type="button"
                aria-pressed={preferences.reduceMotion === motion}
                onClick={() => {
                  setPreference('reduceMotion', motion);
                }}
                className={cn(
                  'min-h-[48px] min-w-[88px] rounded-xl px-4 font-bold font-head text-[0.9375rem]',
                  preferences.reduceMotion === motion
                    ? 'bg-action text-white'
                    : 'border-[1.6px] border-line bg-paper text-ink2',
                )}
              >
                {MOTION_LABELS[motion]}
              </button>
            ))}
          </div>
        </Row>
      </div>

      <button
        type="button"
        onClick={reset}
        className="mt-3 min-h-[48px] rounded-xl px-4 font-bold font-head text-[0.875rem] text-emphasis underline"
      >
        Reset to my device settings
      </button>
    </>
  );
}
