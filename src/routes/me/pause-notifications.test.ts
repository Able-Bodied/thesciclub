import { describe, expect, it } from 'vitest';
import { tomorrowMorning } from '@/routes/me/pause-notifications';

// Dates: the owner's 2026-11-13 Pause, "until tomorrow morning".
describe('tomorrowMorning', () => {
  it('is 8am the next day late at night, but this morning just after midnight', () => {
    const late = tomorrowMorning(new Date(2026, 10, 13, 23, 30));
    expect([late.getDate(), late.getHours(), late.getMinutes()]).toEqual([14, 8, 0]);
    const early = tomorrowMorning(new Date(2026, 10, 14, 0, 15));
    expect([early.getDate(), early.getHours()]).toEqual([14, 8]);
  });

  it('crosses a month end', () => {
    const next = tomorrowMorning(new Date(2026, 10, 30, 21, 0));
    expect([next.getMonth(), next.getDate(), next.getHours()]).toEqual([11, 1, 8]);
  });
});
