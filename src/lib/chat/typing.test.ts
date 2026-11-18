import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FORGET_AFTER, QUIET_AFTER, SAY_EVERY, useTyping } from '@/lib/chat/typing';

/**
 * The timing, which is the part that goes wrong unseen: dots that never go
 * when a "stopped" is lost, or a writer who floods the channel at every key.
 * Who may join the channel is the database's (supabase/tests/who-is-typing.sql).
 */

type Hear = (message: { payload?: { member?: unknown } }) => void;

interface FakeChannel {
  topic: string;
  config: unknown;
  hear: Record<string, Hear>;
  sent: { event: string; member: unknown }[];
  on: (kind: string, filter: { event: string }, hear: Hear) => FakeChannel;
  subscribe: (callback: (status: string) => void) => FakeChannel;
  send: (message: { event: string; payload: { member: unknown } }) => Promise<string>;
}

const bus = vi.hoisted(() => ({ channels: [] as FakeChannel[] }));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    channel(topic: string, params: { config: unknown }): FakeChannel {
      const channel: FakeChannel = {
        topic,
        config: params.config,
        hear: {},
        sent: [],
        on(_kind, filter, hear) {
          channel.hear[filter.event] = hear;
          return channel;
        },
        subscribe(callback) {
          callback('SUBSCRIBED');
          return channel;
        },
        send(message) {
          channel.sent.push({ event: message.event, member: message.payload.member });
          return Promise.resolve('ok');
        },
      };
      bus.channels.push(channel);
      return channel;
    },
    removeChannel: () => Promise.resolve('ok'),
  }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  bus.channels = [];
});
afterEach(() => {
  vi.useRealTimers();
});

const only = () => {
  const channel = bus.channels[0];
  if (!channel) throw new Error('no channel');
  return channel;
};

describe('useTyping', () => {
  it('joins privately, shows others until they stop or go quiet, and says typing sparingly', () => {
    const { result } = renderHook(() => useTyping('thread-1', 'me'));
    const channel = only();
    expect(channel.topic).toBe('typing:thread-1');
    expect(channel.config).toMatchObject({ private: true });

    // Heard: shown; one's own echo is not.
    act(() => {
      channel.hear.typing?.({ payload: { member: 'ben' } });
      channel.hear.typing?.({ payload: { member: 'me' } });
    });
    expect(result.current.typing).toEqual(['ben']);
    act(() => {
      channel.hear.stopped?.({ payload: { member: 'ben' } });
    });
    expect(result.current.typing).toEqual([]);

    // A lost "stopped": the dots go on their own.
    act(() => {
      channel.hear.typing?.({ payload: { member: 'ann' } });
    });
    act(() => {
      vi.advanceTimersByTime(FORGET_AFTER - 1);
    });
    expect(result.current.typing).toEqual(['ann']);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.typing).toEqual([]);

    // Writing: once per SAY_EVERY however many keys, and stopped once quiet.
    act(() => {
      result.current.typed(true);
      result.current.typed(true);
    });
    expect(channel.sent).toEqual([{ event: 'typing', member: 'me' }]);
    act(() => {
      vi.advanceTimersByTime(SAY_EVERY);
      result.current.typed(true);
    });
    expect(channel.sent).toHaveLength(2);
    act(() => {
      vi.advanceTimersByTime(QUIET_AFTER);
    });
    expect(channel.sent.at(-1)).toEqual({ event: 'stopped', member: 'me' });

    // An emptied box (or a send) says stopped at once.
    act(() => {
      result.current.typed(true);
      result.current.typed(false);
    });
    expect(channel.sent.slice(-2).map((s) => s.event)).toEqual(['typing', 'stopped']);
  });
});
