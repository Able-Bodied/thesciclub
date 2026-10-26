import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type * as Attachments from '@/lib/chat/attachments';
import type { SharedPost } from '@/lib/chat/shared-posts';

vi.mock('@/lib/chat/authors', () => ({
  useChatAuthors: () =>
    new Map([
      [
        'ada',
        {
          id: 'ada',
          displayName: 'Ada',
          username: null,
          photoPath: null,
          photoAlt: null,
          avatarColor: null,
          level: null,
          isAdmin: false,
          hasProfile: true,
        },
      ],
    ]),
}));
vi.mock('@/lib/chat/attachments', async (importOriginal) => ({
  ...(await importOriginal<typeof Attachments>()),
  useSmallCopies: (paths: readonly string[]) => {
    const found = new Map(paths.map((path) => [path, `https://signed/${path}`]));
    return { small: found, full: found };
  },
}));
vi.mock('@/components/member-avatar', () => ({
  MemberAvatar: () => null,
  FormerMemberAvatar: () => null,
}));

const { SharedPostCard } = await import('@/routes/chat/shared-post-card');

const post = (o: Partial<SharedPost> = {}): SharedPost => ({
  postId: 'p1',
  topicId: 't1',
  roomId: 'kit',
  roomName: 'Kit',
  topicTitle: 'Which cushion?',
  opening: true,
  authorId: 'ada',
  body: 'I use **air** cells, and they are fine.',
  photoPath: 'rooms/kit/a.jpg',
  createdAt: '2026-10-24T10:00:00Z',
  ...o,
});

function draw(shared: SharedPost | null | undefined) {
  return render(
    <MemoryRouter>
      <SharedPostCard post={shared} />
    </MemoryRouter>,
  );
}

describe('a shared post in a conversation', () => {
  it('is one link to the topic: room, author, title, words without marks, photograph', () => {
    const { container } = draw(post());
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/chat/rooms/kit/topics/t1');
    expect(link).toHaveTextContent(
      'Shared post: KitAdaWhich cushion?I use air cells, and they are fine.',
    );
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://signed/rooms/kit/a.jpg');
  });

  it('opens a reply on the reply itself, and says it is one', () => {
    draw(post({ opening: false, postId: 'p9', photoPath: null }));
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/chat/rooms/kit/topics/t1?post=p9');
    expect(link).toHaveTextContent('Ada, replying in');
  });

  it('says only that it is not available, and links nowhere', () => {
    const { container } = draw(null);
    expect(screen.getByText("This post isn't available.")).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container).not.toHaveTextContent('Ada');
  });

  it('says it is loading before the card is read', () => {
    draw(undefined);
    expect(screen.getByText('Shared post…')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
