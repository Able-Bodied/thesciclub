import { cn } from '@/lib/utils';

/**
 * One of a few things, side by side at the top of a screen: Events or
 * Organizations, an event or an organization to add, Peers, Mentors or
 * Professionals. `aria-pressed` buttons,
 * as SegmentPills, and the shape of ViewSwitch beside it.
 */
export function TwoWayToggle<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  /** What the choice is, for a screen reader. */
  label: string;
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    // A group, not a fieldset: Safari measured a fieldset narrower than its
    // buttons, so a row of them did not wrap and ran off a phone at a larger
    // text size (the owner, 2026-11-06).
    // biome-ignore lint/a11y/useSemanticElements: Safari lays out a fieldset in a wrapping row too narrow; the group keeps its name.
    <div
      role="group"
      aria-label={label}
      className="flex w-fit min-w-0 flex-none rounded-full bg-tint p-0.5"
    >
      {options.map(([option, name]) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => {
            onChange(option);
          }}
          className={cn(
            'min-h-[44px] rounded-full px-3.5 font-semibold text-[0.84375rem] transition-colors',
            value === option
              ? 'bg-action text-white hover:bg-action-hi'
              : 'text-ink2 hover:bg-line',
          )}
        >
          {name}
        </button>
      ))}
    </div>
  );
}
