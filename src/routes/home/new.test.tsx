import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Router from 'react-router-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ChatRooms from '@/lib/chat/rooms';
import type { ChatRoom } from '@/lib/chat/types';
import { makeRoom } from '@/test/factory';

/**
 * Asking or sharing from Home: the kind, and the room.
 *
 * `roomsByCategory` is left real, since the order of the list is what this
 * screen promises and a stub would let the test assert its own order. The
 * read is the network and is stubbed. There is no join to stub since
 * 20260930000000.
 */

const db = vi.hoisted(() => ({
  rooms: [] as ChatRoom[],
  roomsError: null as string | null,
  navigated: [] as [string, unknown][],
}));

vi.mock('@/lib/chat/rooms', async (importOriginal) => ({
  ...(await importOriginal<typeof ChatRooms>()),
  useChatRooms: () => ({
    rooms: db.rooms,
    loading: false,
    error: db.roomsError,
    reload: () => undefined,
  }),
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
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(['Body', 'Life', 'Kit']);
    expect(screen.queryByRole('radio', { name: /Skin/ })).toBeNull();
  });

  // h1, then h2, then the six h3s Chat uses for categories; never a jump.
  it('keeps the headings in order', () => {
    renderPage();
    expect(screen.getAllByRole('heading').map((h) => [h.tagName, h.textContent])).toEqual([
      ['H1', 'Ask the club'],
      ['H2', 'Which room does it go in?'],
      ['H3', 'Body'],
      ['H3', 'Life'],
      ['H3', 'Kit'],
    ]);
  });

  it('names each room and describes it, with no word about joining', () => {
    renderPage();
    const bowel = screen.getByRole('radio', { name: 'Bowel management' });
    expect(bowel).toHaveAccessibleDescription('The one nobody talks about anywhere else.');
    expect(screen.getByRole('radio', { name: 'Newly injured' })).toBeInTheDocument();
    expect(screen.queryByText('Joined')).toBeNull();
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
  // Since 20260930000000 nobody joins a room to write in it, so the button is
  // Continue for everybody and goes straight on.
  it('goes straight on, with the kind and the way back', async () => {
    const user = userEvent.setup();
    renderPage('?kind=share');
    await user.click(screen.getByRole('radio', { name: /Bowel management/ }));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Join/ })).toBeNull();
    expect(screen.queryByText(/Joining is what lets you write/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(db.navigated).toEqual([
      ['/chat/rooms/bowel/new', { from: 'home', segment: 'topics', kind: 'share' }],
    ]);
  });

  it('says nothing under the button once a room is chosen', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByText('Choose a room.')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Newly injured' }));
    expect(screen.queryByText('Choose a room.')).toBeNull();
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
