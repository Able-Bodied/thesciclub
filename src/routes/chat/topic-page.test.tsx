import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Attachments from '@/lib/chat/attachments';
import type * as Likes from '@/lib/chat/likes';
import type * as Reports from '@/lib/chat/reports';
import type * as ChatRooms from '@/lib/chat/rooms';
import type * as Topics from '@/lib/chat/topics';
import type { ChatAuthor, ChatEdit, ChatPost, ChatRoom, ChatTopic } from '@/lib/chat/types';
import TopicPage from '@/routes/chat/topic-page';

const db = vi.hoisted(() => ({
  rooms: [] as ChatRoom[],
  topic: null as ChatTopic | null,
  posts: [] as ChatPost[],
  authors: new Map<string, ChatAuthor>(),
  isAdmin: false,
  removed: [] as string[],
  edited: [] as [string, string][],
  editFails: null as string | null,
  sent: [] as [string, string | null][],
  sendFails: null as string | null,
  reportedPosts: new Set<string>(),
  reports: [] as [string, string][],
  reportFails: null as string | null,
  deleted: [] as string[],
  deleteFails: null as string | null,
  filesDeleted: [] as string[][],
  edits: new Map<string, ChatEdit[]>(),
  editsReloads: 0,
  likes: new Map<string, string[]>(),
  likesAskedFor: [] as string[][],
  liked: [] as string[],
  likeFailure: null as { postId: string; message: string } | null,
  movedTo: null as string | null,
}));

// Likes are a read and a write of the club; the hook has its own test. The
// pure functions stay real.
vi.mock('@/lib/chat/likes', async (importOriginal) => ({
  ...(await importOriginal<typeof Likes>()),
  usePostLikes: (ids: readonly string[]) => {
    db.likesAskedFor.push([...ids]);
    return {
      byPost: db.likes,
      loading: false,
      error: null,
      failure: db.likeFailure,
      toggle: (id: string) => {
        db.liked.push(id);
      },
      reload: () => undefined,
    };
  },
}));

// chat_edits is administrators' reading; the hook has its own test, and an
// unmocked read here would reach for the network.
vi.mock('@/lib/chat/edits', () => ({
  useEdits: () => ({
    byPost: db.edits,
    byMessage: new Map(),
    loading: false,
    error: null,
    reload: () => {
      db.editsReloads += 1;
    },
  }),
}));

// Storage is the network; record what would have been deleted.
vi.mock('@/lib/chat/attachments', async (importOriginal) => ({
  ...(await importOriginal<typeof Attachments>()),
  deleteAttachments: (paths: string[]) => {
    db.filesDeleted.push(paths);
    return Promise.resolve();
  },
}));

// Mutes read and write the club; the button has its own test.
vi.mock('@/lib/chat/mutes', () => ({
  useMute: () => ({ muted: null, busy: false, error: null, toggle: () => undefined }),
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
    movedTo: db.movedTo,
  }),
  deleteTopic: (id: string) => {
    if (db.deleteFails) return Promise.resolve({ ok: false as const, error: db.deleteFails });
    db.deleted.push(id);
    return Promise.resolve({ ok: true as const, value: ['rooms/bowel/a.webp'] });
  },
  removePost: (id: string) => {
    db.removed.push(id);
    return Promise.resolve({ ok: true as const, value: null });
  },
  editPost: (id: string, body: string) => {
    if (db.editFails) return Promise.resolve({ ok: false as const, error: db.editFails });
    db.edited.push([id, body]);
    return Promise.resolve({ ok: true as const, value: null });
  },
  sendPost: (
    _topicId: string,
    _authorId: string,
    body: string,
    _attachments: string[] = [],
    replyTo: string | null = null,
  ) => {
    if (db.sendFails) return Promise.resolve({ ok: false as const, error: db.sendFails });
    db.sent.push([body, replyTo]);
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
    // Reads back what was sent, as the real one does, so Report becomes
    // Reported in the same render that closes the sheet.
    reload: () => {
      for (const [id] of db.reports) db.reportedPosts.add(id);
    },
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
  attachments: [],
  removedByAdmin: false,
  editedAt: null,
  replyTo: null,
  linkPreview: null,
  ...o,
});

