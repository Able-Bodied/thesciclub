import { describe, expect, it } from 'vitest';
import { chatTime, chatTimeLong } from '@/lib/chat/time';

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
  it('shows a clock for something that arrived today', () => {
    expect(chatTime('2026-09-18T09:30:00Z', now, UTC)).toBe('9:30am');
    expect(chatTime('2026-09-18T13:05:00Z', now, UTC)).toBe('1:05pm');
  });

  it('shows midnight and noon the way a clock does', () => {
    expect(chatTime('2026-09-18T00:04:00Z', now, UTC)).toBe('12:04am');
    expect(chatTime('2026-09-18T12:00:00Z', now, UTC)).toBe('12:00pm');
  });

  it('shows a weekday for the last six days', () => {
    expect(chatTime('2026-09-17T23:00:00Z', now, UTC)).toBe('Thu');
    expect(chatTime('2026-09-12T08:00:00Z', now, UTC)).toBe('Sat');
  });

  // The boundary: a week ago is a weekday name that could be this week or last,
  // and "Fri" above "Fri" is the one thing the column must not do.
  it('shows a date once it is a week old', () => {
    expect(chatTime('2026-09-11T08:00:00Z', now, UTC)).toBe('11 Sep');
  });

  it('carries the year only when it is a different one', () => {
    expect(chatTime('2026-02-03T08:00:00Z', now, UTC)).toBe('3 Feb');
    expect(chatTime('2025-12-31T08:00:00Z', now, UTC)).toBe('31 Dec 2025');
  });

  // 23 hours before 09:00 is the previous calendar day, and the same 23 hours
  // before 23:00 is this morning. Counting instants gets one of them wrong.
  it('counts calendar days, not elapsed hours', () => {
    const lateFriday = new Date('2026-09-18T23:00:00Z');
    expect(chatTime('2026-09-18T00:30:00Z', lateFriday, UTC)).toBe('12:30am');
    const earlyFriday = new Date('2026-09-18T08:00:00Z');
    expect(chatTime('2026-09-17T09:00:00Z', earlyFriday, UTC)).toBe('Thu');
  });

  // A post is shown in the reader's zone, the opposite of how an event is
  // shown. The same instant is this afternoon to one member and last night to
  // another, and each of them is right about their own day.
  it('answers in the reader’s zone', () => {
    expect(chatTime('2026-09-18T20:30:00Z', now, 'UTC')).toBe('8:30pm');
    expect(chatTime('2026-09-18T20:30:00Z', now, 'America/Los_Angeles')).toBe('1:30pm');
    expect(chatTime('2026-09-18T02:30:00Z', now, 'UTC')).toBe('2:30am');
    expect(chatTime('2026-09-18T02:30:00Z', now, 'America/Los_Angeles')).toBe('Thu');
  });

  it('gives nothing rather than "Invalid Date" for a timestamp it cannot read', () => {
    expect(chatTime('not a time', now, UTC)).toBe('');
  });

  // Clock skew between a member's device and the server: a post can arrive
  // stamped a minute into the future. It is still today.
  it('treats a moment slightly in the future as today', () => {
    expect(chatTime('2026-09-18T14:01:00Z', now, UTC)).toBe('2:01pm');
  });
});

describe('chatTimeLong', () => {
  it('writes the moment out in full', () => {
    expect(chatTimeLong('2026-09-18T09:30:00Z', UTC)).toBe('18 September 2026 at 9:30am');
  });

  it('gives nothing for a timestamp it cannot read', () => {
    expect(chatTimeLong('', UTC)).toBe('');
  });
});
