import { act, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Attachments from '@/lib/chat/attachments';
import type * as ChatRooms from '@/lib/chat/rooms';
import type * as Threads from '@/lib/chat/threads';
import { RECOUNT_MS } from '@/lib/coalesce';
import ChatPage from '@/routes/chat/page';

/** The Chat tab's channels: what each one reads when it (re)subscribes. */

interface Channel {
  table: string;
  onChange: () => void;
  onRow?: (row: Record<string, unknown>) => void;
}

const db = vi.hoisted(() => ({
  channels: [] as Channel[],
  reads: { rooms: 0, stats: 0, threads: 0 },
}));

vi.mock('@/lib/account', () => ({
  useAccount: () => ({ status: 'member', userId: 'me', isAdmin: false, displayName: 'Alex' }),
}));
vi.mock('@/lib/chat/authors', () => ({ useChatAuthors: () => new Map() }));
vi.mock('@/lib/chat/attachments', async (importOriginal) => ({
  ...(await importOriginal<typeof Attachments>()),
  useAttachmentUrls: () => new Map(),
}));
vi.mock('@/lib/chat/realtime', () => ({
  useRealtimeRows: (options: Channel) => {
    db.channels = [...db.channels.filter((c) => c.table !== options.table), options];
  },
}));
vi.mock('@/lib/chat/threads', async (importOriginal) => ({
  ...(await importOriginal<typeof Threads>()),
  useMyThreads: () => ({
    threads: [],
    loading: false,
    error: null,
    reload: () => {
      db.reads.threads += 1;
    },
  }),
}));
vi.mock('@/lib/chat/rooms', async (importOriginal) => ({
  ...(await importOriginal<typeof ChatRooms>()),
  useChatRooms: () => ({
    rooms: [],
    loading: false,
    error: null,
    reload: () => {
      db.reads.rooms += 1;
    },
  }),
  useRoomStats: () => ({
    stats: new Map(),
    loading: false,
    reload: () => {
      db.reads.stats += 1;
    },
  }),
}));

const channel = (table: string) => {
  const found = db.channels.find((c) => c.table === table);
  if (!found) throw new Error(`No ${table} channel`);
  return found;
};

afterEach(() => {
  vi.useRealTimers();
  db.channels = [];
  db.reads = { rooms: 0, stats: 0, threads: 0 };
});

describe("the Chat tab's catch-up on (re)subscribe", () => {
  it('reads the room stats once for its channels, not twice', async () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter initialEntries={['/chat']}>
        <ChatPage />
      </MemoryRouter>,
    );
    // Every channel says SUBSCRIBED, as on a show or a reconnect.
    for (const table of ['chat_messages', 'chat_topics', 'chat_rooms']) channel(table).onChange();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECOUNT_MS * 2);
    });
    // Was 2: chat_topics' catch-up and chat_rooms' 1.5 s later.
    expect(db.reads).toEqual({ rooms: 1, stats: 1, threads: 1 });
  });

  it('still recounts when a room itself changes', async () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter initialEntries={['/chat']}>
        <ChatPage />
      </MemoryRouter>,
    );
    channel('chat_rooms').onRow?.({ id: 'new-room' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECOUNT_MS * 2);
    });
    expect(db.reads).toEqual({ rooms: 1, stats: 1, threads: 0 });
  });
});
