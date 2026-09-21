import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Router from 'react-router-dom';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ChatRooms from '@/lib/chat/rooms';
import type { ChatRoom, RoomStats } from '@/lib/chat/types';

/**
 * Starting a room.
 *
 * `roomProblem`, `roomsMatching`, `roomNamed` and `roomToFill` are deliberately
 * left real — they are what the screen says and where its links go, and a stub
 * of any of them would let this file assert its own wording. Their own tests
 * are in src/lib/chat/rooms.test.ts. `useChatRooms`, `useRoomStats` and
 * `createRoom` are the network and are stubbed.
 */

const db = vi.hoisted(() => ({
  rooms: [] as ChatRoom[],
  stats: new Map<string, RoomStats>(),
  created: [] as [string, string, string, string, string][],
  failure: null as string | null,
  navigated: [] as string[],
}));

vi.mock('@/lib/account', () => ({
  useAccount: () => ({ status: 'member', userId: 'me', isAdmin: false, displayName: 'Alex' }),
}));

vi.mock('@/lib/chat/rooms', async (importOriginal) => ({
  ...(await importOriginal<typeof ChatRooms>()),
  useChatRooms: () => ({ rooms: db.rooms, loading: false, error: null, reload: () => undefined }),
  useRoomStats: () => ({ stats: db.stats, loading: false, reload: () => undefined }),
  createRoom: (
    name: string,
    description: string,
    category: string,
    title: string,
    body: string,
  ) => {
    db.created.push([name, description, category, title, body]);
    return Promise.resolve(
      db.failure ? { ok: false, error: db.failure } : { ok: true, value: 'shoulder-pain-1a2b' },
    );
  },
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof Router>()),
  useNavigate: () => (to: string) => {
    db.navigated.push(to);
  },
}));

const { default: NewRoomPage } = await import('@/routes/chat/new-room');

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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/chat/rooms/new']}>
      <NewRoomPage />
    </MemoryRouter>,
  );
}

async function fillIn(
  over: Partial<Record<'name' | 'description' | 'title' | 'body', string>> = {},
) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('What is the room for?'), over.name ?? 'Shoulder pain');
  await user.click(screen.getByRole('button', { name: 'Body' }));
  await user.type(
    screen.getByLabelText('What belongs in it?'),
    over.description ?? 'Overuse, transfers, and what helped.',
  );
  await user.type(screen.getByLabelText('What is it about?'), over.title ?? 'Twenty years');
  await user.type(screen.getByLabelText('The first post'), over.body ?? 'What did you change?');
  return user;
}

beforeEach(() => {
  db.rooms = [];
  db.stats = new Map();
  db.created = [];
  db.failure = null;
  db.navigated = [];
});

describe('starting a room', () => {
  // The whole answer to "a room of two dozen members is empty by
  // construction": the first topic is on this form and not on a later one.
  it('asks for the first topic, and says why', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'The first topic' })).toBeInTheDocument();
    expect(screen.getByText(/nobody arrives to an empty one/)).toBeInTheDocument();
  });

  it('will not submit until all five are filled, and says what is missing', async () => {
    renderPage();
    const submit = screen.getByRole('button', { name: 'Start the room' });
    expect(submit).toBeDisabled();
    expect(screen.getByText('Give the room a name.')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('What is the room for?'), 'Shoulder pain');
    // No category is picked to begin with — a default would be one of the
    // three quietly chosen for somebody, and nobody edits a room afterwards.
    expect(screen.getByText('Say which part of life the room is about.')).toBeInTheDocument();
    expect(submit).toBeDisabled();
  });

  it('sends the five fields and opens the new room', async () => {
    renderPage();
    const user = await fillIn();
    await user.click(screen.getByRole('button', { name: 'Start the room' }));
    await waitFor(() => {
      expect(db.created).toEqual([
        [
          'Shoulder pain',
          'Overuse, transfers, and what helped.',
          'Body',
          'Twenty years',
          'What did you change?',
        ],
      ]);
    });
    expect(db.navigated).toEqual(['/chat/rooms/shoulder-pain-1a2b']);
  });

  // The most likely outcome of a new-room impulse is a room that already
  // exists, and the twin is always the one that looks abandoned.
  it('offers the rooms whose names contain what is being typed', async () => {
    db.rooms = [room({ id: 'bowel' }), room({ id: 'bladder', name: 'Bladder & catheters' })];
    renderPage();
    await userEvent.type(screen.getByLabelText('What is the room for?'), 'bla');
    expect(screen.getByText('Is it one of these?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bladder & catheters' })).toHaveAttribute(
      'href',
      '/chat/rooms/bladder',
    );
  });

  it('keeps the draft on a refusal and links to the room that already has the name', async () => {
    db.rooms = [room({ id: 'bowel', name: 'Shoulder pain' })];
    db.failure = 'There is already a room called Shoulder pain.';
    renderPage();
    const user = await fillIn();
    await user.click(screen.getByRole('button', { name: 'Start the room' }));
    await waitFor(() => {
      expect(screen.getByText(/already a room called Shoulder pain/)).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Open Shoulder pain' })).toHaveAttribute(
      'href',
      '/chat/rooms/bowel',
    );
    // Nothing cleared, nothing navigated. What somebody has just typed is the
    // most expensive thing on the page.
    expect(screen.getByLabelText('The first post')).toHaveValue('What did you change?');
    expect(db.navigated).toEqual([]);
  });

  it('links to the empty room a member has been told to fill', async () => {
    db.rooms = [room({ id: 'mine-1a2b', name: 'Hand cycling', sortOrder: 1000, createdBy: 'me' })];
    db.stats = new Map([['mine-1a2b', { topicCount: 0, postCount: 0, memberCount: 1 }]]);
    db.failure = 'Fill your last room before starting another. Hand cycling has nothing in it yet.';
    renderPage();
    const user = await fillIn();
    await user.click(screen.getByRole('button', { name: 'Start the room' }));
    await waitFor(() => {
      expect(screen.getByText(/Fill your last room/)).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Open Hand cycling' })).toHaveAttribute(
      'href',
      '/chat/rooms/mine-1a2b',
    );
  });

  // The clash is with a room an administrator has closed: the member cannot
  // read it, and a link into nothing is worse than the sentence on its own.
  it('shows the refusal without a link where there is nowhere to send them', async () => {
    db.failure = 'There is already a room called Skin & pressure sores.';
    renderPage();
    const user = await fillIn();
    await user.click(screen.getByRole('button', { name: 'Start the room' }));
    await waitFor(() => {
      expect(screen.getByText(/already a room called Skin/)).toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: /^Open / })).toBeNull();
  });
});
