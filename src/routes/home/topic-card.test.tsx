import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ChatAuthor } from '@/lib/chat/types';
import { TopicCard } from '@/routes/home/topic-card';
import { makeHomeTopic, makePost, makeRoom } from '@/test/factory';

const author = (o: Partial<ChatAuthor> & { id: string }): ChatAuthor => ({
  displayName: 'Jan',
  photoPath: null,
  photoAlt: null,
  avatarColor: null,
  level: 'T4',
  isAdmin: false,
  hasProfile: true,
  ...o,
});

function Where() {
  const location = useLocation();
  return (
    <p>
      at {location.pathname} with {JSON.stringify(location.state)}
    </p>
  );
}

function renderCard(props: Partial<Parameters<typeof TopicCard>[0]> = {}) {
  return render(
    <MemoryRouter initialEntries={['/home']}>
      <Routes>
        <Route
          path="/home"
          element={
            <TopicCard
              topic={makeHomeTopic({ id: 't1', title: 'Morning or evening routine?' })}
              starter={author({ id: 'a', displayName: 'Alex', level: 'C6' })}
              replier={null}
              linkState={{ from: 'home' }}
              {...props}
            />
          }
        />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('a topic on Home', () => {
  // The whole card is the target, but the link's name is the title alone:
  // not the room, the byline and the reply run together.
  it('is one link, named for its title, to the topic page from Home', async () => {
    const user = userEvent.setup();
    renderCard();
    const [link, ...others] = screen.getAllByRole('link');
    if (!link) throw new Error('the card should be a link');
    expect(others).toHaveLength(0);
    expect(link).toHaveAccessibleName('Morning or evening routine?');
    await user.click(link);
    expect(
      screen.getByText('at /chat/rooms/bowel/topics/t1 with {"from":"home"}'),
    ).toBeInTheDocument();
  });

  it('says which room it is in, and who asked', () => {
    renderCard({ topic: makeHomeTopic({ room: makeRoom({ name: 'Bowel management' }) }) });
    expect(screen.getByText('Bowel management')).toBeInTheDocument();
    expect(screen.getByText(/^Alex · C6 · /)).toBeInTheDocument();
  });

  it('says Deleted member for somebody who has left, and not while a name is loading', () => {
    const { unmount } = renderCard({ topic: makeHomeTopic({ authorId: null }), starter: null });
    expect(screen.getByText(/^Deleted member · /)).toBeInTheDocument();
    unmount();
    renderCard({ topic: makeHomeTopic({ authorId: 'somebody' }), starter: null });
    expect(screen.queryByText(/Deleted member/)).toBeNull();
    expect(screen.getByText(/^… · /)).toBeInTheDocument();
  });

  it('shows the first reply, with who wrote it', () => {
    renderCard({
      topic: makeHomeTopic({
        replyCount: 3,
        firstReply: makePost({ authorId: 'j', body: 'Evenings, after a year of mornings.' }),
      }),
      replier: author({ id: 'j', displayName: 'Jan', level: 'T4' }),
    });
    expect(screen.getByText('Jan · T4')).toBeInTheDocument();
    expect(screen.getByText('Evenings, after a year of mornings.')).toBeInTheDocument();
    expect(screen.getByText('3 replies')).toBeInTheDocument();
  });

  it('says a reply was a photograph when it had no words', () => {
    renderCard({
      topic: makeHomeTopic({
        replyCount: 1,
        firstReply: makePost({ body: '', attachments: ['rooms/bowel/a.webp'] }),
      }),
    });
    expect(screen.getByText('Replied with a photograph.')).toBeInTheDocument();
    expect(screen.getByText('1 reply')).toBeInTheDocument();
  });

  it('says there are no replies yet, and never draws a zero', () => {
    renderCard({ topic: makeHomeTopic({ replyCount: 0, firstReply: null }) });
    expect(screen.getByText('No replies yet.')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\b0 repl/);
  });
});

describe('likes on a topic card', () => {
  const likes = (o: Partial<NonNullable<Parameters<typeof TopicCard>[0]['likes']>> = {}) => ({
    likedBy: [] as string[],
    readerId: 'me',
    onToggle: vi.fn(),
    failure: null,
    ...o,
  });

  it('draws no likes until it is handed them', () => {
    renderCard();
    expect(screen.queryByRole('button')).toBeNull();
  });

  // The card is a stretched link. In a browser the button is lifted above the
  // link's pseudo-element; here there is no layout, so what this can hold is
  // that the button is not inside the link and that pressing it goes nowhere.
  it('likes the opening post, named for the topic, without opening it', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderCard({ likes: likes({ likedBy: ['jan'], onToggle }) });
    const like = screen.getByRole('button', { name: 'Like Morning or evening routine?' });
    expect(like.closest('a')).toBeNull();
    expect(
      screen.getByRole('button', { name: '1 like on Morning or evening routine?. Show who.' }),
    ).toBeInTheDocument();
    await user.click(like);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/^at \//)).toBeNull();
  });

  it('says it is liked when the reader has', () => {
    renderCard({ likes: likes({ likedBy: ['me'] }) });
    expect(
      screen.getByRole('button', {
        name: 'Liked Morning or evening routine?. Press to take it back.',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('is reached by Tab after the title, and before the count', async () => {
    const user = userEvent.setup();
    renderCard({ likes: likes({ likedBy: ['jan'] }) });
    await user.tab();
    expect(screen.getByRole('link', { name: 'Morning or evening routine?' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Like Morning or evening routine?' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /^1 like on/ })).toHaveFocus();
  });

  it('draws the count and no Like on the reader’s own topic', () => {
    renderCard({ likes: likes({ likedBy: ['jan'], readerId: null }) });
    expect(screen.queryByRole('button', { name: /^Like/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^1 like on/ })).toBeInTheDocument();
  });

  it('draws no count of zero', () => {
    renderCard({ likes: likes() });
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(document.body.textContent).not.toMatch(/\b0 like/);
  });

  it('says so when a like did not land', () => {
    renderCard({ likes: likes({ failure: 'Your like was not saved. You cannot like this.' }) });
    expect(screen.getByRole('alert')).toHaveTextContent('Your like was not saved.');
  });

  it('draws no likes when the opening post was taken back', () => {
    renderCard({
      topic: makeHomeTopic({ id: 't1', title: 'Morning or evening routine?', opening: null }),
      likes: likes({ likedBy: ['jan'] }),
    });
    expect(screen.queryByRole('button')).toBeNull();
  });
});
