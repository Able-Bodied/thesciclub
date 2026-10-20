import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CountUp } from '@/components/count-up';

function motion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('CountUp', () => {
  it('draws the number at once for somebody who asked for less motion', () => {
    motion(true);
    const { container } = render(<CountUp value={22} />);
    expect(container).toHaveTextContent(/^22$/);
  });

  it('counts up, telling a screen reader only the final number', () => {
    motion(false);
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'performance'] });
    const { container } = render(<CountUp value={22} />);
    expect(screen.getByText('22')).toHaveClass('sr-only');
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('0');

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(container).toHaveTextContent(/^22$/);
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});
