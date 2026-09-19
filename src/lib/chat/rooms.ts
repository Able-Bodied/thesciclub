import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from '@/lib/account';
import {
  type ChatRoom,
  ROOM_CATEGORIES,
  type RoomCategory,
  type RoomStats,
} from '@/lib/chat/types';
import { getSupabase } from '@/lib/supabase';

/**
 * The discussion rooms.
 *
 * ---------------------------------------------------------------------------
 * One query for two audiences
 * ---------------------------------------------------------------------------
 * `/chat` and `/admin` read the same `chat_rooms` and get different answers,
 * because the select policy is `is_member() and (opened_at is not null or
 * is_admin())`. A member gets the open rooms; an administrator gets all twelve
 * with `openedAt` null on the shut ones. There is deliberately no "include
 * closed" flag here for the client to pass — the database decides who sees
 * what, and a flag would be a second place that opinion lived.
 *
 * So a component tells the two apart by looking at `openedAt`, not by asking
 * for a different query.
 */

interface ChatRoomRow {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  sort_order: number;
  opened_at: string | null;
}

function toRoom(row: ChatRoomRow): ChatRoom {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    // The column is checked against exactly these three, so an unknown value
    // means the check was changed without this being. Body is the least
    // surprising thing to draw rather than a crash.
    category: (ROOM_CATEGORIES as readonly string[]).includes(row.category)
      ? (row.category as RoomCategory)
      : 'Body',
    icon: row.icon,
    sortOrder: row.sort_order,
    openedAt: row.opened_at,
  };
}

/**
 * Rooms grouped into the categories, in `sort_order`.
 *
 * The categories come out in the order of the lowest `sort_order` in each,
 * which is how the seed encodes Body · Life · Kit without a second column that
 * could disagree with the first. A category with no rooms in it is left out
 * rather than drawn as an empty heading — which is the ordinary case for a
 * member, who sees only the rooms an administrator has opened.
 *
 * Pure, so it is tested without a database.
 */
export function roomsByCategory(rooms: ChatRoom[]): [RoomCategory, ChatRoom[]][] {
  const sorted = [...rooms].sort((a, b) => a.sortOrder - b.sortOrder);
  const grouped = new Map<RoomCategory, ChatRoom[]>();
  for (const room of sorted) {
    const existing = grouped.get(room.category);
    if (existing) existing.push(room);
    else grouped.set(room.category, [room]);
  }
  // Map preserves insertion order and `sorted` is in sort_order, so the first
  // room of each category arrived in the order the categories should be drawn.
  return [...grouped];
}

export interface ChatRoomsState {
  rooms: ChatRoom[];
  loading: boolean;
  /** The database's own sentence where there is one. */
  error: string | null;
  /** Re-read the list. Used after an administrator opens or closes a room. */
  reload: () => void;
}

export function useChatRooms(): ChatRoomsState {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The read in flight, so that a reload cancels the one before it and
  // unmounting cancels whichever is running. A counter in state with an effect
  // keyed on it would do the same job and would leave the effect with a
  // dependency it never reads.
  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    // Read through a call: the type checker narrows `signal.aborted` to false
    // after the first check and flags every later one as dead code.
    const aborted = () => controller.signal.aborted;

    try {
      const { data, error: failure } = await getSupabase()
        .from('chat_rooms')
        .select('id, name, description, category, icon, sort_order, opened_at')
        .order('sort_order')
        .abortSignal(controller.signal);
      if (aborted()) return;
      if (failure) {
        // A database that predates 20260918020000 has no such table, and the
        // screen should lose its rooms rather than its page.
        setRooms([]);
        setError(failure.message);
        setLoading(false);
        return;
      }
      setRooms((data as ChatRoomRow[]).map(toRoom));
      setError(null);
      setLoading(false);
    } catch (e) {
      if (aborted()) return;
      setRooms([]);
      setError(e instanceof Error ? e.message : 'Could not load the rooms.');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      inFlight.current?.abort();
    };
  }, [load]);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  return { rooms, loading, error, reload };
}

/**
 * Open or close a room, as an administrator.
 *
 * A function rather than an update, because there is no update policy on
 * `chat_rooms` and there should not be: an RLS update that matches no rows
 * reports success, so a member who found this call would get a cheerful
 * no-op. `admin_set_room_open` refuses in a sentence, and that sentence is
 * what /admin shows.
 */
