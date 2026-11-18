import { describe, expect, it } from 'vitest';
import {
  chatDayHeading,
  chatTime,
  chatTimeLong,
  messageDateTime,
  messageTime,
  sameChatDay,
} from '@/lib/chat/time';

/**
 * Every case is pinned to a fixed `now` and an explicit zone. A test that reads
 * the machine's clock or its timezone passes on a laptop and fails in CI, which
 * is how this project has been caught before.
 *
 * UTC+0 throughout except where the point is the zone itself.
 */
const now = new Date('2026-09-18T14:00:00Z'); // A Friday.
const UTC = 'UTC';

describe('chatTime', () => {
  // The owner, 2026-11-18: minutes ago, then hours ago, then days, and a date
  // beyond a week, for all content.
  it('says how long ago for a week: just now, then minutes, hours and days', () => {
    expect(chatTime('2026-09-18T13:59:30Z', now, UTC)).toBe('just now');
    expect(chatTime('2026-09-18T13:59:00Z', now, UTC)).toBe('1 minute ago');
    expect(chatTime('2026-09-18T13:01:00Z', now, UTC)).toBe('59 minutes ago');
    expect(chatTime('2026-09-18T13:00:00Z', now, UTC)).toBe('1 hour ago');
    expect(chatTime('2026-09-17T14:01:00Z', now, UTC)).toBe('23 hours ago');
    expect(chatTime('2026-09-17T14:00:00Z', now, UTC)).toBe('1 day ago');
    expect(chatTime('2026-09-11T14:01:00Z', now, UTC)).toBe('6 days ago');
  });

  it('shows a date once it is a week old', () => {
    expect(chatTime('2026-09-11T14:00:00Z', now, UTC)).toBe('Sep 11');
  });

  it('carries the year only when it is a different one', () => {
    expect(chatTime('2026-02-03T08:00:00Z', now, UTC)).toBe('Feb 3');
    expect(chatTime('2025-12-31T08:00:00Z', now, UTC)).toBe('Dec 31, 2025');
  });

  // The date is the reader's own, the opposite of how an event is shown: the
  // same instant is the 11th to one member and the 10th to another.
  it('writes the date in the reader’s zone', () => {
    expect(chatTime('2026-09-11T02:30:00Z', now, 'UTC')).toBe('Sep 11');
    expect(chatTime('2026-09-11T02:30:00Z', now, 'America/Los_Angeles')).toBe('Sep 10');
  });

  it('gives nothing rather than "Invalid Date" for a timestamp it cannot read', () => {
    expect(chatTime('not a time', now, UTC)).toBe('');
  });

  // Clock skew between a member's device and the server: a post can arrive
  // stamped a minute into the future.
  it('treats a moment slightly in the future as just now', () => {
    expect(chatTime('2026-09-18T14:01:00Z', now, UTC)).toBe('just now');
  });
});

describe('chatTimeLong', () => {
  it('writes the moment out in full', () => {
    expect(chatTimeLong('2026-09-18T09:30:00Z', UTC)).toBe('September 18, 2026 at 9:30am');
  });

  it('gives nothing for a timestamp it cannot read', () => {
    expect(chatTimeLong('', UTC)).toBe('');
  });
});

// Older bubbles still show their clock; the full date is available on the time.
describe('messageTime', () => {
  it('keeps the time of day for an older message in the reader’s zone', () => {
    expect(messageTime('2020-01-18T21:45:00Z', 'America/Los_Angeles')).toBe('1:45 PM');
    expect(messageTime('2020-01-18T21:45:00Z', 'UTC')).toBe('9:45 PM');
  });
  it('formats noon and midnight and handles invalid dates', () => {
    expect(messageTime('2020-01-18T12:00:00Z', 'UTC')).toBe('12:00 PM');
    expect(messageTime('2020-01-18T00:05:00Z', 'UTC')).toBe('12:05 AM');
    expect(messageTime('invalid')).toBe('');
  });
});

describe('chatDayHeading', () => {
  it('says Today and Yesterday', () => {
    expect(chatDayHeading('2026-09-18T00:10:00Z', now, UTC)).toBe('Today');
    expect(chatDayHeading('2026-09-17T23:50:00Z', now, UTC)).toBe('Yesterday');
  });

  it('names the weekday in full within the last six days', () => {
    expect(chatDayHeading('2026-09-16T08:00:00Z', now, UTC)).toBe('Wednesday');
    expect(chatDayHeading('2026-09-12T08:00:00Z', now, UTC)).toBe('Saturday');
  });

  it('gives the date once a week old, with the year only when different', () => {
    expect(chatDayHeading('2026-09-11T08:00:00Z', now, UTC)).toBe('Fri, Sep 11');
    expect(chatDayHeading('2025-12-31T08:00:00Z', now, UTC)).toBe('Dec 31, 2025');
  });

  it('uses the reader’s zone for the day', () => {
    // 02:00 UTC on the 18th is still the 17th in Los Angeles.
    const la = 'America/Los_Angeles';
    expect(chatDayHeading('2026-09-18T02:00:00Z', now, la)).toBe('Yesterday');
    expect(sameChatDay('2026-09-18T02:00:00Z', '2026-09-17T20:00:00Z', la)).toBe(true);
    expect(sameChatDay('2026-09-18T02:00:00Z', '2026-09-17T20:00:00Z', UTC)).toBe(false);
  });
});

describe('messageDateTime', () => {
  it('gives the date and the clock, the year only when different', () => {
    expect(messageDateTime('2026-09-18T09:30:00Z', now, UTC)).toEqual({
      date: 'Fri, Sep 18',
      time: '9:30 AM',
    });
    expect(messageDateTime('2025-11-06T21:05:00Z', now, UTC)).toEqual({
      date: 'Nov 6, 2025',
      time: '9:05 PM',
    });
  });
});
