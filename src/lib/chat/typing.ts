import { REALTIME_SUBSCRIBE_STATES, type RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { pageHidden } from '@/lib/page-return';
import { getSupabase } from '@/lib/supabase';

/**
 * Who is typing in a conversation: the three dots of Messages and WhatsApp
 * (the owner, 2026-11-18).
 *
 * Nothing is stored. Each app says "typing" over a Realtime broadcast channel,
 * `typing:<thread id>`, while its member writes, and "stopped" when they send,
 * empty the box, go quiet or leave. The channel is private: Realtime lets only
 * the conversation's members join it (20261118140000).
 *
 * A message can be lost (a tunnel, a closed lid), so neither side trusts the
 * other to say "stopped": the writer repeats "typing" every SAY_EVERY while
 * keys come, and a reader forgets anyone not heard from for FORGET_AFTER.
 *
 * What a member says is not checked against who they are: another member of
 * the same conversation could name somebody else as typing. Dots are all it
 * could draw, and only for the conversation's own members (the caller keeps to
 * its roster).
 */

/** While keys keep coming, "typing" again this often. */
export const SAY_EVERY = 3_000;
/** No key for this long and the writer has stopped. */
export const QUIET_AFTER = 5_000;
/** Not heard from for this long and a reader lets the dots go. */
export const FORGET_AFTER = 7_000;
/** A closed screen keeps its channel this long, so coming straight back reuses it. */
const LINGER = 2_000;

type Said = 'typing' | 'stopped';
type Listener = (said: Said, memberId: string) => void;

interface Line {
  users: number;
  listeners: Set<Listener>;
  channel: RealtimeChannel | null;
  joined: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * One channel per conversation, shared. The Supabase client hands back the
 * channel it already has for a name, even one still leaving, which then cannot
 * be joined again: so a screen that closes and opens (React's StrictMode, a
 * quick back and forth) keeps its line, and a new one waits for the old to go.
 */
const lines = new Map<string, Line>();
const leaving = new Map<string, Promise<unknown>>();

function open(threadId: string): Line {
  const existing = lines.get(threadId);
  if (existing) {
    if (existing.timer) clearTimeout(existing.timer);
    existing.timer = null;
    existing.users += 1;
    return existing;
  }
  const line: Line = { users: 1, listeners: new Set(), channel: null, joined: false, timer: null };
  lines.set(threadId, line);
  const start = () => {
    if (lines.get(threadId) !== line) return;
    const hear = (said: Said) => (message: { payload?: { member?: unknown } }) => {
      const member = message.payload?.member;
      if (typeof member !== 'string') return;
      for (const listener of line.listeners) listener(said, member);
    };
    const channel = getSupabase().channel(`typing:${threadId}`, {
      config: { private: true, broadcast: { self: false } },
    });
    line.channel = channel;
    channel
      .on('broadcast', { event: 'typing' }, hear('typing'))
      .on('broadcast', { event: 'stopped' }, hear('stopped'))
      .subscribe((status) => {
        line.joined = status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED;
      });
  };
  const before = leaving.get(threadId);
  if (before) void before.then(start);
  else start();
  return line;
}

function close(threadId: string, line: Line) {
  line.users -= 1;
  if (line.users > 0) return;
  line.timer = setTimeout(() => {
    lines.delete(threadId);
    const channel = line.channel;
    line.joined = false;
    if (!channel) return;
    const gone: Promise<unknown> = getSupabase()
      .removeChannel(channel)
      .catch(() => undefined)
      .finally(() => {
        if (leaving.get(threadId) === gone) leaving.delete(threadId);
      });
    leaving.set(threadId, gone);
  }, LINGER);
}

function say(line: Line | null, said: Said, memberId: string) {
  if (!line?.channel || !line.joined) return;
  void line.channel
    .send({ type: 'broadcast', event: said, payload: { member: memberId } })
    .catch(() => undefined);
}

export interface Typing {
  /** Who else is typing here now, first to start first. */
  typing: readonly string[];
  /** The box changed: whether it has words in it. */
  typed: (hasWords: boolean) => void;
}

/**
 * `threadId` undefined (no conversation, or nobody left to write to) and
 * nothing is joined. `me` is never listed.
 */
export function useTyping(threadId: string | undefined, me: string | null): Typing {
  const [typing, setTyping] = useState<readonly string[]>([]);
  const line = useRef<Line | null>(null);
  const saying = useRef(false);
  const lastSaid = useRef(0);
  const quiet = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (quiet.current) clearTimeout(quiet.current);
    quiet.current = null;
    if (!saying.current) return;
    saying.current = false;
    if (me) say(line.current, 'stopped', me);
  }, [me]);

  useEffect(() => {
    if (!threadId || !me) return;
    const current = open(threadId);
    line.current = current;
    const heard = new Map<string, ReturnType<typeof setTimeout>>();
    const show = () => {
      setTyping([...heard.keys()]);
    };
    const forget = (memberId: string) => {
      clearTimeout(heard.get(memberId));
      if (heard.delete(memberId)) show();
    };
    const listener: Listener = (said, memberId) => {
      if (memberId === me) return;
      if (said === 'stopped') {
        forget(memberId);
        return;
      }
      const known = heard.has(memberId);
      clearTimeout(heard.get(memberId));
      heard.set(
        memberId,
        setTimeout(() => {
          forget(memberId);
        }, FORGET_AFTER),
      );
      if (!known) show();
    };
    current.listeners.add(listener);
    // Put away, the phone says nothing more; the others' dots lapse.
    const hidden = () => {
      if (pageHidden()) stop();
    };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      stop();
      current.listeners.delete(listener);
      for (const timer of heard.values()) clearTimeout(timer);
      line.current = null;
      setTyping([]);
      close(threadId, current);
    };
  }, [threadId, me, stop]);

  const typed = useCallback(
    (hasWords: boolean) => {
      if (!hasWords || pageHidden() || !me) {
        stop();
        return;
      }
      const now = Date.now();
      if (!saying.current || now - lastSaid.current >= SAY_EVERY) {
        say(line.current, 'typing', me);
        saying.current = true;
        lastSaid.current = now;
      }
      if (quiet.current) clearTimeout(quiet.current);
      quiet.current = setTimeout(stop, QUIET_AFTER);
    },
    [me, stop],
  );

  return { typing, typed };
}
