import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
const changed = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({ rpc }) }));
vi.mock('@/lib/chat/views', () => ({ announcePostViewsChanged: changed }));

const { resetHomeViews, SEEN_AFTER_MS, useSeenOnHome } = await import('@/lib/chat/home-views');

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;
const watching = new Map<Element, Callback>();

class FakeObserver {
  private readonly callback: Callback;
  constructor(callback: Callback) {
    this.callback = callback;
  }
  observe(element: Element) {
    watching.set(element, this.callback);
  }
  disconnect() {
    for (const [element, callback] of watching)
      if (callback === this.callback) watching.delete(element);
  }
}

function Card({ id }: { id: string }) {
  return <article data-testid={id} ref={useSeenOnHome(id)} />;
}

/** How much of the card is on a 800px-high screen. */
function show(element: Element, ratio: number, cardHeight = 400) {
  act(() => {
    watching.get(element)?.([
      {
        isIntersecting: ratio > 0,
        intersectionRatio: ratio,
        intersectionRect: { height: ratio * cardHeight } as DOMRectReadOnly,
        rootBounds: { height: 800 } as DOMRectReadOnly,
      },
    ]);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  rpc.mockReturnValue(Promise.resolve({ error: null }));
});

afterEach(() => {
  resetHomeViews();
  watching.clear();
  rpc.mockReset();
  changed.mockReset();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
}

describe('useSeenOnHome', () => {
  it('records a card that stayed half on screen for a second', async () => {
    const { getByTestId } = render(<Card id="p1" />);
    show(getByTestId('p1'), 0.6);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SEEN_AFTER_MS);
    });
    await flush();
    expect(rpc).toHaveBeenCalledWith('chat_mark_posts_seen', {
      post_ids: ['p1'],
      device: 'desktop',
    });
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('does not record a card scrolled past', async () => {
    const { getByTestId } = render(<Card id="p1" />);
    show(getByTestId('p1'), 0.6);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SEEN_AFTER_MS / 2);
    });
    show(getByTestId('p1'), 0);
    await flush();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not record a card barely on screen', async () => {
    const { getByTestId } = render(<Card id="p1" />);
    show(getByTestId('p1'), 0.2);
    await flush();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('records a card taller than the screen once it fills half of it', async () => {
    const { getByTestId } = render(<Card id="tall" />);
    show(getByTestId('tall'), 0.25, 2400);
    await flush();
    expect(rpc).toHaveBeenCalledWith('chat_mark_posts_seen', {
      post_ids: ['tall'],
      device: 'desktop',
    });
  });

  it('sends cards seen together at once, and each post only once', async () => {
    const { getByTestId, unmount } = render(
      <>
        <Card id="p1" />
        <Card id="p2" />
      </>,
    );
    show(getByTestId('p1'), 1);
    show(getByTestId('p2'), 1);
    await flush();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('chat_mark_posts_seen', {
      post_ids: ['p1', 'p2'],
      device: 'desktop',
    });
    unmount();

    // Back on Home later: already sent, so not watched again.
    const again = render(<Card id="p1" />);
    expect(watching.has(again.getByTestId('p1'))).toBe(false);
  });

  it('still records the view when the database is older than the app', async () => {
    rpc
      .mockReturnValueOnce(Promise.resolve({ error: { code: 'PGRST202' } }))
      .mockReturnValueOnce(Promise.resolve({ error: null }));
    const { getByTestId } = render(<Card id="p1" />);
    show(getByTestId('p1'), 1);
    await flush();
    expect(rpc).toHaveBeenLastCalledWith('chat_mark_posts_seen', { post_ids: ['p1'] });
    expect(changed).toHaveBeenCalled();
  });

  it('tries again next time when the write failed', async () => {
    rpc.mockReturnValueOnce(Promise.resolve({ error: { message: 'offline' } }));
    const first = render(<Card id="p1" />);
    show(first.getByTestId('p1'), 1);
    await flush();
    expect(changed).not.toHaveBeenCalled();
    first.unmount();

    const second = render(<Card id="p1" />);
    show(second.getByTestId('p1'), 1);
    await flush();
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
