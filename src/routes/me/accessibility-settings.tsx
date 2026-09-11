import { TEXT_SIZE_LABELS, TEXT_SIZES, type TextSize, useAccessibility } from '@/lib/accessibility';
import { cn } from '@/lib/utils';

/**
 * Display settings, on the Me tab.
 *
 * Three controls, because three is what can be made to work properly. A longer
 * list of toggles that each half-work is the overlay-widget failure mode in
 * miniature — see the header of src/lib/accessibility.tsx.
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
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="border-line border-b py-4 last:border-b-0">
      <legend className="font-extrabold font-head text-[15px] text-ink">{title}</legend>
      <p className="mt-1 text-[12.8px] text-ink2 leading-[1.5]">{description}</p>
      <div className="mt-2.5">{children}</div>
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
            'min-h-[48px] min-w-[88px] rounded-xl px-4 font-bold font-head text-[15px]',
            value === option.on
              ? 'bg-navy text-white'
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
  const { preferences, setPreference, reset } = useAccessibility();

  return (
    <section aria-labelledby="display-settings-heading" className="mt-6">
      <h2
        id="display-settings-heading"
        className="mb-1 font-extrabold font-head text-[12px] text-grey uppercase tracking-[0.13em]"
      >
        Display
      </h2>
      <p className="mb-1 text-[12.5px] text-grey leading-[1.5]">
        Saved on this device, so a phone and a desktop can be set differently.
      </p>

      <div className="rounded-[17px] border border-line bg-paper px-3.5">
        <Row
          title="Text and button size"
          description="Scales the whole app, so buttons grow with the words."
        >
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
                  size === 'normal' && 'text-[15px]',
                  size === 'large' && 'text-[17px]',
                  size === 'larger' && 'text-[20px]',
                  preferences.textSize === size
                    ? 'bg-navy text-white'
                    : 'border-[1.6px] border-line bg-paper text-ink2',
                )}
              >
                {TEXT_SIZE_LABELS[size]}
              </button>
            ))}
          </div>
        </Row>

        <Row
          title="Bigger tap targets"
          description="Grows the hit area of small controls, like the ✕ that hides an event, without changing how they look."
        >
          <OnOff
            value={preferences.largeTargets}
            onChange={(next) => {
              setPreference('largeTargets', next);
            }}
          />
        </Row>

        <Row
          title="Reduce motion"
          description="Turns off sliding and fading. Starts from your device setting."
        >
          <OnOff
            value={preferences.reduceMotion}
            onChange={(next) => {
              setPreference('reduceMotion', next);
            }}
          />
        </Row>
      </div>

      <button
        type="button"
        onClick={reset}
        className="mt-3 min-h-[48px] rounded-xl px-4 font-bold font-head text-[14px] text-navy underline"
      >
        Reset to my device settings
      </button>
    </section>
  );
}
