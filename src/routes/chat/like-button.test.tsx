import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatAuthor } from '@/lib/chat/types';
import { LikeButton, PostLikes } from '@/routes/chat/like-button';

// Names are a read of chat_authors; `.env.local` points at the hosted
// project, so an unstubbed hook here would read production.
const db = vi.hoisted(() => ({ authors: new Map<string, ChatAuthor>() }));
vi.mock('@/lib/chat/authors', () => ({
  useChatAuthors: () => db.authors,
}));

const author = (o: Partial<ChatAuthor> & { id: string }): ChatAuthor => ({
  displayName: 'Jan',
  photoPath: null,
  photoAlt: null,
  avatarColor: null,
  level: 'T10',
  isAdmin: false,
  hasProfile: true,
  ...o,
});

beforeEach(() => {
  db.authors = new Map([
    ['jan', author({ id: 'jan', displayName: 'Jan' })],
    ['sam', author({ id: 'sam', displayName: 'Sam', level: null, hasProfile: false })],
  ]);
});

function renderLikes(props: Partial<Parameters<typeof PostLikes>[0]> = {}) {
  const onToggle = vi.fn();
  render(
    <MemoryRouter>
      <p>
        <button type="button">Before</button>
      </p>
      <PostLikes
        likedBy={['jan', 'sam']}
        readerId="me"
        what="Nicole's post"
        onToggle={onToggle}
        {...props}
      />
    </MemoryRouter>,
  );
  return onToggle;
}

describe('LikeButton', () => {
  it('shows the state and names the action and the post', () => {
    render(<LikeButton liked={false} what="Jan's post" onToggle={() => undefined} />);
    const button = screen.getByRole('button', { name: "Like Jan's post" });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveTextContent('Like');
  });

  it('once liked, says so and says how to take it back', () => {
    render(<LikeButton liked what="Jan's post" onToggle={() => undefined} />);
    const button = screen.getByRole('button', {
      name: "Liked Jan's post. Press to take it back.",
    });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveTextContent('Liked');
  });
});

describe('PostLikes', () => {
  it('likes on a press', async () => {
    const onToggle = renderLikes();
    await userEvent.click(screen.getByRole('button', { name: "Like Nicole's post" }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('draws no count when nobody likes it', () => {
    renderLikes({ likedBy: [] });
    expect(screen.getByRole('button', { name: "Like Nicole's post" })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /likes? on/ })).toBeNull();
  });

  it('counts the reader’s own like, and draws the button pressed', () => {
    renderLikes({ likedBy: ['jan', 'me'] });
    expect(
      screen.getByRole('button', { name: "2 likes on Nicole's post. Show who." }),
    ).toHaveTextContent('2 likes');
    expect(
      screen.getByRole('button', { name: "Liked Nicole's post. Press to take it back." }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('says one like', () => {
    renderLikes({ likedBy: ['jan'] });
    expect(
      screen.getByRole('button', { name: "1 like on Nicole's post. Show who." }),
    ).toBeVisible();
  });

  // Nobody likes their own words; who liked them is still worth seeing.
  it('draws no button on the reader’s own post, and still draws the count', () => {
    renderLikes({ readerId: null, what: 'your post' });
    expect(screen.queryByRole('button', { name: /^Like/ })).toBeNull();
    expect(screen.getByRole('button', { name: '2 likes on your post. Show who.' })).toBeVisible();
  });

  describe('the list of who', () => {
    async function open() {
      renderLikes();
      await userEvent.click(screen.getByRole('button', { name: /2 likes on/ }));
      return screen.getByRole('dialog', { name: 'Who liked this' });
    }

    it('is a dialog that says who can see it, with focus on its title', async () => {
      const dialog = await open();
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveTextContent('Every member can see this list.');
      expect(screen.getByRole('heading', { name: 'Who liked this' })).toHaveFocus();
    });

    it('names everybody, linking those with a profile', async () => {
      await open();
      expect(screen.getByRole('link', { name: 'Jan' })).toHaveAttribute('href', '/peers/jan');
      expect(screen.getByText('Sam')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Sam' })).toBeNull();
    });

    it('closes with Escape and puts focus back on the count', async () => {
      await open();
      await userEvent.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByRole('button', { name: /2 likes on/ })).toHaveFocus();
    });

    it('closes with Close and with the backdrop', async () => {
      await open();
      await userEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      await userEvent.click(screen.getByRole('button', { name: /2 likes on/ }));
      await userEvent.click(screen.getByRole('button', { name: 'Close the list' }));
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('keeps Tab inside it', async () => {
      await open();
      await userEvent.tab();
      expect(screen.getByRole('link', { name: 'Jan' })).toHaveFocus();
      await userEvent.tab();
      expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
      await userEvent.tab();
      expect(screen.getByRole('link', { name: 'Jan' })).toHaveFocus();
      await userEvent.tab({ shift: true });
      expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    });
  });
});
