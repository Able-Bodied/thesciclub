import { FilterChip, FilterGroup, FilterSheetShell } from '@/components/filter-sheet-shell';
import type { ChatRoom } from '@/lib/chat/types';
import type { HomeSegment, HomeSort } from '@/lib/home/types';
import type { NearHomeStatus } from '@/lib/near-home';
import { DistanceFilter } from '@/routes/events/distance-filter';
import { type FeedFilters, SHOW_CHIPS, SORT_CHIPS, toggleRoom } from '@/routes/home/filters';

/**
 * "Filter your feed": what Home shows, and that list narrowed by room (and by
 * place, when Home shows events and peers again). What it shows was a row of pills, moved here for the room (the owner,
 * 2026-11-01).
 *
 * Show is whose posts (the owner, 2026-11-18: "everything, my posts, my
 * replies, from my orgs"); the kinds it listed until then are Type, kept
 * beside it at the owner's word; Sort by is the posts' order, a menu between
 * the two. One of each.
 */

export interface HomeFilterSheetProps {
  segments: readonly (readonly [HomeSegment, string])[];
  segment: HomeSegment;
  onSegment: (next: HomeSegment) => void;
  chips: { rooms: ChatRoom[] };
  /**
   * The member's own city, and whether distances can be measured. Left out
   * while Home shows posts alone (the owner, 2026-11-18): distance is for
   * events and peers, and without it the group is not drawn.
   */
  home?: { city: string | null; status: NearHomeStatus };
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
        {SHOW_CHIPS.map(([id, label]) => (
          <FilterChip
            key={id}
            label={label}
            on={filters.show === id}
            onClick={() => {
              onChange({ ...filters, show: id });
            }}
          />
        ))}
      </FilterGroup>

      {/* A menu, as Sort by on Peers, and above Type (the owner, 2026-11-18). */}
      <label className="mb-4 block">
        <span className="mb-2 block font-extrabold font-head text-[0.71875rem] text-grey uppercase tracking-[0.13em]">
          Sort by
        </span>
        <select
          value={filters.sort}
          onChange={(event) => {
            onChange({ ...filters, sort: event.target.value as HomeSort });
          }}
          className="min-h-[44px] w-full rounded-[12px] border-[1.6px] border-line bg-paper px-3.5 text-[1rem] text-ink outline-none focus:border-emphasis"
        >
          {SORT_CHIPS.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <FilterGroup title="Type">
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

      {home ? (
        <DistanceFilter
          miles={filters.withinMiles}
          city={home.city}
          status={home.status}
          things="events and peers"
          note="For events and peers. Events start within 100 miles, closest first. Questions and posts come from everywhere."
          onChange={(withinMiles) => {
            onChange({ ...filters, withinMiles });
          }}
        />
      ) : null}

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
