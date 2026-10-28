import { describe, expect, it } from 'vitest';
import {
  eventChanged,
  eventCity,
  keepPriorPlace,
  matchOrganization,
  placeIsOverridden,
  vanishedEvents,
  withAdminOverride,
  withGeocodedLocation,
  withOneRetry,
} from './ingest.js';

const ORGANIZATIONS = [
  { id: 'ncs', name: 'NorCal SCI', short_code: 'NCS', aliases: [] },
  { id: 'wwm', name: 'Wheel with Me Foundation', short_code: 'WWM', aliases: [] },
  { id: 'hf', name: 'High Fives Foundation', short_code: 'HF', aliases: [] },
  {
    id: 'pch',
    name: 'ParaCliffHangers',
    short_code: 'PCH',
    aliases: ['ParaCliffHangers – Berkeley Ironworks', 'ParaCliffHangers – Pacific Pipe'],
  },
];

describe('matchOrganization', () => {
  it('matches an exact name', () => {
    expect(matchOrganization('High Fives Foundation', ORGANIZATIONS)).toBe('hf');
  });

  it('ignores case and punctuation', () => {
    // A hub writing "Wheel With Me Foundation," should not lose the match to a
    // capital letter and a comma.
    expect(matchOrganization('Wheel With Me Foundation,', ORGANIZATIONS)).toBe('wwm');
    expect(matchOrganization('norcal sci', ORGANIZATIONS)).toBe('ncs');
  });

  it('refuses a near match', () => {
    // Deliberately not fuzzy. An organization's name is a vouching signal here,
    // so crediting an event to the wrong body is worse than crediting it to
    // nobody.
    expect(matchOrganization('NorCal SCI Foundation', ORGANIZATIONS)).toBeNull();
    expect(matchOrganization('High Five', ORGANIZATIONS)).toBeNull();
  });

  it('is null for a host the club does not have', () => {
    expect(matchOrganization('Abilitylab Blackhawks', ORGANIZATIONS)).toBeNull();
  });

  describe('aliases', () => {
    it('matches a name the feed uses that is not the organization name', () => {
      // Adaptive Rec Hub names this organization once per gym it runs at.
      expect(matchOrganization('ParaCliffHangers – Berkeley Ironworks', ORGANIZATIONS)).toBe('pch');
      expect(matchOrganization('ParaCliffHangers – Pacific Pipe', ORGANIZATIONS)).toBe('pch');
    });

    it('still matches the organization’s own name', () => {
      expect(matchOrganization('ParaCliffHangers', ORGANIZATIONS)).toBe('pch');
    });

    it('does not match a venue the aliases do not list', () => {
      // Aliases are curated strings, not a prefix rule — a new gym is a
      // decision somebody makes, not one the job makes for them.
      expect(matchOrganization('ParaCliffHangers – Somewhere New', ORGANIZATIONS)).toBeNull();
    });

    it('survives an organization with no aliases column', () => {
      expect(matchOrganization('NorCal SCI', [{ id: 'x', name: 'NorCal SCI' }])).toBe('x');
    });
  });

  it('is null for no host at all', () => {
    expect(matchOrganization(null, ORGANIZATIONS)).toBeNull();
    expect(matchOrganization('', ORGANIZATIONS)).toBeNull();
    expect(matchOrganization('   ', ORGANIZATIONS)).toBeNull();
  });
});

