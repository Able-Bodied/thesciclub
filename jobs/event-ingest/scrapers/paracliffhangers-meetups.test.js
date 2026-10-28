// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { classifyFormat, classifyTags } from '../classify.js';
import {
  meetupEvents,
  PAGE_URL,
  ParaCliffHangersMeetupsScraper,
  parseScheduleLine,
  parseTimeRange,
  readMeetups,
  ruleDays,
} from './paracliffhangers-meetups.js';

// The Indoor page's meetup accordion as served on 2026-10-27.
const PAGE = readFileSync(
  new URL('./fixtures/paracliffhangers-indoor.html', import.meta.url),
  'utf8',
);
const now = new Date('2026-10-27T20:00:00Z');

/** A rule as one short line, for the table below. */
function ruleOf(meetup) {
  const { scheduleLines } = meetup;
  const reads = scheduleLines.map(parseScheduleLine);
  if (reads.some((r) => r.paused)) return 'paused';
  if (reads.some((r) => r.none)) return 'no dates';
  if (reads.some((r) => r.unread)) return 'unread';
  const hm = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return reads
    .map(({ rule, from }) => {
      const hours = `${hm(rule.start)}-${hm(rule.end)}`;
      const after = from ? ` from ${from.month}/${from.day}` : '';
      if (rule.kind === 'weekly') return `every ${day[rule.weekday]} ${hours}${after}`;
      if (rule.kind === 'monthly')
        return `${rule.nths.join('+')} ${day[rule.weekday]} ${hours}${after}`;
      return `${rule.month}/${rule.day} ${hours}`;
    })
    .join('; ');
}

describe('readMeetups, from the Indoor page', () => {
  const meetups = readMeetups(PAGE);
  const by = (heading) => meetups.find((m) => m.heading === heading);

  it('reads every meetup to its rule', () => {
    expect(Object.fromEntries(meetups.map((m) => [m.heading, ruleOf(m)]))).toEqual({
      'Berkeley, CA': 'every Fri 18:00-21:00',
      'Concord, CA': '2 Tue 17:00-20:00',
      'Oakland, CA': '4 Wed 18:00-20:00',
      'San Francisco, CA': '2 Thu 18:00-20:00',
      'Sunnyvale, CA': '2 Sun 15:00-17:00',
      'Pasadena, CA': '1+3 Tue 18:00-21:00',
      'San Diego, CA - Adult Meetup': 'every Wed 18:00-20:00',
      'San Diego, CA - Youth Meetup': '-1 Sun 10:00-12:00',
      'San Marcos, CA': '2+4 Tue 18:00-20:00',
      'Tampa, FL - Bouldering Only Meetup': '2 Tue 18:00-21:00',
      'St. Petersburg, FL - Meetup': '-1 Sun 15:00-18:00',
      'DeLand, FL - Meetup': '-1 Sat 14:00-18:00 from 11/28',
      'Brick, NJ': 'paused',
      'Fairfield, NJ': '10/3 17:00-19:00; 10/20 18:00-20:00; 11/14 17:00-19:00',
      'Flemington, NJ': 'paused',
      'Brooklyn, NY': '1+3 Mon 18:30-20:30',
      'Long Island City, NY': 'every Wed 19:00-21:00',
      'Manhattan, NY': '2+4 Thu 18:30-20:30',
      'Buffalo, NY': '1+3 Mon 18:30-20:30',
      'Durham, NC': 'unread',
      'Pittsburgh, PA': '1+3 Sun 14:00-16:00; 2+4 Wed 18:00-20:00',
      'Arlington, TX': 'no dates',
    });
  });

  it('reads city, state, label and gym as the page writes them', () => {
    expect(
      [by('San Diego, CA - Youth Meetup'), by('Tampa, FL - Bouldering Only Meetup')].map((m) => [
        m.city,
        m.state,
        m.label,
        m.gym,
      ]),
    ).toEqual([
      ['San Diego', 'CA', 'Youth', 'Mesa Rim Mission Valley'],
      ['Tampa', 'FL', 'Bouldering Only', 'Central Rock Gym Tampa'],
    ]);
    expect(by('St. Petersburg, FL - Meetup').label).toBeNull();
    expect(by('Buffalo, NY').gym).toBe('Central Rock Gym - Buffalo');
  });

  it('gives each meetup its chapter email: by city, else the region’s only other one', () => {
    const emails = Object.fromEntries(meetups.map((m) => [m.city + (m.label ?? ''), m.email]));
    expect(emails).toMatchObject({
      Berkeley: 'sf@paracliffhangers.org',
      Sunnyvale: 'casouthbay@paracliffhangers.org',
      Pasadena: 'la@paracliffhangers.org',
      'San DiegoYouth': 'sd@paracliffhangers.org',
      'San Marcos': 'sd@paracliffhangers.org',
      DeLand: 'fl@paracliffhangers.org',
      Fairfield: 'nj@paracliffhangers.org',
      Manhattan: 'ny@paracliffhangers.org',
      Buffalo: 'buffalo@paracliffhangers.org',
      Durham: 'nc@paracliffhangers.org',
      Pittsburgh: null,
    });
  });

  it('keeps the sign-up links, without the zero-width joiner one ends in', () => {
    expect(by('San Marcos, CA').signUpUrl).toBe(
      'https://account.mesarim.com/northcity/programs/paracliffhangers-community-night',
    );
    expect(by('Manhattan, NY').signUpUrl).toBe(
      'https://centralrockgym.com/manhattan/events/adaptive-climbing-meet-up/',
    );
    expect(by('Fairfield, NJ').signUpUrl).toMatch(/&date=2026-09-10$/);
    expect(by('Berkeley, CA').signUpUrl).toBeNull();
    expect(by('Berkeley, CA').gymUrl).toBe('https://goo.gl/maps/ae7juFi3Tr74cXRZ7');
  });

  it('throws when the page has no meetups at all', () => {
    expect(() => readMeetups('<html><body><p>Indoor</p></body></html>')).toThrow(/no meetups/);
  });
});

