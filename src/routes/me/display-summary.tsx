import { useOpenDisplaySheet } from '@/components/display-sheet';
import {
  APPEARANCE_LABELS,
  MOTION_LABELS,
  TEXT_SIZE_LABELS,
  useAccessibility,
} from '@/lib/accessibility';

/**
 * Display on Me → Settings: what is set, and a button to the Display sheet
 * (the owner, 2026-10-28: the whole list was too long here).
 */
export function DisplaySummary() {
  const { preferences } = useAccessibility();
  const open = useOpenDisplaySheet();
  const on = [
    preferences.highContrast && 'Higher contrast',
    preferences.readableText && 'Easier-to-read text',
    preferences.underlineLinks && 'Underline links',
    preferences.largeTargets && 'Bigger tap targets',
  ].filter((name): name is string => Boolean(name));
  const rows: [string, string][] = [
    ['Appearance', APPEARANCE_LABELS[preferences.appearance]],
    ['Text size', TEXT_SIZE_LABELS[preferences.textSize]],
    ['Reduce motion', MOTION_LABELS[preferences.reduceMotion]],
    ['Also on', on.length > 0 ? on.join(', ') : 'Nothing else'],
  ];
  return (
    <section aria-labelledby="display-settings-heading" className="mt-6">
      <h2
        id="display-settings-heading"
        className="mb-2.5 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]"
      >
        Display
      </h2>
      <div className="rounded-[17px] border border-line bg-paper p-3.5">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[0.875rem]">
          {rows.map(([name, value]) => (
            <div key={name} className="contents">
              <dt className="text-ink2">{name}</dt>
              <dd className="font-semibold text-ink">{value}</dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          onClick={open}
          className="mt-3.5 min-h-[48px] w-full rounded-xl bg-action px-4 font-bold font-head text-[0.9375rem] text-white"
        >
          Change display settings
        </button>
      </div>
    </section>
  );
}
