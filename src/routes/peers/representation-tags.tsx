import { Link } from 'react-router-dom';
import { OrganizationBadge } from '@/routes/events/organization-badge';
import type { RepresentedOrganization } from '@/types/domain';

export type Role = 'mentor' | 'admin';

/**
 * The organizations behind one role pill, opened from it (the owner,
 * 2026-10-28: one pill per role, not a chip per organization). Given by an
 * organization, never chosen; the self-described "Member of" list stays
 * separate.
 */
export function RoleOrganizations({
  id,
  role,
  organizations,
}: {
  id: string;
  role: Role;
  organizations: RepresentedOrganization[];
}) {
  if (organizations.length === 0) return null;
  const heading = role === 'mentor' ? 'Mentor for' : 'Org admin of';
  return (
    <section id={id} aria-label={heading} className="mt-4 mb-3">
      <h2 className="font-bold font-head text-[0.8125rem] text-ink2 uppercase tracking-[0.08em]">
        {heading}
      </h2>
      <ul className="mt-1.5 space-y-1">
        {organizations.map((organization) => (
          <li key={organization.id}>
            <Link
              to={`/events/organizations/${organization.id}`}
              className="flex min-h-[44px] items-center gap-2.5 rounded-[12px] px-2 py-1.5 font-semibold text-[0.9375rem] text-emphasis transition-colors hover:bg-tint"
            >
              <OrganizationBadge organization={organization} />
              <span className="min-w-0 break-words">{organization.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
