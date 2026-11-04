import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { niceMax, RequestBars, seconds } from '@/routes/admin/speed-charts';

describe('the charts’ numbers', () => {
  it('rounds the axis up to 1, 2 or 5 of a power of ten', () => {
    expect(niceMax(4327)).toBe(5000);
    expect(niceMax(1200)).toBe(2000);
    expect(niceMax(640)).toBe(1000);
    expect(niceMax(0)).toBe(1000);
  });

  it('says times the way people read them', () => {
    expect(seconds(640)).toBe('640 ms');
    expect(seconds(1234)).toBe('1.2 s');
    expect(seconds(14_400)).toBe('14 s');
  });
});

describe('the slowest requests', () => {
  it('gives a bar’s numbers when it is pressed', async () => {
    render(
      <RequestBars
        rows={[{ metric: 'rpc:map_events', samples: 466, p50: 288, p90: 4327, failed: 2 }]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /rpc:map_events/ }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Typical 288 ms · slow end 4.3 s466 requests · 2 failed',
    );
  });
});
