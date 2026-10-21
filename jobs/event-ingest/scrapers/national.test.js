import { describe, expect, it } from 'vitest';
import { toEvent as activeNetEvent, parseHours as activeNetHours } from './activenet-events.js';
import { allDayInstants, parseDayRange } from './day-ranges.js';
import { parseGroups } from './reeve-support-groups.js';
import { ianaZone, toEvent as tribeEvent } from './tribe-events.js';
import { parseWhen, parseEvents as triumphEvents } from './triumph-events.js';
import { parseTrips } from './unrecables-trips.js';
import { stateOfPlace, zoneOfPlace } from './us-zones.js';
import { parseTable } from './usahockey-sled.js';
import { parseCards, parseDetail, toEvent as uspsaEvent } from './uspsa-events.js';
import { toEvent as ustaEvent } from './usta-wheelchair.js';

// The sources added 2026-10-20, each from a trimmed copy of its real markup.

describe('day ranges and states', () => {
  it('reads the ways people write dates', () => {
    expect(parseDayRange('Nov. 5-8, 2026')).toEqual({ first: '2026-11-05', last: '2026-11-08' });
    expect(parseDayRange('April 29-May 2, 2027*')).toEqual({
      first: '2027-04-29',
      last: '2027-05-02',
    });
    expect(parseDayRange('December 5, 2026 - December 6, 2026')).toEqual({
      first: '2026-12-05',
      last: '2026-12-06',
    });
    expect(parseDayRange('TBD')).toBeNull();
  });

  it('runs an all-day event from midnight to 23:59 where it is', () => {
    expect(
      allDayInstants({ first: '2026-11-05', last: '2026-11-08' }, 'America/Los_Angeles'),
    ).toEqual({
      start_time: '2026-11-05T08:00:00.000Z',
      end_time: '2026-11-09T07:59:00.000Z',
    });
  });

  it('finds an event’s state in its place, however it is written', () => {
    expect(stateOfPlace('Bowlero, 3835 Lawrenceville Hwy, Lawrenceville, GA 30044')).toBe('GA');
    expect(
      stateOfPlace('Archer Bicycle 431 13th Street Oakland, California, 94607 United States'),
    ).toBe('CA');
    expect(stateOfPlace('City National Arena, Las Vegas, Nev.')).toBe('NV');
    expect(stateOfPlace('Bascom Community Center, 1000 S Bascom Ave, San Jose')).toBeNull();
    expect(stateOfPlace('Rincon Beach California')).toBe('CA');
    expect(stateOfPlace('Birmingham, AL, 4000 Ridgeway Drive, Birmingham')).toBe('AL');
    expect(stateOfPlace('Andy Morin Sports Complex, 66 Clarksville Rd, Folsom')).toBeNull();
    expect(stateOfPlace('Zoom')).toBeNull();
  });

  it('finds the zone from newspaper and postal state names', () => {
    expect(zoneOfPlace('Las Vegas, Nev.')).toBe('America/Los_Angeles');
    expect(zoneOfPlace('Martinsburg, W.Va.')).toBe('America/New_York');
    expect(zoneOfPlace('Wayne, NJ')).toBe('America/New_York');
    expect(zoneOfPlace('Somewhere')).toBeNull();
  });
});

