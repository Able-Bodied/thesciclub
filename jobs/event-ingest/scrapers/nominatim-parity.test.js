// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as port from '../../../supabase/functions/_shared/nominatim.ts';
import { geocodeLocation, lookUpPlace, RateLimited, Unreachable } from './geocode.js';

// geocode-event's port must ask and answer as the import does.
const hit = (type, extra = {}) => [
  {
    type,
    category: 'place',
    lat: '38.5449',
    lon: '-121.7405',
    address: { town: 'Davis', postcode: '95616', 'ISO3166-2-lvl4': 'US-CA' },
    ...extra,
  },
];

/** Answers in order; records each URL and User-Agent asked. */
function nominatim(answers) {
  const asked = [];
  const fetcher = (url, init) => {
    asked.push(`${url.toString()} ${init.headers['User-Agent']}`);
    const next = answers[Math.min(asked.length - 1, answers.length - 1)];
    return Promise.resolve(
      typeof next === 'number'
        ? new Response('', { status: next })
        : new Response(JSON.stringify(next), { status: 200 }),
    );
  };
  return { asked, fetcher };
}

async function both(query, answers) {
  vi.useFakeTimers();
  const js = nominatim(answers);
  vi.stubGlobal('fetch', js.fetcher);
  const running = lookUpPlace(query).then(
    (value) => ({ value }),
    (error) => ({ error: error.constructor.name }),
  );
  await vi.runAllTimersAsync();
  const fromJob = await running;
  vi.useRealTimers();
  const ts = nominatim(answers);
  const fromPort = await port
    .lookUpPlace(query, ts.fetcher, () => Promise.resolve())
    .then(
      (value) => ({ value }),
      (error) => ({ error: error.constructor.name }),
    );
  return { fromJob, fromPort, jobAsked: js.asked, portAsked: ts.asked };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the Nominatim port in geocode-event', () => {
  const cases = [
    ['a building, first try', '1761 Monterey Street, San Luis Obispo, CA', [hit('house')]],
    ['an area is approximate', 'Davis, CA', [hit('city')]],
    ...['house', 'building', 'residential', 'amenity', 'shop', 'tourism', 'leisure', 'office'].map(
      (type) => [`a ${type}`, 'Somewhere, Davis', [hit(type)]],
    ),
    [
      'a rewrite after no match',
      "Gino's Pizza 1761 Monterey Street",
      [[], hit('x', { category: 'amenity' })],
    ],
    ['nowhere', 'Nowhere, Probe, Land', [[]]],
    ['no answer at all', 'Gym, Davis', [500]],
    ['too many requests', 'Gym, Davis', [429]],
  ];

  for (const [name, query, answers] of cases) {
    it(`asks and answers alike: ${name}`, async () => {
      const { fromJob, fromPort, jobAsked, portAsked } = await both(query, answers);
      expect(fromPort).toEqual(fromJob);
      expect(portAsked).toEqual(jobAsked);
    });
  }

  it('says which: a place, nowhere, no answer, or slow down', async () => {
    expect((await both('Davis, CA', [hit('house')])).fromPort).toEqual({
      value: {
        city: 'Davis',
        state: 'CA',
        postalCode: '95616',
        latitude: 38.5449,
        longitude: -121.7405,
        precision: 'exact',
      },
    });
    expect((await both('Nowhere', [[]])).fromPort).toEqual({ value: null });
    expect((await both('Gym, Davis', [500])).fromPort).toEqual({ error: Unreachable.name });
    expect((await both('Gym, Davis', [429])).fromPort).toEqual({ error: RateLimited.name });
  });

  it('leaves geocodeLocation as it was: no answer is null', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', nominatim([500]).fetcher);
    const running = geocodeLocation('Gym, Davis');
    await vi.runAllTimersAsync();
    expect(await running).toBeNull();
  });
});
