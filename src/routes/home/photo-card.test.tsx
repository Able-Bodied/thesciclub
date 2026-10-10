import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Attachments from '@/lib/chat/attachments';
import type { ChatAuthor } from '@/lib/chat/types';
import { PhotoCard } from '@/routes/home/photo-card';
import { makeHomeTopic, makePost } from '@/test/factory';

// Signing is a storage call under the reader's token; stubbed, as the grid's
// own test does.
const urls = vi.hoisted(() => new Map<string, string>());
vi.mock('@/lib/chat/attachments', async (importOriginal) => ({
  ...(await importOriginal<typeof Attachments>()),
  useAttachmentUrls: (paths: readonly string[]) =>
    new Map([...urls].filter(([path]) => paths.includes(path))),
}));

beforeEach(() => {
  urls.clear();
  urls.set('rooms/equip/a.webp', 'https://signed/a');
  urls.set('rooms/equip/b.webp', 'https://signed/b');
});

const jan: ChatAuthor = {
  id: 'jan',
  displayName: 'Jan',
  photoPath: null,
  photoAlt: null,
  avatarColor: null,
  level: 'T10',
  isAdmin: false,
  hasProfile: true,
};

const photoTopic = (o: Parameters<typeof makeHomeTopic>[0] = {}) =>
  makeHomeTopic({
    id: 't1',
    roomId: 'equip',
    title: 'First trip out with the new cushion',
    photo: true,
    opening: makePost({
      body: 'Four hours sitting and no marks. https://example.org/cushion',
      attachments: ['rooms/equip/a.webp', 'rooms/equip/b.webp'],
    }),
    ...o,
  });

function renderCard(props: Partial<Parameters<typeof PhotoCard>[0]> = {}) {
  return render(
    <MemoryRouter>
      <PhotoCard topic={photoTopic()} author={jan} linkState={{ from: 'home' }} {...props} />
    </MemoryRouter>,
  );
}

describe('a photograph on Home', () => {
  it('draws the photographs with Chat’s own grid', () => {
    renderCard();
    expect(
      screen.getByRole('button', { name: 'Photograph 1 of 2 from Jan. Open it.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Photograph 2 of 2 from Jan. Open it.' }),
    ).toBeInTheDocument();
  });

  // Chat's default sizes one photograph for a bubble, which left half the
  // card empty. The card asks the grid to fill it.
  it('draws a single photograph the full width of the card', () => {
    renderCard({
      topic: photoTopic({ opening: makePost({ attachments: ['rooms/equip/a.webp'] }) }),
    });
    const tile = screen.getByRole('button', { name: 'Photograph 1 of 1 from Jan. Open it.' });
    expect(tile.className).toContain('w-full');
    expect(tile.className).toContain('aspect-[400/260]');
  });

  it('draws no likes until it is handed them', () => {
    renderCard();
    expect(screen.queryByRole('button', { name: /^Like/ })).toBeNull();
  });

  it('likes the opening post, named for the topic', async () => {
    const onToggle = vi.fn();
    renderCard({ likes: { likedBy: ['jan'], readerId: 'me', onToggle, failure: null } });
    expect(
      screen.getByRole('button', {
        name: '1 like on First trip out with the new cushion. Show who.',
      }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Like First trip out with the new cushion' }),
    );
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('draws Like and the count on the reader’s own photograph', () => {
    renderCard({ likes: { likedBy: ['jan'], readerId: 'me', onToggle: vi.fn(), failure: null } });
    expect(screen.getByRole('button', { name: /^Like/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /^1 like on/ })).toBeInTheDocument();
  });

  it('says so when a like did not land', () => {
    renderCard({
      likes: {
        likedBy: [],
        readerId: 'me',
        onToggle: vi.fn(),
        failure: 'Your like was not saved. You cannot like this.',
      },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Your like was not saved.');
  });

  it('draws no likes when the opening post was taken back', () => {
    renderCard({
      topic: photoTopic({ opening: null }),
      likes: { likedBy: ['jan'], readerId: 'me', onToggle: vi.fn(), failure: null },
    });
    expect(screen.queryByRole('button', { name: /like/i })).toBeNull();
  });

  // It holds buttons, so it cannot be one link.
  it('puts no button inside a link', () => {
    renderCard();
    for (const button of screen.getAllByRole('button')) expect(button.closest('a')).toBeNull();
  });

  it('links the name to the profile, the title and Reply to the topic', () => {
    renderCard({ topic: photoTopic({ replyCount: 2 }) });
    expect(screen.getByRole('link', { name: 'Jan' })).toHaveAttribute('href', '/peers/jan');
    const topic = '/chat/rooms/equip/topics/t1';
    expect(
      screen.getByRole('link', { name: 'First trip out with the new cushion' }),
    ).toHaveAttribute('href', topic);
    expect(
      screen.getByRole('link', { name: 'Reply to First trip out with the new cushion' }),
    ).toHaveAttribute('href', topic);
    expect(
      screen.getByRole('link', { name: '2 replies to First trip out with the new cushion' }),
    ).toHaveAttribute('href', topic);
  });

  it('draws no count when nobody has replied, and still offers Reply', () => {
    renderCard({ topic: photoTopic({ replyCount: 0 }) });
    expect(screen.queryByRole('link', { name: /repl(y|ies) to/i })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\b0 repl/);
  });

  it('makes the web address in the words a link', () => {
    renderCard();
    expect(screen.getByRole('link', { name: 'example.org/cushion' })).toHaveAttribute(
      'href',
      'https://example.org/cushion',
    );
  });

  it('names somebody without a profile and does not link them', () => {
    renderCard({ author: { ...jan, hasProfile: false } });
    expect(screen.getByText('Jan')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Jan' })).toBeNull();
  });

  it('says Deleted member for somebody who has left', () => {
    renderCard({ topic: photoTopic({ authorId: null }), author: null });
    expect(screen.getByText('Deleted member')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Photograph 1 of 2 from Deleted member. Open it.' }),
    ).toBeInTheDocument();
  });

  it('does not say where the poster lives', () => {
    renderCard();
    expect(document.body.textContent).toContain('T10');
    expect(document.body.textContent).not.toMatch(/San Jose|Oakland/);
  });
});

it('shows zero views on a new post and the real count after it has been read', () => {
  renderCard({ viewCount: 0 });
  expect(screen.getByText('0 views')).toBeVisible();
});
it('shows a positive view count', () => {
  renderCard({ viewCount: 3 });
  expect(screen.getByText('3 views')).toBeVisible();
});
