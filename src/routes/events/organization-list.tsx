import { Search, X } from 'lucide-react';
import { useState } from 'react';
import { FilterChip } from '@/components/filter-sheet-shell';
import { californiaToday, type Grant, grantStatus, useGrantsByOrganization } from '@/lib/grants';
import { FollowButton } from '@/routes/events/follow-button';
import { OrganizationBadge } from '@/routes/events/organization-badge';
import type { ClubEvent, Organization } from '@/types/domain';

/**
 * The organizations directory, from `orgList()` in the mock.
 *
 * It lives under the Events tab rather than in a tab of its own because that is
 * where the mock puts it, and the reason holds: an organization is mostly
 * interesting here as the thing running what you are looking at.
 *
 * ---------------------------------------------------------------------------
 * One list, not sections
 * ---------------------------------------------------------------------------
 * This was briefly split into "can let you in", "running events here" and
 * "worth knowing about". It was reverted, and the reasoning it was built on was
 * wrong in a specific way: everybody reading this screen is already a member.
 * Who can issue an invite matters to them perhaps once, when somebody they know
 * wants in — it is not the axis they scan the list on, and promoting it to a
 * section heading made three organizations look like the important ones.
 *
 * The chip already carries it, on the rows where it is true. That is the right
 * weight for a fact that is occasionally useful and never urgent.
 *
 * The event count stays, because "101 on the calendar" is what tells somebody
 * which of these is actually running things.
 *
 * ---------------------------------------------------------------------------
 * Ordered by that count, not by name
 * ---------------------------------------------------------------------------
 * Alphabetical put Ability360 — Phoenix, nothing on the calendar — at the top
 * and NorCal SCI, which is running 101 of the 124 events, seven rows down.
 * Only 5 of the 23 organizations host anything at all, and many of the rest are
 * nowhere near a member: Portland, Atlanta, Chicago, Short Hills.
 *
 * So the list opens with the ones a member can actually turn up to, and the
 * directory of bodies worth knowing about follows, alphabetically among
 * themselves. This is ordering, not the sectioning that was tried and reverted
 * above — there are no headings, and nothing is promoted to a category.
 */

export interface DirectoryFilters {
  query: string;
  hasGrants: boolean;
  grantsOpen: boolean;
  onCalendar: boolean;
  following: boolean;
}

export const NO_FILTERS: DirectoryFilters = {
  query: '',
  hasGrants: false,
  grantsOpen: false,
  onCalendar: false,
  following: false,
};

/** Whether any of an organization's grants is open on `today`. */
export function hasOpenGrant(grants: Grant[] | undefined, today: string): boolean {
  return (grants ?? []).some((g) => grantStatus(g, today).kind === 'open');
}

/**
 * The directory's search and chips (the owner, 2026-10-20). The search matches
 * the name, place, description and tags, every word somewhere; each chip
 * narrows further.
 */
export function matchesDirectory(
  organization: Organization,
  filters: DirectoryFilters,
  facts: { grants: Grant[] | undefined; eventCount: number; following: boolean; today: string },
): boolean {
  const words = filters.query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length > 0) {
    const text = [
      organization.name,
      organization.city,
      organization.description,
      ...organization.tags,
    ]
      .join(' ')
      .toLowerCase();
    if (!words.every((word) => text.includes(word))) return false;
  }
  if (filters.hasGrants && (facts.grants ?? []).length === 0) return false;
  if (filters.grantsOpen && !hasOpenGrant(facts.grants, facts.today)) return false;
  if (filters.onCalendar && facts.eventCount === 0) return false;
  if (filters.following && !facts.following) return false;
  return true;
}