export async function setRoomOpen(
  roomId: string,
  open: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await getSupabase().rpc('admin_set_room_open', {
    room: roomId,
    is_open: open,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Which rooms the viewer has joined.
 *
 * ---------------------------------------------------------------------------
 * Joining is not what lets you read
 * ---------------------------------------------------------------------------
 * /chat promises "the whole history from before you joined", and it means it:
 * an open room and everything in it is readable by every member. What this set
 * decides is whether the composer is there. So a screen that has not finished
 * loading this shows the room, and only the reply control waits.
 *
 * The `.eq('member_id', …)` on the read is not load-bearing today — the select
 * policy is `member_id = auth.uid()` and nothing else — and is there for the
 * reason organization-follows.ts gives: a read that means "mine" should say so,
 * so that adding a policy later cannot quietly change what it returns.
 *
 * Joining is optimistic with an undo, like following an organization. It is a
 * one-tap decision and the failure case is a button that goes back to where it
 * was. Leaving is the same in reverse and is never refused by the database —
 * a door that opens and does not close is worse than no door.
 */
export interface RoomMembershipState {
  /** Room ids the viewer has joined. Empty while loading. */
  joined: Set<string>;
  loading: boolean;
  error: string | null;
  /** Join if not in it, leave if in it. */
  toggle: (roomId: string) => void;
}

export function useRoomMembership(): RoomMembershipState {
  const account = useAccount();
  const memberId = account.status === 'member' ? account.userId : null;

  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!memberId) {
      setJoined(new Set());
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const { signal } = controller;

    async function load(id: string) {
      const { data, error: failure } = await getSupabase()
        .from('chat_room_members')
        .select('room_id')
        .eq('member_id', id)
        .abortSignal(signal);
      if (signal.aborted) return;
      if (failure) {
        // A database that predates 20260918030000 has no such table, and a
        // screen that reads this should lose a button rather than a page.
        setJoined(new Set());
        setError(failure.message);
        setLoading(false);
        return;
      }
      setJoined(new Set((data as { room_id: string }[]).map((r) => r.room_id)));
      setError(null);
      setLoading(false);
    }

    void load(memberId);
    return () => {
      controller.abort();
    };
  }, [memberId]);

  const toggle = useCallback(
    (roomId: string) => {
      if (!memberId) return;
      const wasJoined = joined.has(roomId);
      setJoined((current) => {
        const next = new Set(current);
        if (wasJoined) next.delete(roomId);
        else next.add(roomId);
        return next;
      });

      const undo = () => {
        setJoined((current) => {
          const next = new Set(current);
          if (wasJoined) next.add(roomId);
          else next.delete(roomId);
          return next;
        });
      };

      const write = wasJoined
        ? getSupabase()
            .from('chat_room_members')
            .delete()
            .eq('member_id', memberId)
            .eq('room_id', roomId)
        : // The compound primary key makes this idempotent, which matters
          // because the button can be pressed twice before the first write
          // lands.
          getSupabase()
            .from('chat_room_members')
            .upsert({ room_id: roomId, member_id: memberId }, { onConflict: 'room_id,member_id' });

      void Promise.resolve(write)
        .then(({ error: failure }) => {
          if (!failure) {
            setError(null);
            return;
          }
          undo();
          setError(failure.message);
        })
        .catch((e: unknown) => {
          undo();
          setError(e instanceof Error ? e.message : 'That did not work.');
        });
    },
    [memberId, joined],
  );

  return { joined, loading, error, toggle };
}

/**
 * How many topics, posts and members each visible room has.
 *
 * Counts and never names. `chat_room_stats` runs with RLS off — that is what
 * lets it count membership rows nobody may list — and its own `where` is the
 * whole of its access control, so a room the viewer cannot see is simply not
 * in the answer.
 *
 * A room with no topics gets no stats line at all on the card rather than
 * "0 topics · 0 posts · 0 members", which is the invented-content rule broken
 * in the other direction: three zeros read as a room that failed, not as one
 * that has not started.
 */
export function useRoomStats(): {
  stats: Map<string, RoomStats>;
  loading: boolean;
  reload: () => void;
} {
  const [stats, setStats] = useState<Map<string, RoomStats>>(new Map());
  const [loading, setLoading] = useState(true);
  // The same shape as useChatRooms above, and for the same reason: a counter in
  // state would leave the effect with a dependency it never reads.
  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const aborted = () => controller.signal.aborted;

    try {
      const { data, error } = await getSupabase()
        .from('chat_room_stats')
        .select('room_id, topic_count, post_count, member_count')
        .abortSignal(controller.signal);
      if (aborted()) return;
      if (error) {
        // Stats are decoration on a card that is readable without them, so a
        // failure loses the line and says nothing.
        setStats(new Map());
        setLoading(false);
        return;
      }
      // Typed as string|number rather than number: these are bigint columns,
      // and the client hands a bigint over as a string once it passes 2^53.
      // Saying `number` and being handed "3" would make a card read "3 topics"
      // and the arithmetic beside it nonsense.
      const rows = data as {
        room_id: string;
        topic_count: number | string;
        post_count: number | string;
        member_count: number | string;
      }[];
      setStats(
        new Map(
          rows.map((row) => [
            row.room_id,
            {
              topicCount: Number(row.topic_count),
              postCount: Number(row.post_count),
              memberCount: Number(row.member_count),
            },
          ]),
        ),
      );
      setLoading(false);
    } catch {
      if (aborted()) return;
      setStats(new Map());
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      inFlight.current?.abort();
    };
  }, [load]);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  return { stats, loading, reload };
}
