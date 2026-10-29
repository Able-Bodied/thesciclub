import { describe, expect, it } from 'vitest';
import {
  citiesToPlace,
  eventCities,
  organizationCities,
  placeMemberCities,
  zipsToPlace,
} from './city-places.js';

const NOW = new Date('2026-10-20T12:00:00Z');

describe('citiesToPlace', () => {
  it('asks once a city, whatever its spelling, and skips one with no city', () => {
    const todo = citiesToPlace(
      [
        { city: 'San Jose', state: 'CA' },
        { city: ' san jose ', state: 'CA' },
        { city: '', state: 'CA' },
        { city: 'Portland', state: 'OR' },
      ],
      [],
      NOW,
    );
    expect(todo).toEqual([
      { city_key: 'san jose', state: 'CA', query: 'San Jose, CA', placed: false },
      { city_key: 'portland', state: 'OR', query: 'Portland, OR', placed: false },
    ]);
  });

  it('leaves a placed city, and a missed one until a month has gone', () => {
    const placed = [
      {
        city_key: 'san jose',
        state: 'CA',
        latitude: 37.3,
        placed_at: '2026-01-01T00:00:00Z',
        settlement: true,
      },
      { city_key: 'nowhere', state: 'CA', latitude: null, placed_at: '2026-10-10T00:00:00Z' },
      { city_key: 'elsewhere', state: 'CA', latitude: null, placed_at: '2026-09-01T00:00:00Z' },
    ];
    const homes = ['San Jose', 'Nowhere', 'Elsewhere'].map((city) => ({ city, state: 'CA' }));
    expect(citiesToPlace(homes, placed, NOW).map((c) => c.city_key)).toEqual(['elsewhere']);
  });
});

function fakeSupabase(homes, events = [], organizations = [], places = []) {
  const written = [];
  const rows = { members: homes, events, organizations, organization_places: places };
  // A read that may be narrowed (events) or awaited as it is (members).
  const query = (data) => {
    const read = Promise.resolve({ data, error: null });
    const narrowed = Object.assign(read, {
      is: () => narrowed,
      not: () => narrowed,
      gte: () => read,
    });
    return narrowed;
  };
  const fake = {
    written,
    placed: [],
    from: (table) => ({
      select: () => query(table === 'city_places' ? fake.placed : (rows[table] ?? [])),
      upsert: (row) => {
        written.push(row);
        return Promise.resolve({ error: null });
      },
    }),
  };
  return fake;
}

describe('placeMemberCities', () => {
  it('keeps a match in another state as not found', async () => {
    const supabase = fakeSupabase([
      { city: 'Davis', state: 'CA' },
      { city: 'Springfield', state: 'IL' },
    ]);
    await placeMemberCities(supabase, { dryRun: false }, (query) =>
      Promise.resolve(
        query === 'Davis, CA'
          ? { state: 'CA', latitude: 38.5, longitude: -121.7 }
          : { state: 'MO', latitude: 37.2, longitude: -93.3 },
      ),
    );
    expect(supabase.written.map((r) => [r.city_key, r.latitude])).toEqual([
      ['davis', 38.5],
      ['springfield', null],
    ]);
  });
});

describe('events nobody geocoded', () => {
  it('places their cities beside members’ ones', async () => {
    const supabase = fakeSupabase(
      [{ city: 'Davis', state: 'CA' }],
      [{ city: 'Menlo Park', state: 'CA' }],
    );
    await placeMemberCities(supabase, { dryRun: false }, (query) =>
      Promise.resolve({
        state: 'CA',
        latitude: query === 'Davis, CA' ? 38.5 : 37.45,
        longitude: -122,
      }),
    );
    expect(supabase.written.map((r) => [r.city_key, r.latitude])).toEqual([
      ['davis', 38.5],
      ['menlo park', 37.45],
    ]);
  });
});

describe('an event with a state and no city', () => {
  // Main places (position 0), as organization_places holds them.
  const organizations = [
    { organization_id: 'blz', position: 0, city: 'Atlanta', state: 'GA' },
    { organization_id: 'blz', position: 1, city: 'Decatur', state: 'GA' },
    { organization_id: 'none', position: 0, city: null, state: 'GA' },
  ];

  it('is placed by its organization’s main place in its own state', () => {
    expect(
      eventCities(
        [
          { city: null, state: 'GA', organization_id: 'blz', event_format: 'in_person' },
          { city: 'Lilburn', state: 'GA', organization_id: 'blz', event_format: 'in_person' },
          { city: null, state: 'GA', organization_id: 'blz', event_format: 'online' },
          { city: null, state: 'GA', organization_id: 'none', event_format: 'in_person' },
          { city: null, state: 'GA', organization_id: null, event_format: null },
        ],
        organizations,
      ),
    ).toEqual([
      { city: 'Atlanta', state: 'GA' },
      { city: 'Lilburn', state: 'GA' },
    ]);
  });

  it('asks the map for Atlanta, GA', async () => {
    const supabase = fakeSupabase(
      [],
      [{ city: null, state: 'GA', organization_id: 'blz', event_format: 'in_person' }],
      [],
      organizations.slice(0, 1),
    );
    const asked = [];
    await placeMemberCities(supabase, { dryRun: false }, (query) => {
      asked.push(query);
      return Promise.resolve({ state: 'GA', latitude: 33.75, longitude: -84.39 });
    });
    expect(asked).toEqual(['Atlanta, GA']);
    expect(supabase.written.map((r) => [r.city_key, r.state])).toEqual([['atlanta', 'GA']]);
  });
});

