import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useOrganizationFollows } from '@/lib/organization-follows';
import { useMyOrganizationMemberships } from '@/lib/organization-members';
import { useOrganizations } from '@/lib/organizations';
import { OrganizationBadge } from '@/routes/events/organization-badge';

/**
 * The organizations on Me (the owner, 2026-10-30): the ones this member
 * belongs to and the ones they follow, apart. Only they see this, so nothing
 * here says who follows what to anybody else. Nothing is drawn with neither.
 */
export function MyOrganizations({ userId }: { userId: string }) {
  const memberships = useMyOrganizationMemberships(userId);
  const follows = useOrganizationFollows();
  const { byId } = useOrganizations();

  const named = (ids: Iterable<string>) =>
    [...ids]
      .map((id) => byId.get(id))
      .filter((organization) => organization !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name));
  const memberOf = named(memberships.ids);
  const following = named(follows.following);
  if (memberOf.length === 0 && following.length === 0) return null;

  const rows = (list: typeof memberOf, heading: string) =>
    list.length > 0 ? (
      <>
        <h3 className="mt-3 mb-1.5 font-bold text-[0.8125rem] text-grey first:mt-0">{heading}</h3>
        <ul className="rounded-[14px] border border-line bg-paper px-3">
          {list.map((organization) => (
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
                <ChevronRight
                  className="h-[18px] w-[18px] flex-none text-grey"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      </>
    ) : null;

  return (
    <section aria-labelledby="me-organizations-heading" className="mt-6 min-w-0">
      <h2
        id="me-organizations-heading"
        className="mb-3 font-extrabold font-head text-[1rem] text-ink"
      >
        Your organizations
      </h2>
      {rows(memberOf, 'Member of')}
      {rows(following, 'Following')}
    </section>
  );
}
