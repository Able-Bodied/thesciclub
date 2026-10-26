import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  geocodeEvents,
  geocodeKey,
  lookUpSettlement,
  RateLimited,
  Unreachable,
} from './geocode.js';

const at = (city) => ({ city, postalCode: null, latitude: 1, longitude: 2, precision: 'exact' });

describe('geocodeEvents', () => {
  it('looks a place up once a run, however many events are there', async () => {
    const asked = [];
    const events = ['Gym, Decatur, GA', 'Gym, Decatur, GA', 'Gym, Decatur, GA'].map(
      (location, i) => ({
        external_id: String(i),
        location,
      }),
    );
    await geocodeEvents(events, new Map(), (place) => {
      asked.push(place);
      return Promise.resolve(at('Decatur'));
    });
    expect(asked).toEqual(['Gym, Decatur, GA']);
    expect(events.map((e) => e.city)).toEqual(['Decatur', 'Decatur', 'Decatur']);
  });

  it('stops asking once the service says too many, and leaves the rest for the next run', async () => {
    let asked = 0;
    const events = ['A, CA', 'B, CA', 'C, CA'].map((location, i) => ({
      external_id: String(i),
      location,
    }));
    await geocodeEvents(events, new Map(), () => {
      asked++;
      return Promise.reject(new RateLimited('Nominatim answered 429'));
    });
    expect(asked).toBe(1);
    expect(events.map((e) => e.city)).toEqual([null, null, null]);
  });
});

describe('geocodeEvents, and whether a place was asked', () => {
  it('marks a looked-up, a kept and a found-nowhere place as asked, a paused one not', async () => {
    const events = [
      { external_id: 'a', location: 'Gym, Davis, CA' },
      { external_id: 'b', location: 'Kept, CA' },
      { external_id: 'c', location: '' },
    ];
    const prior = new Map([['b', { location: 'Kept, CA', latitude: 1, longitude: 2 }]]);
    await geocodeEvents(events, prior, () => Promise.resolve(null));
    expect(events.map((e) => e.geocode_tried)).toEqual([true, true, false]);

    const paused = [{ external_id: 'd', location: 'A, CA' }];
    await geocodeEvents(paused, new Map(), () => Promise.reject(new RateLimited('429')));
    expect(paused[0].geocode_tried).toBe(false);
  });
});

// The same cases as supabase/tests/event-geocode.sql step 1, for geocode_key.
const KEY_CASES = [
  [['1 Main St', 'Probetown', 'CA'], '1 Main St, Probetown, CA'],
  [['1 Main St, Probetown, CA 95814', 'probetown', 'CA'], '1 Main St, Probetown, CA 95814'],
  [['  Gym  ', null, null], 'Gym'],
  [['', 'Davis', 'CA'], null],
  [[null, 'Davis', 'CA'], null],
  [['Cascade Hall', 'Davis', 'CA'], 'Cascade Hall, Davis, CA'],
  [['\tHall\n', ' Davis ', null], 'Hall, Davis'],
];

describe('geocodeKey', () => {
  it('is the place, with the city and state it does not name', () => {
    for (const [args, key] of KEY_CASES) expect(geocodeKey(...args)).toBe(key);
  });
});

describe('lookUpSettlement', () => {
  const answer = (top) =>
    vi.stubGlobal('fetch', (url) => {
      answer.url = url.toString();
      return Promise.resolve(new Response(JSON.stringify(top ? [top] : []), { status: 200 }));
    });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const hit = (addresstype) => ({
    addresstype,
    lat: '38.5449',
    lon: '-121.7405',
    address: { 'ISO3166-2-lvl4': 'US-CA' },
  });

  it('asks for a settlement, and keeps a city, town or village', async () => {
    answer(hit('town'));
    expect(await lookUpSettlement('Davis, CA')).toEqual({
      state: 'CA',
      latitude: 38.5449,
      longitude: -121.7405,
      settlement: 'town',
    });
    expect(answer.url).toContain('featuretype=settlement');
  });

  it('keeps a named part of a city: Tarzana and Van Nuys come back as suburbs', async () => {
    for (const type of ['suburb', 'neighbourhood', 'quarter', 'city_district', 'borough']) {
      answer(hit(type));
      expect((await lookUpSettlement('Tarzana, CA'))?.settlement).toBe(type);
    }
  });

  it('turns a dropped connection or a timeout into no answer, so the run goes on', async () => {
    for (const error of [
      new TypeError('fetch failed'),
      new DOMException('timed out', 'TimeoutError'),
    ]) {
      vi.stubGlobal('fetch', () => Promise.reject(error));
      await expect(lookUpSettlement('Davis, CA')).rejects.toBeInstanceOf(Unreachable);
    }
  });

  it('is nothing for a building, a road or a county', async () => {
    for (const type of [
      'building',
      'road',
      'hospital',
      'county',
      'state',
      'city_block',
      'isolated_dwelling',
    ]) {
      answer(hit(type));
      expect(await lookUpSettlement('UC Davis Medical Center, CA')).toBeNull();
    }
  });
});