describe('organizations, for the map', () => {
  const organizations = [
    { id: 'mtw', city: 'Stratford', state: 'CT' },
    { id: 'ibf', city: 'Columbus', state: null },
    { id: 'blz', city: 'Atlanta', state: 'GA' },
  ];

  it('asks for each city in its own state, and not for one with no state', async () => {
    const supabase = fakeSupabase(
      [{ city: 'Stratford', state: 'CA' }],
      [],
      organizations,
      organizations.filter((o) => o.state).map(({ city, state }) => ({ city, state })),
    );
    const asked = [];
    await placeMemberCities(supabase, { dryRun: false }, (query) => {
      asked.push(query);
      return Promise.resolve({ state: query.slice(-2), latitude: 41.2, longitude: -73.1 });
    });
    expect(asked).toEqual(['Stratford, CA', 'Stratford, CT', 'Atlanta, GA']);
    expect(supabase.written.map((r) => `${r.city_key}|${r.state}`)).toEqual([
      'stratford|CA',
      'stratford|CT',
      'atlanta|GA',
    ]);
  });

  it('places an event at its organization’s city only in the organization’s own state', () => {
    expect(organizationCities(organizations)).toEqual([
      { city: 'Stratford', state: 'CT' },
      { city: 'Atlanta', state: 'GA' },
    ]);
    const places = organizations
      .filter((o) => o.state)
      .map(({ id, city, state }) => ({ organization_id: id, position: 0, city, state }));
    expect(
      eventCities(
        [
          { city: null, state: 'TX', organization_id: 'blz', event_format: 'in_person' },
          { city: null, state: 'GA', organization_id: 'blz', event_format: 'in_person' },
          { city: null, state: 'OH', organization_id: 'ibf', event_format: 'in_person' },
        ],
        places,
      ),
    ).toEqual([{ city: 'Atlanta', state: 'GA' }]);
  });

  it('never uses the directory’s city text: an organization with no place places nothing', () => {
    expect(
      eventCities(
        [{ city: null, state: 'CA', organization_id: 'scas', event_format: 'in_person' }],
        [],
      ),
    ).toEqual([]);
  });
});

describe('only a settlement is a middle (20261025020000)', () => {
  it('places again a city kept before settlements were asked for', () => {
    const placed = [
      { city_key: 'davis', state: 'CA', latitude: 38.5, placed_at: '2026-10-01T00:00:00Z' },
      {
        city_key: 'chico',
        state: 'CA',
        latitude: 39.7,
        placed_at: '2026-10-01T00:00:00Z',
        settlement: true,
      },
    ];
    const homes = ['Davis', 'Chico'].map((city) => ({ city, state: 'CA' }));
    expect(citiesToPlace(homes, placed, NOW).map((c) => c.city_key)).toEqual(['davis']);
  });

  it('keeps what the settlement search found, and nothing for a building', async () => {
    const supabase = fakeSupabase([
      { city: 'Davis', state: 'CA' },
      { city: 'UC Davis Medical Center', state: 'CA' },
    ]);
    await placeMemberCities(supabase, { dryRun: false }, (query) =>
      Promise.resolve(
        query === 'Davis, CA'
          ? { state: 'CA', latitude: 38.5, longitude: -121.7, settlement: 'city' }
          : null,
      ),
    );
    expect(supabase.written.map((r) => [r.city_key, r.latitude, r.settlement])).toEqual([
      ['davis', 38.5, true],
      ['uc davis medical center', null, false],
    ]);
  });
});

describe('a check never wipes a place (20261025020000)', () => {
  it('keeps the coordinates of a placed city the settlement search refuses', async () => {
    const supabase = fakeSupabase([{ city: 'Tarzana', state: 'CA' }]);
    supabase.placed = [
      { city_key: 'tarzana', state: 'CA', latitude: 34.17, placed_at: '2026-01-01T00:00:00Z' },
    ];
    await placeMemberCities(supabase, { dryRun: false }, () => Promise.resolve(null));
    expect(supabase.written).toHaveLength(1);
    expect(supabase.written[0]).not.toHaveProperty('latitude');
    expect(supabase.written[0]).toMatchObject({ city_key: 'tarzana', settlement: null });
  });

  it('asks again after a month, not every night', () => {
    const homes = [{ city: 'Tarzana', state: 'CA' }];
    const row = (checked) => ({
      city_key: 'tarzana',
      state: 'CA',
      latitude: 34.17,
      placed_at: '2026-01-01T00:00:00Z',
      settlement: null,
      settlement_checked_at: checked,
    });
    expect(citiesToPlace(homes, [row('2026-10-19T00:00:00Z')], NOW)).toEqual([]);
    expect(citiesToPlace(homes, [row('2026-09-01T00:00:00Z')], NOW)).toHaveLength(1);
    expect(citiesToPlace(homes, [row(null)], NOW)).toHaveLength(1);
  });
});

describe('zipsToPlace', () => {
  it('asks once a zip, skips one placed or tried lately, and retries a month-old miss', () => {
    const todo = zipsToPlace(
      ['95112', '95112', '9511', null, '94040', '10001', '60601'],
      [
        { zip: '94040', latitude: 37.38, placed_at: '2026-01-01T00:00:00Z' },
        { zip: '10001', latitude: null, placed_at: '2026-10-10T00:00:00Z' },
        { zip: '60601', latitude: null, placed_at: '2026-09-01T00:00:00Z' },
      ],
      NOW,
    );
    expect(todo).toEqual(['95112', '60601']);
  });
});
