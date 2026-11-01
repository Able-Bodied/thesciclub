import { ChevronDown, ChevronRight } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOrganizationFollows } from '@/lib/organization-follows';
import { useOrganizations } from '@/lib/organizations';
import { cn } from '@/lib/utils';
import { OrganizationBadge } from '@/routes/events/organization-badge';

/**
 * The organizations this member belongs to, on Me (the owner, 2026-10-30),
 * behind a button so they do not push the rest of Me down (2026-10-31).
 * Other members see the same list on their profile. Nothing is drawn with none.
 */
export function MyOrganizations() {
  const memberships = useOrganizationFollows();
  const { byId } = useOrganizations();
  const [open, setOpen] = useState(false);
  const listId = useId();

  const memberOf = [...memberships.following]
    .map((id) => byId.get(id))
    .filter((organization) => organization !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (memberOf.length === 0) return null;

  return (
    <section aria-labelledby="me-organizations-heading" className="mt-6 min-w-0">
      <h2 id="me-organizations-heading">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => {
            setOpen(!open);
          }}
          className="flex min-h-[64px] w-full items-center gap-3 rounded-[14px] border border-line bg-paper p-3.5 text-left transition-colors hover:bg-tint"
        >
          <span className="min-w-0 flex-1">
            <span className="block font-extrabold font-head text-[0.96875rem] text-ink">
              Your organizations
            </span>
            <span className="mt-1 block font-normal text-[0.8125rem] text-ink2 leading-[1.5]">
              {memberOf.length === 1 ? '1 organization' : `${memberOf.length} organizations`}
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn('h-5 w-5 flex-none text-emphasis', open && 'rotate-180')}
          />
        </button>
      </h2>
      <ul
        id={listId}
        hidden={!open}
        className="mt-2.5 rounded-[14px] border border-line bg-paper px-3"
      >
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
