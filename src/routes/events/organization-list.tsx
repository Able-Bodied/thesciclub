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
            {[organization.city, eventCount > 0 ? `${eventCount} on the calendar` : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
      </div>
      {organization.canInvite ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-gold-lt px-2.5 py-[5px] font-semibold text-[0.7375rem] text-gold-dp leading-[1.25]">
            Can issue invites
          </span>
        </div>
      ) : null}
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
  const counts = new Map<string, number>();
  for (const event of events) {
    if (!event.organizationId) continue;
    counts.set(event.organizationId, (counts.get(event.organizationId) ?? 0) + 1);
  }

  return (
    <>
      {organizations.map((organization) => (
        <OrganizationRow
          key={organization.id}
          organization={organization}
          eventCount={counts.get(organization.id) ?? 0}
          onOpen={onOpen}
        />
      ))}
      <p className="mt-4 rounded-r-[11px] border-gold border-l-[3px] bg-gold-lt px-3.5 py-3 text-[#5C4409] text-[0.7875rem] leading-[1.5]">
        Organizations are one of the two ways a new member gets in. The other is a mentor.
      </p>
    </>
  );
}
