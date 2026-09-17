import { describe, expect, it } from 'vitest';
import { cadenceOf, groupBySeries, type SeriesGroup } from '@/routes/events/series-groups';
import { makeEvent } from '@/test/factory';

/** An occurrence `days` after 5 September 2026, at 6pm UTC. */
function on(day: number, overrides: Parameters<typeof makeEvent>[0] = {}) {
  const d = new Date(Date.UTC(2026, 8, 5 + day, 18, 0, 0));
  return makeEvent({ id: `e${day}`, startTime: d.toISOString(), ...overrides });
}

describe('groupBySeries', () => {
  it('shows a series once, where its earliest occurrence sat', () => {
    const list = [
      on(0, { id: 'happy-1', seriesId: 'happy' }),
      on(1, { id: 'oneoff' }),
      on(7, { id: 'happy-2', seriesId: 'happy' }),
      on(14, { id: 'happy-3', seriesId: 'happy' }),
    ];
    const groups = groupBySeries(list);
    expect(groups.map((g) => g.lead.id)).toEqual(['happy-1', 'oneoff']);
    expect(groups[0]?.rest.map((e) => e.id)).toEqual(['happy-2', 'happy-3']);
  });

  it('keeps the list in date order by each event’s next occurrence', () => {
    // Occurrences of one series are not adjacent in the input, and the group
    // must not jump to where the last one sat.
    const list = [
      on(0, { id: 'a', seriesId: 's1' }),
      on(2, { id: 'b' }),
      on(30, { id: 'a2', seriesId: 's1' }),
      on(40, { id: 'c' }),
    ];
    expect(groupBySeries(list).map((g) => g.lead.id)).toEqual(['a', 'b', 'c']);
  });

  it('never groups one-offs with each other', () => {
    // They all have a null series. Treating that as a shared key would collapse
    // every unrepeated event in the calendar into one row.
    const list = [on(0, { id: 'a' }), on(1, { id: 'b' }), on(2, { id: 'c' })];
    const groups = groupBySeries(list);
    expect(groups).toHaveLength(3);
    expect(groups.every((g) => g.rest.length === 0)).toBe(true);
  });

  it('leaves a series with a single occurrence in the window as a plain row', () => {
    const groups = groupBySeries([on(0, { id: 'only', seriesId: 's1' })]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.rest).toEqual([]);
  });
});

describe('cadenceOf', () => {
  const group = (days: number[]): SeriesGroup => {
    const [lead, ...rest] = days.map((d) => on(d, { seriesId: 's1' }));
    if (!lead) throw new Error('a group needs at least one occurrence');
    return { lead, rest, seriesId: 's1' };
  };

  it('names a weekly rhythm', () => {
    expect(cadenceOf(group([0, 7, 14, 21]))).toBe('Weekly');
  });

  it('is not renamed by one displaced date', () => {
    // A holiday skips a week, doubling one gap. A mean would drag this to
    // fortnightly and rename a weekly class; the median does not.
    expect(cadenceOf(group([0, 7, 21, 28, 35]))).toBe('Weekly');
  });

  it('names fortnightly and monthly', () => {
    expect(cadenceOf(group([0, 14, 28, 42]))).toBe('Fortnightly');
    expect(cadenceOf(group([0, 30, 60, 90]))).toBe('Monthly');
  });

  it('says only "Repeats" when the rhythm is not a familiar one', () => {
    // Twice a year is real, and naming it would be inventing a word for it.
    expect(cadenceOf(group([0, 180]))).toBe('Repeats');
  });

  it('has nothing to say about a single occurrence', () => {
    expect(cadenceOf(group([0]))).toBeNull();
  });
});
