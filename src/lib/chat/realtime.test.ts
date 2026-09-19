import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRealtimeRows } from '@/lib/chat/realtime';

/**
 * What can and cannot be proved here.
 *
 * Delivery cannot: the channel is a fake, so nothing in this file says a
 * message written by one member reaches another. That is checked by eye, with
 * two browsers on two test numbers, and it is written down in HANDOFF.md as
 * something to redo when this changes.
 *
 * What can be proved is the part that is easy to drop and impossible to notice:
 * that the hook **refetches on every subscribe and on every focus**. Realtime
 * delivers nothing while the socket is down and replays nothing when it comes
 * back, so a hook that only listened would silently miss whatever was said
 * during a tunnel. A test that only checked "it subscribes" would pass on that
 * broken version.
 */

interface Handler {
  event: string;
  filter: string | undefined;
  fire: () => void;
}

interface FakeChannel {
  topic: string;
  handlers: Handler[];
  /** The callback `subscribe` was given, so a test can push a state at it. */
  status: (state: string) => void;
  on: (kind: string, config: { event: string; filter?: string }, fire: () => void) => FakeChannel;
  subscribe: (callback: (state: string) => void) => FakeChannel;
}

const bus = vi.hoisted(() => ({
  channels: [] as FakeChannel[],
  removed: [] as string[],
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    channel(topic: string): FakeChannel {
      const channel: FakeChannel = {
        topic,
        handlers: [],
        status: () => undefined,
        on(_kind, config, fire) {
          channel.handlers.push({ event: config.event, filter: config.filter, fire });
          return channel;
        },
        subscribe(callback) {
          channel.status = callback;
          return channel;
        },
      };
      bus.channels.push(channel);
      return channel;
    },
    removeChannel(channel: FakeChannel) {
      bus.removed.push(channel.topic);
      return Promise.resolve('ok');
    },
  }),
}));

beforeEach(() => {
  bus.channels = [];
  bus.removed = [];
});

const only = () => {
  const channel = bus.channels[0];
  if (!channel) throw new Error('nothing subscribed');
  return channel;
};

describe('useRealtimeRows', () => {
  it('watches inserts and updates, and not deletes', () => {
    const onChange = vi.fn();
    renderHook(() => {
      useRealtimeRows({ table: 'chat_messages', filter: 'thread_id=eq.t1', onChange });
    });
    // Nothing in Chat deletes: removal is a soft update that blanks the body
    // and keeps the row, so it arrives as an UPDATE.
    expect(only().handlers.map((h) => h.event)).toEqual(['INSERT', 'UPDATE']);
    expect(only().handlers.every((h) => h.filter === 'thread_id=eq.t1')).toBe(true);
  });

  it('carries no filter at all when it was not given one', () => {
    // The shell's subscription. RLS is what scopes it, not a filter.
    renderHook(() => {
      useRealtimeRows({ table: 'chat_messages', onChange: () => undefined });
    });
    expect(only().handlers.every((h) => h.filter === undefined)).toBe(true);
  });

  it('refetches the moment it subscribes, and on every reconnection', () => {
    const onChange = vi.fn();
    renderHook(() => {
      useRealtimeRows({ table: 'chat_posts', onChange });
    });
    expect(onChange).not.toHaveBeenCalled();

    only().status('SUBSCRIBED');
    expect(onChange).toHaveBeenCalledTimes(1);

    // A dropped socket coming back. Nothing said during the gap is replayed, so
    // the refetch is the only thing that recovers it.
    only().status('CLOSED');
    only().status('SUBSCRIBED');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('refetches when the window comes back', () => {
    const onChange = vi.fn();
    renderHook(() => {
      useRealtimeRows({ table: 'chat_messages', onChange });
    });
    window.dispatchEvent(new Event('focus'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('passes a change on', () => {
    const onChange = vi.fn();
    renderHook(() => {
      useRealtimeRows({ table: 'chat_topics', onChange });
    });
    for (const handler of only().handlers) handler.fire();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('subscribes to nothing while there is nothing to watch', () => {
    // A screen whose id is not in the URL yet.
    renderHook(() => {
      useRealtimeRows({ table: 'chat_messages', onChange: () => undefined, enabled: false });
    });
    expect(bus.channels).toHaveLength(0);
  });

  it('gives every subscription its own channel and takes it down again', () => {
    // Two components can watch the same table at once — the shell watches every
    // message and an open conversation watches its own — and a shared topic is
    // how one unmounting takes the other's events with it.
    const first = renderHook(() => {
      useRealtimeRows({ table: 'chat_messages', onChange: () => undefined });
    });
    const second = renderHook(() => {
      useRealtimeRows({ table: 'chat_messages', onChange: () => undefined });
    });
    const topics = bus.channels.map((c) => c.topic);
    expect(new Set(topics).size).toBe(2);

    first.unmount();
    second.unmount();
    expect(bus.removed.sort()).toEqual(topics.sort());
  });

  it('does not rebuild the socket when only the callback changes', () => {
    // The callback is a new function on every render of the caller. Rebuilding
    // on it would tear the subscription down and up on every keystroke.
    const { rerender } = renderHook(
      ({ onChange }: { onChange: () => void }) => {
        useRealtimeRows({ table: 'chat_messages', onChange });
      },
      { initialProps: { onChange: () => undefined } },
    );
    rerender({ onChange: () => undefined });
    expect(bus.channels).toHaveLength(1);
  });

  it('uses the newest callback, not the one it subscribed with', () => {
    const stale = vi.fn();
    const fresh = vi.fn();
    const { rerender } = renderHook(
      ({ onChange }: { onChange: () => void }) => {
        useRealtimeRows({ table: 'chat_messages', onChange });
      },
      { initialProps: { onChange: stale } },
    );
    rerender({ onChange: fresh });
    only().status('SUBSCRIBED');
    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledTimes(1);
  });
});
