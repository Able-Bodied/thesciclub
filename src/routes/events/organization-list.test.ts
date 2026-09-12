import { describe, expect, it } from 'vitest';
import { byCalendarActivity } from '@/routes/events/organization-list';
import type { Organization } from '@/types/domain';

function org(id: string, name: string): Organization {
  return {
    id,
    name,
    shortCode: name.slice(0, 2).toUpperCase(),
    city: '',
    description: '',
    tags: [],
    logoPath: null,
    canInvite: false,
  };
}

describe('byCalendarActivity', () => {
  it('puts the organizations running things first', () => {
    // The real shape: 5 of 23 organizations host anything, and alphabetical
    // put Ability360 (Phoenix, nothing on the calendar) above NorCal SCI,
    // which is running 101 of the 124 events.
    const all = [org('ability', 'Ability360'), org('norcal', 'NorCal SCI'), org('borp', 'BORP')];
    const counts = new Map([
      ['norcal', 101],
      ['borp', 11],
    ]);

    expect([...all].sort(byCalendarActivity(counts)).map((o) => o.name)).toEqual([
      'NorCal SCI',
      'BORP',
      'Ability360',
    ]);
  });

  it('falls back to alphabetical among the equally quiet', () => {
    const all = [org('c', 'Craig Hospital'), org('a', 'Angel City Sports')];
    expect([...all].sort(byCalendarActivity(new Map())).map((o) => o.name)).toEqual([
      'Angel City Sports',
      'Craig Hospital',
    ]);
  });
});
