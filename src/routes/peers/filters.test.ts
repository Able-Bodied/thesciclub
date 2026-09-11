import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  citiesIn,
  filterMembers,
  regionsIn,
  toggleFilter,
  topicsIn,
} from '@/routes/peers/filters';
import { makeMember } from '@/test/factory';
import { EMPTY_MEMBER_FILTERS } from '@/types/domain';

const none = EMPTY_MEMBER_FILTERS;

describe('segments', () => {
  const deck = [
    makeMember({ displayName: 'Mentor', type: 'mentor', city: 'Eureka' }),
    makeMember({ displayName: 'Local', type: 'peer', city: 'San Jose' }),
    makeMember({ displayName: 'Distant', type: 'peer', city: 'Eureka' }),
  ];

  it('everyone shows the whole deck', () => {
    expect(filterMembers(deck, none, 'everyone')).toHaveLength(3);
  });

  it('mentors shows only mentors', () => {
    expect(filterMembers(deck, none, 'mentors').map((m) => m.displayName)).toEqual(['Mentor']);
  });

  it('near me shows only nearby cities', () => {
    expect(filterMembers(deck, none, 'near').map((m) => m.displayName)).toEqual(['Local']);
  });

  it('a member with no city is not "near me"', () => {
    const noCity = [makeMember({ displayName: 'Nowhere', city: null })];
    expect(filterMembers(noCity, none, 'near')).toHaveLength(0);
  });
});

describe('filters', () => {
  it('filters by region', () => {
    const deck = [
      makeMember({ displayName: 'Quad', region: 'Cervical' }),
      makeMember({ displayName: 'Para', region: 'Thoracic' }),
    ];
    const filtered = filterMembers(deck, { ...none, regions: ['Cervical'] }, 'everyone');
    expect(filtered.map((m) => m.displayName)).toEqual(['Quad']);
  });

  it('excludes members with no city when a city filter is on', () => {
    const deck = [makeMember({ city: null }), makeMember({ city: 'San Jose' })];
    expect(filterMembers(deck, { ...none, cities: ['San Jose'] }, 'everyone')).toHaveLength(1);
  });

  it('matches a topic filter against interests too, since people file things under both', () => {
    const deck = [makeMember({ displayName: 'A', topics: [], interests: ['Adaptive sports'] })];
    expect(filterMembers(deck, { ...none, topics: ['Adaptive sports'] }, 'everyone')).toHaveLength(
      1,
    );
  });

  it('combines filters with AND, not OR', () => {
    const deck = [
      makeMember({ displayName: 'Both', region: 'Cervical', city: 'San Jose' }),
      makeMember({ displayName: 'OnlyRegion', region: 'Cervical', city: 'Eureka' }),
    ];
    const filtered = filterMembers(
      deck,
      { ...none, regions: ['Cervical'], cities: ['San Jose'] },
      'everyone',
    );
    expect(filtered.map((m) => m.displayName)).toEqual(['Both']);
  });
});

describe('search', () => {
  const deck = [
    makeMember({ displayName: 'Nicole', bio: 'Mostly manual chair; SmartDrive to travel.' }),
    makeMember({ displayName: 'Vicki', selfCare: ['Colostomy'], bio: 'Power chair.' }),
  ];

  it('finds a term in the free-text bio, not just in indexed fields', () => {
    expect(filterMembers(deck, { ...none, search: 'smartdrive' }, 'everyone')).toHaveLength(1);
  });

  it('searches self-care, which is what people actually look for', () => {
    const found = filterMembers(deck, { ...none, search: 'colostomy' }, 'everyone');
    expect(found.map((m) => m.displayName)).toEqual(['Vicki']);
  });

  it('is case insensitive and ignores surrounding whitespace', () => {
    expect(filterMembers(deck, { ...none, search: '  NICOLE ' }, 'everyone')).toHaveLength(1);
  });

  it('an empty search matches everyone', () => {
    expect(filterMembers(deck, { ...none, search: '   ' }, 'everyone')).toHaveLength(2);
  });
});

describe('toggleFilter', () => {
  it('adds then removes, without mutating', () => {
    const on = toggleFilter(none, 'regions', 'Cervical');
    expect(on.regions).toEqual(['Cervical']);
    expect(none.regions).toEqual([]);
    expect(toggleFilter(on, 'regions', 'Cervical').regions).toEqual([]);
  });
});

describe('option lists', () => {
  const deck = [
    makeMember({ region: 'Cervical', city: 'San Jose', topics: ['Driving', 'Travel'] }),
    makeMember({ region: 'Cervical', city: null, topics: ['Driving'] }),
  ];

  it('deduplicates and drops null cities', () => {
    expect(regionsIn(deck)).toEqual(['Cervical']);
    expect(citiesIn(deck)).toEqual(['San Jose']);
    expect(topicsIn(deck)).toEqual(['Driving', 'Travel']);
  });

  it('counts active filters but not the search box', () => {
    expect(activeFilterCount({ ...none, regions: ['Cervical'], search: 'x' })).toBe(1);
  });
});
