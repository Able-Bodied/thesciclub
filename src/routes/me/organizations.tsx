import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useOrganizationFollows } from '@/lib/organization-follows';
import { useOrganizations } from '@/lib/organizations';
import { OrganizationBadge } from '@/routes/events/organization-badge';

/**
 * The organizations this member belongs to, on Me (the owner, 2026-10-30).
 * Other members see the same list on their profile. Nothing is drawn with none.
 */
export function MyOrganizations() {
  const memberships = useOrganizationFollows();
  const { byId } = useOrganizations();

  const memberOf = [...memberships.following]
    .map((id) => byId.get(id))
    .filter((organization) => organization !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (memberOf.length === 0) return null;

  return (
    <section aria-labelledby="me-organizations-heading" className="mt-6 min-w-0">
      <h2
        id="me-organizations-heading"
        className="mb-3 font-extrabold font-head text-[1rem] text-ink"
      >
        Your organizations
      </h2>
      <ul className="rounded-[14px] border border-line bg-paper px-3">
        {memberOf.map((organization) => (
          <li key={organization.id} className="border-line border-b last:border-b-0">
            <Link
              to={`/events/organizations/${organization.id}`}
              state={{ from: 'me' }}
              className="flex min-h-[52px] items-center gap-2.5 py-2"
            >
              <OrganizationBadge organization={organization} />
              <span className="min-w-0 flex-1 font-bold text-[0.9375rem] text-ink">
                {organization.name}
              </span>
              <ChevronRight className="h-[18px] w-[18px] flex-none text-grey" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