describe('eventChanged', () => {
  const scraped = {
    title: 'Wheelchair rugby',
    description: 'Bring nothing.',
    description_html: '<p>Bring nothing.</p>',
    start_time: '2026-09-05T17:00:00.000Z',
    end_time: null,
    location: 'Independence Sports Complex',
    url: 'https://example.org/rugby',
    registration_url: null,
  };

  it('is true for an event we have never seen', () => {
    expect(eventChanged(undefined, scraped)).toBe(true);
  });

  it('is false for a byte-for-byte re-scrape', () => {
    expect(eventChanged({ ...scraped }, scraped)).toBe(false);
  });

  // The case the byte-for-byte test could never catch, because both of its
  // sides are in the scraper's format. What actually comes back from the
  // database is PostgREST's "+00:00", against the scraper's ".000Z" — the
  // same moment, and for months every event reported as changed because of
  // it.
  it('is false when the stored time is the same moment written differently', () => {
    const stored = {
      ...scraped,
      start_time: '2026-09-05T17:00:00+00:00',
    };
    expect(eventChanged(stored, scraped)).toBe(false);
  });

  it('handles an end time the same way, including when there is none', () => {
    const withEnd = { ...scraped, end_time: '2026-09-05T19:00:00.000Z' };
    expect(eventChanged({ ...withEnd, end_time: '2026-09-05T19:00:00+00:00' }, withEnd)).toBe(
      false,
    );
    // Absent on both sides, spelled two ways, is still absent.
    expect(eventChanged({ ...scraped, end_time: null }, { ...scraped, end_time: '' })).toBe(false);
    // Gaining or losing one is a change.
    expect(eventChanged(scraped, withEnd)).toBe(true);
    expect(eventChanged(withEnd, scraped)).toBe(true);
  });

  it('still notices a time that really moved, by any amount', () => {
    expect(eventChanged({ ...scraped, start_time: '2026-09-05T17:00:01+00:00' }, scraped)).toBe(
      true,
    );
  });

  // A malformed time must read as a change rather than as two equal NaNs.
  it('falls back to comparing the text when a time will not parse', () => {
    expect(eventChanged({ ...scraped, start_time: 'not a date' }, scraped)).toBe(true);
    expect(
      eventChanged(
        { ...scraped, start_time: 'not a date' },
        { ...scraped, start_time: 'not a date' },
      ),
    ).toBe(false);
  });

  it('notices a changed time', () => {
    expect(eventChanged({ ...scraped, start_time: '2026-09-05T18:00:00.000Z' }, scraped)).toBe(
      true,
    );
  });

  it('notices a rewritten description', () => {
    expect(eventChanged({ ...scraped, description: 'Bring a chair.' }, scraped)).toBe(true);
  });

  it('ignores updated_at, which we write every run', () => {
    // Including it would make every event look changed on every pass, which
    // makes the signal worthless.
    const prior = { ...scraped, updated_at: '2020-01-01T00:00:00.000Z' };
    expect(eventChanged(prior, { ...scraped, updated_at: new Date().toISOString() })).toBe(false);
  });

  it('treats null and an empty string as the same absence', () => {
    // Scrapers are inconsistent about which they emit for "no end time", and a
    // spurious diff would re-flag every event forever.
    expect(eventChanged({ ...scraped, end_time: '' }, { ...scraped, end_time: null })).toBe(false);
    expect(
      eventChanged({ ...scraped, registration_url: null }, { ...scraped, registration_url: '' }),
    ).toBe(false);
  });

  it('ignores the geocoded columns, which the source never states', () => {
    const prior = { ...scraped, city: 'San Jose', latitude: 37.3 };
    expect(eventChanged(prior, scraped)).toBe(false);
  });
});

describe('withAdminOverride', () => {
  const scraped = {
    external_id: 'x1',
    title: 'Friday Happy Hour',
    start_time: '2026-10-17T01:30:00.000Z',
    location: 'The Patio',
    description: 'From the calendar',
    description_html: '<p>From the calendar</p>',
  };

  it('writes the scrape as it is, with no calendar values, when nothing is overridden', () => {
    expect(withAdminOverride(scraped, undefined)).toEqual({ ...scraped, feed_values: null });
    expect(withAdminOverride(scraped, { admin_override: null })).toEqual({
      ...scraped,
      feed_values: null,
    });
  });

  it("keeps an administrator's change and records what the calendar now says", () => {
    const next = withAdminOverride(scraped, {
      admin_override: { title: 'Happy Hour on the patio' },
    });
    expect(next.title).toBe('Happy Hour on the patio');
    expect(next.feed_values).toEqual({ title: 'Friday Happy Hour' });
  });

  it('lets every field the administrator left alone keep updating', () => {
    const moved = { ...scraped, start_time: '2026-10-17T02:00:00.000Z' };
    const next = withAdminOverride(moved, { admin_override: { title: 'Fixed title' } });
    expect(next.start_time).toBe('2026-10-17T02:00:00.000Z');
    expect(next.location).toBe('The Patio');
  });

  it("holds a changed description's formatting empty", () => {
    const next = withAdminOverride(scraped, {
      admin_override: { description: 'Our words', description_html: '' },
    });
    expect(next.description).toBe('Our words');
    expect(next.description_html).toBe('');
    expect(next.feed_values).toEqual({
      description: 'From the calendar',
      description_html: '<p>From the calendar</p>',
    });
  });

  it('ignores a key that is not an event field', () => {
    const next = withAdminOverride(scraped, { admin_override: { feed_id: 'elsewhere' } });
    expect(next).toEqual({ ...scraped, feed_values: null });
  });
});