describe('The Events Calendar', () => {
  const base = {
    id: 7,
    title: 'Pool &#8211; try a dive',
    url: 'https://diveheart.org/event/x/',
    description: '<p>Come and try.</p>',
    start_date: '2026-10-25 09:00:00',
    end_date: '2026-10-25 13:00:00',
    utc_start_date: '2026-10-25 14:00:00',
    utc_end_date: '2026-10-25 18:00:00',
    timezone: 'America/Chicago',
    all_day: false,
    website: '',
  };

  it('keeps a venue’s zone, and decodes its words', () => {
    const event = tribeEvent({
      ...base,
      venue: {
        venue: 'Oak Lawn &#038; Pool',
        address: '9400 SW Hwy',
        city: 'Oak Lawn',
        stateprovince: 'IL',
        zip: '60453',
      },
    });
    expect(event).toMatchObject({
      title: 'Pool – try a dive',
      location: 'Oak Lawn & Pool, 9400 SW Hwy, Oak Lawn, IL 60453',
      timezone: 'America/Chicago',
      start_time: '2026-10-25T14:00:00Z',
    });
  });

  it('reads an online class in the club’s time', () => {
    expect(tribeEvent({ ...base, venue: [] })).toMatchObject({ location: '', timezone: null });
  });

  it('re-reads a site whose clock is wrong in the zone the feed names', () => {
    const event = tribeEvent(
      {
        ...base,
        venue: { venue: 'Gym', city: 'Decatur' },
        timezone: 'UTC+0',
        start_date: '2026-10-21 10:00:00',
        end_date: '2026-10-21 11:00:00',
      },
      { timezone: 'America/New_York' },
    );
    expect(event).toMatchObject({
      start_time: '2026-10-21T14:00:00.000Z',
      timezone: 'America/New_York',
    });
    expect(ianaZone('UTC+0')).toBeNull();
  });

  it('keeps only the titles a feed asks for', () => {
    expect(
      tribeEvent({ ...base, title: 'DEMA Scuba Show', venue: [] }, { exclude: 'dema' }),
    ).toBeNull();
    expect(
      tribeEvent({ ...base, title: 'Gala', venue: [] }, { include: 'wheelchair fitness' }),
    ).toBeNull();
  });
});

describe('USTA wheelchair tennis', () => {
  const item = {
    id: 't1',
    name: 'SacTown Classic  Wheelchair Championships',
    startDateTime: '2027-09-17T07:00:00+00:00',
    endDateTime: '2027-09-20T06:59:00+00:00',
    timeZone: 'America/Los_Angeles',
    isCancelled: false,
    primaryLocation: {
      address1: '1 Court Ln',
      town: 'GOLD RIVER',
      county: 'CA',
      postcode: '95670',
    },
    organization: { name: 'Sac Club', urlSegment: 'sacclub' },
  };

  it('is all day when it runs midnight to 23:59, and links to its page', () => {
    expect(ustaEvent(item)).toMatchObject({
      title: 'SacTown Classic Wheelchair Championships',
      location: '1 Court Ln, Gold River, CA 95670',
      all_day: true,
      timezone: 'America/Los_Angeles',
      url: 'https://playtennis.usta.com/Competitions/sacclub/Tournaments/Overview/t1',
    });
  });

  it('leaves out a cancelled tournament', () => {
    expect(ustaEvent({ ...item, isCancelled: true })).toBeNull();
  });
});

describe('USA Hockey', () => {
  const table = `<table><tr><td>Event</td><td>Date</td><td>Location</td><td>Rink</td></tr>
    <tr><td>Blind Hockey Classic</td><td>Nov. 20-22, 2026</td><td>Voorhees, N.J.</td><td>Flyers</td></tr>
    <tr><td>USA Hockey Sled Classic</td><td>Nov. 5-8, 2026</td><td>Las Vegas, Nev.</td><td>City National Arena</td></tr>
    <tr><td>Sled Hockey National Championships</td><td>April 29-May 2, 2027*</td><td>Wayne, NJ</td><td>Ice Vault</td></tr></table>`;

  it('keeps the sled rows, all day in their state’s zone', () => {
    const events = parseTable(table, 'https://www.usahockey.com/disabledhockeyevents');
    expect(events.map((e) => [e.title, e.timezone, e.location])).toEqual([
      ['USA Hockey Sled Classic', 'America/Los_Angeles', 'City National Arena, Las Vegas, Nev.'],
      ['Sled Hockey National Championships', 'America/New_York', 'Ice Vault, Wayne, NJ'],
    ]);
    expect(events[1]?.description).toMatch(/tentative/);
  });

  it('throws when the table is not the one it knows', () => {
    expect(() => parseTable('<table><tr><td>Name</td></tr></table>', 'x')).toThrow(/changed/);
  });
});

