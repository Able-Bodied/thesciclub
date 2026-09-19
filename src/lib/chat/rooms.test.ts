import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { roomsByCategory, setRoomOpen, useChatRooms } from '@/lib/chat/rooms';
import type { ChatRoom } from '@/lib/chat/types';

/**
 * Only `@/lib/supabase` is stubbed — the module under test is the real one.
 * `roomsByCategory` is pure and is exported from the same file as the hook, so
 * mocking `@/lib/chat/rooms` itself would let this file assert its own
 * arithmetic.
 */

const db = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  error: null as { message: string } | null,
  rpcCalls: [] as [string, Record<string, unknown>][],
  rpcError: null as { message: string } | null,
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: () => ({
      select: () => ({
        order: () => ({
          abortSignal: () => Promise.resolve({ data: db.rows, error: db.error }),
        }),
      }),
    }),
    rpc: (name: string, args: Record<string, unknown>) => {
      db.rpcCalls.push([name, args]);
      return Promise.resolve({ error: db.rpcError });
    },
  }),
}));

const room = (o: Partial<ChatRoom> & { id: string }): ChatRoom => ({
  name: 'A room',
  description: 'What it is for.',
  category: 'Body',
  icon: '◍',
  sortOrder: 1,
  openedAt: null,
  ...o,
});

beforeEach(() => {
  db.rows = [];
  db.error = null;
  db.rpcCalls = [];
  db.rpcError = null;
});

describe('grouping rooms into categories', () => {
  // The seed puts Body at 1-5, Life at 6-10 and Kit at 11-12 precisely so that
  // one column carries both orders. If that stops being true the categories
  // come out in whatever order the rows arrive in, which is the kind of drift
  // nobody notices in a screenshot.
  it('orders the categories by the lowest sort_order in each', () => {
    const grouped = roomsByCategory([
      room({ id: 'equip', category: 'Kit', sortOrder: 11 }),
      room({ id: 'newsci', category: 'Life', sortOrder: 6 }),
      room({ id: 'bowel', category: 'Body', sortOrder: 1 }),
      room({ id: 'driving', category: 'Kit', sortOrder: 12 }),
      room({ id: 'aging', category: 'Body', sortOrder: 5 }),
    ]);
    expect(grouped.map(([category]) => category)).toEqual(['Body', 'Life', 'Kit']);
  });

  it('orders the rooms inside a category by sort_order', () => {
    const grouped = roomsByCategory([
      room({ id: 'aging', sortOrder: 5 }),
      room({ id: 'bowel', sortOrder: 1 }),
      room({ id: 'skin', sortOrder: 3 }),
    ]);
    expect(grouped[0]?.[1].map((r) => r.id)).toEqual(['bowel', 'skin', 'aging']);
  });

  // The ordinary case for a member: an administrator has opened one room, so
  // two of the three categories have nothing in them and must not be drawn as
  // empty headings.
  it('leaves out a category with no rooms in it', () => {
    const grouped = roomsByCategory([room({ id: 'bowel', category: 'Body', sortOrder: 1 })]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.[0]).toBe('Body');
  });

  it('has nothing to group when no room is open', () => {
    expect(roomsByCategory([])).toEqual([]);
  });

  it('does not reorder the array it was given', () => {
    const rooms = [room({ id: 'aging', sortOrder: 5 }), room({ id: 'bowel', sortOrder: 1 })];
    roomsByCategory(rooms);
    expect(rooms.map((r) => r.id)).toEqual(['aging', 'bowel']);
  });
});

describe('reading the rooms', () => {
  it('maps the row and keeps opened_at', async () => {
    db.rows = [
      {
        id: 'bowel',
        name: 'Bowel management',
        description: 'The one nobody talks about anywhere else.',
        category: 'Body',
        icon: '◍',
        sort_order: 1,
        opened_at: '2026-09-18T10:00:00Z',
      },
      {
        id: 'bladder',
        name: 'Bladder & catheters',
        description: 'Intermittent, suprapubic, Mitrofanoff, Foley.',
        category: 'Body',
        icon: '◌',
        sort_order: 2,
        opened_at: null,
      },
    ];
    const { result } = renderHook(() => useChatRooms());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.rooms).toHaveLength(2);
    expect(result.current.rooms[0]?.openedAt).toBe('2026-09-18T10:00:00Z');
    // Null is how a closed room reaches /admin. A member never gets this row
    // at all, so the client must not treat null as "unknown".
    expect(result.current.rooms[1]?.openedAt).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('reports the database refusal verbatim and shows no rooms', async () => {
    db.error = { message: 'relation "public.chat_rooms" does not exist' };
    const { result } = renderHook(() => useChatRooms());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.rooms).toEqual([]);
    expect(result.current.error).toBe('relation "public.chat_rooms" does not exist');
  });
});

describe('opening and closing a room', () => {
  it('names the room and whether it should be open', async () => {
    expect(await setRoomOpen('bowel', true)).toEqual({ ok: true });
    expect(db.rpcCalls).toEqual([['admin_set_room_open', { room: 'bowel', is_open: true }]]);
  });

  // The refusal is the database's sentence verbatim — /admin shows it, and it
  // says why better than anything this layer could write.
  it('passes a refusal through unrewritten', async () => {
    db.rpcError = { message: 'Only an administrator can open or close a room.' };
    expect(await setRoomOpen('bowel', true)).toEqual({
      ok: false,
      error: 'Only an administrator can open or close a room.',
    });
  });
});
