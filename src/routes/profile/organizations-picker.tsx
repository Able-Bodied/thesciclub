import { Check, Search } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { useOrganizationFollows } from '@/lib/organization-follows';
import { useOrganizations } from '@/lib/organizations';
import { cn } from '@/lib/utils';
import { loadOwnPlace, type OwnPlace } from '@/routes/profile/profile-api';
import type { Organization } from '@/types/domain';

const NEARBY = 6;
/** Matches shown at once; past this, more letters narrow it. */
const SHOWN = 8;

function placesOf(organization: Organization): { city: string; state: string | null }[] {
  return [
    { city: organization.city, state: organization.state ?? null },
    ...(organization.places ?? []).map(({ city, state }) => ({ city, state })),
  ];
}

/** Those in the member's city, then the rest of their state; a few, by name. */
export function nearbyOrganizations(
  organizations: readonly Organization[],
  place: OwnPlace | null,
  max = NEARBY,
): Organization[] {
  const state = place?.state?.trim().toLowerCase();
  if (!state) return [];
  const city = place?.city?.trim().toLowerCase();
  const closeness = (organization: Organization): number => {
    const here = placesOf(organization).filter((p) => p.state?.trim().toLowerCase() === state);
    if (here.length === 0) return 2;
    return here.some((p) => p.city.trim().toLowerCase() === city) ? 0 : 1;
  };
  return organizations
    .map((organization) => ({ organization, at: closeness(organization) }))
    .filter(({ at }) => at < 2)
    .sort((a, b) => a.at - b.at || a.organization.name.localeCompare(b.organization.name))
    .slice(0, max)
    .map(({ organization }) => organization);
}

/**
 * Organizations whose name, or a city or state of theirs, has every word typed,
 * by name. Nothing for nothing typed: the list is what was searched for.
 */
export function searchOrganizations(
  organizations: readonly Organization[],
  query: string,
): Organization[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return organizations
    .filter((organization) => {
      const text = [
        organization.name,
        ...placesOf(organization).flatMap(({ city, state }) => [city, state ?? '']),
      ]
        .join(' ')
        .toLowerCase();
      return words.every((word) => text.includes(word));
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The survey's organizations screen (the owner, 2026-10-31): a few near the
 * member as buttons, and every other in a list. Choosing one is pressing Join
 * on its page, so it takes effect at once and not with the screen's Continue,
 * and one that approves first is asked.
 * One the member is in stays on the screen, to take back.
 *
 * The others are searched for, not scrolled through (the owner, 2026-11-10:
 * the list had grown very long): a box, and what matches as boxes to tick,
 * as many as they belong to. A ticked one joins the buttons above.
 */
export function OrganizationsPicker() {
  const { organizations, loading } = useOrganizations();
  const { following, requested, error, toggle } = useOrganizationFollows();
  const [place, setPlace] = useState<OwnPlace | null>(null);
  const [query, setQuery] = useState('');
  const searchId = useId();

  useEffect(() => {
    let live = true;
    void loadOwnPlace().then(
      (found) => {
        if (live) setPlace(found);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);

  const nearby = useMemo(() => nearbyOrganizations(organizations, place), [organizations, place]);
  const buttons = [
    ...organizations.filter((o) => following.has(o.id) || requested.has(o.id)),
    ...nearby.filter((o) => !following.has(o.id) && !requested.has(o.id)),
  ];
  const matches = useMemo(() => searchOrganizations(organizations, query), [organizations, query]);

  if (loading) {
    return (
      <p role="status" className="mt-6 text-[0.875rem] text-grey">
        Loading…
      </p>
    );
  }

  return (
    <section className="mt-6">
      {buttons.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {buttons.map((organization) => {
            const asked = requested.has(organization.id);
            const on = asked || following.has(organization.id);
            return (
              <button
                key={organization.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  toggle(organization.id);
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-left font-semibold text-[0.84375rem]',
                  on ? 'bg-action text-white' : 'border border-line bg-paper text-ink2',
                )}
              >
                {on ? <Check className="h-3.5 w-3.5 flex-none" /> : null}
                {asked ? `${organization.name} · Requested` : organization.name}
              </button>
            );
          })}
        </div>
      ) : null}

      <label
        htmlFor={searchId}
        className="mt-4 block font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]"
      >
        {buttons.length > 0 ? 'Find others' : 'Find your organizations'}
      </label>
      <div className="relative mt-2.5">
        <Search
          aria-hidden="true"
          className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 h-4 w-4 text-grey"
        />
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
          placeholder="Search by name or city"
          autoComplete="off"
          enterKeyHint="search"
          className="min-h-[44px] w-full rounded-[13px] border-[1.6px] border-line bg-paper py-2 pr-3 pl-9 text-[1rem] text-ink outline-none focus:border-emphasis"
        />
      </div>

      {query.trim() ? (
        matches.length > 0 ? (
          <ul
            aria-label="Matching organizations"
            className="mt-2 divide-y divide-line rounded-[13px] border-[1.6px] border-line bg-paper"
          >
            {matches.slice(0, SHOWN).map((organization) => {
              const asked = requested.has(organization.id);
              const on = asked || following.has(organization.id);
              const where = [organization.city, organization.state].filter(Boolean).join(', ');
              return (
                <li key={organization.id}>
                  <label className="flex min-h-[48px] cursor-pointer items-center gap-3 px-3.5 py-2.5">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => {
                        toggle(organization.id);
                      }}
                      className="h-5 w-5 flex-none accent-[var(--action)]"
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold text-[0.9375rem] text-ink">
                        {organization.name}
                        {asked ? <span className="font-normal text-grey"> · Requested</span> : null}
                      </span>
                      {where ? (
                        <span className="block text-[0.8125rem] text-grey">{where}</span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-[0.875rem] text-grey">
            No organization matches that. Not in our list? Tell us about it in the box below.
          </p>
        )
      ) : null}
      {matches.length > SHOWN ? (
        <p className="mt-1.5 text-[0.8125rem] text-grey">
          {matches.length - SHOWN} more match. Type more to narrow it down.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-[0.8125rem] text-destructive leading-[1.45]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
