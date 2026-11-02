import { FilterChip, FilterGroup, FilterSheetShell } from '@/components/filter-sheet-shell';
import type { ChatRoom } from '@/lib/chat/types';
import type { HomeSegment } from '@/lib/home/types';
import type { NearHomeStatus } from '@/lib/near-home';
import { DistanceFilter } from '@/routes/events/distance-filter';
import { type FeedFilters, toggleRoom } from '@/routes/home/filters';

/**
 * "Filter your feed": what Home shows, and that list narrowed by room and by
 * place. What it shows was a row of pills, moved here for the room (the owner,
 * 2026-11-01).
 *
 */

export interface HomeFilterSheetProps {
  segments: readonly (readonly [HomeSegment, string])[];
  segment: HomeSegment;
  onSegment: (next: HomeSegment) => void;
  chips: { rooms: ChatRoom[] };
  /** The member's own city, and whether distances can be measured. */
  home: { city: string | null; status: NearHomeStatus };
  filters: FeedFilters;
  /** How many cards the pill draws with the filters on, and without. */
  matchCount: number;
  total: number;
  activeCount: number;
  onChange: (next: FeedFilters) => void;
  onClear: () => void;
  onClose: () => void;
}

export function HomeFilterSheet({
  segments,
  segment,
  onSegment,
  chips,
  home,
  filters,
  matchCount,
  total,
  activeCount,
  onChange,
  onClear,
  onClose,
}: HomeFilterSheetProps) {
  return (
    <FilterSheetShell
      title="Filter your feed"
      summary={`${matchCount} of ${total} ${matchCount === 1 ? 'matches' : 'match'}`}
      onClose={onClose}
      onClear={onClear}
      clearCount={activeCount}
      applyLabel={`Show ${matchCount}`}
    >
      <FilterGroup title="Show">
        {segments.map(([id, label]) => (
          <FilterChip
            key={id}
            label={label}
            on={segment === id}
            onClick={() => {
              onSegment(id);
            }}
          />
        ))}
      </FilterGroup>

      <DistanceFilter
        miles={filters.withinMiles}
        city={home.city}
        status={home.status}
        things="events and peers"
        note="For events and peers. Questions and topics come from everywhere."
        onChange={(withinMiles) => {
          onChange({ ...filters, withinMiles });
        }}
      />

      {chips.rooms.length > 0 ? (
        <FilterGroup title="Rooms">
          {chips.rooms.map((room) => (
            <FilterChip
              key={room.id}
              label={room.name}
              on={filters.rooms.includes(room.id)}
              onClick={() => {
                onChange(toggleRoom(filters, room.id));
              }}
            />
          ))}
        </FilterGroup>
      ) : null}
    </FilterSheetShell>
  );
}
