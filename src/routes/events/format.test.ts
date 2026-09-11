import { describe, expect, it } from 'vitest';
import { dateTileParts, longWhen, timeOfDay, timeRange } from '@/routes/events/format';

const PACIFIC = 'America/Los_Angeles';

/**
 * These assert the *timezone* behaviour, not the punctuation. The reason this
 * module exists is that a Date is an instant and the tile is a wall clock, so
 * every test here pins an instant and reads it in a named zone.
 */
describe('dateTileParts', () => {
  it('reads the instant in the event timezone, not the machine one', () => {
    // 03:00 UTC on 6 September is still 8pm on the 5th in California. A tile
    // built from the machine's own clock says SEP 6 in CI and SEP 5 on a phone
    // in San Jose, which is the bug this module exists to prevent.
    expect(dateTileParts('2026-09-06T03:00:00Z', PACIFIC)).toEqual({
      dow: 'SAT',
      day: '5',
      mon: 'SEP',
    });
  });

  it('gives the same instant a different date in a different zone', () => {
    expect(dateTileParts('2026-09-06T03:00:00Z', 'Europe/London').day).toBe('6');
  });

  it('does not pad the day', () => {
    expect(dateTileParts('2026-09-05T17:00:00Z', PACIFIC).day).toBe('5');
  });

  it('survives the spring-forward gap', () => {
    // 2026-03-08 is the US DST switch; 10:30 UTC is 02:30 Pacific, an hour that
    // does not exist locally. Intl resolves it rather than throwing.
    expect(dateTileParts('2026-03-08T10:30:00Z', PACIFIC).mon).toBe('MAR');
  });
});

describe('timeOfDay', () => {
  it('is lower case and unspaced, unlike en-US default', () => {
    expect(timeOfDay('2026-09-05T17:00:00Z', PACIFIC)).toBe('10:00am');
  });

  it('keeps :00 on the hour so a column of times lines up', () => {
    expect(timeOfDay('2026-09-05T17:00:00Z', PACIFIC)).not.toBe('10am');
  });

  it('handles afternoon', () => {
    expect(timeOfDay('2026-09-05T23:30:00Z', PACIFIC)).toBe('4:30pm');
  });

  it('shifts by an hour across the daylight saving boundary', () => {
    // Same UTC instant-of-day, one side of the switch each. A naive fixed
    // offset would print the same time twice.
    const winter = timeOfDay('2026-01-15T18:00:00Z', PACIFIC);
    const summer = timeOfDay('2026-07-15T18:00:00Z', PACIFIC);
    expect(winter).toBe('10:00am');
    expect(summer).toBe('11:00am');
  });
});

describe('timeRange', () => {
  it('is just the start when there is no end', () => {
    expect(timeRange('2026-09-05T17:00:00Z', null, PACIFIC)).toBe('10:00am');
  });

  it('joins start and end on the same day', () => {
    expect(timeRange('2026-09-05T17:00:00Z', '2026-09-05T19:00:00Z', PACIFIC)).toBe(
      '10:00am – 12:00pm',
    );
  });

  it('names the day when the end is on another one', () => {
    // An overnight trip. Without the date this reads as "10:00am – 9:00am",
    // which is wrong by a day and looks right.
    expect(timeRange('2026-09-05T17:00:00Z', '2026-09-06T16:00:00Z', PACIFIC)).toBe(
      '10:00am – 6 Sep, 9:00am',
    );
  });

  it('judges "same day" in the event zone, not UTC', () => {
    // Both instants are on 6 September in UTC, but 5 September in California.
    expect(timeRange('2026-09-06T02:00:00Z', '2026-09-06T04:00:00Z', PACIFIC)).toBe(
      '7:00pm – 9:00pm',
    );
  });
});

describe('longWhen', () => {
  it('matches the mock’s shape', () => {
    expect(longWhen('2026-09-05T17:00:00Z', PACIFIC)).toBe('Sat 5 Sep · 10:00am');
  });
});
