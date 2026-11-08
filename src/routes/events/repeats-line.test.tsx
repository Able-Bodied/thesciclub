import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const series = vi.hoisted(() => ({ starts: [] as string[], asked: [] as string[] }));
vi.mock('@/lib/events', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchSeriesStarts: (id: string) => {
    series.asked.push(id);
    return Promise.resolve(series.starts);
  },
}));

const { RepeatsLine, whatRepeats } = await import('@/routes/events/repeats-line');

const LA = 'America/Los_Angeles';
// Thursdays at 6 pm Pacific.
const FIRST = '2026-11-06T02:00:00Z';
const LAST = '2026-11-27T02:00:00Z';
const THU = [FIRST, '2026-11-13T02:00:00Z', '2026-11-20T02:00:00Z', LAST];

describe("a repeating event's page says so (the owner, 2026-11-06)", () => {
  it('says how often, and its next two dates', () => {
    expect(whatRepeats(THU, FIRST, LA)).toBe('Repeats weekly · next Thu, Nov 12 and Thu, Nov 19');
  });

  it('says when it is the last date', () => {
    expect(whatRepeats(THU, LAST, LA)).toBe('Repeats weekly · this is the last date');
  });

  it('names no rhythm from two dates', () => {
    expect(whatRepeats(THU.slice(0, 2), FIRST, LA)).toBe('Repeats · next Thu, Nov 12');
  });

  it('reads the dates only for a repeating event', async () => {
    series.starts = THU;
    series.asked = [];
    const { rerender } = render(<RepeatsLine seriesId={null} startTime={FIRST} timezone={LA} />);
    expect(series.asked).toEqual([]);
    expect(screen.queryByText(/Repeats/)).toBeNull();
    rerender(<RepeatsLine seriesId="s1" startTime={FIRST} timezone={LA} />);
    expect(
      await screen.findByText('Repeats weekly · next Thu, Nov 12 and Thu, Nov 19'),
    ).toBeInTheDocument();
    expect(series.asked).toEqual(['s1']);
  });
});