function renderTopic(path = '/chat/rooms/bowel/topics/t') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/chat/rooms/:roomId/topics/:topicId" element={<TopicPage />} />
        <Route path="/chat/rooms/:roomId" element={<p>The room</p>} />
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
  db.isAdmin = false;
  db.removed = [];
  db.edited = [];
  db.editFails = null;
  db.sent = [];
  db.sendFails = null;
  db.reportedPosts = new Set();
  db.reports = [];
  db.reportFails = null;
  db.deleted = [];
  db.deleteFails = null;
  db.filesDeleted = [];
  db.edits = new Map();
  db.editsReloads = 0;
  db.likes = new Map();
  db.likesAskedFor = [];
  db.liked = [];
  db.likeFailure = null;
  db.movedTo = null;
});

// A reply or a like notification links to ?post=<id> (20261006000000).
describe('opening on the post a notification was about', () => {
  it('centres that post, lights it up once and gives it focus', async () => {
    const scrolled: [string, ScrollIntoViewOptions | boolean | undefined][] = [];
    // jsdom draws nothing, so it has no scrollIntoView; this one records.
    Element.prototype.scrollIntoView = function (this: Element, options) {
      scrolled.push([this.id, options]);
    };
    db.posts = [post({ id: '1' }), post({ id: '2', replyTo: '1', body: 'The reply' })];
    renderTopic('/chat/rooms/bowel/topics/t?post=2');

    const target = document.getElementById('post-2');
    await waitFor(() => {
      expect(target).toHaveFocus();
    });
    // A frame later: off and on, so a second press lights it again.
    await waitFor(() => {
      expect(target).toHaveClass('message-flash');
    });
    expect(document.getElementById('post-1')).not.toHaveClass('message-flash');
    expect(scrolled).toContainEqual(['post-2', { block: 'center' }]);
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  });

  it('opens as it would have when that post has been taken back', async () => {
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    renderTopic('/chat/rooms/bowel/topics/t?post=gone');
    expect(await screen.findByText(db.posts[0]?.body ?? '')).toBeInTheDocument();
    expect(document.querySelector('.message-flash')).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  });
});