describe('US Power Soccer', () => {
  const card = `<a href="/events/summit-classic-55dfb" class="event_block w-inline-block"><div><div class="event_month">Dec</div></div>
    <div><div class="event_name">Summit Classic</div><div class="spacer"></div><div>Fort Wayne</div></div>
    <div fs-cmssort-field="date" class="hide">December 5, 2026</div></a>`;
  const page = (
    dates,
  ) => `<div class="event-item-header11_metatag-item"><div class="icon"></div>${dates}</div>
    <div class="event-item-header11_metatag-item"><div class="icon"></div><div><div>Turnstone Center</div><div>3320 N Clinton St</div></div></div>`;

  it('takes the last day and venue from the event’s page', () => {
    const [c] = parseCards(card, 'https://www.powersoccerusa.org/event/calendar');
    const event = uspsaEvent(
      c,
      parseDetail(page('<div>December 5, 2026</div><div>-</div><div>December 6, 2026</div>')),
    );
    expect(event).toMatchObject({
      title: 'Summit Classic',
      location: 'Turnstone Center, 3320 N Clinton St, Fort Wayne',
      start_time: '2026-12-05T08:00:00.000Z',
      end_time: '2026-12-07T07:59:00.000Z',
      all_day: true,
    });
  });

  it('ignores a page still showing last year, and keeps the card’s day', () => {
    const [c] = parseCards(card, 'https://www.powersoccerusa.org/event/calendar');
    const event = uspsaEvent(
      c,
      parseDetail(page('<div>December 6, 2025</div><div>-</div><div>December 7, 2025</div>')),
    );
    expect(event).toMatchObject({ location: 'Fort Wayne', start_time: '2026-12-05T08:00:00.000Z' });
  });
});

describe('Reeve support groups', () => {
  const html = `<h2><strong>Living with Paraplegia&nbsp;Support Group</strong></h2>
    <p>Meetings are held every second and fourth Monday of the month, at 7:00 PM ET.</p>
    <p>October 26<br><a href="https://us02web.zoom.us/meeting/register/a">https://us02web.zoom.us/meeting/register/a</a></p>
    <p>November 9<br><a href="https://us02web.zoom.us/meeting/register/b">https://us02web.zoom.us/meeting/register/b</a></p>`;

  it('dates each meeting in its year and hour, with its Zoom sign-up', () => {
    const events = parseGroups(html, new Date('2026-10-20T19:00:00Z'));
    expect(events.map((e) => [e.title, e.start_time, e.registration_url])).toEqual([
      [
        'Living with Paraplegia Support Group (Zoom)',
        '2026-10-26T23:00:00.000Z',
        'https://us02web.zoom.us/meeting/register/a',
      ],
      [
        'Living with Paraplegia Support Group (Zoom)',
        '2026-11-10T00:00:00.000Z',
        'https://us02web.zoom.us/meeting/register/b',
      ],
    ]);
    expect(events[0]?.timezone).toBeNull();
  });

  it('throws when the groups are gone from the page', () => {
    expect(() => parseGroups('<h2>News</h2>')).toThrow(/no support group/);
  });
});

