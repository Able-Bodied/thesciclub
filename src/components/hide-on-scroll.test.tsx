import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { INTENT_MS, useHideOnScroll } from '@/components/hide-on-scroll';

function Page({ enabled = true, place = '/home' }: { enabled?: boolean; place?: string }) {
  const { hidden } = useHideOnScroll(enabled, place);
  return (
    <>
      <p>{hidden ? 'Hidden' : 'Showing'}</p>
      <div data-testid="box" />
    </>
  );
}

/** A scroll by the reader: a finger on the screen first, unless `byPage`. */
function scrollTo(box: HTMLElement, top: number, height = 2000, shown = 600, byPage = false) {
  if (!byPage) fireEvent.touchStart(box);
  Object.defineProperty(box, 'scrollHeight', { value: height, configurable: true });
  Object.defineProperty(box, 'clientHeight', { value: shown, configurable: true });
  Object.defineProperty(box, 'scrollTop', { value: top, configurable: true });
  fireEvent.scroll(box);
  if (!byPage) fireEvent.touchEnd(box);
}

describe('the tab bar on a scroll', () => {
  it('goes on the way down, and comes back on the way up', () => {
    render(<Page />);
    const box = screen.getByTestId('box');
    scrollTo(box, 300);
    expect(screen.getByText('Hidden')).toBeInTheDocument();
    scrollTo(box, 200);
    expect(screen.getByText('Showing')).toBeInTheDocument();
  });

  it('ignores a finger settling', () => {
    render(<Page />);
    const box = screen.getByTestId('box');
    scrollTo(box, 300);
    scrollTo(box, 296);
    expect(screen.getByText('Hidden')).toBeInTheDocument();
  });

  it('is not brought back by the page moving as the bar goes', () => {
    render(<Page />);
    const box = screen.getByTestId('box');
    scrollTo(box, 1400);
    expect(screen.getByText('Hidden')).toBeInTheDocument();
    // At the bottom, the box growing into the bar's room pulls the page up.
    scrollTo(box, 1340, 2000, 660);
    expect(screen.getByText('Hidden')).toBeInTheDocument();
    // The reader turning back still brings it.
    scrollTo(box, 1200, 2000, 660);
    expect(screen.getByText('Showing')).toBeInTheDocument();
  });

  it('always shows near the top', () => {
    render(<Page />);
    const box = screen.getByTestId('box');
    scrollTo(box, 300);
    scrollTo(box, 20);
    expect(screen.getByText('Showing')).toBeInTheDocument();
  });

  it('stays for a page too short to gain from it', () => {
    render(<Page />);
    scrollTo(screen.getByTestId('box'), 90, 700);
    expect(screen.getByText('Showing')).toBeInTheDocument();
  });

  it('comes back on a new screen', () => {
    const { rerender } = render(<Page />);
    scrollTo(screen.getByTestId('box'), 300);
    rerender(<Page place="/peers" />);
    expect(screen.getByText('Showing')).toBeInTheDocument();
  });

  // The bounce on opening a conversation (2026-11-03): its jump to the newest
  // message is the page's scroll, not the reader's.
  it('ignores a scroll the page made by itself', () => {
    render(<Page />);
    scrollTo(screen.getByTestId('box'), 1400, 2000, 600, true);
    expect(screen.getByText('Showing')).toBeInTheDocument();
  });

  it('counts a wheel or a key just before, and not long before', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(10_000);
    render(<Page />);
    const box = screen.getByTestId('box');
    fireEvent.wheel(box);
    scrollTo(box, 300, 2000, 600, true);
    expect(screen.getByText('Hidden')).toBeInTheDocument();
    fireEvent.keyDown(box, { key: 'ArrowUp' });
    scrollTo(box, 200, 2000, 600, true);
    expect(screen.getByText('Showing')).toBeInTheDocument();
    now.mockReturnValue(10_000 + INTENT_MS + 1);
    scrollTo(box, 900, 2000, 600, true);
    expect(screen.getByText('Showing')).toBeInTheDocument();
    now.mockRestore();
  });

  it('does nothing where it is off', () => {
    render(<Page enabled={false} />);
    scrollTo(screen.getByTestId('box'), 300);
    expect(screen.getByText('Showing')).toBeInTheDocument();
  });
});
