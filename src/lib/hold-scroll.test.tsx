import { act, fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHoldScroll } from '@/lib/hold-scroll';

// jsdom has no ResizeObserver. This one lets the test say when the content
// changed size, which is what a photograph finishing loading does.
let resized: (() => void) | null = null;
class FakeResizeObserver {
  constructor(callback: () => void) {
    resized = callback;
  }
  observe() {
    // Nothing to watch: the test calls `resized` itself.
  }
  disconnect() {
    resized = null;
  }
}

let api: ReturnType<typeof useHoldScroll> | null = null;

function List() {
  const scroller = useRef<HTMLDivElement | null>(null);
  const content = useRef<HTMLDivElement | null>(null);
  api = useHoldScroll(scroller, content, true);
  return (
    <div ref={scroller} data-testid="scroller">
      <div ref={content} />
    </div>
  );
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});
afterEach(() => {
  vi.unstubAllGlobals();
  resized = null;
  api = null;
});

describe('useHoldScroll', () => {
  it('places at once, and again each time the content changes size', () => {
    render(<List />);
    const place = vi.fn();
    act(() => {
      api?.hold(place);
    });
    expect(place).toHaveBeenCalledTimes(1);
    act(() => {
      resized?.();
      resized?.();
    });
    expect(place).toHaveBeenCalledTimes(3);
  });

  it('can hold without placing, for a smooth scroll already under way', () => {
    render(<List />);
    const place = vi.fn();
    act(() => {
      api?.hold(place, { now: false });
    });
    expect(place).not.toHaveBeenCalled();
    act(() => {
      resized?.();
    });
    expect(place).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['wheel', (el: Element) => fireEvent.wheel(el)],
    ['touch', (el: Element) => fireEvent.touchStart(el)],
    ['press', (el: Element) => fireEvent.pointerDown(el)],
    ['key', (el: Element) => fireEvent.keyDown(el, { key: 'ArrowUp' })],
  ])('lets go once the reader does anything to the list (%s)', (_, act_) => {
    const { getByTestId } = render(<List />);
    const place = vi.fn();
    act(() => {
      api?.hold(place);
    });
    act_(getByTestId('scroller'));
    expect(api?.holding()).toBe(false);
    act(() => {
      resized?.();
    });
    expect(place).toHaveBeenCalledTimes(1);
  });
});
