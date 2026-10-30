import { describe, expect, it } from 'vitest';
import { checkInOpen, checkInUrl, checkInWindow } from '@/lib/check-ins';

const at = (iso: string) => Date.parse(iso);

describe('when check-in is open', () => {
  const timed = {
    startTime: '2026-11-01T18:00:00Z',
    endTime: '2026-11-01T20:00:00Z',
    allDay: false,
  };

  it('runs from an hour before the start to an hour after the end', () => {
    expect(checkInOpen(timed, at('2026-11-01T16:59:00Z'))).toBe(false);
    expect(checkInOpen(timed, at('2026-11-01T17:00:00Z'))).toBe(true);
    expect(checkInOpen(timed, at('2026-11-01T21:00:00Z'))).toBe(true);
    expect(checkInOpen(timed, at('2026-11-01T21:01:00Z'))).toBe(false);
  });

  it('counts an event with no end as four hours long', () => {
    const { closes } = checkInWindow({ ...timed, endTime: null });
    expect(closes).toBe(at('2026-11-01T23:00:00Z'));
  });

  it('keeps an all-day event open through the day after it starts', () => {
    const { closes } = checkInWindow({ ...timed, endTime: null, allDay: true });
    expect(closes).toBe(at('2026-11-02T18:00:00Z'));
  });

  it('prints the check-in page, which is all a code needs to say', () => {
    expect(checkInUrl('abc')).toBe('https://thesciclub.com/events/abc/check-in');
  });
});
