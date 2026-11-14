import { describe, expect, it } from 'vitest';
import {
  checkInOpen,
  checkInPhase,
  checkInUrl,
  checkInWindow,
  missedCheckInHelpOpen,
} from '@/lib/check-ins';

const at = (iso: string) => Date.parse(iso);

describe('when check-in is open', () => {
  const timed = {
    startTime: '2026-11-01T18:00:00Z',
    endTime: '2026-11-01T20:00:00Z',
    allDay: false,
  };

  // The owner, 2026-11-13: open up to 24 hours after the event (20261113100000).
  it('runs from an hour before the start to a day after the end', () => {
    expect(checkInOpen(timed, at('2026-11-01T16:59:00Z'))).toBe(false);
    expect(checkInOpen(timed, at('2026-11-01T17:00:00Z'))).toBe(true);
    expect(checkInOpen(timed, at('2026-11-02T20:00:00Z'))).toBe(true);
    expect(checkInOpen(timed, at('2026-11-02T20:01:00Z'))).toBe(false);
  });

  it('offers a message about a missed check-in for the week after it closes', () => {
    expect(missedCheckInHelpOpen(timed, at('2026-11-02T20:00:00Z'))).toBe(false);
    expect(missedCheckInHelpOpen(timed, at('2026-11-02T20:01:00Z'))).toBe(true);
    expect(missedCheckInHelpOpen(timed, at('2026-11-09T20:00:00Z'))).toBe(true);
    expect(missedCheckInHelpOpen(timed, at('2026-11-09T20:01:00Z'))).toBe(false);
  });

  it('is soon the day before it opens, and over a day after the end', () => {
    expect(checkInPhase(timed, at('2026-10-31T16:59:00Z'))).toBe('far');
    expect(checkInPhase(timed, at('2026-10-31T17:00:00Z'))).toBe('soon');
    expect(checkInPhase(timed, at('2026-11-01T16:59:00Z'))).toBe('soon');
    expect(checkInPhase(timed, at('2026-11-01T19:00:00Z'))).toBe('open');
    expect(checkInPhase(timed, at('2026-11-02T20:01:00Z'))).toBe('over');
  });

  it('counts an event with no end as four hours long', () => {
    const { closes } = checkInWindow({ ...timed, endTime: null });
    expect(closes).toBe(at('2026-11-02T22:00:00Z'));
  });

  it('keeps an all-day event open through its day and the next', () => {
    const { closes } = checkInWindow({ ...timed, endTime: null, allDay: true });
    expect(closes).toBe(at('2026-11-03T18:00:00Z'));
  });

  it('prints the check-in page, which is all a code needs to say', () => {
    expect(checkInUrl('abc')).toBe('https://thesciclub.com/events/abc/check-in');
  });
});
