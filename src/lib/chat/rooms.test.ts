import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRoom,
  normalizeRoomName,
  roomNamed,
  roomProblem,
  roomsByCategory,
  roomsMatching,
  roomToFill,
  setRoomOpen,
  useChatRooms,
  useRoomMembership,
} from '@/lib/chat/rooms';
import type { ChatRoom, RoomStats } from '@/lib/chat/types';
import { UPDATING_FAILURE } from '@/lib/describe-error';

/**
 * Only `@/lib/supabase` is stubbed — the module under test is the real one.
 * `roomsByCategory` is pure and is exported from the same file as the hook, so
 * mocking `@/lib/chat/rooms` itself would let this file assert its own
 * arithmetic.
 */

const db = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  error: null as { code?: string; message: string } | null,
  rpcCalls: [] as [string, Record<string, unknown>][],
  rpcData: null as string | null,
  rpcError: null as { message: string } | null,
  /** Every upsert's row and options, so a test can see the conflict shape. */
  upserts: [] as [Record<string, unknown>, Record<string, unknown>][],
  upsertError: null as { code?: string; message: string } | null,
}));

vi.mock('@/lib/account', () => ({
  useAccount: () => ({ status: 'member', userId: 'me' }),
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: () => ({
      select: () => ({
        order: () => ({
          abortSignal: () => Promise.resolve({ data: db.rows, error: db.error }),
        }),
        eq: () => ({
          abortSignal: () => Promise.resolve({ data: db.rows, error: db.error }),
        }),
      }),
      upsert: (row: Record<string, unknown>, options: Record<string, unknown>) => {
        db.upserts.push([row, options]);
        return Promise.resolve({ error: db.upsertError });
      },
    }),
    rpc: (name: string, args: Record<string, unknown>) => {
      db.rpcCalls.push([name, args]);
      return Promise.resolve({ data: db.rpcData, error: db.rpcError });
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
  createdBy: null,
  ...o,
});

beforeEach(() => {
  db.rows = [];
  db.error = null;
  db.rpcCalls = [];
  db.rpcData = null;
  db.rpcError = null;
  db.upserts = [];
  db.upsertError = null;
});

describe('joining a room', () => {
  // Found by a member, not a test: every join was refused with `permission
  // denied for table chat_room_members`. PostgREST turns an upsert into
  // `on conflict do update`, which needs an update grant the table rightly
  // does not have. `ignoreDuplicates` makes it `do nothing`, which needs only
  // insert and still absorbs a double tap.
  it('inserts, and on a second tap does nothing rather than updating', async () => {
    const { result } = renderHook(() => useRoomMembership());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    act(() => {
      result.current.toggle('bowel');
    });
    await waitFor(() => {
      expect(db.upserts).toHaveLength(1);
    });
    expect(db.upserts[0]?.[0]).toEqual({ room_id: 'bowel', member_id: 'me' });
    expect(db.upserts[0]?.[1]).toMatchObject({ ignoreDuplicates: true });
    expect(result.current.joined.has('bowel')).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('takes the join back and says so when the database refuses', async () => {
    db.upsertError = {
      code: '42501',
      message: 'new row violates row-level security policy for table "chat_room_members"',
    };
    const { result } = renderHook(() => useRoomMembership());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    act(() => {
      result.current.toggle('bowel');
    });
    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });
    expect(result.current.joined.has('bowel')).toBe(false);
    expect(result.current.error).toBe('You did not join the room. You cannot do that here.');
  });
});

describe('grouping rooms into categories', () => {
  // The order is ROOM_CATEGORIES', not the rooms'. A category that holds only
  // member rooms — every member room is sort_order 1000 and up — would
  // otherwise land wherever its first room happened to fall, so the headings
  // could come out in a different order for two members looking at the same
  // rooms, which is the kind of drift nobody notices in a screenshot.
  it('orders the categories as ROOM_CATEGORIES does, whatever the rooms say', () => {
    const grouped = roomsByCategory([
      room({ id: 'equip', category: 'Kit', sortOrder: 11 }),
      room({ id: 'grief', category: 'Mind', sortOrder: 1002 }),
      room({ id: 'newsci', category: 'Life', sortOrder: 6 }),
      room({ id: 'bowel', category: 'Body', sortOrder: 1 }),
      room({ id: 'driving', category: 'Kit', sortOrder: 12 }),
      room({ id: 'airports', category: 'Places', sortOrder: 1001 }),
      room({ id: 'aging', category: 'Body', sortOrder: 5 }),
    ]);
    expect(grouped.map(([category]) => category)).toEqual([
      'Body',
      'Mind',
      'Life',
      'Kit',
      'Places',
    ]);
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

  // A database that predates the table is schema drift, and a member should
  // read that the club is being updated — never the relation's name.
  it('reports the database refusal as a sentence and shows no rooms', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    db.error = { code: '42P01', message: 'relation "public.chat_rooms" does not exist' };
    const { result } = renderHook(() => useChatRooms());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.rooms).toEqual([]);
    expect(result.current.error).toBe(UPDATING_FAILURE);
    expect(consoleError).toHaveBeenCalledWith(db.error);
    consoleError.mockRestore();
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

describe('a name the database would call the same name', () => {
  // The database collapses whitespace before it checks lower(name) against the
  // unique index — found by running the probe, which walked "SHOULDER   pain"
  // straight past a lowercase-only comparison.
  it.each([
    ['Shoulder pain', 'Shoulder pain'],
    ['  Shoulder pain  ', 'Shoulder pain'],
    ['SHOULDER   pain', 'SHOULDER pain'],
    ['Shoulder\tpain', 'Shoulder pain'],
  ])('%s becomes %s', (given, expected) => {
    expect(normalizeRoomName(given)).toBe(expected);
  });
});

describe('what is missing from a room somebody is describing', () => {
  const full = (o: Partial<Record<'n' | 'd' | 't' | 'b', string>> & { c?: null } = {}) =>
    roomProblem(
      o.n ?? 'Shoulder pain',
      'c' in o ? null : 'Body',
      o.d ?? 'Overuse, transfers, and what helped.',
      o.t ?? 'Twenty years of pushing',
      o.b ?? 'What did you change first?',
    );

  it('says nothing when all five are there', () => {
    expect(full()).toBeNull();
  });

  // Top to bottom: somebody filling the form in order is never told about a
  // field they have not reached yet.
  it('asks for the fields in the order the form does', () => {
    expect(full({ n: '', c: null, d: '', t: '', b: '' })).toBe('Give the room a name.');
    expect(full({ c: null, d: '', t: '', b: '' })).toBe(
      'Say which part of life the room is about.',
    );
    expect(full({ d: '', t: '', b: '' })).toBe('Say what the room is for.');
    expect(full({ t: '', b: '' })).toBe('Give the first topic a title.');
    expect(full({ b: '' })).toBe('Write the first topic.');
  });

  it('counts a name the way the database will', () => {
    expect(full({ n: ' a  ' })).toContain('at least 3');
    expect(full({ n: 'x'.repeat(41) })).toContain('40 characters or fewer');
    // Three characters once the spaces are collapsed, and therefore fine.
    expect(full({ n: 'a  bc' })).toBeNull();
  });

  it('will not take a description too short to say anything', () => {
    expect(full({ d: 'Shoulders' })).toContain('at least 10');
    expect(full({ d: 'x'.repeat(201) })).toContain('200 characters or fewer');
  });

  it('treats whitespace as empty', () => {
    expect(full({ b: '   \n  ' })).toBe('Write the first topic.');
  });
});

describe('the rooms that already exist under that name', () => {
  const rooms = [
    room({ id: 'bowel', name: 'Bowel management', sortOrder: 1 }),
    room({ id: 'bladder', name: 'Bladder & catheters', sortOrder: 2 }),
    room({ id: 'pain-1a2b', name: 'Shoulder pain', sortOrder: 1000, createdBy: 'ada' }),
  ];

  // One letter matches most of the twelve, and a list that is always there is
  // not a suggestion.
  it('says nothing until there are two characters', () => {
    expect(roomsMatching(rooms, 'b')).toEqual([]);
    expect(roomsMatching(rooms, ' b ')).toEqual([]);
    expect(roomsMatching(rooms, 'bl').map((r) => r.id)).toEqual(['bladder']);
  });

  it('matches anywhere in the name, ignoring case', () => {
    expect(roomsMatching(rooms, 'PAIN').map((r) => r.id)).toEqual(['pain-1a2b']);
    expect(roomsMatching(rooms, 'bl').map((r) => r.id)).toEqual(['bladder']);
  });

  it('keeps the seeded rooms above the member-started ones', () => {
    expect(roomsMatching(rooms, 'er').map((r) => r.id)).toEqual(['bladder', 'pain-1a2b']);
  });

  it('caps the list', () => {
    expect(roomsMatching(rooms, 'er', 1).map((r) => r.id)).toEqual(['bladder']);
  });

  it('finds the exact clash the database refused, whatever was typed', () => {
    expect(roomNamed(rooms, '  SHOULDER   pain ')?.id).toBe('pain-1a2b');
    // A clash with a closed room: the member cannot see it, so there is no
    // link to offer and the refusal stands on its own sentence.
    expect(roomNamed(rooms, 'Skin & pressure sores')).toBeNull();
  });
});

describe('the room a member has to fill first', () => {
  const rooms = [
    room({ id: 'bowel', name: 'Bowel management' }),
    room({ id: 'mine-1', name: 'Mine, empty', createdBy: 'ada' }),
    room({ id: 'mine-2', name: 'Mine, filled', createdBy: 'ada' }),
    room({ id: 'theirs', name: 'Theirs, empty', createdBy: 'bo' }),
  ];
  const stats = new Map<string, RoomStats>([
    ['bowel', { topicCount: 0, postCount: 0, memberCount: 0 }],
    ['mine-1', { topicCount: 0, postCount: 0, memberCount: 1 }],
    ['mine-2', { topicCount: 3, postCount: 9, memberCount: 2 }],
    ['theirs', { topicCount: 0, postCount: 0, memberCount: 1 }],
  ]);

  it('is theirs, empty, and nobody else’s', () => {
    expect(roomToFill(rooms, stats, 'ada')?.id).toBe('mine-1');
    expect(roomToFill(rooms, stats, 'bo')?.id).toBe('theirs');
  });

  // Counts that have not arrived are not zero. Linking a member to a room they
  // have already filled would contradict the sentence above the link.
  it('offers nothing while the counts are missing', () => {
    expect(roomToFill(rooms, new Map(), 'ada')).toBeNull();
  });

  it('offers nothing to somebody signed out', () => {
    expect(roomToFill(rooms, stats, null)).toBeNull();
  });
});

describe('starting a room', () => {
  it('sends all five fields trimmed, under the names the function has', () => {
    db.rpcData = 'shoulder-pain-1a2b';
    return createRoom(
      '  Shoulder pain ',
      ' Overuse and transfers. ',
      'Body',
      ' Twenty years ',
      ' What did you change? ',
    ).then((result) => {
      expect(result).toEqual({ ok: true, value: 'shoulder-pain-1a2b' });
      expect(db.rpcCalls).toEqual([
        [
          'chat_create_room',
          {
            room_name: 'Shoulder pain',
            room_description: 'Overuse and transfers.',
            room_category: 'Body',
            topic_title: 'Twenty years',
            topic_body: 'What did you change?',
          },
        ],
      ]);
    });
  });

  // The database's own sentence, unrewritten: it names the room that already
  // has the name, or the one waiting to be filled, and the screen turns that
  // name into a link.
  it('passes a refusal through unrewritten', async () => {
    db.rpcError = { message: 'There is already a room called Shoulder pain.' };
    expect(await createRoom('Shoulder pain', 'x'.repeat(20), 'Body', 't', 'b')).toEqual({
      ok: false,
      error: 'There is already a room called Shoulder pain.',
    });
  });

  it('does not report success without an id to go to', async () => {
    const result = await createRoom('Shoulder pain', 'x'.repeat(20), 'Body', 't', 'b');
    expect(result.ok).toBe(false);
  });
});
