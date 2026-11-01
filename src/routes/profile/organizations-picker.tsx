import { Check } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useOrganizationFollows } from '@/lib/organization-follows';
import { useOrganizations } from '@/lib/organizations';
import { cn } from '@/lib/utils';
import { loadOwnPlace, type OwnPlace } from '@/routes/profile/profile-api';
import type { Organization } from '@/types/domain';

const NEARBY = 6;

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
 * The survey's organizations screen (the owner, 2026-10-31): a few near the
 * member as buttons, and every other in a list. Choosing one is pressing Join
 * on its page, so it takes effect at once and not with the screen's Continue,
 * and one that approves first is asked.
 * One the member is in stays on the screen, to take back.
 */
export function OrganizationsPicker() {
  const { organizations, loading } = useOrganizations();
  const { following, requested, error, toggle } = useOrganizationFollows();
  const [place, setPlace] = useState<OwnPlace | null>(null);

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
  const others = organizations.filter((o) => !buttons.includes(o));

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

      <label className="mt-4 block font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
        All organizations
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) toggle(e.target.value);
          }}
          className="mt-2.5 min-h-[44px] w-full rounded-[13px] border-[1.6px] border-line bg-paper px-3 font-normal font-sans text-[1rem] text-ink normal-case tracking-normal outline-none focus:border-emphasis"
        >
          <option value="">Choose an organization</option>
          {others.map((organization) => (
            <option key={organization.id} value={organization.id}>
              {organization.name}
            </option>
          ))}
        </select>
      </label>

      {error ? (
        <p role="alert" className="mt-2 text-[0.8125rem] text-destructive leading-[1.45]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