describe('meetupEvents', () => {
  const { events, warnings, notes } = meetupEvents(readMeetups(PAGE), { now });
  const of = (city) => events.filter((e) => e.location.includes(`, ${city}, `));

  it('makes nothing for paused chapters or ones with no dates, and says so', () => {
    expect(of('Brick')).toEqual([]);
    expect(of('Flemington')).toEqual([]);
    expect(of('Arlington')).toEqual([]);
    expect(notes).toEqual([
      'Brick, NJ: paused',
      'Flemington, NJ: paused',
      'Arlington, TX: no dates yet',
    ]);
  });

  it('makes nothing for a schedule it cannot read, and names it in a warning', () => {
    expect(of('Durham')).toEqual([]);
    expect(warnings).toEqual([
      'Durham, NC: "various Saturdays, email for exact dates| 12PM - 2PM" is not a schedule this reads',
    ]);
  });

  it('makes weekly dates 92 days ahead, at the chapter’s hours across the change of clocks', () => {
    const berkeley = of('Berkeley');
    expect(berkeley).toHaveLength(13);
    expect(berkeley.slice(0, 2).map((e) => [e.start_time, e.end_time])).toEqual([
      ['2026-10-31T01:00:00.000Z', '2026-10-31T04:00:00.000Z'],
      ['2026-11-07T02:00:00.000Z', '2026-11-07T05:00:00.000Z'],
    ]);
    expect(berkeley.at(-1).start_time).toBe('2027-01-23T02:00:00.000Z');
  });

  it('puts each chapter in its own state’s zone', () => {
    expect(of('Brooklyn')[0]).toMatchObject({
      start_time: '2026-11-02T23:30:00.000Z',
      timezone: 'America/New_York',
    });
    expect(of('Pittsburgh')[0].timezone).toBe('America/New_York');
    expect(of('Tampa')[0]).toMatchObject({
      start_time: '2026-11-10T23:00:00.000Z',
      timezone: 'America/New_York',
    });
    expect(of('Pasadena')[0].timezone).toBe('America/Los_Angeles');
  });

  it('makes nth and last weekdays', () => {
    const days = (city) => of(city).map((e) => e.external_id.split(':')[2]);
    expect(days('Pasadena')).toEqual([
      '2026-11-03',
      '2026-11-17',
      '2026-12-01',
      '2026-12-15',
      '2027-01-05',
      '2027-01-19',
    ]);
    expect(days('St. Petersburg')).toEqual(['2026-11-29', '2026-12-27']);
    expect(of('Pittsburgh').map((e) => e.start_time.slice(0, 16))).toEqual([
      '2026-10-28T22:00',
      '2026-11-01T19:00',
      '2026-11-11T23:00',
      '2026-11-15T19:00',
      '2026-11-25T23:00',
      '2026-12-06T19:00',
      '2026-12-09T23:00',
      '2026-12-20T19:00',
      '2026-12-23T23:00',
      '2027-01-03T19:00',
      '2027-01-13T23:00',
      '2027-01-17T19:00',
      '2027-01-27T23:00',
    ]);
  });

  it('starts DeLand back up on November 28th, nothing before', () => {
    expect(of('DeLand').map((e) => e.start_time)).toEqual([
      '2026-11-28T19:00:00.000Z',
      '2026-12-26T19:00:00.000Z',
    ]);
    const earlier = meetupEvents(readMeetups(PAGE), { now: new Date('2026-10-01T16:00:00Z') });
    expect(
      earlier.events.filter((e) => e.location.includes('DeLand')).map((e) => e.start_time),
    ).toEqual(['2026-11-28T19:00:00.000Z', '2026-12-26T19:00:00.000Z']);
  });

  it('takes an explicit date in the year nearest today, and drops a passed one', () => {
    expect(of('Fairfield').map((e) => [e.start_time, e.end_time])).toEqual([
      ['2026-11-14T22:00:00.000Z', '2026-11-15T00:00:00.000Z'],
    ]);
    const rule = { kind: 'date', month: 10, day: 3, start: 1020, end: 1140 };
    // A stale line is never carried into next year.
    expect(ruleDays(rule, '2026-10-27', 400)).toEqual([]);
    expect(ruleDays(rule, '2026-10-03')).toEqual(['2026-10-03']);
    // Early January read in late December is the coming one.
    const january = { kind: 'date', month: 1, day: 9, start: 1020, end: 1140 };
    expect(ruleDays(january, '2026-12-20')).toEqual(['2027-01-09']);
  });

  it('titles, places, links and describes each in the page’s own words', () => {
    const youth = of('San Diego').find((e) => e.title.endsWith('youth'));
    expect(youth).toMatchObject({
      external_id: 'pch:san-diego-ca-youth:2026-11-29',
      title: 'ParaCliffHangers climbing meetup in San Diego — youth',
      location: 'Mesa Rim Mission Valley, San Diego, CA',
      stated_city: 'San Diego',
      url: 'https://account.mesarim.com/missionvalley/programs/paracliffhangers-youth-meetup',
      registration_url:
        'https://account.mesarim.com/missionvalley/programs/paracliffhangers-youth-meetup',
      host_name: 'ParaCliffHangers',
      all_day: false,
    });
    expect(youth.description).toBe(
      [
        'Location: Mesa Rim Mission Valley',
        'Dates: Last Sundays| 10 AM- 12 PM',
        'https://account.mesarim.com/missionvalley/programs/paracliffhangers-youth-meetup',
        'All San Diego chapters: sd@paracliffhangers.org',
      ].join('\n'),
    );
    expect(youth.description_html).toContain(
      '<a href="mailto:sd@paracliffhangers.org" target="_blank" rel="noopener noreferrer">',
    );
    expect(of('Berkeley')[0]).toMatchObject({
      title: 'ParaCliffHangers climbing meetup in Berkeley',
      url: 'https://goo.gl/maps/ae7juFi3Tr74cXRZ7',
      registration_url: null,
    });
    expect(of('Tampa')[0].title).toBe(
      'ParaCliffHangers climbing meetup in Tampa — bouldering only',
    );
  });

  it('falls back to the Indoor page when there is no sign-up or gym link', () => {
    // Fairfield's gym has no link; take its sign-up away too.
    const page = PAGE.replace(/<strong>Sign Up: <\/strong><a[^>]*>[^<]*<\/a>/, '');
    expect(
      meetupEvents(readMeetups(page), { now }).events.find((e) => e.location.includes('Fairfield'))
        .url,
    ).toBe(PAGE_URL);
  });

  it('is an in-person climbing event, so it is sport', () => {
    expect(classifyFormat(of('Berkeley')[0])).toBe('in_person');
    expect(classifyTags(of('Berkeley')[0])).toContain('adaptive-climbing');
  });

  it('gives each date its own id, the same on every run', () => {
    expect(new Set(events.map((e) => e.external_id)).size).toBe(events.length);
    const again = meetupEvents(readMeetups(PAGE), { now: new Date('2026-10-28T03:00:00Z') });
    expect(again.events.find((e) => e.location.includes('Berkeley')).external_id).toBe(
      'pch:berkeley-ca:2026-10-30',
    );
  });

  it('makes nothing for a meetup whose schedule changed into words it cannot read', () => {
    const page = PAGE.replace('Fridays | 6PM - 9PM', 'Fridays, most weeks');
    const read = meetupEvents(readMeetups(page), { now });
    expect(read.events.filter((e) => e.location.includes('Berkeley'))).toEqual([]);
    expect(read.warnings).toContain('Berkeley, CA: no hours read');
  });

  it('follows a changed time, keeping the same dates', () => {
    const page = PAGE.replace('Fridays | 6PM - 9PM', 'Fridays | 5PM - 8PM');
    const moved = meetupEvents(readMeetups(page), { now }).events.filter((e) =>
      e.location.includes('Berkeley'),
    );
    expect(moved.map((e) => e.external_id)).toEqual(of('Berkeley').map((e) => e.external_id));
    expect(moved[0].start_time).toBe('2026-10-31T00:00:00.000Z');
  });
});