describe('withOneRetry', () => {
  it('tries a failed feed once more and keeps the second result', async () => {
    let calls = 0;
    const retried = [];
    const result = await withOneRetry(
      async () => {
        calls++;
        if (calls === 1) throw new Error('fetch failed');
        return 'ok';
      },
      { pauseMs: 0, onRetry: (error) => retried.push(error.message) },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(2);
    expect(retried).toEqual(['fetch failed']);
  });

  it('gives up after the second failure', async () => {
    let calls = 0;
    const run = async () => {
      calls++;
      throw new Error(`fail ${calls}`);
    };
    await expect(withOneRetry(run, { pauseMs: 0 })).rejects.toThrow('fail 2');
    expect(calls).toBe(2);
  });

  it('runs a feed that works only once', async () => {
    let calls = 0;
    await withOneRetry(async () => calls++, { pauseMs: 0 });
    expect(calls).toBe(1);
  });
});

describe('an event an administrator moved', () => {
  const prior = {
    admin_override: { location: '9 New St' },
    city: 'Davis',
    postal_code: '95616',
    latitude: 38.55,
    longitude: -121.74,
    location_precision: 'exact',
    state: 'CA',
    geocoded_location: '9 New St, Davis, CA',
  };

  it('is one whose place or city was changed, not its title', () => {
    expect(placeIsOverridden(prior)).toBe(true);
    expect(placeIsOverridden({ admin_override: { city: 'Davis' } })).toBe(true);
    expect(placeIsOverridden({ admin_override: { title: 'Renamed' } })).toBe(false);
    expect(placeIsOverridden({ admin_override: null })).toBe(false);
    expect(placeIsOverridden(undefined)).toBe(false);
  });

  it("keeps the place the database found for the administrator's address", () => {
    const event = { external_id: 'x', location: '1 Feed St', latitude: 1, longitude: 2 };
    keepPriorPlace(event, prior);
    const payload = withGeocodedLocation(
      withAdminOverride(
        { location: event.location, city: event.city, latitude: event.latitude },
        prior,
      ),
      event,
      true,
    );
    expect(payload).toMatchObject({
      location: '9 New St',
      city: 'Davis',
      latitude: 38.55,
      geocoded_location: '9 New St, Davis, CA',
    });
  });
});

describe('what the coordinates were found for', () => {
  const payload = { location: 'Gym', city: 'Davis', state: 'CA' };

  it('is the written place once asked, and nothing when the lookup was paused', () => {
    expect(withGeocodedLocation(payload, { geocode_tried: true }, false).geocoded_location).toBe(
      'Gym, Davis, CA',
    );
    expect(
      withGeocodedLocation(payload, { geocode_tried: false }, false).geocoded_location,
    ).toBeNull();
  });
});

describe('dates a complete reader stops giving', () => {
  const now = new Date('2026-10-27T20:00:00Z');
  const rows = [
    {
      id: 'kept',
      external_id: 'pch:berkeley-ca:2026-10-30',
      start_time: '2026-10-31T01:00:00+00:00',
    },
    { id: 'gone', external_id: 'pch:brick-nj:2026-11-03', start_time: '2026-11-03T23:00:00+00:00' },
    { id: 'past', external_id: 'pch:brick-nj:2026-10-20', start_time: '2026-10-20T23:00:00+00:00' },
  ];

  it('are the later ones no longer given; one that has started stays', () => {
    expect(vanishedEvents(rows, new Set(['pch:berkeley-ca:2026-10-30']), now)).toEqual(['gone']);
  });

  it('are none while every date is still given', () => {
    expect(vanishedEvents(rows, new Set(rows.map((r) => r.external_id)), now)).toEqual([]);
  });
});

describe('an event’s city', () => {
  it('is the reader’s own over the map’s, unless an administrator moved it', () => {
    const event = { stated_city: 'Long Island City', city: 'New York' };
    expect(eventCity(event, false, null)).toBe('Long Island City');
    expect(eventCity(event, true, null)).toBe('New York');
    expect(eventCity({ city: null }, false, { city: 'Davis' })).toBe('Davis');
  });
});
