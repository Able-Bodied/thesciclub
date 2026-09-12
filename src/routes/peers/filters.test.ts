import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  citiesIn,
  filterMembers,
  othersOnly,
  regionsIn,
  toggleFilter,
  topicsIn,
} from '@/routes/peers/filters';
import { makeMember } from '@/test/factory';
import { EMPTY_MEMBER_FILTERS } from '@/types/domain';

const none = EMPTY_MEMBER_FILTERS;

describe('othersOnly', () => {
  const deck = [
    makeMember({ id: 'me', displayName: 'You' }),
    makeMember({ id: 'a', displayName: 'Ajay' }),
  ];

  it('drops the person reading it', () => {
    // The deck answers "who could I talk to", and the reader is not one of
    // them. It skewed the count under it too.
    expect(othersOnly(deck, 'me').map((m) => m.displayName)).toEqual(['Ajay']);
  });

  it('drops nobody when there is no viewer', () => {
    // Signed out, or before onboarding has written a member row.
    expect(othersOnly(deck, null)).toHaveLength(2);
  });
});

describe("the club's own account", () => {
  it('sorts last, not first', () => {
    // It used to arrive first by accident — the query orders by display_name
    // and the account is called "Admin" — so the deck opened on a full-height
    // card for the one member who is not a peer.
    const deck = [
      makeMember({ displayName: 'Admin', isAdmin: true }),
      makeMember({ displayName: 'Bea' }),
      makeMember({ displayName: 'Cal' }),
    ];
    expect(filterMembers(deck, none, 'everyone').map((m) => m.displayName)).toEqual([
      'Bea',
      'Cal',
      'Admin',
    ]);
  });

  it('is still in the deck, because it is how you reach the club', () => {
    const deck = [makeMember({ displayName: 'Admin', isAdmin: true })];
    expect(filterMembers(deck, none, 'everyone')).toHaveLength(1);
  });
});

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
    // The chip carries the grouped label, because that is what topicsIn offers.
    expect(filterMembers(deck, { ...none, topics: ['Adaptive sport'] }, 'everyone')).toHaveLength(
      1,
    );
  });

  it('finds a member who wrote the topic another way', () => {
    const deck = [
      makeMember({ displayName: 'Wrote it one way', topics: ['Going back to school'] }),
      makeMember({ displayName: 'Wrote it another', topics: ['Returning to college'] }),
      makeMember({ displayName: 'Not interested', topics: ['Cooking'] }),
    ];
    expect(
      filterMembers(deck, { ...none, topics: ['Back to school'] }, 'everyone').map(
        (m) => m.displayName,
      ),
    ).toEqual(['Wrote it one way', 'Wrote it another']);
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
    // Grouped: "Driving" is one of the wordings under the driving group, and
    // "Travel" is claimed by nothing, so it keeps the member's own word.
    expect(topicsIn(deck)).toEqual(['Driving and getting about', 'Travel']);
  });

  it('counts active filters but not the search box', () => {
    expect(activeFilterCount({ ...none, regions: ['Cervical'], search: 'x' })).toBe(1);
  });
});