/** Busiest first, then alphabetical among the equally quiet. */
export function byCalendarActivity(
  counts: Map<string, number>,
): (a: Organization, b: Organization) => number {
  return (a, b) =>
    (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.name.localeCompare(b.name);
}

/**
 * The card is a div and the name is the button, which it was not before.
 *
 * The whole row used to be one `<button>`, and Follow cannot live inside one —
 * a button inside a button is invalid HTML, and browsers resolve it by
 * discarding the inner one, so the follow would have been a dead region that
 * opened the organization instead. The opening control is now the badge, the
 * name and the line under it, which is everything somebody aims at anyway.
 */
function OrganizationRow({
  organization,
  eventCount,
  grants,
  grantOpen,
  following,
  onToggleFollow,
  onOpen,
}: {
  organization: Organization;
  eventCount: number;
  grants: number;
  grantOpen: boolean;
  following: boolean;
  onToggleFollow: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="mb-[11px] w-full rounded-[17px] border border-line bg-paper p-3.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            onOpen(organization.id);
          }}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <OrganizationBadge
            organization={organization}
            size="lg"
            className="h-[52px] w-[52px] rounded-[16px] text-[0.875rem]"
          />
          <span className="min-w-0 flex-1">
            <span className="block font-extrabold font-head text-[1.03125rem] text-ink leading-[1.2] tracking-[-0.01em]">
              {organization.name}
            </span>
            <span className="mt-[3px] block text-[0.8125rem] text-ink2 leading-[1.42]">
              {[organization.city, eventCount > 0 ? `${eventCount} on the calendar` : null]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
        </button>
        <FollowButton
          following={following}
          onToggle={() => {
            onToggleFollow(organization.id);
          }}
          className="flex-none"
        />
      </div>
      {organization.canInvite || grants > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {organization.canInvite ? (
            <span className="rounded-full bg-gold-lt px-2.5 py-[5px] font-semibold text-[0.7375rem] text-gold-dp leading-[1.25]">
              Can issue invites
            </span>
          ) : null}
          {grantOpen ? (
            <span className="rounded-full bg-gold-lt px-2.5 py-[5px] font-semibold text-[0.7375rem] text-gold-ink leading-[1.25]">
              Grant applications open
            </span>
          ) : grants > 0 ? (
            <span className="rounded-full border border-line px-2.5 py-[4px] font-semibold text-[0.7375rem] text-ink2 leading-[1.25]">
              {grants === 1 ? 'Gives a grant' : `Gives ${grants} grants`}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function OrganizationList({
  organizations,
  events,
  following,
  onToggleFollow,
  onOpen,
}: {
  organizations: Organization[];
  /** Used only to count what each organization is running. */
  events: ClubEvent[];
  following: Set<string>;
  onToggleFollow: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const [filters, setFilters] = useState<DirectoryFilters>(NO_FILTERS);
  const grants = useGrantsByOrganization();
  const today = californiaToday();
  const counts = new Map<string, number>();
  for (const event of events) {
    if (!event.organizationId) continue;
    counts.set(event.organizationId, (counts.get(event.organizationId) ?? 0) + 1);
  }
  const shown = [...organizations]
    .filter((organization) =>
      matchesDirectory(organization, filters, {
        grants: grants.get(organization.id),
        eventCount: counts.get(organization.id) ?? 0,
        following: following.has(organization.id),
        today,
      }),
    )
    .sort(byCalendarActivity(counts));
  const filtered =
    filters.query.trim() !== '' ||
    filters.hasGrants ||
    filters.grantsOpen ||
    filters.onCalendar ||
    filters.following;
  const toggle = (key: Exclude<keyof DirectoryFilters, 'query'>) => {
    setFilters((f) => ({ ...f, [key]: !f[key] }));
  };

  return (
    <>
      <div className="relative mb-2.5">
        <Search
          className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 h-[16px] w-[16px] text-grey"
          strokeWidth={2}
          aria-hidden="true"
        />
        <input
          type="search"
          value={filters.query}
          onChange={(e) => {
            setFilters((f) => ({ ...f, query: e.target.value }));
          }}
          aria-label="Search organizations"
          placeholder="Search by name, place or what they do"
          className="min-h-[44px] w-full rounded-full border-[1.6px] border-line bg-canvas py-2 pr-9 pl-9 text-[0.875rem] text-ink outline-none transition-colors placeholder:text-grey focus:border-emphasis [&::-webkit-search-cancel-button]:appearance-none"
        />
        {filters.query ? (
          <button
            type="button"
            onClick={() => {
              setFilters((f) => ({ ...f, query: '' }));
            }}
            aria-label="Clear the search"
            data-target="small"
            className="-translate-y-1/2 absolute top-1/2 right-2 grid h-[26px] w-[26px] place-items-center rounded-full text-grey transition-colors hover:bg-tint hover:text-ink"
          >
            <X className="h-[15px] w-[15px]" />
          </button>
        ) : null}
      </div>
      <fieldset className="mb-3 flex flex-wrap gap-1.5">
        <legend className="sr-only">Filter organizations</legend>
        <FilterChip
          label="Has grants"
          on={filters.hasGrants}
          onClick={() => {
            toggle('hasGrants');
          }}
        />
        <FilterChip
          label="Grants open now"
          on={filters.grantsOpen}
          onClick={() => {
            toggle('grantsOpen');
          }}
        />
        <FilterChip
          label="On the calendar"
          on={filters.onCalendar}
          onClick={() => {
            toggle('onCalendar');
          }}
        />
        <FilterChip
          label="Following"
          on={filters.following}
          onClick={() => {
            toggle('following');
          }}
        />
      </fieldset>
      {filtered ? (
        <p role="status" className="mb-2.5 text-[0.8125rem] text-ink2">
          {shown.length === 0
            ? 'No organizations match.'
            : `${shown.length} ${shown.length === 1 ? 'organization matches' : 'organizations match'}.`}{' '}
          <button
            type="button"
            onClick={() => {
              setFilters(NO_FILTERS);
            }}
            className="min-h-[36px] font-semibold text-emphasis underline underline-offset-2"
            data-target="small"
          >
            Show all
          </button>
        </p>
      ) : null}
      {shown.map((organization) => (
        <OrganizationRow
          key={organization.id}
          organization={organization}
          eventCount={counts.get(organization.id) ?? 0}
          grants={grants.get(organization.id)?.length ?? 0}
          grantOpen={hasOpenGrant(grants.get(organization.id), today)}
          following={following.has(organization.id)}
          onToggleFollow={onToggleFollow}
          onOpen={onOpen}
        />
      ))}
      <p className="mt-4 rounded-r-[11px] border-gold border-l-[3px] bg-gold-lt px-3.5 py-3 text-gold-ink text-[0.7875rem] leading-[1.5]">
        Organizations are one of the two ways a new member gets in. The other is a mentor.
      </p>
    </>
  );
}
