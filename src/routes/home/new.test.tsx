import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Router from 'react-router-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ChatRooms from '@/lib/chat/rooms';
import type { ChatRoom } from '@/lib/chat/types';
import { makeRoom } from '@/test/factory';

/**
 * Asking or sharing from Home: the kind, the room, and the join on the way.
 *
 * `roomsByCategory` is left real, since the order of the list is what this
 * screen promises and a stub would let the test assert its own order. The
 * reads, the join and the account are the network and are stubbed.
 */

const db = vi.hoisted(() => ({
  rooms: [] as ChatRoom[],
  roomsError: null as string | null,
  joined: new Set<string>(),
  isAdmin: false,
  joins: [] as [string, string][],
  joinFailure: null as string | null,
  navigated: [] as [string, unknown][],
}));

vi.mock('@/lib/account', () => ({
  useAccount: () => ({
    status: 'member',
    userId: 'me',
    isAdmin: db.isAdmin,
    displayName: 'Alex',
  }),
}));

vi.mock('@/lib/chat/rooms', async (importOriginal) => ({
  ...(await importOriginal<typeof ChatRooms>()),
  useChatRooms: () => ({
    rooms: db.rooms,
    loading: false,
    error: db.roomsError,
    reload: () => undefined,
  }),
  useRoomMembership: () => ({
    joined: db.joined,
    loading: false,
    error: null,
    toggle: () => undefined,
  }),
  joinRoom: (roomId: string, memberId: string) => {
    db.joins.push([roomId, memberId]);
    return Promise.resolve(
      db.joinFailure ? { ok: false, error: db.joinFailure } : { ok: true, value: null },
    );
  },
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof Router>()),
  useNavigate: () => (to: string, options?: { state?: unknown }) => {
    db.navigated.push([to, options?.state]);
  },
}));

const { default: HomeNewPage } = await import('@/routes/home/new');

const rooms = () => [
  makeRoom({ id: 'equip', name: 'Equipment & assistive tech', category: 'Kit', sortOrder: 11 }),
  makeRoom({ id: 'bowel', name: 'Bowel management', category: 'Body', sortOrder: 1 }),
  makeRoom({ id: 'newsci', name: 'Newly injured', category: 'Life', sortOrder: 6 }),
  // Closed: an administrator reads it, and nobody can ask in it.
  makeRoom({ id: 'skin', name: 'Skin & pressure sores', category: 'Body', openedAt: null }),
];

beforeEach(() => {
  db.rooms = rooms();
  db.roomsError = null;
  db.joined = new Set();
  db.isAdmin = false;
  db.joins = [];
  db.joinFailure = null;
  db.navigated = [];
});

