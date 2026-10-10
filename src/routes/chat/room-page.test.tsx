import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ChatRooms from '@/lib/chat/rooms';
import type * as Topics from '@/lib/chat/topics';
import type { ChatRoom, ChatTopic, RoomStats } from '@/lib/chat/types';
import RoomPage from '@/routes/chat/room-page';

/**
 * The reads are stubbed; `sortTopics` deliberately is not, so the order on
 * screen is the real function's and this file cannot assert its own
 * arithmetic. Its own tests are in src/lib/chat/topics.test.ts.
 */

const db = vi.hoisted(() => ({
  rooms: [] as ChatRoom[],
  topics: [] as ChatTopic[],
  stats: new Map<string, RoomStats>(),
  isAdmin: false,
}));

// Mutes read and write the club; the button has its own test.
vi.mock('@/lib/chat/mutes', () => ({
  useMute: () => ({ muted: null, busy: false, error: null, toggle: () => undefined }),
}));

vi.mock('@/lib/account', () => ({
  useAccount: () => ({
    status: 'member',
    userId: 'me',
    isAdmin: db.isAdmin,
    displayName: 'Alex',
  }),
}));

// Stubbed, and it has to be: `.env.local` points at the hosted project, so an
// unmocked subscription in a test opens a websocket to production. What the
// hook does is its own concern — the screen's job here is to hand it a refetch.
vi.mock('@/lib/chat/realtime', () => ({
  useRealtimeRows: () => undefined,
}));

vi.mock('@/lib/chat/rooms', async (importOriginal) => ({
  ...(await importOriginal<typeof ChatRooms>()),
  useChatRooms: () => ({ rooms: db.rooms, loading: false, error: null, reload: () => undefined }),
  useRoomStats: () => ({ stats: db.stats, loading: false, reload: () => undefined }),
}));

vi.mock('@/lib/chat/topics', async (importOriginal) => ({
  ...(await importOriginal<typeof Topics>()),
  useRoomTopics: () => ({
    topics: db.topics,
    loading: false,
    error: null,
    reload: () => undefined,
  }),
}));

vi.mock('@/lib/chat/authors', () => ({
  useChatAuthors: () => new Map(),
}));

const room = (o: Partial<ChatRoom> = {}): ChatRoom => ({
  id: 'bowel',
  name: 'Bowel management',
  description: 'The one nobody talks about anywhere else.',
  category: 'Body',
  icon: '◍',
  sortOrder: 1,
  openedAt: '2026-09-01T10:00:00Z',
  createdBy: null,
  ...o,
});

const topic = (o: Partial<ChatTopic> & { id: string; title: string }): ChatTopic => ({
  roomId: 'bowel',
  authorId: 'a',
  createdAt: '2026-09-01T10:00:00Z',
  lastPostAt: '2026-09-01T10:00:00Z',
  replyCount: 0,
  viewCount: 0,
  unread: false,
  participantIds: [],
  ...o,
});

function renderRoom() {
  return render(
    <MemoryRouter initialEntries={['/chat/rooms/bowel']}>
      <Routes>
        <Route path="/chat/rooms/:roomId" element={<RoomPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  db.rooms = [room()];
  db.topics = [];
  db.stats = new Map();
  db.isAdmin = false;
});

describe('a discussion room', () => {
  // The sentence /chat prints; and since 20260930000000 writing is as open
  // as reading, so there is no Join and the way to write is there at once.
  it('shows the whole history and the way to write, with no Join', () => {
    db.topics = [topic({ id: '1', title: 'Travelling with a bowel programme' })];
    renderRoom();
    expect(screen.getByText('Travelling with a bowel programme')).toBeInTheDocument();
    // At the top, typed into where it is.
    const ask = screen.getByRole('textbox', { name: 'Ask or post in Bowel management' });
    expect(
      ask.compareDocumentPosition(screen.getByText('Travelling with a bowel programme')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Join/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Leave' })).toBeNull();
    expect(screen.queryByText(/You are in this room/)).toBeNull();
  });

  // A count of zero is not drawn on a topic row.
  it('draws a topic row’s counts, leaving out a zero', () => {
    db.topics = [
      topic({ id: 'a', title: 'Answered', replyCount: 2, viewCount: 0 }),
      topic({ id: 'b', title: 'Unread', replyCount: 0, viewCount: 0 }),
    ];
    renderRoom();
    const answered = screen.getByRole('link', { name: /Answered/ });
    expect(answered).toHaveTextContent(/2\s*replies/);
    expect(answered).not.toHaveTextContent(/views?/);
    const unread = screen.getByRole('link', { name: /Unread/ });
    expect(unread).not.toHaveTextContent(/repl|views?/);
  });

  it('sorts by replies and by views when asked', async () => {
    db.topics = [
      topic({ id: 'a', title: 'Older', replyCount: 9, viewCount: 1, lastPostAt: '2026-09-01' }),
      topic({ id: 'b', title: 'Newer', replyCount: 1, viewCount: 9, lastPostAt: '2026-09-09' }),
    ];
    renderRoom();
    // The topic rows only — the back link is a link too.
    const titles = () =>
      screen
        .getAllByRole('link')
        .filter((l) => l.getAttribute('href')?.includes('/topics/'))
        .map((l) => l.textContent);
    expect(titles()[0]).toContain('Newer');
    await userEvent.click(screen.getByRole('button', { name: 'Replies' }));
    expect(titles()[0]).toContain('Older');
    await userEvent.click(screen.getByRole('button', { name: 'Views' }));
    expect(titles()[0]).toContain('Newer');
  });

  // Three zeros read as a room that failed rather than one that has not
  // started — and "open to all" is not true of a room that is shut.
  it('counts nothing until there is something to count', () => {
    db.stats = new Map([['bowel', { topicCount: 0, postCount: 0 }]]);
    renderRoom();
    expect(screen.queryByText(/0 topics/)).toBeNull();
    expect(screen.queryByText(/open to all/)).toBeNull();
  });

  // Topics and posts, and no member count: nobody joins a room any more.
  it('counts once there is', () => {
    db.stats = new Map([['bowel', { topicCount: 2, postCount: 7 }]]);
    renderRoom();
    expect(screen.getByText(/2 topics · 7 posts · open to all, full history/)).toBeInTheDocument();
    expect(screen.queryByText(/members/)).toBeNull();
  });

  // The select policy hides a closed room from a member, so anybody who can
  // see one is an administrator — and has to be told nobody else can.
  it('tells an administrator that nobody can see a closed room', () => {
    db.rooms = [room({ openedAt: null })];
    db.isAdmin = true;
    renderRoom();
    expect(screen.getByText(/This room is closed. No member can see it yet/)).toBeInTheDocument();
    // They can seed it before it opens.
    expect(screen.getByRole('textbox', { name: /Ask or post in/ })).toBeInTheDocument();
    expect(screen.queryByText(/open to all/)).toBeNull();
  });

  it('invites the first topic rather than pretending there is activity', () => {
    renderRoom();
    expect(screen.getByText(/Nothing has been asked here yet/)).toBeInTheDocument();
    expect(screen.getByText(/Start the first topic/)).toBeInTheDocument();
  });

  it('says so when the room is not one the viewer can reach', () => {
    db.rooms = [];
    renderRoom();
    expect(screen.getByText(/There is no such room, or it is not open yet/)).toBeInTheDocument();
  });

  it('labels the sort row as a sort, for sight and for screen readers', () => {
    renderRoom();
    const group = screen.getByRole('group', { name: 'Sort by' });
    expect(within(group).getByRole('button', { name: 'Activity' })).toBeInTheDocument();
  });
});
