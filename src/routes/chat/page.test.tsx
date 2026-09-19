import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ChatRooms from '@/lib/chat/rooms';
import type { ChatRoom, RoomStats } from '@/lib/chat/types';
import ChatPage from '@/routes/chat/page';

/**
 * What this screen must not do is as important as what it does: it must not
 * show an empty conversation list that reads as "you have no messages" when
 * the truth is that messages are not built, and it must not report an empty
 * room as three zeros.
 *
 * The hooks that read the database are stubbed and `roomsByCategory`
 * deliberately is not — the grouping and ordering on screen is the real
 * function's, so this file cannot assert its own arithmetic. Its own tests are
 * in src/lib/chat/rooms.test.ts.
 */

const db = vi.hoisted(() => ({
  rooms: [] as ChatRoom[],
  loading: false,
  error: null as string | null,
  stats: new Map<string, RoomStats>(),
  joined: new Set<string>(),
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
});

describe('the chat screen', () => {
  // The mock's header has a search box. Search is not in this build, and a
  // field that takes words and does nothing with them is the one control
  // somebody will try first.
  it('offers no search box', () => {
    renderPage();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('says direct messages and groups are not built, rather than showing them empty', () => {
    renderPage();
    expect(screen.getByText(/Direct messages and groups are not built yet/)).toBeInTheDocument();
  });

  it('names only the one that is missing when a segment is chosen', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Direct' }));
    expect(screen.getByText('Direct messages are not built yet.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Groups' }));
    expect(screen.getByText('Groups are not built yet.')).toBeInTheDocument();
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
