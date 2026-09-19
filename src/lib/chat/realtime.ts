import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';
import { useEffect, useRef } from 'react';
import { getSupabase } from '@/lib/supabase';

/**
 * Being told when a row lands, instead of asking.
 *
 * One hook, used by every live surface in Chat: a conversation watches its own
 * messages, a topic its own posts, a room its own topics, and the shell watches
 * every message the reader can see so that the list and the nav dot move.
 *
 * ---------------------------------------------------------------------------
 * Realtime reads tables, and applies the table's select policy
 * ---------------------------------------------------------------------------
 * Not views — see 20260918120000. The filter below is a narrowing of what the
 * reader is already allowed to see and never the thing that makes it safe: an
 * unfiltered `chat_messages` subscription is scoped by RLS to the threads they
 * are in, which is why the shell can have one at all.
 *
 * ---------------------------------------------------------------------------
 * It refetches; it does not apply the payload
 * ---------------------------------------------------------------------------
 * The hook hands back nothing but a callback, and every caller's callback is
 * "read it again". Taking the row off the wire and splicing it into state would
 * be faster and would be a second copy of every derivation the database already
 * does — a post's number in its topic, a topic's reply count, whether a thread
 * is unread, whose faces are on a topic row. All of those are computed in SQL
 * and none of them can be recomputed from one row arriving.
 *
 * So the event is a signal that something changed, not the change itself. A
 * refetch of a screen somebody is looking at is one small query; being wrong
 * about a count on a screen somebody is looking at lasts until they leave it.
 *
 * ---------------------------------------------------------------------------
 * Every (re)subscribe refetches, and so does regaining focus
 * ---------------------------------------------------------------------------
 * **This is the part that must not be dropped.** Realtime delivers nothing
 * while the socket is down — a phone that slept, a tunnel, a wifi handover —
 * and it does not replay what was missed when it comes back. A screen that
 * subscribed once and then only listened would silently miss everything said
 * during the gap, which is the "passes by not running" failure this project has
 * had six times, in production form: a chat that looks like it is working and
 * is not showing you a message.
 *
 * So the refetch runs on SUBSCRIBED — the first one and every reconnection —
 * and again when the window regains focus, which covers the case where the
 * socket never noticed it had died.
 */

export interface RealtimeRowsOptions {
  /** The table to watch. It must be in the `supabase_realtime` publication. */
  table: string;
  /**
   * A PostgREST-style narrowing, e.g. `thread_id=eq.<uuid>`. One condition
   * only — that is all `postgres_changes` supports — and always a narrowing of
   * what RLS already permits, never the thing that makes the subscription safe.
   */
  filter?: string | undefined;
  /** Re-read whatever the screen is showing. Called on every change. */
  onChange: () => void;
  /** False while the screen has nothing to watch yet (no id in the URL). */
  enabled?: boolean;
}

/**
 * Channels are named per subscription, not per table.
 *
 * Two components can legitimately watch the same table at once — the shell
 * watches every message and an open conversation watches its own — and a shared
 * topic name is how one of them unsubscribing takes the other one's events with
 * it.
 */
let channelCount = 0;

export function useRealtimeRows({ table, filter, onChange, enabled = true }: RealtimeRowsOptions) {
  // The callback is a new function on every render of the caller. Held in a ref
  // so that the effect below depends on what it is watching — the table and the
  // filter — and does not tear the socket down and rebuild it every render.
  const latest = useRef(onChange);
  latest.current = onChange;

  useEffect(() => {
    if (!enabled) return;

    const supabase = getSupabase();
    channelCount += 1;
    const channel = supabase.channel(`chat:${table}:${channelCount}`);

    const fire = () => {
      latest.current();
    };

    channel
      // INSERT and UPDATE, and not DELETE: nothing in Chat deletes. Removal is
      // a soft update that blanks the body and keeps the row, so a removal
      // arrives here as an UPDATE and the screen redraws it as "Removed by…".
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table, ...(filter ? { filter } : {}) },
        fire,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table, ...(filter ? { filter } : {}) },
        fire,
      )
      .subscribe((status) => {
        // The first subscribe and every reconnection. See the header: this is
        // what stops a screen silently missing everything said while the socket
        // was down.
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) fire();
      });

    const onFocus = () => {
      fire();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      window.removeEventListener('focus', onFocus);
      void supabase.removeChannel(channel);
    };
  }, [table, filter, enabled]);
}