describe('parseScheduleLine', () => {
  it('refuses what it cannot be sure of', () => {
    for (const text of [
      'Friday | 6PM - 9PM',
      'Most Fridays | 6PM - 9PM',
      'Fridays',
      'Fridays | 6 - 9',
      'Fridays | 9PM - 6PM',
      'Fridays | 6PM - 9PM and Sundays | 2PM - 4PM',
      'Every other Friday | 6PM - 9PM',
    ]) {
      expect(parseScheduleLine(text).unread, text).toBeTruthy();
    }
  });

  it('reads a paused chapter and an unscheduled one', () => {
    expect(parseScheduleLine('Currently paused')).toEqual({ paused: true });
    expect(parseScheduleLine('TBD')).toEqual({ none: true });
  });
});

describe('parseTimeRange', () => {
  it.each([
    ['6PM - 9PM', 18 * 60, 21 * 60],
    ['6:30-8:30pm', 18 * 60 + 30, 20 * 60 + 30],
    ['10 AM- 12 PM', 10 * 60, 12 * 60],
    ['5-7pm', 17 * 60, 19 * 60],
    ['12PM - 2PM', 12 * 60, 14 * 60],
    ['11-1pm', 11 * 60, 13 * 60],
  ])('%s', (text, start, end) => {
    expect(parseTimeRange(text)).toMatchObject({ start, end });
  });

  it('wants an am or pm', () => {
    expect(parseTimeRange('6-9')).toBeNull();
  });
});

describe('ParaCliffHangersMeetupsScraper', () => {
  it('fails the run when meetups are listed and none can be read', async () => {
    const page = PAGE.replace(/Dates:/g, 'When:');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(page, { status: 200 })),
    );
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await expect(
        new ParaCliffHangersMeetupsScraper({ feed_url: PAGE_URL }).scrape(),
      ).rejects.toThrow(/none could be read/);
      expect(log).toHaveBeenCalledWith(expect.stringContaining('! ParaCliffHangers: Berkeley, CA'));
    } finally {
      log.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('says the run is complete, so ingest removes dates it stops giving', () => {
    expect(new ParaCliffHangersMeetupsScraper({}).complete).toBe(true);
  });
});
