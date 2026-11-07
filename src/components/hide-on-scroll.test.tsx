import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { INTENT_MS, useHideOnScroll } from '@/components/hide-on-scroll';

/** An iPhone's bar with the home indicator's room under it. */
const BAR = 90;

function Page({ enabled = true, place = '/home' }: { enabled?: boolean; place?: string }) {
  const bar = useRef<HTMLElement | null>(null);
  const { hidden } = useHideOnScroll(enabled, place, bar);
  return (
    <>
      <p>{hidden ? 'Hidden' : 'Showing'}</p>
      <div data-testid="box" />
      {/* As AppNav: a margin takes it off, so the box above gets its room. */}
      <nav
        ref={(nav) => {
          bar.current = nav;
          if (nav) Object.defineProperty(nav, 'offsetHeight', { value: BAR, configurable: true });
        }}
        style={hidden ? { marginBottom: -BAR } : undefined}
      />
    </>
  );
}

const isHidden = () => screen.queryByText('Hidden') !== null;

/**
 * A phone's screen box that follows the bar as a browser would: taller by the
 * bar while it is away, its scroll pulled back to the new end, and a scroll
 * event for that pull, which is the page's and not the reader's.
 */
function phone(box: HTMLElement, room: number, shown = 600) {
  let top = 0;
  let told = 0;
  const height = () => shown + (isHidden() ? BAR : 0);
  const end = () => Math.max(0, shown + room - height());
  Object.defineProperty(box, 'scrollHeight', { get: () => shown + room, configurable: true });
  Object.defineProperty(box, 'clientHeight', { get: height, configurable: true });
  Object.defineProperty(box, 'scrollTop', {
    get: () => Math.min(top, end()),
    configurable: true,
  });
  const settle = () => {
    for (let i = 0; i < 10 && box.scrollTop !== told; i++) {
      told = box.scrollTop;
      top = told;
      fireEvent.scroll(box);
    }
  };
  /** The reader's finger moving the page by `by`; the moments it was hidden. */
  return (by: number) => {
    fireEvent.touchStart(box);
    top = Math.max(0, Math.min(top + by, end()));
    told = box.scrollTop;
    fireEvent.scroll(box);
    settle();
    fireEvent.touchEnd(box);
    return isHidden();
  };
}

/** Down a page in small steps and on past its end, as a thumb does. */
function readDown(room: number) {
  render(<Page />);
  const flick = phone(screen.getByTestId('box'), room);
  const states: boolean[] = [];
  for (let i = 0; i < 30; i++) states.push(flick(20));
  const flips = states.filter((state, i) => i > 0 && state !== states[i - 1]).length;
  return { states, flips };
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

  // The owner, 2026-11-04: on a page a little taller than the screen it
  // bounced, and hid what was at the bottom.
  it('stays, without bouncing, for a page a little taller than the screen', () => {
    expect(readDown(125)).toEqual({ states: Array(30).fill(false), flips: 0 });
  });

  it('stays for a page with not quite the room it needs with the bar gone', () => {
    // 120 left once the bar's 90 is taken would be enough; 115 is not.
    expect(readDown(205).flips).toBe(0);
  });

  it('goes once, and stays gone, for a page with just the room', () => {
    const { states, flips } = readDown(215);
    expect(flips).toBe(1);
    expect(states.at(-1)).toBe(true);
  });

  it('goes once, and stays gone, on a long page', () => {
    const { states, flips } = readDown(2000);
    expect(flips).toBe(1);
    expect(states.at(-1)).toBe(true);
  });

  it('comes back when the page that sent it away grows too short', () => {
    render(<Page />);
    const box = screen.getByTestId('box');
    scrollTo(box, 300);
    expect(screen.getByText('Hidden')).toBeInTheDocument();
    // Content went, which pulled the page back by itself: 100 left.
    scrollTo(box, 100, 600 + BAR + 100, 600 + BAR, true);
    expect(screen.getByText('Showing')).toBeInTheDocument();
  });

  it('comes back when a resize leaves the page too short', () => {
    render(<Page />);
    const box = screen.getByTestId('box');
    scrollTo(box, 300);
    expect(screen.getByText('Hidden')).toBeInTheDocument();
    Object.defineProperty(box, 'clientHeight', { value: 1900, configurable: true });
    fireEvent(window, new Event('resize'));
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

  // The owner, 2026-11-06: it came back only at the top.
  it('comes back on the way up even after the finger lifts, as a flick runs on', () => {
    render(<Page />);
    const box = screen.getByTestId('box');
    scrollTo(box, 900);
    expect(screen.getByText('Hidden')).toBeInTheDocument();
    // The flick's momentum: no finger, no wheel, long after.
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 5_000);
    scrollTo(box, 890, 2000, 600, true);
    expect(screen.getByText('Hidden')).toBeInTheDocument();
    scrollTo(box, 860, 2000, 600, true);
    expect(screen.getByText('Showing')).toBeInTheDocument();
    // Going away again still takes the reader's own scroll.
    scrollTo(box, 1200, 2000, 600, true);
    expect(screen.getByText('Showing')).toBeInTheDocument();
    now.mockRestore();
  });

  it('comes back on a tap that scrolls nothing, but not one into a box to type in', () => {
    render(<Page />);
    const box = screen.getByTestId('box');
    scrollTo(box, 900);
    expect(screen.getByText('Hidden')).toBeInTheDocument();
    const field = document.createElement('textarea');
    box.appendChild(field);
    fireEvent.touchStart(field);
    fireEvent.touchEnd(field);
    expect(screen.getByText('Hidden')).toBeInTheDocument();
    fireEvent.touchStart(box);
    fireEvent.touchEnd(box);
    expect(screen.getByText('Showing')).toBeInTheDocument();
  });

  it('does nothing where it is off', () => {
    render(<Page enabled={false} />);
    scrollTo(screen.getByTestId('box'), 300);
    expect(screen.getByText('Showing')).toBeInTheDocument();
  });
});
