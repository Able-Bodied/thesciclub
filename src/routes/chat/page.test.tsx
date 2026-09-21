import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ChatRooms from '@/lib/chat/rooms';
import type * as Threads from '@/lib/chat/threads';
import type { ChatAuthor, ChatRoom, ChatThread, RoomStats } from '@/lib/chat/types';
import ChatPage from '@/routes/chat/page';

/**
 * What this screen must not do is as important as what it does: it must not
 * report an empty room as three zeros, and it must not leave an empty segment
 * as blank space — every blank here says where to go next, and where to go is
 * different in each segment.
 *
 * The hooks that read the database are stubbed and `roomsByCategory` and
 * `threadTitle` deliberately are not — the grouping on screen is the real
 * function's, so this file cannot assert its own arithmetic. Their own tests
 * are in src/lib/chat/rooms.test.ts and threads.test.ts.
 */

const db = vi.hoisted(() => ({
  subscribed: [] as string[],
  rooms: [] as ChatRoom[],
  loading: false,
  error: null as string | null,
  stats: new Map<string, RoomStats>(),
  joined: new Set<string>(),
  threads: [] as ChatThread[],
  threadsLoading: false,
  threadsError: null as string | null,
  authors: new Map<string, ChatAuthor>(),
}));

vi.mock('@/lib/account', () => ({
  useAccount: () => ({ status: 'member', userId: 'me', isAdmin: false, displayName: 'Alex' }),
}));

vi.mock('@/lib/chat/threads', async (importOriginal) => ({
  ...(await importOriginal<typeof Threads>()),
  useMyThreads: () => ({
    threads: db.threads,
    loading: db.threadsLoading,
    error: db.threadsError,
    reload: () => undefined,
  }),
}));

vi.mock('@/lib/chat/authors', () => ({
  useChatAuthors: () => db.authors,
}));

// Stubbed, and it has to be: `.env.local` points at the hosted project, so an
// unmocked subscription in a test opens a websocket to production. What the
// hook does is its own concern — the screen's job here is to hand it a refetch.
vi.mock('@/lib/chat/realtime', () => ({
  useRealtimeRows: ({ table }: { table: string }) => {
    db.subscribed.push(table);
  },
}));

vi.mock('@/lib/chat/rooms', async (importOriginal) => ({
  ...(await importOriginal<typeof ChatRooms>()),
  useChatRooms: () => ({
    rooms: db.rooms,
    loading: db.loading,
    error: db.error,
    reload: () => undefined,
  }),
  useRoomStats: () => ({ stats: db.stats, loading: false, reload: () => undefined }),
  useRoomMembership: () => ({
    joined: db.joined,
    loading: false,
    error: null,
    toggle: () => undefined,
  }),
}));

const thread = (o: Partial<ChatThread> & { id: string }): ChatThread => ({
  kind: 'direct',
  name: null,
  eventId: null,
  createdAt: '2026-09-18T09:00:00Z',
  lastMessageAt: '2026-09-18T10:00:00Z',
  memberCount: 2,
  otherMemberId: 'jan',
  lastBody: 'The seat took three fittings.',
  lastAuthorId: 'jan',
  lastAt: '2026-09-18T10:00:00Z',
  lastRemoved: false,
  unread: false,
  ...o,
});

const author = (o: Partial<ChatAuthor> & { id: string }): ChatAuthor => ({
  displayName: 'Jan',
  photoPath: null,
  photoAlt: null,
  avatarColor: null,
  level: 'T4 complete',
  isAdmin: false,
  hasProfile: true,
  ...o,
});

const room = (o: Partial<ChatRoom> & { id: string }): ChatRoom => ({
  name: 'Bowel management',
  description: 'The one nobody talks about anywhere else.',
  category: 'Body',
  icon: '◍',
  sortOrder: 1,
  openedAt: '2026-09-18T10:00:00Z',
  createdBy: null,
  ...o,
});

function renderPage(entry = '/chat') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ChatPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  db.rooms = [];
  db.loading = false;
  db.error = null;
  db.stats = new Map();
  db.joined = new Set();
  db.threads = [];
  db.threadsLoading = false;
  db.threadsError = null;
  db.authors = new Map([['jan', author({ id: 'jan' })]]);
  db.subscribed = [];
});

