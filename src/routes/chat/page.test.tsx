import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ChatRooms from '@/lib/chat/rooms';
import type * as Threads from '@/lib/chat/threads';
import type { ChatAuthor, ChatRoom, ChatThread, RoomStats } from '@/lib/chat/types';
import ChatPage from '@/routes/chat/page';

/**
 * What this screen must not do is as important as what it does: it must not
 * report an empty room as three zeros, and it must not let "no conversations
 * yet" and "groups are not built" turn into the same blank space — a member
 * can do something about the first and nothing about the second.
 *
 * The hooks that read the database are stubbed and `roomsByCategory` and
 * `threadTitle` deliberately are not — the grouping on screen is the real
 * function's, so this file cannot assert its own arithmetic. Their own tests
 * are in src/lib/chat/rooms.test.ts and threads.test.ts.
 */

const db = vi.hoisted(() => ({
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
  ...o,
});

function renderPage() {
  return render(
    <MemoryRouter>
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
});

describe('the chat screen', () => {
  // The mock's header has a search box. Search is not in this build, and a
  // field that takes words and does nothing with them is the one control
  // somebody will try first.
  it('offers no search box', () => {
    renderPage();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  // Two different blanks, and only one of them is something the member can do
  // anything about. A member with no conversations is told where to start; a
  // member with no groups is told groups do not exist yet.
  it('points somebody with no conversations at a profile, and says groups are not built', () => {
    renderPage();
    expect(screen.getByText(/No conversations yet/)).toBeInTheDocument();
    expect(screen.getByText(/Message a member from their profile/)).toBeInTheDocument();
    expect(screen.getByText('Groups are not built yet.')).toBeInTheDocument();
  });

  it('does not offer the empty-conversations line under Groups', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Groups' }));
    expect(screen.getByText('Groups are not built yet.')).toBeInTheDocument();
    expect(screen.queryByText(/No conversations yet/)).toBeNull();
  });

  it('opens a conversation, named by the other member', () => {
    db.threads = [thread({ id: 'th1' })];
    renderPage();
    const row = screen.getByRole('link', { name: /Jan/ });
    expect(row).toHaveAttribute('href', '/chat/t/th1');
    expect(within(row).getByText(/Jan: The seat took three fittings/)).toBeInTheDocument();
  });

  it('says who wrote the last message, and "You" when it was the viewer', () => {
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

  it('keeps conversations out of the Rooms segment', async () => {
    db.threads = [thread({ id: 'th1' })];
    db.rooms = [room({ id: 'bowel' })];
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Rooms' }));
    expect(screen.queryByRole('link', { name: /Jan/ })).toBeNull();
  });

  // The rooms are all seeded closed, so this is the ordinary first sight of
  // the screen. It explains the policy rather than apologising for a lack of
  // content — the rooms are not missing, they have not been opened.
  it('explains that rooms open one at a time when none is open', () => {
    renderPage();
    expect(screen.getByText(/No rooms are open yet/)).toBeInTheDocument();
    expect(screen.getByText(/as there are members to fill them/)).toBeInTheDocument();
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
