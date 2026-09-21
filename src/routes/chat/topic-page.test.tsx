import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Reports from '@/lib/chat/reports';
import type * as ChatRooms from '@/lib/chat/rooms';
import type * as Topics from '@/lib/chat/topics';
import type { ChatAuthor, ChatPost, ChatRoom, ChatTopic } from '@/lib/chat/types';
import TopicPage from '@/routes/chat/topic-page';

const db = vi.hoisted(() => ({
  rooms: [] as ChatRoom[],
  topic: null as ChatTopic | null,
  posts: [] as ChatPost[],
  authors: new Map<string, ChatAuthor>(),
  joined: new Set<string>(),
  isAdmin: false,
  removed: [] as string[],
  sent: [] as string[],
  sendFails: null as string | null,
  reportedPosts: new Set<string>(),
  reports: [] as [string, string][],
  reportFails: null as string | null,
}));

vi.mock('@/lib/account', () => ({
  useAccount: () => ({ status: 'member', userId: 'me', isAdmin: db.isAdmin, displayName: 'Alex' }),
}));

// Stubbed, and it has to be: `.env.local` points at the hosted project, so an
// unmocked subscription in a test opens a websocket to production. What the
// hook does is its own concern — the screen's job here is to hand it a refetch.
vi.mock('@/lib/chat/realtime', () => ({
  useRealtimeRows: () => undefined,
}));

vi.mock('@/lib/chat/rooms', async (importOriginal) => ({
  ...(await importOriginal<typeof ChatRooms>()),
  useChatRooms: () => ({ rooms: db.rooms, loading: false, error: null, reload: () => undefined }),
  useRoomMembership: () => ({
    joined: db.joined,
    loading: false,
    error: null,
    toggle: () => undefined,
  }),
}));

vi.mock('@/lib/chat/topics', async (importOriginal) => ({
  ...(await importOriginal<typeof Topics>()),
  useTopicPosts: () => ({
    topic: db.topic,
    posts: db.posts,
    lastReadAt: null,
    loading: false,
    error: null,
    reload: () => undefined,
  }),
  removePost: (id: string) => {
    db.removed.push(id);
    return Promise.resolve({ ok: true as const, value: null });
  },
  sendPost: (_topicId: string, _authorId: string, body: string) => {
    if (db.sendFails) return Promise.resolve({ ok: false as const, error: db.sendFails });
    db.sent.push(body);
    return Promise.resolve({ ok: true as const, value: db.posts[0] });
  },
}));

vi.mock('@/lib/chat/authors', () => ({
  useChatAuthors: () => db.authors,
}));

// Stubbed for the same reason as realtime, and the reason is not the socket:
// `.env.local` points at the hosted project, so an unmocked *read* in a test
// talks to production too. Phase 6 found two screens doing exactly that.
// reportPreamble is deliberately left real — it is the sentence under test in
// the sheet, and a stub of it would let this file assert its own wording.
vi.mock('@/lib/chat/reports', async (importOriginal) => ({
  ...(await importOriginal<typeof Reports>()),
  useMyReports: () => ({
    postIds: db.reportedPosts,
    messageIds: new Set<string>(),
    loading: false,
    error: null,
    reload: () => undefined,
  }),
  reportPost: (id: string, note: string) => {
    if (db.reportFails) return Promise.resolve({ ok: false as const, error: db.reportFails });
    db.reports.push([id, note]);
    return Promise.resolve({ ok: true as const, value: null });
  },
}));

const author = (o: Partial<ChatAuthor> & { id: string }): ChatAuthor => ({
  displayName: 'Nicole',
  photoPath: null,
  photoAlt: null,
  avatarColor: null,
  level: 'T4',
  isAdmin: false,
  hasProfile: true,
  ...o,
});

const post = (o: Partial<ChatPost> & { id: string }): ChatPost => ({
  topicId: 't',
  authorId: 'nicole',
  body: 'Something useful.',
  createdAt: '2026-09-01T10:00:00Z',
  removedAt: null,
  removedByAdmin: false,
  ...o,
});