describe('the chat screen', () => {
  // The mock's header has a search box. Search is not in this build, and a
  // field that takes words and does nothing with them is the one control
  // somebody will try first.
  it('offers no search box', () => {
    renderPage();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  // Two different blanks with two different ways out. A direct conversation
  // starts from somebody's profile and a group starts here, so neither empty
  // state is a dead end and neither points at the other one's door.
  it('points somebody with no conversations at a profile, and at the group control', () => {
    renderPage();
    expect(screen.getByText(/No conversations yet/)).toBeInTheDocument();
    expect(screen.getByText(/Message a member from their profile/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start a group' })).toHaveAttribute(
      'href',
      '/chat/new-group',
    );
  });

  it('says "no groups" under Groups, not "no conversations"', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Groups' }));
    expect(screen.getByText(/No groups yet/)).toBeInTheDocument();
    expect(screen.queryByText(/No conversations yet/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Start a group' })).toBeInTheDocument();
  });

  // The rooms segment is not about conversations at all, so the one control
  // that makes one has no business being there.
  it('offers no group control under Rooms', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Rooms' }));
    expect(screen.queryByRole('link', { name: 'Start a group' })).toBeNull();
  });

  it('opens a conversation, named by the other member', () => {
    db.threads = [thread({ id: 'th1' })];
    renderPage();
    const row = screen.getByRole('link', { name: /Jan/ });
    expect(row).toHaveAttribute('href', '/chat/t/th1');
    // Not "Jan: …" — the row is already titled Jan, and saying it twice spends
    // a third of the line on nothing.
    expect(within(row).getByText('The seat took three fittings.')).toBeInTheDocument();
  });

  it('names the speaker in a group, where the row is not already titled with it', () => {
    db.threads = [thread({ id: 'g1', kind: 'group', name: 'Saturday ride', otherMemberId: null })];
    renderPage();
    expect(screen.getByText('Jan: The seat took three fittings.')).toBeInTheDocument();
  });

  it('says "You" when the last word was the viewer’s', () => {
    db.threads = [thread({ id: 'th1', lastAuthorId: 'me', lastBody: 'Thank you.' })];
    renderPage();
    expect(screen.getByText('You: Thank you.')).toBeInTheDocument();
  });

  // The blank the database left is not shown. "Message removed" is the fact.
  it('says a removed last message was removed rather than showing the blank', () => {
    db.threads = [thread({ id: 'th1', lastBody: '', lastRemoved: true })];
    renderPage();
    expect(screen.getByText('Message removed')).toBeInTheDocument();
  });

  it('marks a conversation with something new in it', () => {
    db.threads = [thread({ id: 'th1', unread: true })];
    renderPage();
    // The dot is decorative; the word beside it is what a screen reader gets.
    expect(screen.getByRole('link', { name: /new/ })).toBeInTheDocument();
  });

  // The segment is in the URL, not in component state. Me's ROOMS counter
  // links straight at it, and a member who opens a room and presses back has
  // to land back on Rooms rather than on All.
  it('opens on the segment the link asked for', () => {
    db.threads = [thread({ id: 'th1' })];
    db.rooms = [room({ id: 'bowel' })];
    renderPage('/chat?segment=rooms');
    expect(screen.getByRole('button', { name: 'Rooms' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('link', { name: /Jan/ })).toBeNull();
  });

  it('ignores a segment it does not have', () => {
    db.threads = [thread({ id: 'th1' })];
    renderPage('/chat?segment=nonsense');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps conversations out of the Rooms segment', async () => {
    db.threads = [thread({ id: 'th1' })];
    db.rooms = [room({ id: 'bowel' })];
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Rooms' }));
    expect(screen.queryByRole('link', { name: /Jan/ })).toBeNull();
  });

  // The rooms are all seeded closed, so this is the ordinary first sight of
  // the screen. It explains the policy rather than apologising for a lack of
  // content — the rooms are not missing, they have not been opened — and it
  // says the other half now that a member can start one.
  it('explains that rooms open a few at a time, and that anybody can start one', () => {
    renderPage();
    expect(screen.getByText(/No rooms are open yet/)).toBeInTheDocument();
    expect(screen.getByText(/anybody can start one/)).toBeInTheDocument();
  });

  // Present whether or not there are rooms. A control that only appears when
  // the screen is empty reads as an apology for the emptiness.
  it('offers Start a room with rooms on the screen and without', async () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Start a room' })).toHaveAttribute(
      'href',
      '/chat/rooms/new',
    );
    cleanup();
    db.rooms = [room({ id: 'bowel' })];
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Rooms' }));
    expect(screen.getByRole('link', { name: 'Start a room' })).toBeInTheDocument();
  });

  // A room a member starts has to reach everybody else's list without them
  // reloading, which is the reason chat_rooms is in the realtime publication
  // at all. The conversations and the topic counts were already live.
  it('listens for rooms as well as messages and topics', () => {
    renderPage();
    expect(db.subscribed).toContain('chat_rooms');
    expect(db.subscribed).toContain('chat_messages');
    expect(db.subscribed).toContain('chat_topics');
  });

  it('names who started a member room, and nobody on a seeded one', () => {
    db.authors = new Map([
      [
        'ada',
        {
          id: 'ada',
          displayName: 'Ada A',
          photoPath: null,
          photoAlt: null,
          avatarColor: null,
          level: null,
          isAdmin: false,
          hasProfile: true,
        },
      ],
    ]);
    db.rooms = [
      room({ id: 'bowel' }),
      room({
        id: 'shoulder-pain-1a2b',
        name: 'Shoulder pain',
        sortOrder: 1000,
        createdBy: 'ada',
      }),
    ];
    renderPage();
    expect(screen.getByText('Started by Ada A')).toBeInTheDocument();
    expect(screen.queryByText(/Started by a former member/)).toBeNull();
  });

  it('keeps the mock’s promise about history and privacy', () => {
    renderPage();
    expect(
      screen.getByText(/the whole history from before you joined. Nothing here is public/),
    ).toBeInTheDocument();
  });

  it('draws an open room under its category label', () => {
    db.rooms = [
      room({ id: 'bowel' }),
      room({ id: 'equip', name: 'Equipment & assistive tech', category: 'Kit', sortOrder: 11 }),
    ];
    renderPage();
    expect(screen.getByRole('heading', { name: 'Body' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Kit' })).toBeInTheDocument();
    // Life has no open room, so it is not a heading over nothing.
    expect(screen.queryByRole('heading', { name: 'Life' })).toBeNull();
    expect(screen.getByText('Bowel management')).toBeInTheDocument();
  });

  it('opens the room', () => {
    db.rooms = [room({ id: 'bowel' })];
    renderPage();
    expect(screen.getByRole('link', { name: /Bowel management/ })).toHaveAttribute(
      'href',
      '/chat/rooms/bowel',
    );
    // The note that stood here while there was nothing behind the card.
    expect(screen.queryByText(/being built/)).toBeNull();
  });

  // Three zeros read as a room that failed rather than one that has not
  // started, and they would be the first thing a member saw on the day the
  // first room opened.
  it('says a room is empty in words rather than in zeros', () => {
    db.rooms = [room({ id: 'bowel' })];
    db.stats = new Map([['bowel', { topicCount: 0, postCount: 0, memberCount: 0 }]]);
    renderPage();
    expect(screen.getByText('Nothing has been asked here yet.')).toBeInTheDocument();
    expect(screen.queryByText(/0 topics/)).toBeNull();
  });

  it('counts what is in a room once there is something in it', () => {
    db.rooms = [room({ id: 'bowel' })];
    db.stats = new Map([['bowel', { topicCount: 1, postCount: 4, memberCount: 2 }]]);
    renderPage();
    expect(screen.getByText('1 topic · 4 posts · 2 members')).toBeInTheDocument();
  });

  it('marks the rooms the viewer is in', () => {
    db.rooms = [room({ id: 'bowel' })];
    db.joined = new Set(['bowel']);
    renderPage();
    const card = screen.getByRole('link', { name: /Bowel management/ });
    expect(within(card).getByText('Joined')).toBeInTheDocument();
  });

  // Only an administrator is ever given a closed room to draw — the select
  // policy withholds it from everybody else — and without the chip they would
  // have no way to tell which of the twelve a member can actually see.
  it('marks a closed room as one no member can see', () => {
    db.rooms = [room({ id: 'bowel', openedAt: null })];
    renderPage();
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.getByText('No member can see this room yet.')).toBeInTheDocument();
  });

  it('says nothing about closure on a room that is open', () => {
    db.rooms = [room({ id: 'bowel' })];
    renderPage();
    expect(screen.queryByText(/Closed/)).toBeNull();
  });

  it('shows the rooms without the conversations note under Rooms', async () => {
    db.rooms = [room({ id: 'bowel' })];
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Rooms' }));
    expect(screen.getByText('Bowel management')).toBeInTheDocument();
    expect(screen.queryByText(/are not built yet/)).toBeNull();
    expect(screen.queryByText(/No conversations yet/)).toBeNull();
  });

  it('shows the database’s own sentence when the read fails', async () => {
    db.error = 'relation "public.chat_rooms" does not exist';
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Could not load the rooms.')).toBeInTheDocument();
    });
    expect(screen.getByText('relation "public.chat_rooms" does not exist')).toBeInTheDocument();
  });
});
