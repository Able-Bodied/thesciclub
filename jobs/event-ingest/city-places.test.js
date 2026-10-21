import { describe, expect, it } from 'vitest';
import { citiesToPlace, placeMemberCities } from './city-places.js';

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
      { city_key: 'san jose', state: 'CA', query: 'San Jose, CA' },
      { city_key: 'portland', state: 'OR', query: 'Portland, OR' },
    ]);
  });

  it('leaves a placed city, and a missed one until a month has gone', () => {
    const placed = [
      { city_key: 'san jose', state: 'CA', latitude: 37.3, placed_at: '2026-01-01T00:00:00Z' },
      { city_key: 'nowhere', state: 'CA', latitude: null, placed_at: '2026-10-10T00:00:00Z' },
      { city_key: 'elsewhere', state: 'CA', latitude: null, placed_at: '2026-09-01T00:00:00Z' },
    ];
    const homes = ['San Jose', 'Nowhere', 'Elsewhere'].map((city) => ({ city, state: 'CA' }));
    expect(citiesToPlace(homes, placed, NOW).map((c) => c.city_key)).toEqual(['elsewhere']);
  });
});

function fakeSupabase(homes) {
  const written = [];
  return {
    written,
    from: (table) => ({
      select: () => Promise.resolve({ data: table === 'members' ? homes : [], error: null }),
      upsert: (row) => {
        written.push(row);
        return Promise.resolve({ error: null });
      },
    }),
  };
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
