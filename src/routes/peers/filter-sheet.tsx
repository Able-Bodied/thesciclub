import { FilterChip, FilterGroup, FilterSheetShell } from '@/components/filter-sheet-shell';
import { toggleFilter } from '@/routes/peers/filters';
import type { InjuryRegion, MemberFilters } from '@/types/domain';

/**
 * The peers filter sheet.
 *
 * Every option is drawn from the members actually in the club rather than from
 * a fixed list, so a filter can never offer something that matches nobody — an
 * empty result from a chip you were invited to tap reads as the app being
 * broken.
 *
 * Shares its frame with the events sheet (src/components/filter-sheet-shell.tsx),
 * which is where the width and pointer-travel reasoning lives.
 *
 * Deliberately not in columns, where the events sheet is. That sheet has eight
 * short groups and columns halve its height; this one has three groups of three,
 * twenty and twenty-four chips. A CSS column cannot split a group without
 * breaking it across the gutter, so the long ones stay whole and the short one
 * leaves a column-height hole beside them. Stacked full width, the chips wrap
 * three or four to a row and there is no hole at all.
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
  return (
    <FilterSheetShell
      title="Filter peers"
      summary={`${matchCount} member${matchCount === 1 ? '' : 's'} match right now`}
      onClose={onClose}
      onClear={onClear}
      clearCount={activeCount}
      applyLabel={`Show ${matchCount}`}
    >
      {regions.length > 0 ? (
        <FilterGroup title="Level of injury">
          {regions.map((region) => (
            <FilterChip
              key={region}
              label={region}
              on={filters.regions.includes(region)}
              onClick={() => {
                onChange(toggleFilter(filters, 'regions', region));
              }}
            />
          ))}
        </FilterGroup>
      ) : null}

      {cities.length > 0 ? (
        <FilterGroup title="City">
          {cities.map((city) => (
            <FilterChip
              key={city}
              label={city}
              on={filters.cities.includes(city)}
              onClick={() => {
                onChange(toggleFilter(filters, 'cities', city));
              }}
            />
          ))}
        </FilterGroup>
      ) : null}

      {topics.length > 0 ? (
        <FilterGroup title="Happy to talk about">
          {topics.map((topic) => (
            <FilterChip
              key={topic}
              label={topic}
              on={filters.topics.includes(topic)}
              onClick={() => {
                onChange(toggleFilter(filters, 'topics', topic));
              }}
            />
          ))}
        </FilterGroup>
      ) : null}

      <p className="mb-4 rounded-r-[11px] border-gold border-l-[3px] bg-gold-lt px-3.5 py-3 text-[#5C4409] text-[0.7875rem] leading-[1.5]">
        Step-free access is assumed everywhere in the club, so it is not a filter.
      </p>
    </FilterSheetShell>
  );
}
