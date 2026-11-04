import { describe, expect, it } from 'vitest';
import { eventOverAt, isEventOver } from '@/lib/event-over';

const NOW = Date.parse('2026-11-03T22:00:00Z');

describe('isEventOver', () => {
  it('is over once the end has passed', () => {
    const when = {
      startTime: '2026-11-03T17:00:00Z',
      endTime: '2026-11-03T19:00:00Z',
      allDay: false,
    };
    expect(isEventOver(when, NOW)).toBe(true);
    expect(isEventOver(when, Date.parse('2026-11-03T18:59:00Z'))).toBe(false);
  });

  it('goes by the start when there is no end', () => {
    const when = { startTime: '2026-11-03T21:00:00Z', endTime: null, allDay: false };
    expect(isEventOver(when, NOW)).toBe(true);
    expect(isEventOver(when, Date.parse('2026-11-03T20:00:00Z'))).toBe(false);
  });

  it('keeps an all-day event open to its last day’s 23:59 in its own zone', () => {
    // 3 Nov in New York: midnight to 23:59 Eastern, 05:00 to 04:59 UTC.
    const when = {
      startTime: '2026-11-03T05:00:00Z',
      endTime: '2026-11-04T04:59:00Z',
      allDay: true,
    };
    expect(isEventOver(when, NOW)).toBe(false);
    expect(isEventOver(when, Date.parse('2026-11-04T05:00:00Z'))).toBe(true);
  });

  it('gives an all-day event with no end its whole day', () => {
    const when = { startTime: '2026-11-03T08:00:00Z', endTime: null, allDay: true };
    expect(eventOverAt(when)).toBe(Date.parse('2026-11-04T08:00:00Z'));
    expect(isEventOver(when, NOW)).toBe(false);
  });

  it('reads the same instant whatever zone the event is in', () => {
    // 8pm in Honolulu is 06:00 UTC the next day, wherever it is read.
    const when = { startTime: '2026-11-03T20:00:00-10:00', endTime: null, allDay: false };
    expect(isEventOver(when, Date.parse('2026-11-04T05:59:00Z'))).toBe(false);
    expect(isEventOver(when, Date.parse('2026-11-04T06:01:00Z'))).toBe(true);
  });
});
