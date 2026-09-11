import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { toggleFilter } from '@/routes/peers/filters';
import type { InjuryRegion, MemberFilters } from '@/types/domain';

/**
 * The filter sheet.
 *
 * Every option is drawn from the members actually in the club rather than from
 * a fixed list, so a filter can never offer something that matches nobody —
 * an empty result from a chip you were invited to tap reads as the app being
 * broken.
 *
 * The footer counts matches live, so the effect of a chip is visible before the
 * sheet closes. Closing is possible three ways — the button, the backdrop, and
 * Escape — because a sheet that can only be dismissed by a tap on a specific
 * region is a trap for anybody navigating by keyboard or switch.
 */

export interface FilterSheetProps {
  regions: InjuryRegion[];
  cities: string[];
  topics: string[];
  filters: MemberFilters;
  /** How many members the current selection matches, computed by the caller. */
  matchCount: number;
  activeCount: number;
  onChange: (next: MemberFilters) => void;
  onClear: () => void;
  onClose: () => void;
}

function ChipGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <>
      <h3 className="mt-5 mb-2.5 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
        {title}
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const on = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={on}
              onClick={() => {
                onToggle(option);
              }}
              className={cn(
                'rounded-full px-2.5 py-[5px] font-semibold text-[0.7375rem] leading-[1.25]',
                on ? 'bg-navy text-white' : 'border border-line text-ink2',
              )}
            >
              {option}
            </button>
          );
        })}
      </div>
    </>
  );
}

export function FilterSheet({
  regions,
  cities,
  topics,
  filters,
  matchCount,
  activeCount,
  onChange,
  onClear,
  onClose,
}: FilterSheetProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <>
      <button
        type="button"
        aria-label="Close filters"
        onClick={onClose}
        className="absolute inset-0 z-[70] bg-[rgba(10,20,35,.5)]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filter peers"
        className="absolute inset-x-0 bottom-0 z-[71] flex max-h-[88%] flex-col rounded-t-3xl bg-paper shadow-[0_-14px_40px_rgba(10,20,35,.3)]"
      >
        <div className="mx-auto mt-2.5 mb-1 h-[4.5px] w-[38px] flex-none rounded-[3px] bg-line" />

        <div className="flex-1 overflow-y-auto px-[18px]">
          <h2 className="mt-1 font-extrabold font-head text-[1.3125rem] tracking-[-0.02em]">
            Filter peers
          </h2>
          <p className="mt-0.5 text-[0.78125rem] text-grey">
            {matchCount} member{matchCount === 1 ? '' : 's'} match right now
          </p>

          <ChipGroup
            title="Level of injury"
            options={regions}
            selected={filters.regions}
            onToggle={(value) => {
              onChange(toggleFilter(filters, 'regions', value as InjuryRegion));
            }}
          />
          <ChipGroup
            title="Happy to talk about"
            options={topics}
            selected={filters.topics}
            onToggle={(value) => {
              onChange(toggleFilter(filters, 'topics', value));
            }}
          />
          <ChipGroup
            title="City"
            options={cities}
            selected={filters.cities}
            onToggle={(value) => {
              onChange(toggleFilter(filters, 'cities', value));
            }}
          />

          <p className="mt-5 rounded-r-[11px] border-gold border-l-[3px] bg-gold-lt px-3.5 py-3 text-[0.7875rem] text-[#5C4409] leading-[1.5]">
            Step-free access is assumed everywhere in the club, so it is not a filter.
          </p>
          <div className="h-4" />
        </div>

        <div className="grid flex-none grid-cols-2 gap-2.5 border-line border-t px-[18px] pt-3 pb-6">
          <button
            type="button"
            onClick={onClear}
            disabled={activeCount === 0}
            className="flex min-h-[44px] items-center justify-center rounded-xl bg-tint font-bold font-head text-[0.9375rem] text-navy disabled:opacity-40"
          >
            Clear{activeCount ? ` (${activeCount})` : ''}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[44px] items-center justify-center rounded-xl bg-navy font-bold font-head text-[0.9375rem] text-white"
          >
            Show {matchCount}
          </button>
        </div>
      </div>
    </>
  );
}
