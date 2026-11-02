import { describe, expect, it } from 'vitest';
import { ALL_TYPES, tapTypeChip, typeChipOn } from '@/lib/organization-categories';
import {
  byCalendarActivity,
  matchesDirectory,
  NO_FILTERS,
} from '@/routes/events/organization-list';
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

describe('the Type and Sports filters', () => {
  const facts = { grants: undefined, eventCount: 0, following: false, today: '2026-11-01' };
  const gym = {
    name: 'Gym',
    city: '',
    description: 'Surfing days',
    tags: [],
    category: 'gym',
  } as unknown as Organization;

  it('shows only the first type tapped, adds the next, and ends with all of them', () => {
    const only = tapTypeChip(new Set(), 'gym');
    expect(typeChipOn(only, 'gym')).toBe(true);
    expect(typeChipOn(only, 'veterans')).toBe(false);
    const two = tapTypeChip(only, 'veterans');
    expect(typeChipOn(two, 'veterans')).toBe(true);
    expect(tapTypeChip(tapTypeChip(two, 'veterans'), 'gym').size).toBe(0);
  });

  it('turns on no chip while everything is shown, or everything is off', () => {
    expect(typeChipOn(new Set(), 'gym')).toBe(false);
    expect(typeChipOn(new Set(ALL_TYPES), 'gym')).toBe(false);
  });

  it('narrows the directory', () => {
    const hidden = { ...NO_FILTERS, hiddenTypes: new Set(['gym']) };
    expect(matchesDirectory(gym, hidden, facts)).toBe(false);
    expect(matchesDirectory(gym, { ...NO_FILTERS, sports: ['water', 'winter'] }, facts)).toBe(true);
    expect(matchesDirectory(gym, { ...NO_FILTERS, sports: ['winter'] }, facts)).toBe(false);
  });
});