function renderTopic() {
  return render(
    <MemoryRouter initialEntries={['/chat/rooms/bowel/topics/t']}>
      <Routes>
        <Route path="/chat/rooms/:roomId/topics/:topicId" element={<TopicPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  db.rooms = [
    {
      id: 'bowel',
      name: 'Bowel management',
      description: 'x',
      category: 'Body',
      icon: '◍',
      createdBy: null,
      sortOrder: 1,
      openedAt: '2026-09-01T10:00:00Z',
    },
  ];
  db.topic = {
    id: 't',
    roomId: 'bowel',
    title: 'Travelling with a bowel programme',
    authorId: 'nicole',
    createdAt: '2026-09-01T10:00:00Z',
    lastPostAt: '2026-09-03T10:00:00Z',
    replyCount: 2,
    viewCount: 3,
    unread: false,
    participantIds: ['nicole'],
  };
  db.posts = [post({ id: '1' })];
  db.authors = new Map([['nicole', author({ id: 'nicole' })]]);
  db.joined = new Set(['bowel']);
  db.isAdmin = false;
  db.removed = [];
  db.sent = [];
  db.sendFails = null;
  db.reportedPosts = new Set();
  db.reports = [];
  db.reportFails = null;
});

describe('a topic', () => {
  // Numbering is why removal is soft: "3/3" has to mean the same thing before
  // and after somebody takes a post back.
  it('numbers every post, removed ones included', () => {
    db.posts = [
      post({ id: '1' }),
      post({ id: '2', body: '', removedAt: '2026-09-02T10:00:00Z' }),
      post({ id: '3' }),
    ];
    renderTopic();
    expect(screen.getByText('1/3')).toBeInTheDocument();
    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(screen.getByText('3/3')).toBeInTheDocument();
  });

  // Two different facts. Rolling them into one would hide a moderation
  // decision behind an author's second thoughts.
  it('says which kind of removal it was', () => {
    db.posts = [
      post({ id: '1', body: '', removedAt: '2026-09-02T10:00:00Z' }),
      post({ id: '2', body: '', removedAt: '2026-09-02T10:00:00Z', removedByAdmin: true }),
    ];
    renderTopic();
    expect(screen.getByText('Removed by its author.')).toBeInTheDocument();
    expect(screen.getByText('Removed by an administrator.')).toBeInTheDocument();
  });

  it('names a member who has left the club without linking to them', () => {
    db.posts = [post({ id: '1', authorId: null })];
    renderTopic();
    const article = screen.getByText('Former member').closest('article');
    if (!article) throw new Error('the post is not drawn as an article');
    expect(within(article).queryByRole('link')).toBeNull();
  });

  it('links to a member who is still in the directory, and not to one who is not', () => {
    db.authors = new Map([
      ['nicole', author({ id: 'nicole' })],
      ['hidden', author({ id: 'hidden', displayName: 'Jake', hasProfile: false })],
    ]);
    db.posts = [post({ id: '1' }), post({ id: '2', authorId: 'hidden' })];
    renderTopic();
    expect(screen.getByRole('link', { name: 'Nicole' })).toHaveAttribute('href', '/peers/nicole');
    // Named all the same — hiding from the deck is not unwriting a post.
    expect(screen.getByText('Jake')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Jake' })).toBeNull();
  });

  it('offers Remove on the viewer’s own post and on nobody else’s', () => {
    db.posts = [post({ id: '1' }), post({ id: '2', authorId: 'me' })];
    renderTopic();
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(1);
  });

  it('offers Remove on every post to an administrator', async () => {
    db.isAdmin = true;
    db.posts = [post({ id: '1' }), post({ id: '2', authorId: 'me' })];
    renderTopic();
    const buttons = screen.getAllByRole('button', { name: 'Remove' });
    expect(buttons).toHaveLength(2);
    const [first] = buttons;
    if (!first) throw new Error('no Remove button to press');
    await userEvent.click(first);
    await waitFor(() => {
      expect(db.removed).toEqual(['1']);
    });
  });

  it('offers no Remove on a post that is already removed', () => {
    db.isAdmin = true;
    db.posts = [post({ id: '1', body: '', removedAt: '2026-09-02T10:00:00Z' })];
    renderTopic();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  // Enter is a paragraph break here and not a send. A member dictating a post
  // will pause, and a send bound to Enter would publish the first sentence.
  it('breaks a line on Enter rather than posting', async () => {
    renderTopic();
    const box = screen.getByLabelText('Reply to this topic');
    await userEvent.type(box, 'First line{Enter}second line');
    expect(db.sent).toEqual([]);
    expect(box).toHaveValue('First line\nsecond line');
  });

  it('posts what was typed when the button is pressed', async () => {
    renderTopic();
    await userEvent.type(screen.getByLabelText('Reply to this topic'), 'That worked for me too.');
    await userEvent.click(screen.getByRole('button', { name: 'Post this reply' }));
    await waitFor(() => {
      expect(db.sent).toEqual(['That worked for me too.']);
    });
  });

  // The one thing this control must never do, especially to somebody who
  // dictated four paragraphs into it.
  it('keeps the draft when the post is refused, and says what happened', async () => {
    db.sendFails = 'new row violates row-level security policy';
    renderTopic();
    const box = screen.getByLabelText('Reply to this topic');
    await userEvent.type(box, 'Four paragraphs of this.');
    await userEvent.click(screen.getByRole('button', { name: 'Post this reply' }));
    await waitFor(() => {
      expect(screen.getByText(/row-level security policy/)).toBeInTheDocument();
    });
    expect(box).toHaveValue('Four paragraphs of this.');
  });

  it('offers a way in rather than a composer to somebody who has not joined', () => {
    db.joined = new Set();
    renderTopic();
    expect(screen.queryByLabelText('Reply to this topic')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Join Bowel management to reply' }),
    ).toBeInTheDocument();
  });

  it('tells an administrator that nobody can see a topic in a closed room', () => {
    db.isAdmin = true;
    db.rooms = db.rooms.map((r) => ({ ...r, openedAt: null }));
    renderTopic();
    expect(screen.getByText(/No member can see this topic yet/)).toBeInTheDocument();
  });
});

describe('reporting a post', () => {
  it("offers Report on somebody else's post and Remove on your own", () => {
    db.posts = [post({ id: '1' }), post({ id: '2', authorId: 'me' })];
    renderTopic();
    // Two posts and two controls between them, not four: the reader can take
    // back what they wrote, and hand over what somebody else did, and neither
    // post offers both.
    expect(screen.getAllByRole('button', { name: 'Report' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(1);
  });

  it('offers an administrator Remove instead, not a complaint to themselves', () => {
    db.isAdmin = true;
    renderTopic();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Report' })).toBeNull();
  });

  it("offers nothing on a former member's post", () => {
    // A report names who wrote it, and they have already left the club.
    db.posts = [post({ id: '1', authorId: null })];
    renderTopic();
    expect(screen.queryByRole('button', { name: 'Report' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('says what will be disclosed before anything is sent', async () => {
    renderTopic();
    await userEvent.click(screen.getByRole('button', { name: 'Report' }));
    const sheet = screen.getByRole('dialog', { name: 'Report this post' });
    // The promise, and the fact that it has not happened yet.
    expect(
      within(sheet).getByText(/go to the club's administrators, with your name/),
    ).toBeInTheDocument();
    expect(within(sheet).getByText(/The person is not told/)).toBeInTheDocument();
    expect(db.reports).toEqual([]);
  });

  it('sends the note with the report, and can be backed out of', async () => {
    renderTopic();
    await userEvent.click(screen.getByRole('button', { name: 'Report' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(db.reports).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: 'Report' }));
    await userEvent.type(screen.getByLabelText('Anything to add'), 'Selling supplements.');
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }));
    await waitFor(() => {
      expect(db.reports).toEqual([['1', 'Selling supplements.']]);
    });
    // The sheet goes once it has worked, and not before.
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the sheet and the words when the report is refused', async () => {
    db.reportFails = 'new row violates row-level security policy';
    renderTopic();
    await userEvent.click(screen.getByRole('button', { name: 'Report' }));
    const note = screen.getByLabelText('Anything to add');
    await userEvent.type(note, 'What happened.');
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }));
    await waitFor(() => {
      expect(screen.getByText(/row-level security policy/)).toBeInTheDocument();
    });
    expect(note).toHaveValue('What happened.');
    expect(screen.getByRole('dialog', { name: 'Report this post' })).toBeInTheDocument();
  });

  it('says Reported, inertly, on something already handed over', () => {
    db.reportedPosts = new Set(['1']);
    renderTopic();
    expect(screen.getByText('Reported')).toBeInTheDocument();
    // Not a disabled button: a disabled control reads out as one and invites a
    // second try.
    expect(screen.queryByRole('button', { name: /Report/ })).toBeNull();
  });
});