function renderPage(search = '', state: unknown = { from: 'home', segment: 'topics' }) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/home/new', search, state }]}>
      <Routes>
        <Route path="/home/new" element={<HomeNewPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const group = () => screen.getByRole('group', { name: 'Which room does it go in?' });

describe('the kind', () => {
  it('asks by default, and the heading follows the pill', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Ask the club' })).toBeInTheDocument();
    expect(screen.getByText(/Answers come from people who have lived it/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Share something' }));
    expect(
      screen.getByRole('heading', { level: 1, name: 'Share a photograph' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share something' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('opens on sharing from the URL', () => {
    renderPage('?kind=share');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Share a photograph' }),
    ).toBeInTheDocument();
  });

  it('goes back to the pill on Home it came from', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      '/home?segment=topics',
    );
  });
});

describe('the rooms', () => {
  it('lists the open rooms only, under their headings in order, with none chosen', () => {
    renderPage();
    const radios = within(group()).getAllByRole('radio');
    expect(radios.map((radio) => radio.getAttribute('value'))).toEqual([
      'bowel',
      'newsci',
      'equip',
    ]);
    for (const radio of radios) expect(radio).not.toBeChecked();
    expect(
      within(group())
        .getAllByRole('heading')
        .map((heading) => heading.textContent),
    ).toEqual(['Body', 'Life', 'Kit']);
    expect(screen.queryByRole('radio', { name: /Skin/ })).toBeNull();
  });

  it('names each room, says Joined where it is, and describes it', () => {
    db.joined = new Set(['bowel']);
    renderPage();
    const bowel = screen.getByRole('radio', { name: 'Bowel management Joined' });
    expect(bowel).toHaveAccessibleDescription('The one nobody talks about anywhere else.');
    expect(screen.getByRole('radio', { name: 'Newly injured' })).toBeInTheDocument();
  });

  it('waits for a room and says so', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.getByText('Choose a room.')).toBeInTheDocument();
  });

  it('always offers to start a room', () => {
    renderPage();
    expect(screen.getByText(/None of these fit\?/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start a room' })).toHaveAttribute(
      'href',
      '/chat/rooms/new',
    );
  });
});

describe('continuing', () => {
  it('goes straight on for a room already joined, with the kind and the way back', async () => {
    db.joined = new Set(['bowel']);
    const user = userEvent.setup();
    renderPage('?kind=share');
    await user.click(screen.getByRole('radio', { name: /Bowel management/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(db.joins).toEqual([]);
    expect(db.navigated).toEqual([
      ['/chat/rooms/bowel/new', { from: 'home', segment: 'topics', kind: 'share' }],
    ]);
  });

  it('offers to join a room not yet joined, and says what joining means', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('radio', { name: 'Bowel management' }));
    expect(
      screen.getByRole('button', { name: 'Join Bowel management and continue' }),
    ).toBeEnabled();
    expect(
      screen.getByText('Joining is what lets you write in a room. You can leave at any time.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Newly injured' }));
    expect(screen.getByRole('button', { name: 'Join Newly injured and continue' })).toBeEnabled();
  });

  it('joins, waits for it, then goes on', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('radio', { name: 'Bowel management' }));
    await user.click(screen.getByRole('button', { name: 'Join Bowel management and continue' }));
    await waitFor(() => {
      expect(db.navigated).toEqual([
        ['/chat/rooms/bowel/new', { from: 'home', segment: 'topics', kind: 'ask' }],
      ]);
    });
    expect(db.joins).toEqual([['bowel', 'me']]);
  });

  it('shows a failed join in its sentence and does not go on', async () => {
    db.joinFailure = 'You did not join the room. You cannot do that here.';
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('radio', { name: 'Bowel management' }));
    await user.click(screen.getByRole('button', { name: 'Join Bowel management and continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You did not join the room. You cannot do that here.',
    );
    expect(db.navigated).toEqual([]);
    // Still there to try again.
    expect(screen.getByRole('radio', { name: 'Bowel management' })).toBeChecked();
  });

  // An administrator can write in any room without a membership row.
  it('never asks an administrator to join', async () => {
    db.isAdmin = true;
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('radio', { name: 'Bowel management' }));
    expect(screen.queryByRole('button', { name: /Join/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(db.joins).toEqual([]);
    expect(db.navigated).toEqual([
      ['/chat/rooms/bowel/new', { from: 'home', segment: 'topics', kind: 'ask' }],
    ]);
  });

  it('offers an administrator the open rooms only', () => {
    db.isAdmin = true;
    renderPage();
    expect(screen.queryByRole('radio', { name: /Skin/ })).toBeNull();
  });
});

describe('when no room is open', () => {
  it('says so and links to starting one, with no list and no button', () => {
    db.rooms = rooms().map((room) => ({ ...room, openedAt: null }));
    renderPage();
    expect(
      screen.getByText('No rooms are open yet. Start one — it begins with your first topic.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start a room' })).toHaveAttribute(
      'href',
      '/chat/rooms/new',
    );
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button', { name: /Continue/ })).toBeNull();
  });
});

describe('when the rooms cannot be read', () => {
  it('says why, and still offers to start a room', () => {
    db.roomsError = 'Could not load the rooms.';
    renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the rooms.');
    expect(screen.queryByRole('button', { name: /Continue/ })).toBeNull();
  });
});
