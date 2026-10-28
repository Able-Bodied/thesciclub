import { Link } from 'react-router-dom';
import { OrganizationBadge } from '@/routes/events/organization-badge';
import type { RepresentedOrganization } from '@/types/domain';

/**
 * What a member is for which organization: its org admin, its mentor, or
 * both (the owner, 2026-10-28). Given by an organization, never chosen;
 * the self-described "Member of" list stays separate.
 */
export function RepresentationTags({
  organizations,
  mentorOf = [],
}: {
  /** Org admin of these. */
  organizations: RepresentedOrganization[];
  mentorOf?: RepresentedOrganization[];
}) {
  const tags = [
    ...organizations.map((organization) => ({ organization, role: 'Org admin' })),
    ...mentorOf.map((organization) => ({ organization, role: 'Mentor' })),
  ];
  if (tags.length === 0) return null;
  return (
    <section aria-label="Roles in organizations" className="mt-4 mb-3 flex flex-wrap gap-2">
      {tags.map(({ organization, role }) => (
        <Link
          key={`${role}:${organization.id}`}
          to={`/events/organizations/${organization.id}`}
          className="inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-[14px] border border-line bg-tint px-3 py-2 font-bold font-head text-[0.8125rem] text-emphasis transition-colors hover:bg-line"
        >
          <OrganizationBadge organization={organization} />
          <span className="min-w-0 break-words">
            {role}, {organization.name}
          </span>
        </Link>
      ))}
    </section>
  );
}
