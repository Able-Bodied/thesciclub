import { useCallback, useEffect, useRef, useState } from 'react';
import { type ChatRoom, ROOM_CATEGORIES, type RoomCategory } from '@/lib/chat/types';
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
