import { FilterChip, FilterGroup, FilterSheetShell } from '@/components/filter-sheet-shell';
import { TypeBadge } from '@/components/type-badge';
import type { NearHomeStatus } from '@/lib/near-home';
import { ORGANIZATION_CATEGORIES, tapTypeChip, typeChipOn } from '@/lib/organization-categories';
import { ANY_SPORT_ID, ORGANIZATION_SPORTS } from '@/lib/organization-sports';
import { DistanceFilter } from '@/routes/events/distance-filter';
import {
  type DirectoryChip,
  type DirectoryFilters,
  directoryFilterCount,
  NO_FILTERS,
  useDirectory,
} from '@/routes/events/organization-list';
import type { ClubEvent, Organization } from '@/types/domain';

const CHIPS: [DirectoryChip, string][] = [
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
  home,
  startingMiles,
  distance = true,
  onChange,
  onClose,
}: {
  organizations: Organization[];
  events: ClubEvent[];
  following: ReadonlySet<string>;
  filters: DirectoryFilters;
  /** The member's own city, and whether distances can be measured. */
  home: { city: string | null; status: NearHomeStatus };
  startingMiles: number | null;
  /** The list's; the map shows every place (the owner, 2026-11-03). */
  distance?: boolean;
  onChange: (next: DirectoryFilters) => void;
  onClose: () => void;
}) {
  const { shown } = useDirectory(organizations, events, following, filters);
  const count = shown.length;
  // Off the map's count too, where it does nothing.
  const counted = distance ? filters : { ...filters, withinMiles: startingMiles };
  return (
    <FilterSheetShell
      title="Filter organizations"
      summary={`${count} organization${count === 1 ? '' : 's'} match right now`}
      onClose={onClose}
      onClear={() => {
        onChange({ ...NO_FILTERS, query: filters.query, withinMiles: startingMiles });
      }}
      clearCount={directoryFilterCount({ ...counted, query: '' }, startingMiles)}
      applyLabel={`Show ${count}`}
    >
      {distance ? (
        <DistanceFilter
          miles={filters.withinMiles}
          city={home.city}
          status={home.status}
          things="organizations"
          note="From the middle of your city. Those with no place of their own always show."
          onChange={(withinMiles) => {
            onChange({ ...filters, withinMiles });
          }}
        />
      ) : null}
      <FilterGroup title="Type">
        {ORGANIZATION_CATEGORIES.map((type) => (
          <FilterChip
            key={type.id}
            label={type.label}
            leading={<TypeBadge type={type} />}
            on={typeChipOn(filters.hiddenTypes, type.id)}
            onClick={() => {
              onChange({ ...filters, hiddenTypes: tapTypeChip(filters.hiddenTypes, type.id) });
            }}
          />
        ))}
      </FilterGroup>
      <FilterGroup title="Sports">
        {[{ id: ANY_SPORT_ID, label: 'Any sport' }, ...ORGANIZATION_SPORTS].map((sport) => (
          <FilterChip
            key={sport.id}
            label={sport.label}
            on={filters.sports.includes(sport.id)}
            onClick={() => {
              const sports = filters.sports.includes(sport.id)
                ? filters.sports.filter((one) => one !== sport.id)
                : [...filters.sports, sport.id];
              onChange({ ...filters, sports });
            }}
          />
        ))}
      </FilterGroup>
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
