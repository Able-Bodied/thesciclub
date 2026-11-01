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
 * The directory's chips as a sheet, behind the header's filter button in the
 * list and on the map. The search is in the header beside it.
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
        onChange({ ...NO_FILTERS, query: filters.query });
      }}
      clearCount={directoryFilterCount({ ...filters, query: '' })}
      applyLabel={`Show ${count}`}
    >
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