describe('Triumph Foundation', () => {
  const item = (
    tag,
    when,
    title,
    venue,
  ) => `<div class="event-item-wrapper"><div class="event-item-info">
    <div class="date-details">${tag} ${when}</div>
    <div class="event-title"><a href="https://triumph-foundation.org/tf-event/${title.length}/">${title}</a></div>
    <div class="venue">${venue}</div><div class="summary">About it.</div></div></div>`;
  const page = (...items) => `<div class="event-list-wrapper">${items.join('')}</div>`;

  it('reads its own events as Triumph’s, and a partner’s as nobody’s', () => {
    const events = triumphEvents(
      page(
        item(
          '<span class="tf-event-tag"><a>Triumph Featured Event</a></span>',
          'November 7, 2026 @ 8:30 am - 2:00 pm',
          'Pasadena Adaptive Sports Festival',
          'Brookside Park<br>360 N. Arroyo Blvd, Pasadena, CA 91103',
        ),
        item(
          'Community Event',
          'September 26, 2026 @ 11:00 am - 5:00 pm',
          'Waves of Ability',
          'Marine Stadium<br>Long Beach, CA',
        ),
      ),
    );
    expect(events.map((e) => [e.host_name, e.start_time, e.end_time, e.location])).toEqual([
      [
        'Triumph Foundation',
        '2026-11-07T16:30:00.000Z',
        '2026-11-07T22:00:00.000Z',
        'Brookside Park, 360 N. Arroyo Blvd, Pasadena, CA 91103',
      ],
      [
        null,
        '2026-09-26T18:00:00.000Z',
        '2026-09-27T00:00:00.000Z',
        'Marine Stadium, Long Beach, CA',
      ],
    ]);
  });

  it('treats a Zoom venue as online', () => {
    const [webinar] = triumphEvents(
      page(item('', 'October 13, 2026 @ 5:30 pm - 7:00 pm', 'SCI Health Webinar', 'Zoom<br>')),
    );
    expect(webinar?.location).toBe('');
  });

  it('reads an end on another day', () => {
    expect(parseWhen('December 3, 2026 @ 5:00 pm - December 4, 2026 @ 2:00 pm')).toEqual({
      start: '2026-12-04T01:00:00.000Z',
      end: '2026-12-04T22:00:00.000Z',
    });
  });

  it('throws when the list is gone', () => {
    expect(() => triumphEvents('<main>Events</main>')).toThrow(/changed/);
  });
});

describe('Sacramento Access Leisure (ActiveNet)', () => {
  const item = (over) => ({
    id: 1,
    name: 'ACL- Get Fit - October 22nd, 2026',
    date_range_start: '2026-10-22',
    age_max_year: 0,
    desc: '<div>Activity Date: Thursday, October 22nd, 6:00-7:30pm</div><div>Location: Hart Senior Center</div><div>Address: 915 27th Street Sacramento CA 95816</div>',
    detail_url: 'https://apm.activecommunities.com/x/1',
    enroll_now: { href: 'https://anc.apm.activecommunities.com/enroll/1' },
    ...over,
  });
  const options = { category: 25, title_prefix: '^ACL\\s*-\\s*' };

  it('reads the day, the hours and the place from the description', () => {
    expect(activeNetEvent(item({}), options)).toMatchObject({
      title: 'Get Fit',
      start_time: '2026-10-23T01:00:00.000Z',
      end_time: '2026-10-23T02:30:00.000Z',
      location: 'Hart Senior Center, 915 27th Street Sacramento CA 95816',
      registration_url: 'https://anc.apm.activecommunities.com/enroll/1',
    });
  });

  it('gives a start without am or pm the end’s', () => {
    expect(activeNetHours('6:00-8:30pm')).toEqual({ start: 1080, end: 1230 });
    expect(activeNetHours('11:30-1:00pm')).toEqual({ start: 690, end: 780 });
  });

  it('leaves out a program with an upper age limit', () => {
    expect(activeNetEvent(item({ age_max_year: 22 }), options)).toBeNull();
  });

  it('makes an item without hours all day', () => {
    expect(activeNetEvent(item({ desc: '<p>Location: Pool</p>' }), options)).toMatchObject({
      all_day: true,
    });
  });
});

describe('The Unrecables', () => {
  it('reads each trip as an all-day weekend at Mammoth, with its deadline', () => {
    const [trip] = parseTrips(
      '<table id="tablepress-1"><tbody><tr><td>11/20/2026 - 11/22/2026</td><td>10/20/2026</td></tr></tbody></table>',
      'https://unrecables.org/trips/',
    );
    expect(trip).toMatchObject({
      start_time: '2026-11-20T08:00:00.000Z',
      end_time: '2026-11-23T07:59:00.000Z',
      location: 'Mammoth Mountain, Mammoth Lakes, CA',
      all_day: true,
    });
    expect(trip?.description).toMatch(/Register by October 20\./);
  });

  it('throws when the table is gone', () => {
    expect(() => parseTrips('<main></main>', 'x')).toThrow(/gone/);
  });
});
