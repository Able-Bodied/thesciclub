import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
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

  it('says Former member for somebody who has left, and not while a name is loading', () => {
    const { unmount } = renderCard({ topic: makeHomeTopic({ authorId: null }), starter: null });
    expect(screen.getByText(/^Former member · /)).toBeInTheDocument();
    unmount();
    renderCard({ topic: makeHomeTopic({ authorId: 'somebody' }), starter: null });
    expect(screen.queryByText(/Former member/)).toBeNull();
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
