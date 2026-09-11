import { describe, expect, it } from 'vitest';
import { eventCountsByOrganization, groupOrganizations } from '@/routes/events/organization-groups';
import { makeEvent, makeOrganization } from '@/test/factory';

const norcal = makeOrganization({ id: 'ncs', name: 'NorCal SCI', canInvite: true });
const scvmc = makeOrganization({ id: 'sc', name: 'SCVMC', canInvite: true });
const borp = makeOrganization({ id: 'borp', name: 'BORP', canInvite: false });
const craig = makeOrganization({ id: 'craig', name: 'Craig Hospital', canInvite: false });

const ALL = [norcal, scvmc, borp, craig];

/** NorCal runs two, BORP runs one, Craig and SCVMC run none. */
const EVENTS = [
  makeEvent({ organizationId: 'ncs' }),
  makeEvent({ organizationId: 'ncs' }),
  makeEvent({ organizationId: 'borp' }),
  makeEvent({ organizationId: null }),
];

function grouped() {
  return groupOrganizations(ALL, eventCountsByOrganization(EVENTS));
}

describe('eventCountsByOrganization', () => {
  it('counts events per organization', () => {
    const counts = eventCountsByOrganization(EVENTS);
    expect(counts.get('ncs')).toBe(2);
    expect(counts.get('borp')).toBe(1);
  });

  it('ignores events with no organization', () => {
    // A host the club has no row for is attributed by host_name only.
    expect(eventCountsByOrganization(EVENTS).size).toBe(2);
  });
});

describe('groupOrganizations', () => {
  it('puts everyone who can invite first, even when they also run events', () => {
    // NorCal runs the calendar and still belongs here: being able to let
    // somebody in is the rarer and more consequential fact about it.
    const [first] = grouped();
    expect(first?.key).toBe('invites');
    expect(first?.organizations.map((o) => o.id)).toEqual(['ncs', 'sc']);
  });

  it('puts each organization in exactly one group', () => {
    const ids = grouped().flatMap((g) => g.organizations.map((o) => o.id));
    expect(ids).toHaveLength(new Set(ids).size);
    expect(new Set(ids)).toEqual(new Set(['ncs', 'sc', 'borp', 'craig']));
  });

  it('separates bodies running events from bodies that are not', () => {
    const byKey = Object.fromEntries(
      grouped().map((g) => [g.key, g.organizations.map((o) => o.id)]),
    );
    expect(byKey.hosts).toEqual(['borp']);
    expect(byKey.wider).toEqual(['craig']);
  });

  it('only tells the membership rule under the group it is true of', () => {
    // It used to sit at the bottom of the whole list, under twenty rows that
    // cannot let anybody in.
    const groups = grouped();
    const invites = groups.find((g) => g.key === 'invites');
    const wider = groups.find((g) => g.key === 'wider');
    expect(invites?.blurb).toMatch(/cannot let anybody in/);
    expect(wider?.blurb).not.toMatch(/list/);
  });

  it('drops a group with nobody in it rather than showing an empty heading', () => {
    // An empty "Running events here" reads as a broken calendar.
    const groups = groupOrganizations([norcal], new Map());
    expect(groups.map((g) => g.key)).toEqual(['invites']);
  });

  it('handles no organizations at all', () => {
    expect(groupOrganizations([], new Map())).toEqual([]);
  });

  it('moves an organization into hosts as soon as it has an event', () => {
    const before = groupOrganizations(ALL, eventCountsByOrganization([]));
    expect(before.find((g) => g.key === 'hosts')).toBeUndefined();
    const after = grouped();
    expect(after.find((g) => g.key === 'hosts')?.organizations.map((o) => o.id)).toEqual(['borp']);
  });
});
