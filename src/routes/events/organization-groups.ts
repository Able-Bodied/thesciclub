import type { ClubEvent, Organization } from '@/types/domain';

/**
 * How the organizations directory is divided.
 *
 * It grew from six to twenty-three, and twenty-three cards in one alphabetical
 * run stopped answering anybody's question. The three groups are the three
 * reasons somebody opens this tab:
 *
 *   invites   Who can get me, or somebody I know, into the club? This is the
 *             only group the tab's closing note is true of, and the club's
 *             whole membership model (docs/CONTEXT.md) rests on it.
 *
 *   hosts     Who is running something I could actually turn up to? Bodies
 *             with events on this calendar that cannot issue invites.
 *
 *   wider     Everybody else — Craig, Shepherd, Reeve and the rest. Real
 *             organizations in the SCI world with nothing on our calendar,
 *             because the ingest reads two California feeds. Worth a member's
 *             time, and worth being honest that they are reference rather than
 *             something happening this month.
 *
 * Disjoint and priority-ordered: an organization that can invite appears once,
 * under invites, even when it also runs events. NorCal SCI runs a hundred of
 * them and still belongs first under "can let you in", because that is the rarer
 * and more consequential fact about it. The event count on each card carries
 * the rest.
 */

export interface OrganizationGroup {
  key: 'invites' | 'hosts' | 'wider';
  title: string;
  /** Shown under the heading. Null where the heading says enough. */
  blurb: string | null;
  organizations: Organization[];
}

/** How many events on the calendar each organization is running. */
export function eventCountsByOrganization(events: ClubEvent[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (!event.organizationId) continue;
    counts.set(event.organizationId, (counts.get(event.organizationId) ?? 0) + 1);
  }
  return counts;
}

export function groupOrganizations(
  organizations: Organization[],
  counts: Map<string, number>,
): OrganizationGroup[] {
  const invites = organizations.filter((organization) => organization.canInvite);
  const rest = organizations.filter((organization) => !organization.canInvite);
  const hosts = rest.filter((organization) => (counts.get(organization.id) ?? 0) > 0);
  const wider = rest.filter((organization) => (counts.get(organization.id) ?? 0) === 0);

  return [
    {
      key: 'invites',
      title: 'Can let you in',
      blurb:
        'A member organization or a peer mentor puts your number on the list before you can join. The app itself cannot let anybody in.',
      organizations: invites,
    },
    {
      key: 'hosts',
      title: 'Running events here',
      blurb: null,
      organizations: hosts,
    },
    {
      key: 'wider',
      title: 'Worth knowing about',
      blurb:
        'Nothing of theirs is on this calendar — it reads two Californian feeds — but these are the names that come up.',
      organizations: wider,
    },
    // A group with nobody in it is not rendered: an empty "Running events here"
    // would read as a calendar that has stopped working rather than as a
    // heading that happens to have nothing under it today.
  ].filter((group) => group.organizations.length > 0) as OrganizationGroup[];
}
