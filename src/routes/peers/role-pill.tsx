import { cn } from '@/lib/utils';
import { OrganizationBadge } from '@/routes/events/organization-badge';
import type { BrowseMember, RepresentedOrganization } from '@/types/domain';

/** How many logos fit in a pill before it says "+1". */
const MAX_LOGOS = 2;

/** The star a mentor of no organization still gets. Inline so the pill is one element. */
function Star() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-[11px] w-[11px] flex-none fill-current"
    >
      <path d="m12 2 2.1 5.6L20 9.7l-5.1 3 .8 6.1-3.7-3-3.7 3 .8-6.1-5.1-3 5.9-2.1L12 2Z" />
    </svg>
  );
}

/** "NorCal SCI and The SCI Club", for the words a screen reader hears. */
export function namesOf(organizations: RepresentedOrganization[]): string {
  const names = organizations.map((organization) => organization.name);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
}

/**
 * "Mentor" or "Admin", with the logo of each organization it is for (the
 * owner, 2026-10-28): a mentor is badged by the organization that made them
 * one, The SCI Club included. With `onToggle` it is a button that opens the
 * list of them.
 */
export function RolePill({
  kind,
  organizations,
  className,
  expanded,
  controls,
  onToggle,
}: {
  kind: 'mentor' | 'admin';
  organizations: RepresentedOrganization[];
  className?: string;
  expanded?: boolean;
  /** The id of the list it opens. */
  controls?: string;
  onToggle?: () => void;
}) {
  const shown = organizations.slice(0, MAX_LOGOS);
  const more = organizations.length - shown.length;
  const label = kind === 'mentor' ? 'Mentor' : 'Admin';
  const classes = cn(
    'inline-flex items-center gap-1.5 rounded-full py-[4px] pr-2.5 font-extrabold font-head text-[0.6875rem] uppercase leading-none tracking-[0.08em]',
    shown.length > 0 ? 'pl-[4px]' : 'pl-2.5',
    kind === 'mentor' ? 'bg-gold text-on-gold' : 'bg-white text-navy',
    className,
  );
  const inside = (
    <>
      {shown.length > 0 ? (
        <span className="flex -space-x-1" aria-hidden="true">
          {shown.map((organization) => (
            <OrganizationBadge
              key={organization.id}
              organization={organization}
              tight
              className="h-[2.25em] w-[2.25em] rounded-full text-[0.5rem] ring-[1.5px] ring-white/80"
            />
          ))}
        </span>
      ) : kind === 'mentor' ? (
        <Star />
      ) : null}
      {label}
      {more > 0 ? <span aria-hidden="true">+{more}</span> : null}
      {organizations.length > 0 ? (
        <span className="sr-only">{`, ${namesOf(organizations)}`}</span>
      ) : null}
    </>
  );
  // Only worth a tap when there is something to list.
  if (onToggle && organizations.length > 0) {
    return (
      <button
        type="button"
        aria-expanded={expanded === true}
        aria-controls={controls}
        onClick={onToggle}
        className={cn(classes, 'min-h-[36px] cursor-pointer')}
        data-target="small"
      >
        {inside}
      </button>
    );
  }
  return <span className={classes}>{inside}</span>;
}

/** A mentor of any organization, or of none yet (an administrator, or from before 20261028000000). */
export function isMentor(member: Pick<BrowseMember, 'type' | 'mentorOrganizations'>): boolean {
  return member.type === 'mentor' || member.mentorOrganizations.length > 0;
}

/** A club administrator, or an org admin of any organization. */
export function isAdminOfAny(
  member: Pick<BrowseMember, 'isAdmin' | 'representedOrganizations'>,
): boolean {
  return member.isAdmin || member.representedOrganizations.length > 0;
}
