import { describe, expect, it } from 'vitest';
import { cleanDescription, ianaZone, readInvite, wallTimeToUtc } from './ics.ts';

/** An invitation the way Google Calendar sends one. */
const GOOGLE = [
  'BEGIN:VCALENDAR',
  'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
  'VERSION:2.0',
  'CALSCALE:GREGORIAN',
  'METHOD:REQUEST',
  'BEGIN:VTIMEZONE',
  'TZID:America/Los_Angeles',
  'END:VTIMEZONE',
  'BEGIN:VEVENT',
  'DTSTART;TZID=America/Los_Angeles:20261030T183000',
  'DTEND;TZID=America/Los_Angeles:20261030T200000',
  'DTSTAMP:20261022T180000Z',
  'ORGANIZER;CN=NorCal SCI:mailto:rep@norcalsci.org',
  'UID:abc123@google.com',
  'ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;CN=events@thesciclub.com:mailto:events@thesciclub.com',
  'DESCRIPTION:Join us on the patio\\, first-timers welcome.\\nBring water.\\n\\n-::~:~::~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~::~:~::-\\nInvitation from Google Calendar',
  'LOCATION:Lakeside Park\\, Oakland',
  'SEQUENCE:0',
  'STATUS:CONFIRMED',
  'SUMMARY:Friday Happy Hour',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('reading an invitation', () => {
  it('reads Google’s: title, place, words, and the times in UTC', () => {
    const event = readInvite(GOOGLE);
    expect(event).toMatchObject({
      uid: 'abc123@google.com',
      method: 'REQUEST',
      cancelled: false,
      title: 'Friday Happy Hour',
      location: 'Lakeside Park, Oakland',
      description: 'Join us on the patio, first-timers welcome.\nBring water.',
      // 6:30pm Pacific daylight time is 01:30 the next day in UTC.
      starts: '2026-10-31T01:30:00.000Z',
      ends: '2026-10-31T03:00:00.000Z',
      allDay: false,
      timezone: 'America/Los_Angeles',
      repeat: null,
    });
  });

  it('unfolds long lines', () => {
    const folded = GOOGLE.replace('SUMMARY:Friday Happy Hour', 'SUMMARY:Friday Happy\r\n  Hour');
    expect(readInvite(folded)?.title).toBe('Friday Happy Hour');
  });

  it('reads Outlook’s Windows zone names', () => {
    expect(ianaZone('Pacific Standard Time')).toBe('America/Los_Angeles');
    expect(ianaZone('Eastern Standard Time')).toBe('America/New_York');
    const outlook = GOOGLE.replaceAll('TZID=America/Los_Angeles', 'TZID="Eastern Standard Time"');
    expect(readInvite(outlook)?.starts).toBe('2026-10-30T22:30:00.000Z');
  });

  it('falls back to the club’s zone for one it cannot read', () => {
    expect(ianaZone('Somewhere/Odd')).toBe('America/Los_Angeles');
  });

  it('reads a time already in UTC', () => {
    const utc = GOOGLE.replace(
      'DTSTART;TZID=America/Los_Angeles:20261030T183000',
      'DTSTART:20261031T013000Z',
    );
    expect(readInvite(utc)?.starts).toBe('2026-10-31T01:30:00.000Z');
  });

  it('reads an all-day event, with no end', () => {
    const allDay = GOOGLE.replace(
      'DTSTART;TZID=America/Los_Angeles:20261030T183000',
      'DTSTART;VALUE=DATE:20261030',
    ).replace('DTEND;TZID=America/Los_Angeles:20261030T200000', 'DTEND;VALUE=DATE:20261031');
    expect(readInvite(allDay)).toMatchObject({
      allDay: true,
      ends: null,
      starts: '2026-10-30T07:00:00.000Z',
    });
  });

  it('reads a cancellation', () => {
    const cancel = GOOGLE.replace('METHOD:REQUEST', 'METHOD:CANCEL').replace(
      'STATUS:CONFIRMED',
      'STATUS:CANCELLED',
    );
    expect(readInvite(cancel)).toMatchObject({ method: 'CANCEL', cancelled: true });
  });

  it('gives nothing for a file with no event', () => {
    expect(readInvite('BEGIN:VCALENDAR\r\nEND:VCALENDAR')).toBeNull();
    expect(readInvite('not a calendar')).toBeNull();
  });

  it('drops a link that is not a web address', () => {
    const link = GOOGLE.replace('SEQUENCE:0', 'URL:javascript:alert(1)\r\nSEQUENCE:0');
    expect(readInvite(link)?.url).toBeNull();
  });
});

describe('repeating invitations', () => {
  const withRule = (rule: string) => GOOGLE.replace('SEQUENCE:0', `RRULE:${rule}\r\nSEQUENCE:0`);

  it('every Friday, for ever', () => {
    expect(readInvite(withRule('FREQ=WEEKLY;BYDAY=FR'))?.repeat).toEqual({
      unit: 'week',
      every: 1,
      endsOn: null,
      endsAfter: null,
    });
  });

  it('every two weeks, ten times', () => {
    expect(readInvite(withRule('FREQ=WEEKLY;INTERVAL=2;COUNT=10'))?.repeat).toMatchObject({
      unit: 'week',
      every: 2,
      endsAfter: 10,
    });
  });

  it('daily until a date', () => {
    expect(readInvite(withRule('FREQ=DAILY;UNTIL=20261115T065959Z'))?.repeat).toMatchObject({
      unit: 'day',
      endsOn: '2026-11-14',
    });
  });

  it('monthly on the fifth Friday, as the first date is', () => {
    // 30 October 2026 is the fifth Friday.
    expect(readInvite(withRule('FREQ=MONTHLY;BYDAY=5FR'))?.repeat).toMatchObject({ unit: 'month' });
  });

  it('only the first date, and says so, for what the club cannot repeat', () => {
    const odd = readInvite(withRule('FREQ=WEEKLY;BYDAY=MO,WE,FR'));
    expect(odd?.repeat).toBeNull();
    expect(odd?.repeatNote).toMatch(/only its first date/);
    expect(readInvite(withRule('FREQ=MONTHLY;BYMONTHDAY=15'))?.repeat).toBeNull();
    expect(readInvite(withRule('FREQ=YEARLY'))?.repeat).toBeNull();
  });
});

describe('the pieces', () => {
  it('takes HTML out of a description', () => {
    expect(cleanDescription('<p>Hello <b>there</b></p><p>Bring water &amp; snacks</p>')).toBe(
      'Hello there\nBring water & snacks',
    );
  });

  it('turns a wall-clock time into UTC across a daylight-saving change', () => {
    // 1 November 2026, the day Pacific time falls back: 10am is PST.
    expect(
      new Date(
        wallTimeToUtc(
          { year: 2026, month: 11, day: 1, hour: 10, minute: 0, second: 0 },
          'America/Los_Angeles',
        ),
      ).toISOString(),
    ).toBe('2026-11-01T18:00:00.000Z');
  });
});

describe('where it is, from each calendar', () => {
  const at = (lines: string[]) =>
    GOOGLE.replace('LOCATION:Lakeside Park\\, Oakland', lines.join('\r\n'));

  it('Google: an address, with Meet only in its conference field', () => {
    const event = readInvite(
      at([
        'LOCATION:1 Hacker Wy\\, Menlo Park\\, CA 94025\\, USA',
        'X-GOOGLE-CONFERENCE:https://meet.google.com/rgz-aaxe-xyf',
      ]),
    );
    expect(event).toMatchObject({
      location: '1 Hacker Wy, Menlo Park, CA 94025, USA',
      url: 'https://meet.google.com/rgz-aaxe-xyf',
      format: 'in_person',
      city: 'Menlo Park',
      state: 'CA',
    });
  });

  it('Google: an address glued to its Meet link', () => {
    expect(
      readInvite(
        at([
          'LOCATION:1 Hacker Wy\\, Menlo Park\\, CA 94025\\, USA; https://meet.google.com/rgz-aaxe-xyf',
        ]),
      ),
    ).toMatchObject({
      location: '1 Hacker Wy, Menlo Park, CA 94025, USA',
      url: 'https://meet.google.com/rgz-aaxe-xyf',
      format: 'hybrid',
      city: 'Menlo Park',
    });
  });

  it('Google: no place, Meet in the description’s footer only', () => {
    const footer = GOOGLE.replace('LOCATION:Lakeside Park\\, Oakland\r\n', '').replace(
      '\\nInvitation from Google Calendar',
      '\\nJoin with Google Meet: https://meet.google.com/abc-defg-hij\\nInvitation from Google Calendar',
    );
    expect(readInvite(footer)).toMatchObject({
      location: '',
      url: 'https://meet.google.com/abc-defg-hij',
      format: 'online',
      city: null,
    });
  });

  it('Outlook: a Teams meeting, its link in a header of its own', () => {
    const teams = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_x%40thread.v2/0';
    expect(
      readInvite(
        at([
          'LOCATION:Microsoft Teams Meeting',
          `X-MICROSOFT-SKYPETEAMSMEETINGURL:${teams}`,
        ]).replaceAll('TZID=America/Los_Angeles', 'TZID="Pacific Standard Time"'),
      ),
    ).toMatchObject({ location: '', url: teams, format: 'online', city: null, state: null });
  });

  it('Outlook: a room and a Zoom link', () => {
    expect(
      readInvite(at(['LOCATION:Room 4; https://us02web.zoom.us/j/8812?pwd=abc'])),
    ).toMatchObject({
      location: 'Room 4',
      url: 'https://us02web.zoom.us/j/8812?pwd=abc',
      format: 'hybrid',
      city: null,
    });
  });

  it('Apple: a venue over its address, on two lines', () => {
    expect(
      readInvite(
        at([
          'LOCATION:Apple Park\\n1 Apple Park Way\\, Cupertino\\, CA 95014\\, United States',
          'X-APPLE-STRUCTURED-LOCATION;VALUE=URI;X-TITLE=Apple Park:geo:37.33,-122.01',
        ]),
      ),
    ).toMatchObject({
      location: 'Apple Park, 1 Apple Park Way, Cupertino, CA 95014, United States',
      url: null,
      format: 'in_person',
      city: 'Cupertino',
      state: 'CA',
    });
  });

  it('Apple: an address abroad, and its own URL', () => {
    expect(
      readInvite(
        at([
          'LOCATION:10 Downing St\\, London SW1A 2AA\\, UK',
          'URL;VALUE=URI:https://example.org/visit',
        ]),
      ),
    ).toMatchObject({
      location: '10 Downing St, London SW1A 2AA, UK',
      url: 'https://example.org/visit',
      format: 'in_person',
      city: null,
      state: null,
    });
  });
});
