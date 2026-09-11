import { useEffect } from 'react';
import { cn } from '@/lib/utils';
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
 * The events filter sheet — the same shell as the Peers one, deliberately.
 *
 * Every option is drawn from the events actually on the calendar rather than
 * from a fixed list, so a chip can never match nothing. An empty result from a
 * chip you were invited to tap reads as the app being broken, and here it would
 * be worse than on Peers: an empty calendar looks like a club with nothing
 * going on.
 *
 * That is also why the tag groups come from the events rather than from the
 * taxonomy table. The taxonomy has thirty tags in it and a given month will use
 * eight; offering the other twenty-two is offering twenty-two ways to empty
 * the screen.
 */

export interface EventFilterSheetProps {
  /** Tags present on the events in view, already deduplicated. */
  tags: EventTag[];
  formats: EventFormat[];
  cities: string[];
  organizations: Organization[];
  filters: EventFilters;
  /** How many events the current selection matches, computed by the caller. */
  matchCount: number;
  activeCount: number;
  onChange: (next: EventFilters) => void;
  onClear: () => void;
  onClose: () => void;
}

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'rounded-full px-2.5 py-[5px] font-semibold text-[0.7375rem] leading-[1.25]',
        on ? 'bg-navy text-white' : 'border border-line text-ink2',
      )}
    >
      {label}
    </button>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h3 className="mt-5 mb-2.5 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
        {title}
      </h3>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </>
  );
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Tags grouped under their category, in the order the taxonomy gave them.
  const byCategory = new Map<string, { name: string; tags: EventTag[] }>();
  for (const tag of tags) {
    const bucket = byCategory.get(tag.categorySlug);
    if (bucket) bucket.tags.push(tag);
    else byCategory.set(tag.categorySlug, { name: tag.categoryName, tags: [tag] });
  }

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
        aria-label="Filter events"
        className="absolute inset-x-0 bottom-0 z-[71] flex max-h-[88%] flex-col rounded-t-3xl bg-paper shadow-[0_-14px_40px_rgba(10,20,35,.3)]"
      >
        <div className="mx-auto mt-2.5 mb-1 h-[4.5px] w-[38px] flex-none rounded-[3px] bg-line" />

        <div className="flex-1 overflow-y-auto px-[18px]">
          <h2 className="mt-1 font-extrabold font-head text-[1.3125rem] tracking-[-0.02em]">
            Filter events
          </h2>
          <p className="mt-0.5 text-[0.78125rem] text-grey">
            {matchCount} event{matchCount === 1 ? '' : 's'} match right now
          </p>

          {/* When is a single choice, not a set: "this week and past events" is
              not a window anybody means. */}
          <Group title="When">
            {DATE_WINDOWS.map((when: DateWindow) => (
              <Chip
                key={when}
                label={DATE_WINDOW_LABELS[when]}
                on={filters.when === when}
                onClick={() => {
                  onChange({ ...filters, when });
                }}
              />
            ))}
          </Group>

          {formats.length > 1 ? (
            <Group title="Getting there">
              {formats.map((format) => (
                <Chip
                  key={format}
                  label={EVENT_FORMAT_LABELS[format]}
                  on={filters.formats.includes(format)}
                  onClick={() => {
                    onChange(toggleFilter(filters, 'formats', format));
                  }}
                />
              ))}
            </Group>
          ) : null}

          {[...byCategory.entries()].map(([slug, group]) => (
            <Group key={slug} title={group.name}>
              {group.tags.map((tag) => (
                <Chip
                  key={tag.slug}
                  label={tag.name}
                  on={filters.tags.includes(tag.slug)}
                  onClick={() => {
                    onChange(toggleFilter(filters, 'tags', tag.slug));
                  }}
                />
              ))}
            </Group>
          ))}

          {organizations.length > 0 ? (
            <Group title="Hosted by">
              {organizations.map((organization) => (
                <Chip
                  key={organization.id}
                  label={organization.name}
                  on={filters.organizations.includes(organization.id)}
                  onClick={() => {
                    onChange(toggleFilter(filters, 'organizations', organization.id));
                  }}
                />
              ))}
            </Group>
          ) : null}

          {cities.length > 0 ? (
            <Group title="City">
              {cities.map((city) => (
                <Chip
                  key={city}
                  label={city}
                  on={filters.cities.includes(city)}
                  onClick={() => {
                    onChange(toggleFilter(filters, 'cities', city));
                  }}
                />
              ))}
            </Group>
          ) : null}

          <p className="mt-5 rounded-r-[11px] border-gold border-l-[3px] bg-gold-lt px-3.5 py-3 text-[0.7875rem] text-[#5C4409] leading-[1.5]">
            Events come from the organizations’ own calendars. If something is missing, it is
            missing there too.
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
