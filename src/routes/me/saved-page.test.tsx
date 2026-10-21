import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Saves from '@/lib/chat/saves';
import type { SavedItem } from '@/lib/chat/saves';
import SavedPage from '@/routes/me/saved-page';

const db = vi.hoisted(() => ({
  items: [] as SavedItem[],
  removed: [] as SavedItem[],
  removeFails: null as string | null,
}));

vi.mock('@/lib/chat/saves', async (importOriginal) => ({
  ...(await importOriginal<typeof Saves>()),
  useSavedItems: () => ({
    items: db.items,
    loading: false,
    error: null,
    reload: () => undefined,
    remove: (item: SavedItem) => {
      db.removed.push(item);
      return Promise.resolve(db.removeFails);
    },
  }),
}));

vi.mock('@/lib/chat/rooms', () => ({
  useChatRooms: () => ({ rooms: [{ id: 'kit', name: 'Kit' }], loading: false, error: null }),
}));

vi.mock('@/lib/chat/authors', () => ({
  useChatAuthors: () => new Map([['jan', { id: 'jan', displayName: 'Jan' }]]),
}));

const topicSave: SavedItem = {
  topicId: 't',
  postId: null,
  savedAt: '2026-10-20T10:00:00Z',
  topic: { title: 'Cushions', roomId: 'kit' },
  post: null,
};
const postSave: SavedItem = {
  topicId: 't',
  postId: 'p',
  savedAt: '2026-10-20T09:00:00Z',
  topic: { title: 'Cushions', roomId: 'kit' },
  post: { body: '**Air** cells', authorId: 'jan', removed: false },
};

function renderPage() {
  render(
    <MemoryRouter>
      <SavedPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  db.items = [];
  db.removed = [];
  db.removeFails = null;
});

describe('Saved', () => {
  it('says what to do when nothing is saved', () => {
    renderPage();
    expect(screen.getByText(/Nothing saved yet/)).toBeInTheDocument();
  });

  it('links a topic to the topic, and a post to its place in it', () => {
    db.items = [topicSave, postSave];
    renderPage();
    expect(screen.getByRole('link', { name: 'Cushions' })).toHaveAttribute(
      'href',
      '/chat/rooms/kit/topics/t',
    );
    expect(screen.getByRole('link', { name: 'Jan in Cushions' })).toHaveAttribute(
      'href',
      '/chat/rooms/kit/topics/t?post=p',
    );
    expect(screen.getByText('Air cells')).toBeInTheDocument();
  });

  it('links nothing it can no longer show, and still lets it be removed', async () => {
    db.items = [{ ...postSave, post: { body: '', authorId: 'jan', removed: true } }];
    renderPage();
    expect(screen.queryByRole('link', { name: /Cushions/ })).toBeNull();
    expect(screen.getByText('This post was removed.')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove the post Cushions from Saved' }),
    );
    expect(db.removed).toHaveLength(1);
  });

  it('says why when removing one fails', async () => {
    db.items = [topicSave];
    db.removeFails = 'This is still saved.';
    renderPage();
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove the topic Cushions from Saved' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('This is still saved.');
  });
});
