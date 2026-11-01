import { useEffect, useRef, useState } from 'react';
import { FilterChip, FilterGroup, FilterSheetShell } from '@/components/filter-sheet-shell';
import type { NearHomeStatus } from '@/lib/near-home';
import { DistanceFilter } from '@/routes/events/distance-filter';
import { AGE_BANDS, toggleFilter } from '@/routes/peers/filters';
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
 * twenty and twenty-four chips (more, once "Show all" is pressed). A CSS column cannot split a group without
 * breaking it across the gutter, so the long ones stay whole and the short one
 * leaves a column-height hole beside them. Stacked full width, the chips wrap
 * three or four to a row and there is no hole at all.
 */

/**
 * How many topics are drawn before "Show all". They come most common first, so
 * these are the ones that narrow a deck; the rest are mostly one member's own
 * words. Until 2026-10-01 the list stopped here, and a topic past it could be
 * found by the deck's search but never ticked.
 */
export const TOPICS_SHOWN = 24;

const ROLES: [MemberFilters['role'], string][] = [
  ['any', 'Everyone'],
  ['mentors', 'Mentors'],
  ['peers', 'Not mentors'],
];

export interface FilterSheetProps {
  regions: InjuryRegion[];
  /** Somebody in the deck has a spinal cord condition: offer its chip. */
  conditions: boolean;
  /** The organizations of the members in the list, by name (organizationsIn). */
  organizations: string[];
  /** The member's own city and whether distances can be measured. */
  home: { city: string | null; status: NearHomeStatus };
  /** Age groups somebody in the deck is in (ageBandsIn). */
  ages: string[];
  /** Every topic, most common first. The sheet decides how many to draw. */
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
  conditions,
  organizations,
  home,
  ages,
  topics,
  filters,
  matchCount,
  activeCount,
  onChange,
  onClear,
  onClose,
}: FilterSheetProps) {
  const [allTopics, setAllTopics] = useState(false);
  const topicGroup = useRef<HTMLDivElement | null>(null);
  // A ticked topic is always drawn, wherever it falls in the order.
  const shownTopics = allTopics
    ? topics
    : topics.filter((topic, index) => index < TOPICS_SHOWN || filters.topics.includes(topic));
  const hiddenCount = topics.length - shownTopics.length;

  // The button that revealed them is gone, so focus goes to the first topic
  // that was not there before, rather than to the top of the page.
  useEffect(() => {
    if (!allTopics) return;
    const chips = topicGroup.current?.querySelectorAll<HTMLButtonElement>('button[aria-pressed]');
    const firstNew = chips ? chips[TOPICS_SHOWN] : undefined;
    firstNew?.focus();
  }, [allTopics]);

  return (
    <FilterSheetShell
      title="Filter peers"
      summary={`${matchCount} member${matchCount === 1 ? '' : 's'} match right now`}
      onClose={onClose}
      onClear={onClear}
      clearCount={activeCount}
      applyLabel={`Show ${matchCount}`}
    >
      <DistanceFilter
        miles={filters.withinMiles}
        city={home.city}
        status={home.status}
        things="members"
        note="From the middle of your city to the middle of theirs. Members who keep off the map aren’t counted."
        onChange={(withinMiles) => {
          onChange({ ...filters, withinMiles });
        }}
      />

      <FilterGroup title="Mentors">
        {ROLES.map(([role, label]) => (
          <FilterChip
            key={role}
            label={label}
            on={filters.role === role}
            onClick={() => {
              onChange({ ...filters, role });
            }}
          />
        ))}
      </FilterGroup>

      {regions.length > 0 || conditions ? (
        <FilterGroup title="Level or condition">
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
          {conditions ? (
            <FilterChip
              label="Other disability"
              on={filters.condition}
              onClick={() => {
                onChange({ ...filters, condition: !filters.condition });
              }}
            />
          ) : null}
        </FilterGroup>
      ) : null}

      {ages.length > 0 ? (
        <FilterGroup title="Age">
          {AGE_BANDS.filter((band) => ages.includes(band.id)).map((band) => (
            <FilterChip
              key={band.id}
              label={band.label}
              on={filters.ages.includes(band.id)}
              onClick={() => {
                onChange(toggleFilter(filters, 'ages', band.id));
              }}
            />
          ))}
        </FilterGroup>
      ) : null}

      {organizations.length > 0 || filters.organization ? (
        <label className="mb-4 block">
          <span className="mb-2 block font-extrabold font-head text-[0.71875rem] text-grey uppercase tracking-[0.13em]">
            Member of
          </span>
          <select
            value={filters.organization ?? ''}
            onChange={(event) => {
              onChange({ ...filters, organization: event.target.value || null });
            }}
            className="min-h-[44px] w-full rounded-[12px] border-[1.6px] border-line bg-paper px-3.5 text-[1rem] text-ink outline-none focus:border-emphasis"
          >
            <option value="">Any organization</option>
            {/* Kept while chosen, though a change elsewhere leaves nobody in it. */}
            {[
              ...new Set([
                ...(filters.organization ? [filters.organization] : []),
                ...organizations,
              ]),
            ]
              .sort((a, b) => a.localeCompare(b))
              .map((organization) => (
                <option key={organization} value={organization}>
                  {organization}
                </option>
              ))}
          </select>
        </label>
      ) : null}

      {topics.length > 0 ? (
        <div ref={topicGroup}>
          <FilterGroup title="Happy to talk about">
            {shownTopics.map((topic) => (
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
          {hiddenCount > 0 ? (
            <button
              type="button"
              onClick={() => {
                setAllTopics(true);
              }}
              data-target="small"
              className="-mt-2 mb-4 font-semibold text-[0.8125rem] text-emphasis underline decoration-line underline-offset-2 hover:decoration-emphasis"
            >
              Show all {topics.length} topics
            </button>
          ) : null}
        </div>
      ) : null}

      <p className="mb-4 rounded-r-[11px] border-gold border-l-[3px] bg-gold-lt px-3.5 py-3 text-gold-ink text-[0.7875rem] leading-[1.5]">
        Step-free access is assumed everywhere in the club, so it is not a filter.
      </p>
    </FilterSheetShell>
  );
}
