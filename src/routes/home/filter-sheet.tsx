import { FilterChip, FilterGroup, FilterSheetShell } from '@/components/filter-sheet-shell';
import type { ChatRoom } from '@/lib/chat/types';
import { type FeedFilters, toggleFeedFilter } from '@/routes/home/filters';

/**
 * "Filter your feed": Home's list narrowed by room and by place.
 *
 * The chips come from `chipsFor`, which builds them from the list the pill
 * drew, so a chip is only offered when something on screen would match it;
 * a chip that is on stays, so it can be turned off. The rules for what
 * matches are in `filters.ts`, not here.
 *
 * Two groups, stacked. Events lays its groups in columns because it has five;
 * two side by side would put Where's chips half a panel away from the heading
 * somebody read to find them.
 */

export interface HomeFilterSheetProps {
  chips: { rooms: ChatRoom[]; cities: string[]; online: boolean };
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
  chips,
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
      {chips.rooms.length > 0 ? (
        <FilterGroup title="Rooms">
          {chips.rooms.map((room) => (
            <FilterChip
              key={room.id}
              label={room.name}
              on={filters.rooms.includes(room.id)}
              onClick={() => {
                onChange(toggleFeedFilter(filters, 'rooms', room.id));
              }}
            />
          ))}
        </FilterGroup>
      ) : null}

      {chips.cities.length > 0 || chips.online ? (
        <FilterGroup title="Where">
          {chips.cities.map((city) => (
            <FilterChip
              key={city}
              label={city}
              on={filters.cities.includes(city)}
              onClick={() => {
                onChange(toggleFeedFilter(filters, 'cities', city));
              }}
            />
          ))}
          {/* Last, as the mock has it: it is the one place that is not a
              place. */}
          {chips.online ? (
            <FilterChip
              label="Online"
              on={filters.online}
              onClick={() => {
                onChange({ ...filters, online: !filters.online });
              }}
            />
          ) : null}
        </FilterGroup>
      ) : null}

      {chips.rooms.length === 0 && chips.cities.length === 0 && !chips.online ? (
        // A list of events with no city, no sport and nothing online has
        // nothing to narrow by. Saying so beats an empty panel.
        <p className="mb-4 text-[0.875rem] text-grey leading-relaxed">
          Nothing in this list has a room or a place to narrow by.
        </p>
      ) : null}

      <p className="mb-4 rounded-r-[11px] border-gold border-l-[3px] bg-gold-lt px-3.5 py-3 text-[0.7875rem] text-ink2 leading-[1.5]">
        The pills across the top filter by kind. This narrows what is inside them.
      </p>
    </FilterSheetShell>
  );
}