describe('likes', () => {
  it('asks for the likes of the standing posts only', () => {
    db.posts = [
      post({ id: '1' }),
      post({ id: '2', body: '', removedAt: '2026-09-02T10:00:00Z' }),
      post({ id: '3', authorId: 'me' }),
    ];
    renderTopic();
    expect(db.likesAskedFor.at(-1)).toEqual(['1', '3']);
  });

  it('offers Like on somebody else’s post, named for it, and likes on a press', async () => {
    renderTopic();
    await userEvent.click(screen.getByRole('button', { name: "Like Nicole's post" }));
    expect(db.liked).toEqual(['1']);
  });

  it('draws the count, and no Like, on the reader’s own post', () => {
    db.posts = [post({ id: '1' }), post({ id: '2', authorId: 'me' })];
    db.likes = new Map([['2', ['nicole']]]);
    renderTopic();
    const mine = screen.getByRole('button', { name: '1 like on your post. Show who.' });
    const article = mine.closest('article');
    if (!article) throw new Error('the count is not inside its post');
    expect(within(article).queryByRole('button', { name: /^Like/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Like / })).toHaveLength(1);
  });

  it('likes a reply as well as a top-level post', () => {
    db.posts = [post({ id: '1' }), post({ id: '2', authorId: 'jan', replyTo: '1' })];
    db.authors.set('jan', author({ id: 'jan', displayName: 'Jan' }));
    db.likes = new Map([['2', ['me']]]);
    renderTopic();
    expect(
      screen.getByRole('button', { name: "Liked Jan's post. Press to take it back." }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('says under the post when a like did not land', () => {
    db.posts = [post({ id: '1' }), post({ id: '2', authorId: 'jan' })];
    db.authors.set('jan', author({ id: 'jan', displayName: 'Jan' }));
    db.likeFailure = { postId: '2', message: 'Your like was not saved. You cannot like this.' };
    renderTopic();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Your like was not saved. You cannot like this.');
    expect(alert.closest('article')).toBe(
      screen.getByRole('button', { name: "Like Jan's post" }).closest('article'),
    );
  });
});

describe('a topic', () => {
  it('says how many replies and views it has', () => {
    renderTopic();
    expect(screen.getByText(/^2 replies · 3 views · started by/)).toBeInTheDocument();
  });

  // A count of zero is not drawn: a topic nobody has answered says who
  // started it, not "0 replies".
  it('leaves out a count of zero', () => {
    db.topic = { ...db.topic, replyCount: 0, viewCount: 1 } as ChatTopic;
    renderTopic();
    expect(screen.getByText(/^1 view · started by/)).toBeInTheDocument();
    expect(screen.queryByText(/0 replies/)).toBeNull();
  });

  it('starts with who started it when there is no count at all', () => {
    db.topic = { ...db.topic, replyCount: 0, viewCount: 0 } as ChatTopic;
    renderTopic();
    expect(screen.getByText(/^Started by/)).toBeInTheDocument();
  });

  // The owner, 2026-09-27: a removed post is not drawn at all, and the
  // numbers close up over the gap.
  it('leaves removed posts out and numbers the rest among themselves', () => {
    db.posts = [
      post({ id: '1' }),
      post({ id: '2', body: '', removedAt: '2026-09-02T10:00:00Z' }),
      post({ id: '3', body: '', removedAt: '2026-09-02T10:00:00Z', removedByAdmin: true }),
      post({ id: '4' }),
    ];
    renderTopic();
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByText('2/2')).toBeInTheDocument();
    expect(screen.queryByText(/Removed by/)).toBeNull();
  });

  describe('deleting it', () => {
    it('is not offered to a member', () => {
      renderTopic();
      expect(screen.queryByRole('button', { name: 'Delete topic' })).toBeNull();
    });

    it('asks first, and does nothing when the administrator says no', async () => {
      db.isAdmin = true;
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      renderTopic();
      await userEvent.click(screen.getByRole('button', { name: 'Delete topic' }));
      expect(confirm).toHaveBeenCalledOnce();
      expect(db.deleted).toEqual([]);
      confirm.mockRestore();
    });

    it('deletes it, removes its photographs, and goes back to the room', async () => {
      db.isAdmin = true;
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
      renderTopic();
      await userEvent.click(screen.getByRole('button', { name: 'Delete topic' }));
      expect(await screen.findByText('The room')).toBeInTheDocument();
      expect(db.deleted).toEqual(['t']);
      expect(db.filesDeleted).toEqual([['rooms/bowel/a.webp']]);
      confirm.mockRestore();
    });

    it('says so when it fails, and stays', async () => {
      db.isAdmin = true;
      db.deleteFails = 'The topic was not deleted. You cannot do that here.';
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
      renderTopic();
      await userEvent.click(screen.getByRole('button', { name: 'Delete topic' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('The topic was not deleted.');
      expect(screen.queryByText('The room')).toBeNull();
      confirm.mockRestore();
    });
  });

  it('names a member who has left the club without linking to them', () => {
    db.posts = [post({ id: '1', authorId: null })];
    renderTopic();
    const article = screen.getByText('Deleted member').closest('article');
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
    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(1);
    // Named for the post, so a list of twenty is not twenty "Remove"s.
    expect(screen.getByRole('button', { name: 'Remove your post' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Report Nicole's post" })).toBeInTheDocument();
  });

  describe('editing', () => {
    it('is offered on the viewer’s own standing post and on nobody else’s', () => {
      db.posts = [post({ id: '1' }), post({ id: '2', authorId: 'me' })];
      renderTopic();
      expect(screen.getAllByRole('button', { name: 'Edit your post' })).toHaveLength(1);
    });

    // An administrator removes; rewriting a member's words in their name is
    // not moderation, and chat_edit_post refuses them too.
    it('is not offered to an administrator on somebody else’s post', () => {
      db.isAdmin = true;
      db.posts = [post({ id: '1' }), post({ id: '2', authorId: 'me' })];
      renderTopic();
      expect(screen.getAllByRole('button', { name: 'Edit your post' })).toHaveLength(1);
    });

    it('is not offered in a closed room', () => {
      db.rooms = db.rooms.map((r) => ({ ...r, openedAt: null }));
      db.posts = [post({ id: '2', authorId: 'me' })];
      renderTopic();
      expect(screen.queryByRole('button', { name: 'Edit your post' })).toBeNull();
    });

    it('swaps the words for the composer, and saves what was changed', async () => {
      db.posts = [post({ id: '2', authorId: 'me', body: 'First draft.' })];
      renderTopic();
      await userEvent.click(screen.getByRole('button', { name: 'Edit your post' }));
      const box = screen.getByLabelText('Your post');
      expect(box).toHaveValue('First draft.');
      // Nothing has changed yet, so Save waits: the database would refuse it.
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
      await userEvent.type(box, ' Second thoughts.');
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => {
        expect(db.edited).toEqual([['2', 'First draft. Second thoughts.']]);
      });
      // The editor closes; the words come back from the reload.
      await waitFor(() => {
        expect(screen.queryByLabelText('Your post')).toBeNull();
      });
    });

    it('keeps the draft and says why when the edit is refused', async () => {
      db.editFails = 'Your edit was not saved. You can only edit your own post.';
      db.posts = [post({ id: '2', authorId: 'me', body: 'First draft.' })];
      renderTopic();
      await userEvent.click(screen.getByRole('button', { name: 'Edit your post' }));
      const box = screen.getByLabelText('Your post');
      await userEvent.type(box, ' More.');
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/You can only edit your own post/);
      expect(box).toHaveValue('First draft. More.');
    });

    it('is cancelled by the button and by Escape, with nothing saved', async () => {
      db.posts = [post({ id: '2', authorId: 'me', body: 'First draft.' })];
      renderTopic();
      await userEvent.click(screen.getByRole('button', { name: 'Edit your post' }));
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByLabelText('Your post')).toBeNull();
      expect(screen.getByText('First draft.')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Edit your post' }));
      await userEvent.type(screen.getByLabelText('Your post'), ' gone{Escape}');
      expect(screen.queryByLabelText('Your post')).toBeNull();
      expect(db.edited).toEqual([]);
    });

    it('says Edited, with the time, under an edited post', () => {
      db.posts = [post({ id: '1', editedAt: '2026-09-01T11:30:00Z' })];
      renderTopic();
      expect(screen.getByText(/^Edited · /)).toBeInTheDocument();
    });

    // What an edited post used to say, for the one reader who may have to
    // act on it. The hook hands a member nothing, so the disclosure is
    // simply absent for them; here the map says what came back.
    it('shows an administrator every earlier version under a disclosure', async () => {
      db.isAdmin = true;
      db.posts = [post({ id: '1', body: 'Third draft.', editedAt: '2026-09-01T11:30:00Z' })];
      db.edits = new Map([
        [
          '1',
          [
            {
              id: 'e1',
              postId: '1',
              messageId: null,
              body: 'First draft.',
              attachments: [],
              editedBy: 'nicole',
              replacedAt: '2026-09-01T11:00:00Z',
            },
            {
              id: 'e2',
              postId: '1',
              messageId: null,
              body: 'Second draft.',
              attachments: [],
              editedBy: 'nicole',
              replacedAt: '2026-09-01T11:30:00Z',
            },
          ],
        ],
      ]);
      renderTopic();
      const disclosure = screen.getByText('Earlier versions');
      expect(disclosure.closest('details')).not.toHaveAttribute('open');
      await userEvent.click(disclosure);
      const details = disclosure.closest('details');
      expect(details).toHaveAttribute('open');
      if (!(details instanceof HTMLElement)) throw new Error('the disclosure should be a details');
      const items = within(details).getAllByRole('listitem');
      expect(items.map((item) => item.textContent)).toEqual([
        expect.stringContaining('First draft.'),
        expect.stringContaining('Second draft.'),
      ]);
      expect(screen.getAllByText(/^Replaced /)).toHaveLength(2);
    });

    it('draws no disclosure for a post with no earlier versions', () => {
      db.isAdmin = true;
      db.posts = [post({ id: '1' })];
      renderTopic();
      expect(screen.queryByText('Earlier versions')).toBeNull();
    });

    it('re-reads the earlier versions once its own edit lands', async () => {
      db.isAdmin = true;
      db.posts = [post({ id: '2', authorId: 'me', body: 'First draft.' })];
      renderTopic();
      await userEvent.click(screen.getByRole('button', { name: 'Edit your post' }));
      await userEvent.type(screen.getByLabelText('Your post'), ' More.');
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => {
        expect(db.editsReloads).toBe(1);
      });
    });
  });

  describe('replies under a post', () => {
    const jake = author({ id: 'jake', displayName: 'Jake' });
    beforeEach(() => {
      db.authors = new Map([
        ['nicole', author({ id: 'nicole' })],
        ['jake', jake],
      ]);
      db.posts = [
        post({ id: 'q', createdAt: '2026-09-01T10:00:00Z' }),
        post({ id: 'r1', authorId: 'jake', replyTo: 'q', createdAt: '2026-09-01T12:00:00Z' }),
        post({ id: 'a1', authorId: 'me', createdAt: '2026-09-01T11:00:00Z' }),
      ];
    });

    it('draws a reply inside its post, unnumbered, and numbers the top level only', () => {
      renderTopic();
      const articles = screen.getAllByRole('article');
      // Three articles: the question with its reply inside it, and the answer.
      expect(articles).toHaveLength(3);
      const question = articles[0];
      if (!question) throw new Error('no question');
      expect(within(question).getByText('1/2')).toBeInTheDocument();
      expect(within(question).getByRole('article')).toBeInTheDocument();
      expect(screen.getByText('2/2')).toBeInTheDocument();
      expect(screen.queryByText('3/3')).toBeNull();
      expect(screen.queryByText(/\/3$/)).toBeNull();
    });

    it('offers Reply on every standing post, named for its author', () => {
      renderTopic();
      expect(screen.getByRole('button', { name: "Reply to Nicole's post" })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: "Reply to Jake's post" })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reply to your post' })).toBeInTheDocument();
    });

    it('files the reply under the post, and says so over the composer until it is sent', async () => {
      renderTopic();
      await userEvent.click(screen.getByRole('button', { name: "Reply to Nicole's post" }));
      expect(screen.getByText(/Replying to/)).toHaveTextContent('Replying to Nicole');
      const box = screen.getByLabelText('Reply to this topic');
      expect(box).toHaveFocus();
      await userEvent.type(box, 'Under the question.');
      await userEvent.click(screen.getByRole('button', { name: 'Post this reply' }));
      await waitFor(() => {
        expect(db.sent).toEqual([['Under the question.', 'q']]);
      });
      await waitFor(() => {
        expect(screen.queryByText(/Replying to/)).toBeNull();
      });
    });

    // Reply on a reply names and answers that particular reply.
    it('files a reply to a reply under that specific reply', async () => {
      renderTopic();
      await userEvent.click(screen.getByRole('button', { name: "Reply to Jake's post" }));
      expect(screen.getByText(/Replying to/)).toHaveTextContent('Replying to Jake');
      await userEvent.type(screen.getByLabelText('Reply to this topic'), 'Under this reply.');
      await userEvent.click(screen.getByRole('button', { name: 'Post this reply' }));
      await waitFor(() => {
        expect(db.sent).toEqual([['Under this reply.', 'r1']]);
      });
    });

    it('turns back into an ordinary post when the bar is closed', async () => {
      renderTopic();
      await userEvent.click(screen.getByRole('button', { name: "Reply to Nicole's post" }));
      await userEvent.click(screen.getByRole('button', { name: 'Stop replying' }));
      expect(screen.queryByText(/Replying to/)).toBeNull();
      await userEvent.type(screen.getByLabelText('Reply to this topic'), 'On its own.');
      await userEvent.click(screen.getByRole('button', { name: 'Post this reply' }));
      await waitFor(() => {
        expect(db.sent).toEqual([['On its own.', null]]);
      });
    });

    // The database nulls replyTo when the parent is removed; and if the read
    // is older than that, the parent is simply not drawn. Either way the
    // reply stands on its own, and nothing says "reply to a removed post".
    it('stands a reply on its own once its post is removed', () => {
      db.posts = [
        post({
          id: 'q',
          body: '',
          removedAt: '2026-09-02T10:00:00Z',
          createdAt: '2026-09-01T10:00:00Z',
        }),
        post({ id: 'r1', authorId: 'jake', replyTo: 'q', createdAt: '2026-09-01T12:00:00Z' }),
      ];
      renderTopic();
      expect(screen.getAllByRole('article')).toHaveLength(1);
      expect(screen.getByText('1/1')).toBeInTheDocument();
      expect(screen.queryByText(/removed/i)).toBeNull();
    });

    // The owner, 2026-09-29: for the day a thread of replies gets long.
    const folded = () => [
      post({ id: 'q', body: 'The question.', createdAt: '2026-09-01T10:00:00Z' }),
      post({
        id: 'r1',
        authorId: 'jake',
        replyTo: 'q',
        body: 'A reply under the question.',
        createdAt: '2026-09-01T12:00:00Z',
      }),
      post({ id: 'a1', authorId: 'me', body: 'An answer.', createdAt: '2026-09-01T11:00:00Z' }),
    ];

    it('hides the replies under a post and shows them again, naming the count and the post', async () => {
      db.posts = folded();
      renderTopic();
      expect(screen.getByText('A reply under the question.')).toBeVisible();
      const hide = screen.getByRole('button', { name: "Hide 1 reply to Nicole's post" });
      expect(hide).toHaveAttribute('aria-expanded', 'true');
      await userEvent.click(hide);
      const show = screen.getByRole('button', { name: "Show 1 reply to Nicole's post" });
      expect(show).toHaveAttribute('aria-expanded', 'false');
      expect(screen.getByText('A reply under the question.')).not.toBeVisible();
      await userEvent.click(show);
      expect(screen.getByText('A reply under the question.')).toBeVisible();
    });

    it('collapses a reply conversation independently of its siblings and parent', async () => {
      db.posts = [
        ...folded(),
        post({ id: 'deep', authorId: 'me', replyTo: 'r1', body: 'Nested conversation.' }),
        post({ id: 'sibling', replyTo: 'q', body: 'A sibling conversation.' }),
      ];
      renderTopic();
      const parent = document.getElementById('post-r1');
      expect(parent).toContainElement(document.getElementById('post-deep'));
      await userEvent.click(screen.getByRole('button', { name: "Hide 1 reply to Jake's post" }));
      expect(screen.getByText('Nested conversation.')).not.toBeVisible();
      expect(screen.getByText('A reply under the question.')).toBeVisible();
      expect(screen.getByText('A sibling conversation.')).toBeVisible();
      await userEvent.click(
        screen.getByRole('button', { name: "Hide 3 replies to Nicole's post" }),
      );
      expect(screen.getByText('A sibling conversation.')).not.toBeVisible();
      await userEvent.click(
        screen.getByRole('button', { name: "Show 3 replies to Nicole's post" }),
      );
      expect(screen.getByText('A sibling conversation.')).toBeVisible();
      expect(screen.getByText('Nested conversation.')).not.toBeVisible();
      await userEvent.click(screen.getByRole('button', { name: "Show 1 reply to Jake's post" }));
      expect(screen.getByText('Nested conversation.')).toBeVisible();
    });

    it('draws no hide control on a post with no replies', () => {
      db.posts = folded();
      renderTopic();
      expect(screen.getAllByRole('button', { name: /^Hide / })).toHaveLength(1);
      expect(screen.queryByRole('button', { name: /^(Hide|Show) .* to your post$/ })).toBeNull();
    });

    // A reply you have just written under a folded post must not land where
    // you cannot see it.
    it('shows the replies again once their number changes', async () => {
      db.posts = folded();
      const { rerender } = renderTopic();
      await userEvent.click(screen.getByRole('button', { name: "Hide 1 reply to Nicole's post" }));
      expect(screen.getByText('A reply under the question.')).not.toBeVisible();
      db.posts = [
        ...folded(),
        post({
          id: 'r2',
          authorId: 'me',
          replyTo: 'q',
          body: 'Mine, just now.',
          createdAt: '2026-09-01T13:00:00Z',
        }),
      ];
      rerender(
        <MemoryRouter initialEntries={['/chat/rooms/bowel/topics/t']}>
          <Routes>
            <Route path="/chat/rooms/:roomId/topics/:topicId" element={<TopicPage />} />
          </Routes>
        </MemoryRouter>,
      );
      expect(screen.getByText('Mine, just now.')).toBeVisible();
      expect(screen.getByText('A reply under the question.')).toBeVisible();
      expect(
        screen.getByRole('button', { name: "Hide 2 replies to Nicole's post" }),
      ).toBeInTheDocument();
    });

    it('offers no Reply in a closed room', () => {
      db.rooms = db.rooms.map((r) => ({ ...r, openedAt: null }));
      renderTopic();
      expect(screen.queryByRole('button', { name: /^Reply to/ })).toBeNull();
    });
  });

  it('offers Remove on every post to an administrator', async () => {
    db.isAdmin = true;
    db.posts = [post({ id: '1' }), post({ id: '2', authorId: 'me' })];
    renderTopic();
    const buttons = screen.getAllByRole('button', { name: /^Remove / });
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
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull();
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
      expect(db.sent).toEqual([['That worked for me too.', null]]);
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

  // Since 20260930000000 any member writes in an open room: the composer is
  // there for somebody who has joined nothing, and there is no Join.
  it('offers the composer to somebody who has joined nothing, and no Join', () => {
    renderTopic();
    expect(screen.getByLabelText('Reply to this topic')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Join/ })).toBeNull();
  });

  it('offers a member no composer in a closed room', () => {
    db.rooms = db.rooms.map((r) => ({ ...r, openedAt: null }));
    renderTopic();
    expect(screen.queryByLabelText('Reply to this topic')).toBeNull();
    expect(screen.getByText('This room is closed. No member can see it yet.')).toBeInTheDocument();
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
    expect(screen.getAllByRole('button', { name: /^Report / })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(1);
  });

  it('offers an administrator Remove instead, not a complaint to themselves', () => {
    db.isAdmin = true;
    renderTopic();
    expect(screen.getByRole('button', { name: /^Remove / })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Report / })).toBeNull();
  });

  it("offers nothing on a deleted member's post", () => {
    // A report names who wrote it, and they have already left the club.
    db.posts = [post({ id: '1', authorId: null })];
    renderTopic();
    expect(screen.queryByRole('button', { name: /^Report / })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull();
  });

  it('says what will be disclosed before anything is sent', async () => {
    renderTopic();
    await userEvent.click(screen.getByRole('button', { name: /^Report / }));
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
    await userEvent.click(screen.getByRole('button', { name: /^Report / }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(db.reports).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: /^Report / }));
    await userEvent.type(screen.getByLabelText('Anything to add'), 'Selling supplements.');
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }));
    await waitFor(() => {
      expect(db.reports).toEqual([['1', 'Selling supplements.']]);
    });
    // The sheet goes once it has worked, and not before.
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('puts focus on Reported once the report has gone, and back on Report after Cancel', async () => {
    const user = userEvent.setup();
    renderTopic();
    await user.click(screen.getByRole('button', { name: /^Report / }));
    expect(screen.getByRole('heading', { name: 'Report this post' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: /^Report / })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: /^Report / }));
    await user.click(screen.getByRole('button', { name: 'Send report' }));
    await waitFor(() => {
      expect(screen.getByText('Reported')).toHaveFocus();
    });
  });

  it('keeps the sheet and the words when the report is refused', async () => {
    db.reportFails = 'new row violates row-level security policy';
    renderTopic();
    await userEvent.click(screen.getByRole('button', { name: /^Report / }));
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
    expect(screen.queryByRole('button', { name: /^Report / })).toBeNull();
  });
});

describe('a topic moved to another room', () => {
  it('follows it there, keeping the post the link was about', async () => {
    db.topic = null;
    db.movedTo = 'general';
    render(
      <MemoryRouter initialEntries={['/chat/rooms/bowel/topics/t?post=2']}>
        <Routes>
          <Route path="/chat/rooms/bowel/topics/:topicId" element={<TopicPage />} />
          <Route path="/chat/rooms/general/topics/:topicId" element={<p>In General</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('In General')).toBeInTheDocument();
  });

  it('offers moving to whoever started it', () => {
    const current = db.topic;
    if (!current) throw new Error('the fixture should have a topic');
    db.topic = { ...current, authorId: 'me' };
    renderTopic();
    expect(screen.getByRole('button', { name: 'Move to another room' })).toBeInTheDocument();
  });

  it('offers moving to an administrator', () => {
    db.isAdmin = true;
    renderTopic();
    expect(screen.getByRole('button', { name: 'Move to another room' })).toBeInTheDocument();
  });

  it('offers it to nobody else', () => {
    renderTopic();
    expect(screen.queryByRole('button', { name: 'Move to another room' })).toBeNull();
  });
});

describe('a question asked with no details', () => {
  it('says the question once, as the title, not again as the first post', () => {
    db.posts = [post({ id: '1', body: 'Travelling with a bowel programme' })];
    renderTopic();
    expect(screen.getAllByText('Travelling with a bowel programme')).toHaveLength(1);
    expect(screen.getByText('No answers yet. Yours can be the first.')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Travelling with a bowel programme' }),
    ).toBeInTheDocument();
  });

  it('still draws a first post that says more', () => {
    db.posts = [post({ id: '1', body: 'More about it.' })];
    renderTopic();
    expect(screen.getByText('More about it.')).toBeInTheDocument();
  });
});

describe('the way out of a topic', () => {
  it('offers Home, every room, and this room’s other topics', () => {
    renderTopic();
    const crumbs = within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getAllByRole(
      'link',
    );
    expect(crumbs.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Home', '/home'],
      ['Rooms', '/chat?segment=rooms'],
      ['Bowel management', '/chat/rooms/bowel'],
    ]);
  });

  it('goes back to the Home pill it was opened from', () => {
    render(
      <MemoryRouter
        initialEntries={[
          { pathname: '/chat/rooms/bowel/topics/t', state: { from: 'home', segment: 'topics' } },
        ]}
      >
        <Routes>
          <Route path="/chat/rooms/:roomId/topics/:topicId" element={<TopicPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      '/home?segment=topics',
    );
  });
});

describe('the header’s controls', () => {
  // Mute is stubbed in this file (useMute answers nothing), so the row is
  // checked with the two that draw.
  it('sit in one evenly spaced row, with no margins of their own', () => {
    db.isAdmin = true;
    renderTopic();
    const move = screen.getByRole('button', { name: 'Move to another room' });
    const remove = screen.getByRole('button', { name: 'Delete topic' });
    expect(move.parentElement).toBe(remove.parentElement);
    expect(move.parentElement).toHaveClass('flex', 'gap-2');
    expect(move.className).not.toMatch(/\bm[trl]?-/);
    expect(remove.className).not.toMatch(/\bm[trl]?-/);
  });
});

describe('a question with no details, answered', () => {
  it('counts the answers from 1, and does not repeat the asker over nothing', () => {
    db.posts = [
      post({ id: '1', body: 'Travelling with a bowel programme' }),
      post({ id: '2', authorId: 'jan', body: 'First answer', createdAt: '2026-09-02T10:00:00Z' }),
    ];
    renderTopic();
    expect(screen.getByText('1/1')).toBeInTheDocument();
    expect(screen.queryByText('2/2')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit your post' })).toBeNull();
  });
});
