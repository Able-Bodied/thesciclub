import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ChatRooms from '@/lib/chat/rooms';
import type { ChatRoom } from '@/lib/chat/types';
import ChatPage from '@/routes/chat/page';

/**
 * What this screen must not do is as important as what it does: it must not
 * show an empty conversation list that reads as "you have no messages" when
 * the truth is that messages are not built, and it must not show a room card
 * that looks tappable before there is a room to open.
 *
 * `useChatRooms` is stubbed and `roomsByCategory` deliberately is not — the
 * grouping and ordering on screen is the real function's, so this file cannot
 * assert its own arithmetic. Its own tests are in src/lib/chat/rooms.test.ts.
 */

const db = vi.hoisted(() => ({
  rooms: [] as ChatRoom[],
  loading: false,
  error: null as string | null,
}));

vi.mock('@/lib/chat/rooms', async (importOriginal) => ({
  ...(await importOriginal<typeof ChatRooms>()),
  useChatRooms: () => ({
    rooms: db.rooms,
    loading: db.loading,
    error: db.error,
    reload: () => undefined,
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

  // Topics and posts are the next thing built. A card that looks like it opens
  // something and does not is the failure CONTEXT.md keeps Home a placeholder
  // to avoid, so the card is not a control and the screen says why.
  it('does not pretend a room can be opened yet', () => {
    db.rooms = [room({ id: 'bowel' })];
    renderPage();
    const card = screen.getByText('Bowel management').closest('article');
    if (!card) throw new Error('the room is not drawn as a card');
    expect(within(card).queryByRole('button')).toBeNull();
    expect(within(card).queryByRole('link')).toBeNull();
    expect(screen.getByText(/Reading and writing topics is being built/)).toBeInTheDocument();
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
