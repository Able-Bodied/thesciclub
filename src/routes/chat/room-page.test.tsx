import { render, screen } from '@testing-library/react';
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
  joined: new Set<string>(),
  stats: new Map<string, RoomStats>(),
  isAdmin: false,
  joins: [] as string[],
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
  useRoomMembership: () => ({
    joined: db.joined,
    loading: false,
    error: null,
    toggle: (id: string) => {
      db.joins.push(id);
    },
  }),
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
  db.joined = new Set();
  db.stats = new Map();
  db.isAdmin = false;
  db.joins = [];
});

describe('a discussion room', () => {
  // The sentence /chat prints, and the one thing membership must not gate.
  it('shows the whole history to somebody who has not joined', () => {
    db.topics = [topic({ id: '1', title: 'Travelling with a bowel programme' })];
    renderRoom();
    expect(screen.getByText('Travelling with a bowel programme')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join Bowel management' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '+ New topic' })).toBeNull();
  });

  it('offers the way to write once they have joined', async () => {
    db.joined = new Set(['bowel']);
    renderRoom();
    expect(screen.getByRole('link', { name: '+ New topic' })).toHaveAttribute(
      'href',
      '/chat/rooms/bowel/new',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(db.joins).toEqual(['bowel']);
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
    db.stats = new Map([['bowel', { topicCount: 0, postCount: 0, memberCount: 0 }]]);
    renderRoom();
    expect(screen.queryByText(/0 topics/)).toBeNull();
    expect(screen.queryByText(/open to all/)).toBeNull();
  });

  it('counts once there is', () => {
    db.stats = new Map([['bowel', { topicCount: 2, postCount: 7, memberCount: 3 }]]);
    renderRoom();
    expect(
      screen.getByText(/2 topics · 3 members · open to all, full history/),
    ).toBeInTheDocument();
  });

  // The select policy hides a closed room from a member, so anybody who can
  // see one is an administrator — and has to be told nobody else can.
  it('tells an administrator that nobody can see a closed room', () => {
    db.rooms = [room({ openedAt: null })];
    db.isAdmin = true;
    renderRoom();
    expect(screen.getByText(/This room is closed. No member can see it yet/)).toBeInTheDocument();
    // They can seed it without joining: joining a closed room is refused.
    expect(screen.getByRole('link', { name: '+ New topic' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Join/ })).toBeNull();
    expect(screen.queryByText(/open to all/)).toBeNull();
  });

  it('invites the first topic rather than pretending there is activity', () => {
    db.joined = new Set(['bowel']);
    renderRoom();
    expect(screen.getByText(/Nothing has been asked here yet/)).toBeInTheDocument();
    expect(screen.getByText(/Start the first topic/)).toBeInTheDocument();
  });

  it('tells somebody who has not joined how to start one', () => {
    renderRoom();
    expect(screen.getByText(/Join the room to start the first one/)).toBeInTheDocument();
  });

  it('says so when the room is not one the viewer can reach', () => {
    db.rooms = [];
    renderRoom();
    expect(screen.getByText(/There is no such room, or it is not open yet/)).toBeInTheDocument();
  });
});
