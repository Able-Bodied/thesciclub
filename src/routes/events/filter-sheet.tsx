import { FilterChip, FilterGroup, FilterSheetShell } from '@/components/filter-sheet-shell';
import { toggleFilter } from '@/routes/events/filters';
import {
  DATE_WINDOW_LABELS,
  DATE_WINDOWS,
  type DateWindow,
  EVENT_FORMAT_LABELS,
  type EventFilters,
  type EventFormat,
  type EventTag,
  type Organization,
} from '@/types/domain';

/**
 * The events filter sheet.
 *
 * Every option is drawn from the events actually on the calendar rather than
 * from a fixed list, so a chip can never match nothing. An empty result from a
 * chip you were invited to tap reads as the app being broken, and here it is
 * worse than on Peers: an empty calendar looks like a club with nothing going
 * on.
 *
 * That is also why the tag groups come from the events rather than from the
 * taxonomy table. The taxonomy has thirty tags and a given month uses eight;
 * offering the other twenty-two is offering twenty-two ways to empty the
 * screen.
 *
 * The groups are laid out in columns on a wide screen. Most of them hold one to
 * three chips, so stacked they were a column of headings with air between them
 * and the whole sheet scrolled — see the shell for why scrolling and width are
 * the same problem here.
 */

export interface EventFilterSheetProps {
  tags: EventTag[];
  formats: EventFormat[];
  cities: string[];
  organizations: Organization[];
  filters: EventFilters;
  matchCount: number;
  activeCount: number;
  onChange: (next: EventFilters) => void;
  onClear: () => void;
  onClose: () => void;
}

export function EventFilterSheet({
  tags,
  formats,
  cities,
  organizations,
  filters,
  matchCount,
  activeCount,
  onChange,
  onClear,
  onClose,
}: EventFilterSheetProps) {
  const byCategory = new Map<string, { name: string; tags: EventTag[] }>();
  for (const tag of tags) {
    const bucket = byCategory.get(tag.categorySlug);
    if (bucket) bucket.tags.push(tag);
    else byCategory.set(tag.categorySlug, { name: tag.categoryName, tags: [tag] });
  }

  return (
    <FilterSheetShell
      title="Filter events"
      summary={`${matchCount} event${matchCount === 1 ? '' : 's'} match right now`}
      onClose={onClose}
      onClear={onClear}
      clearCount={activeCount}
      applyLabel={`Show ${matchCount}`}
    >
      {/* When is first and full width: it is the filter that changes the answer
          most, and a single choice rather than a set — "this week and past
          events" is not a window anybody means. */}
      <FilterGroup title="When">
        {DATE_WINDOWS.map((when: DateWindow) => (
          <FilterChip
            key={when}
            label={DATE_WINDOW_LABELS[when]}
            on={filters.when === when}
            onClick={() => {
              onChange({ ...filters, when });
            }}
          />
        ))}
      </FilterGroup>

      {/* Columns rather than a stack: most groups hold one to three chips, and
          stacked they made a tall sheet out of mostly empty space. */}
      <div className="lg:columns-2 lg:gap-x-5">
        {formats.length > 1 ? (
          <FilterGroup title="Getting there">
            {formats.map((format) => (
              <FilterChip
                key={format}
                label={EVENT_FORMAT_LABELS[format]}
                on={filters.formats.includes(format)}
                onClick={() => {
                  onChange(toggleFilter(filters, 'formats', format));
                }}
              />
            ))}
          </FilterGroup>
        ) : null}

        {[...byCategory.entries()].map(([slug, group]) => (
          <FilterGroup key={slug} title={group.name}>
            {group.tags.map((tag) => (
              <FilterChip
                key={tag.slug}
                label={tag.name}
                on={filters.tags.includes(tag.slug)}
                onClick={() => {
                  onChange(toggleFilter(filters, 'tags', tag.slug));
                }}
              />
            ))}
          </FilterGroup>
        ))}

        {organizations.length > 0 ? (
          <FilterGroup title="Hosted by">
            {organizations.map((organization) => (
              <FilterChip
                key={organization.id}
                label={organization.name}
                on={filters.organizations.includes(organization.id)}
                onClick={() => {
                  onChange(toggleFilter(filters, 'organizations', organization.id));
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
      </div>

      <p className="mb-4 rounded-r-[11px] border-gold border-l-[3px] bg-gold-lt px-3.5 py-3 text-[#5C4409] text-[0.7875rem] leading-[1.5]">
        Events come from the organizations’ own calendars. If something is missing, it is missing
        there too.
      </p>
    </FilterSheetShell>
  );
}
