import { OrganizationBadge } from '@/routes/events/organization-badge';
import { eventCountsByOrganization, groupOrganizations } from '@/routes/events/organization-groups';
import type { ClubEvent, Organization } from '@/types/domain';

/**
 * The organizations directory, from `orgList()` in the mock.
 *
 * It lives under the Events tab rather than in a tab of its own because that is
 * where the mock puts it, and the reason holds: an organization is mostly
 * interesting here as the thing running what you are looking at.
 *
 * Grouped rather than one alphabetical run — see organization-groups.ts. The
 * note about how somebody gets into the club now sits under the group it is
 * actually true of, instead of at the bottom of a list where twenty of the
 * twenty-three rows above it cannot let anybody in. docs/CONTEXT.md asks that
 * this stay visible in the product; it does not ask for it to be misleading.
 */

function OrganizationRow({
  organization,
  eventCount,
  onOpen,
}: {
  organization: Organization;
  eventCount: number;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        onOpen(organization.id);
      }}
      className="mb-[11px] block w-full rounded-[17px] border border-line bg-paper p-3.5 text-left"
    >
      <div className="flex items-center gap-3">
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
            {/* The count is the rest of the answer: it is how somebody sees that
                NorCal SCI runs the calendar even though it is filed under
                "can let you in". */}
            {[organization.city, eventCount > 0 ? `${eventCount} on the calendar` : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
      </div>
    </button>
  );
}

export function OrganizationList({
  organizations,
  events,
  onOpen,
}: {
  organizations: Organization[];
  /** Used only to count what each organization is running. */
  events: ClubEvent[];
  onOpen: (id: string) => void;
}) {
  const counts = eventCountsByOrganization(events);
  const groups = groupOrganizations(organizations, counts);

  return (
    <>
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`orggroup-${group.key}`}>
          <h2
            id={`orggroup-${group.key}`}
            className="mt-5 mb-1 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em] first:mt-0"
          >
            {group.title}
          </h2>
          {group.blurb ? (
            <p className="mb-2.5 text-[0.78125rem] text-grey leading-[1.5]">{group.blurb}</p>
          ) : (
            <div className="mb-2.5" />
          )}
          {group.organizations.map((organization) => (
            <OrganizationRow
              key={organization.id}
              organization={organization}
              eventCount={counts.get(organization.id) ?? 0}
              onOpen={onOpen}
            />
          ))}
        </section>
      ))}
    </>
  );
}
