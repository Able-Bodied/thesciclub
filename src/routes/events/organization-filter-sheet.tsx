import { FilterChip, FilterGroup, FilterSheetShell } from '@/components/filter-sheet-shell';
import {
  type DirectoryFilters,
  directoryFilterCount,
  NO_FILTERS,
  useDirectory,
} from '@/routes/events/organization-list';
import type { ClubEvent, Organization } from '@/types/domain';

const CHIPS: [Exclude<keyof DirectoryFilters, 'query'>, string][] = [
  ['hasGrants', 'Has grants'],
  ['grantsOpen', 'Grants open now'],
  ['onCalendar', 'On the calendar'],
  ['following', 'Member of'],
];

/**
 * The directory's search and chips as a sheet, for the map on the
 * Organizations segment: the same filters the list draws inline.
 */
export function OrganizationFilterSheet({
  organizations,
  events,
  following,
  filters,
  onChange,
  onClose,
}: {
  organizations: Organization[];
  events: ClubEvent[];
  following: ReadonlySet<string>;
  filters: DirectoryFilters;
  onChange: (next: DirectoryFilters) => void;
  onClose: () => void;
}) {
  const { shown } = useDirectory(organizations, events, following, filters);
  const count = shown.length;
  return (
    <FilterSheetShell
      title="Filter organizations"
      summary={`${count} organization${count === 1 ? '' : 's'} match right now`}
      onClose={onClose}
      onClear={() => {
        onChange(NO_FILTERS);
      }}
      clearCount={directoryFilterCount(filters)}
      applyLabel={`Show ${count}`}
    >
      <label className="mb-4 block">
        <span className="mb-2 block font-extrabold font-head text-[0.71875rem] text-grey uppercase tracking-[0.13em]">
          Search
        </span>
        <input
          type="search"
          value={filters.query}
          onChange={(e) => {
            onChange({ ...filters, query: e.target.value });
          }}
          placeholder="Name, place or what they do"
          className="min-h-[44px] w-full rounded-full border-[1.6px] border-line bg-canvas px-4 py-2 text-[0.875rem] text-ink outline-none placeholder:text-grey focus:border-emphasis"
        />
      </label>
      <FilterGroup title="Show only">
        {CHIPS.map(([key, label]) => (
          <FilterChip
            key={key}
            label={label}
            on={filters[key]}
            onClick={() => {
              onChange({ ...filters, [key]: !filters[key] });
            }}
          />
        ))}
      </FilterGroup>
    </FilterSheetShell>
  );
}
