import { describe, expect, it } from 'vitest';
import { expandIcs, parseIcs } from './ics.js';
import { icsEvents } from './ics-events.js';

const calendar = (...events) =>
  ['BEGIN:VCALENDAR', 'X-WR-TIMEZONE:America/New_York', ...events, 'END:VCALENDAR'].join('\r\n');

const vevent = (lines) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');

const days = (text, from = '2026-10-20', until = '2026-12-31') =>
  expandIcs(parseIcs(text), from, until).map((o) => o.day);

describe('expanding repeat rules', () => {
  it('walks a weekly rule, with an interval and an end', () => {
    const text = calendar(
      vevent([
        'UID:a',
        'SUMMARY:Every other Tuesday',
        'DTSTART;TZID=America/New_York:20261020T140000',
        'RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=20261201T190000Z',
      ]),
    );
    expect(days(text)).toEqual(['2026-10-20', '2026-11-03', '2026-11-17', '2026-12-01']);
  });

  it('finds the nth and the last weekday of a month', () => {
    const text = calendar(
      vevent([
        'UID:b',
        'SUMMARY:1st and 3rd Thursday',
        'DTSTART;TZID=America/New_York:20250102T120000',
        'RRULE:FREQ=MONTHLY;WKST=MO;BYDAY=1TH,3TH',
      ]),
      vevent([
        'UID:c',
        'SUMMARY:Last Friday',
        'DTSTART;TZID=America/New_York:20250131T120000',
        'RRULE:FREQ=MONTHLY;BYDAY=-1FR',
      ]),
    );
    const all = expandIcs(parseIcs(text), '2026-11-01', '2026-11-30');
    expect(all.map((o) => `${o.event.uid} ${o.day}`)).toEqual([
      'b 2026-11-05',
      'b 2026-11-19',
      'c 2026-11-27',
    ]);
  });

  it('keeps the wall clock through the change to standard time', () => {
    const text = calendar(
      vevent([
        'UID:d',
        'SUMMARY:Noon',
        'DTSTART;TZID=America/New_York:20261027T120000',
        'RRULE:FREQ=WEEKLY',
      ]),
    );
    const [before, after] = expandIcs(parseIcs(text), '2026-10-27', '2026-11-03');
    expect(before?.start.toISOString()).toBe('2026-10-27T16:00:00.000Z');
    expect(after?.start.toISOString()).toBe('2026-11-03T17:00:00.000Z');
  });

  it('skips an EXDATE, and uses a changed occurrence in place of its own', () => {
    const text = calendar(
      vevent([
        'UID:e',
        'SUMMARY:Group',
        'DTSTART;TZID=America/New_York:20261020T180000',
        'RRULE:FREQ=WEEKLY;COUNT=4',
        'EXDATE;TZID=America/New_York:20261027T180000',
      ]),
      vevent([
        'UID:e',
        'SUMMARY:Group, moved',
        'RECURRENCE-ID;TZID=America/New_York:20261103T180000',
        'DTSTART;TZID=America/New_York:20261104T180000',
      ]),
    );
    const all = expandIcs(parseIcs(text), '2026-10-01', '2026-12-31');
    expect(all.map((o) => `${o.event.summary} ${o.start.toISOString().slice(0, 10)}`)).toEqual([
      'Group 2026-10-20',
      'Group, moved 2026-11-04',
      'Group 2026-11-10',
    ]);
  });

  it('keeps a rule it cannot read as its first date only, and says so', () => {
    const heard = [];
    const text = calendar(
      vevent(['UID:f', 'SUMMARY:Odd', 'DTSTART:20261101T150000Z', 'RRULE:FREQ=WEEKLY;BYSETPOS=1']),
    );
    expect(
      expandIcs(parseIcs(text), '2026-10-20', '2026-12-31', (e) => heard.push(e.summary)).length,
    ).toBe(1);
    expect(heard).toEqual(['Odd']);
  });
});

describe('icsEvents', () => {
  it('reads an online meeting in the club’s time, and a place in its own zone', () => {
    const text = calendar(
      vevent([
        'UID:g',
        'SUMMARY:Peer group',
        'LOCATION:Zoom',
        'DTSTART;TZID=America/New_York:20261021T140000',
      ]),
      vevent([
        'UID:h',
        'SUMMARY:Game night',
        'LOCATION:Ann Arbor, MI',
        'DTSTART;TZID=America/New_York:20261107T190000',
      ]),
    );
    const [online, inPerson] = icsEvents(text, { fromDay: '2026-10-20', untilDay: '2026-12-31' });
    expect(online).toMatchObject({
      location: '',
      timezone: null,
      start_time: '2026-10-21T18:00:00.000Z',
    });
    expect(inPerson).toMatchObject({ location: 'Ann Arbor, MI', timezone: 'America/New_York' });
  });

  it('joins a tournament’s days into one all-day event ending on its last day', () => {
    const day = (d, next) =>
      vevent([
        `UID:n${d}`,
        'SUMMARY:Queen City Classic',
        `DTSTART;VALUE=DATE:202611${d}`,
        `DTEND;VALUE=DATE:202611${next}`,
        'DESCRIPTION:Tag(s): Sanction\\nhttp://www.nwba.org/event/show/1',
      ]);
    const [event, ...rest] = icsEvents(calendar(day('07', '08'), day('08', '09')), {
      fromDay: '2026-10-20',
      untilDay: '2026-12-31',
      options: { group_days: true, description: 'A tournament.' },
    });
    expect(rest).toEqual([]);
    expect(event).toMatchObject({
      all_day: true,
      timezone: 'America/New_York',
      start_time: '2026-11-07T05:00:00.000Z',
      end_time: '2026-11-09T04:59:00.000Z',
      description: 'A tournament.',
      url: 'http://www.nwba.org/event/show/1',
    });
  });

  it('drops titles the feed’s options exclude', () => {
    const text = calendar(
      vevent([
        'UID:i',
        'SUMMARY:Rolling Through Parenthood',
        'DTSTART;TZID=America/New_York:20261021T130000',
      ]),
    );
    expect(
      icsEvents(text, {
        fromDay: '2026-10-20',
        untilDay: '2026-12-31',
        options: { exclude: '^rolling through parenthood$' },
      }),
    ).toEqual([]);
  });
});
