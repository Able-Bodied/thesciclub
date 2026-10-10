import { Link } from 'react-router-dom';
import { OrganizationBadge } from '@/routes/events/organization-badge';
import type { RepresentedOrganization } from '@/types/domain';

/** Only administrator links earn this label; membership affiliations remain separate. */
export function RepresentationTags({
  organizations,
}: {
  organizations: RepresentedOrganization[];
}) {
  if (organizations.length === 0) return null;
  return (
    <section aria-label="Organizations represented" className="mt-4 mb-3 flex flex-wrap gap-2">
      {organizations.map((organization) => (
        <Link
          key={organization.id}
          to={`/events/organizations/${organization.id}`}
          className="inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-[14px] border border-line bg-tint px-3 py-2 font-bold font-head text-[0.8125rem] text-emphasis transition-colors hover:bg-line"
        >
          <OrganizationBadge organization={organization} />
          <span className="min-w-0 break-words">Represents {organization.name}</span>
        </Link>
      ))}
    </section>
  );
}
