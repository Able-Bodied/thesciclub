import { cn } from '@/lib/utils';

/**
 * The row of segment pills under a screen's header.
 *
 * Peers and Events had the same twenty lines, byte for byte apart from the
 * wrapper's max-width, and Chat wants a third copy. Extracted before the third
 * rather than after it: a pill row that drifts between screens reads as two
 * different controls doing the same job, and the drift is the kind nobody
 * notices in a diff.
 *
 * `value` is generic so each screen keeps its own union — `PeersSegment`,
 * `EventsSegment` — and a typo in a segment name is still a type error rather
 * than a pill that never lights up.
 *
 * The pills are `aria-pressed` buttons, not tabs: a segment changes the content
 * below and nothing else, and there is no tab panel to be the tab of.
 */
export function SegmentPills<T extends string>({
  segments,
  value,
  onChange,
  className,
}: {
  segments: readonly (readonly [T, string])[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full gap-[7px] overflow-x-auto py-[11px] [scrollbar-width:none]',
        className,
      )}
    >
      {segments.map(([segment, label]) => (
        <button
          key={segment}
          type="button"
          onClick={() => {
            onChange(segment);
          }}
          aria-pressed={value === segment}
          // 30px tall. Below 44px, and deliberately: a row of pills at full
          // target height is a wall, and they sit alone with nothing to mis-tap.
          data-target="small"
          className={cn(
            'flex-none whitespace-nowrap rounded-full px-3.5 py-[7px] font-semibold text-[0.84375rem] transition-colors',
            value === segment
              ? 'bg-navy text-white hover:bg-navy-hi'
              : 'bg-tint text-ink2 hover:bg-line',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
