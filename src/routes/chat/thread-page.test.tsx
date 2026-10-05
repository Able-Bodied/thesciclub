import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Attachments from '@/lib/chat/attachments';
import type * as Reports from '@/lib/chat/reports';
import type * as Threads from '@/lib/chat/threads';
import type { ChatAuthor, ChatMessage, ChatThread } from '@/lib/chat/types';
import ThreadPage from '@/routes/chat/thread-page';

/**
 * The reads are stubbed; `threadTitle` deliberately is not, so what the header
 * calls the conversation is the real function's answer and this file cannot
 * assert its own wording. Its own tests are in src/lib/chat/threads.test.ts.
 *
 * jsdom has no layout, so scrollHeight and clientHeight are both zero and the
 * follow-or-not decision cannot be exercised here. That is what
 * `shouldFollowScroll` is pure and separately tested for.
 */

const db = vi.hoisted(() => ({
  thread: null as ChatThread | null,
  messages: [] as ChatMessage[],
  loading: false,
  error: null as string | null,
  authors: new Map<string, ChatAuthor>(),
  isAdmin: false,
  sent: [] as [string, string | null][],
  sendFailure: null as string | null,
  edited: [] as [string, string][],
  editFailure: null as string | null,
  removed: [] as string[],
  reportedMessages: new Set<string>(),
  reports: [] as [string, string][],
  reportFails: null as string | null,
  /** Signed URLs by path, for the group's picture. */
  urls: new Map<string, string>(),
}));

// Signing is a storage call under the reader's token.
vi.mock('@/lib/chat/attachments', async (importOriginal) => ({
  ...(await importOriginal<typeof Attachments>()),
  useAttachmentUrls: (paths: readonly string[]) =>
    new Map([...db.urls].filter(([path]) => paths.includes(path))),
}));

// Mutes read and write the club; the button has its own test.
vi.mock('@/lib/chat/mutes', () => ({
  useMute: () => ({ muted: null, busy: false, error: null, toggle: () => undefined }),
}));

vi.mock('@/lib/account', () => ({
  useAccount: () => ({
    status: 'member',
    userId: 'me',
    isAdmin: db.isAdmin,
    displayName: 'Alex',
  }),
}));

// Stubbed, and it has to be: `.env.local` points at the hosted project, so an
// unmocked subscription in a test opens a websocket to production. What the
// hook does is its own concern — the screen's job here is to hand it a refetch.
vi.mock('@/lib/chat/realtime', () => ({
  useRealtimeRows: () => undefined,
}));

vi.mock('@/lib/chat/threads', async (importOriginal) => ({
  ...(await importOriginal<typeof Threads>()),
  useThreadMessages: () => ({
    thread: db.thread,
    messages: db.messages,
    loading: db.loading,
    error: db.error,
    reload: () => undefined,
    send: (body: string, _attachments: string[] = [], replyTo: string | null = null) => {
      db.sent.push([body, replyTo]);
      return Promise.resolve(db.sendFailure);
    },
    edit: (id: string, body: string) => {
      if (!db.editFailure) db.edited.push([id, body]);
      return Promise.resolve(db.editFailure);
    },
    remove: (id: string) => {
      db.removed.push(id);
      return Promise.resolve(null);
    },
  }),
}));

vi.mock('@/lib/chat/authors', () => ({
  useChatAuthors: () => db.authors,
}));

// Stubbed for the same reason as realtime, and the reason is not the socket:
// `.env.local` points at the hosted project, so an unmocked *read* in a test
// talks to production too. reportPreamble is left real — it is the promise the
// sheet makes, and a stub of it would let this file assert its own wording.
vi.mock('@/lib/chat/reports', async (importOriginal) => ({
  ...(await importOriginal<typeof Reports>()),
  useMyReports: () => ({
    postIds: new Set<string>(),
    messageIds: db.reportedMessages,
    loading: false,
    error: null,
    reload: () => undefined,
  }),
  reportMessage: (id: string, note: string) => {
    if (db.reportFails) return Promise.resolve({ ok: false as const, error: db.reportFails });
    db.reports.push([id, note]);
    return Promise.resolve({ ok: true as const, value: null });
  },
}));

const thread = (o: Partial<ChatThread> = {}): ChatThread => ({
  id: 'th1',
  kind: 'direct',
  name: null,
  eventId: null,
  createdAt: '2026-09-18T09:00:00Z',
  lastMessageAt: '2026-09-18T10:00:00Z',
  memberCount: 2,
  otherMemberId: 'jan',
  lastBody: 'Hello.',
  lastAuthorId: 'jan',
  lastAt: '2026-09-18T10:00:00Z',
  lastRemoved: false,
  unread: false,
  photoPath: null,
  lastNotice: null,
  ...o,
});

const message = (o: Partial<ChatMessage> & { id: string }): ChatMessage => ({
  threadId: 'th1',
  authorId: 'jan',
  body: 'Something.',
  createdAt: '2026-09-18T10:00:00Z',
  removedAt: null,
  attachments: [],
  removedByAdmin: false,
  editedAt: null,
  replyTo: null,
  notice: null,
  ...o,
});

const jan: ChatAuthor = {
  id: 'jan',
  displayName: 'Jan',
  photoPath: null,
  photoAlt: null,
  avatarColor: null,
  level: 'T4 complete',
  isAdmin: false,
  hasProfile: true,
};

function renderThread() {
  return render(
    <MemoryRouter initialEntries={['/chat/t/th1']}>
      <Routes>
        <Route path="/chat/t/:threadId" element={<ThreadPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  db.thread = thread();
  db.messages = [];
  db.loading = false;
  db.error = null;
  db.authors = new Map([['jan', jan]]);
  db.isAdmin = false;
  db.sent = [];
  db.sendFailure = null;
  db.edited = [];
  db.editFailure = null;
  db.removed = [];
  db.reportedMessages = new Set();
  db.reports = [];
  db.reportFails = null;
  db.urls = new Map();
});

describe('a conversation', () => {
  it('is headed by the other member, their level, and a way to their profile', () => {
    renderThread();
    expect(screen.getByRole('heading', { name: 'Jan' })).toBeInTheDocument();
    expect(screen.getByText('T4 complete')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/peers/jan');
  });

  it('draws what has been said, announced politely as it grows', () => {
    db.messages = [
      message({ id: 'm1', body: 'Which frame?' }),
      message({ id: 'm2', authorId: 'me', body: 'A Top End Force.' }),
    ];
    renderThread();
    const log = screen.getByRole('log');
    expect(log).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Which frame?')).toBeInTheDocument();
    expect(screen.getByText('A Top End Force.')).toBeInTheDocument();
  });

  it('says a conversation is empty rather than leaving a blank screen', () => {
    renderThread();
    expect(screen.getByText(/Nothing has been said yet/)).toBeInTheDocument();
    expect(screen.getByText(/between the two of you/)).toBeInTheDocument();
  });

  it('sends what was typed', async () => {
    renderThread();
    await userEvent.type(screen.getByLabelText('Message Jan'), 'Saturday works.');
    await userEvent.click(screen.getByRole('button', { name: 'Send this message' }));
    await waitFor(() => {
      expect(db.sent).toEqual([['Saturday works.', null]]);
    });
  });

  it('keeps the words when the send is refused, and says why', async () => {
    db.sendFailure = 'new row violates row-level security policy';
    renderThread();
    const box = screen.getByLabelText('Message Jan');
    await userEvent.type(box, 'Saturday works.');
    await userEvent.click(screen.getByRole('button', { name: 'Send this message' }));
    await waitFor(() => {
      expect(screen.getByText(/row-level security/)).toBeInTheDocument();
    });
    expect(box).toHaveValue('Saturday works.');
  });

  // Enter sends here and breaks a line in a topic. Messages are short and Enter
  // is what everybody's hands already do.
  it('sends on Enter', async () => {
    renderThread();
    await userEvent.type(screen.getByLabelText('Message Jan'), 'Yes{Enter}');
    await waitFor(() => {
      expect(db.sent).toEqual([['Yes', null]]);
    });
  });

  it('says which kind of removal happened, and keeps the bubble', () => {
    db.messages = [
      message({ id: 'm1', body: '', removedAt: '2026-09-18T11:00:00Z' }),
      message({
        id: 'm2',
        body: '',
        removedAt: '2026-09-18T11:00:00Z',
        removedByAdmin: true,
      }),
    ];
    renderThread();
    expect(screen.getByText('Removed by its author.')).toBeInTheDocument();
    expect(screen.getByText('Removed by an administrator.')).toBeInTheDocument();
  });

  it('offers Remove on the viewer’s own message and not on anybody else’s', () => {
    db.messages = [message({ id: 'm1' }), message({ id: 'm2', authorId: 'me' })];
    renderThread();
    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(1);
  });

  // Unlike a topic. An administrator is in a conversation as a member of it,
  // and one they could reach as an administrator would not be private —
  // moderating that happens by an id somebody hands them, not on a screen.
  it('offers an administrator no more than anybody else here', () => {
    db.isAdmin = true;
    db.messages = [message({ id: 'm1' })];
    renderThread();
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull();
  });

  it('removes the viewer’s own message', async () => {
    db.messages = [message({ id: 'm2', authorId: 'me' })];
    renderThread();
    await userEvent.click(screen.getByRole('button', { name: /^Remove / }));
    await waitFor(() => {
      expect(db.removed).toEqual(['m2']);
    });
  });

  // Their words stay and their name does not — the owner's decision. There is
  // nobody to send to, so the composer goes rather than failing on send.
  it('replaces the composer when the other member has left the club', () => {
    db.thread = thread({ otherMemberId: null });
    db.authors = new Map();
    renderThread();
    expect(screen.getByRole('heading', { name: 'Deleted member' })).toBeInTheDocument();
    expect(screen.getByText(/This member has left the club/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send this message' })).toBeNull();
  });

  it('names a group and says how many are in it', () => {
    db.thread = thread({
      kind: 'group',
      name: 'Saturday ride',
      otherMemberId: null,
      memberCount: 6,
    });
    db.authors = new Map();
    renderThread();
    expect(screen.getByRole('heading', { name: 'Saturday ride' })).toBeInTheDocument();
    // The count is the way in to adding and leaving, so it is a link and not a
    // line of grey text.
    expect(screen.getByRole('link', { name: '6 members' })).toHaveAttribute(
      'href',
      '/chat/t/th1/members',
    );
    // A group is not a pair, so nobody has left it and the composer stays.
    expect(screen.getByRole('button', { name: 'Send this message' })).toBeInTheDocument();
  });

  it('has nothing behind the subtitle of a conversation between two people', () => {
    // A member's level is a fact about them, not a door; their profile is the
    // button already on the right of the header.
    db.thread = thread();
    renderThread();
    expect(screen.queryByRole('link', { name: /members/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Profile' })).toBeInTheDocument();
  });

  it('says a conversation cannot be shown rather than printing nothing', () => {
    db.thread = null;
    renderThread();
    expect(screen.getByText('This conversation cannot be shown.')).toBeInTheDocument();
  });
});

describe('reporting a message', () => {
  it('offers Report on theirs and Remove on yours, never both', () => {
    db.messages = [message({ id: 'm1' }), message({ id: 'm2', authorId: 'me' })];
    renderThread();
    expect(screen.getByRole('button', { name: /^Report / })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Remove / })).toBeInTheDocument();
  });

  it('offers an administrator the same two, because they are in this conversation as a member', () => {
    // Unlike a topic. The thread screen has never offered an administrator
    // anybody else's Remove — a private thread they could moderate from the
    // inside would not be private — so Report is what they have here too.
    db.isAdmin = true;
    db.messages = [message({ id: 'm1' })];
    renderThread();
    expect(screen.getByRole('button', { name: /^Report / })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull();
  });

  it("offers nothing on a deleted member's message", () => {
    db.messages = [message({ id: 'm1', authorId: null })];
    renderThread();
    expect(screen.queryByRole('button', { name: /^Report / })).toBeNull();
  });

  it('promises that nothing else in the conversation goes with it', async () => {
    db.messages = [message({ id: 'm1' })];
    renderThread();
    await userEvent.click(screen.getByRole('button', { name: /^Report / }));
    const sheet = screen.getByRole('dialog', { name: 'Report this message' });
    // The sentence a room's post does not get, and the whole point of the
    // feature: an administrator is handed one message and no way back in.
    expect(within(sheet).getByText(/Nothing else in this conversation does/)).toBeInTheDocument();
    expect(db.reports).toEqual([]);
  });

  it('sends the message id and the note, and closes once it has worked', async () => {
    db.messages = [message({ id: 'm1' })];
    renderThread();
    await userEvent.click(screen.getByRole('button', { name: /^Report / }));
    await userEvent.type(screen.getByLabelText('Anything to add'), 'He will not stop.');
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }));
    await waitFor(() => {
      expect(db.reports).toEqual([['m1', 'He will not stop.']]);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sends without a note, because demanding one is a toll', async () => {
    db.messages = [message({ id: 'm1' })];
    renderThread();
    await userEvent.click(screen.getByRole('button', { name: /^Report / }));
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }));
    await waitFor(() => {
      expect(db.reports).toEqual([['m1', '']]);
    });
  });

  it('says Reported on one already handed over', () => {
    db.messages = [message({ id: 'm1' })];
    db.reportedMessages = new Set(['m1']);
    renderThread();
    expect(screen.getByText('Reported')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Report / })).toBeNull();
  });
});

describe('editing a message', () => {
  it('is offered on the viewer’s own standing message and on nobody else’s', () => {
    db.messages = [message({ id: 'm1' }), message({ id: 'm2', authorId: 'me' })];
    renderThread();
    expect(screen.getAllByRole('button', { name: 'Edit your message' })).toHaveLength(1);
  });

  it('swaps the bubble for the composer and saves the change', async () => {
    db.messages = [message({ id: 'm2', authorId: 'me', body: 'Saturday works.' })];
    renderThread();
    await userEvent.click(screen.getByRole('button', { name: 'Edit your message' }));
    const box = screen.getByLabelText('Your message');
    expect(box).toHaveValue('Saturday works.');
    await userEvent.type(box, ' Sunday too.');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(db.edited).toEqual([['m2', 'Saturday works. Sunday too.']]);
    });
    await waitFor(() => {
      expect(screen.queryByLabelText('Your message')).toBeNull();
    });
  });

  it('keeps the draft and says why when the edit is refused', async () => {
    db.editFailure = 'Your edit was not saved. You can only edit your own message.';
    db.messages = [message({ id: 'm2', authorId: 'me', body: 'Saturday works.' })];
    renderThread();
    await userEvent.click(screen.getByRole('button', { name: 'Edit your message' }));
    await userEvent.type(screen.getByLabelText('Your message'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/only edit your own message/);
    expect(screen.getByLabelText('Your message')).toHaveValue('Saturday works.!');
  });

  it('says Edited, with the time, on an edited bubble', () => {
    db.messages = [message({ id: 'm1', editedAt: '2026-09-18T10:05:00Z' })];
    renderThread();
    expect(screen.getByText(/· Edited /)).toBeInTheDocument();
  });

  it('is not offered on a removed message, nor to an administrator on somebody else’s', () => {
    db.isAdmin = true;
    db.messages = [
      message({ id: 'm1' }),
      message({ id: 'm2', authorId: 'me', body: '', removedAt: '2026-09-18T11:00:00Z' }),
    ];
    renderThread();
    expect(screen.queryByRole('button', { name: 'Edit your message' })).toBeNull();
  });
});

describe('replying to a message', () => {
  it('offers Reply on every standing bubble, named for its author', () => {
    db.messages = [
      message({ id: 'm1' }),
      message({ id: 'm2', authorId: 'me' }),
      message({ id: 'm3', body: '', removedAt: '2026-09-18T11:00:00Z' }),
    ];
    renderThread();
    expect(screen.getByRole('button', { name: "Reply to Jan's message" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reply to your message' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Reply to/ })).toHaveLength(2);
  });

  it('says who is being answered over the composer, and sends the message with the quote', async () => {
    db.messages = [message({ id: 'm1', body: 'Which frame?' })];
    renderThread();
    await userEvent.click(screen.getByRole('button', { name: "Reply to Jan's message" }));
    expect(screen.getByText(/Replying to/)).toHaveTextContent('Replying to Jan');
    const box = screen.getByLabelText('Message Jan');
    expect(box).toHaveFocus();
    await userEvent.type(box, 'A Top End Force.{Enter}');
    await waitFor(() => {
      expect(db.sent).toEqual([['A Top End Force.', 'm1']]);
    });
    await waitFor(() => {
      expect(screen.queryByText(/Replying to/)).toBeNull();
    });
  });

  it('draws the quote over a reply, and scrolls to the quoted message when tapped', async () => {
    db.messages = [
      message({ id: 'm1', body: 'Which frame do you ride these days, the rigid or the folder?' }),
      message({ id: 'm2', authorId: 'me', body: 'The rigid.', replyTo: 'm1' }),
    ];
    renderThread();
    const quote = screen.getByRole('button', { name: /Which frame do you ride/ });
    expect(quote).toHaveTextContent('Jan');
    const target = document.getElementById('message-m1');
    if (!target) throw new Error('the quoted message should be on the page');
    const scrolled = vi.fn();
    target.scrollIntoView = scrolled;
    await userEvent.click(quote);
    expect(scrolled).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(target.querySelector('.message-flash')).not.toBeNull();
    });
  });

  it('quotes a removed message as removed, and a photograph as a photograph', () => {
    db.messages = [
      message({ id: 'm1', body: '', removedAt: '2026-09-18T11:00:00Z' }),
      message({ id: 'm2', body: '', attachments: ['threads/th1/a.webp'] }),
      message({ id: 'm3', authorId: 'me', body: 'Sorry to hear it.', replyTo: 'm1' }),
      message({ id: 'm4', authorId: 'me', body: 'Nice.', replyTo: 'm2' }),
    ];
    db.authors = new Map([['jan', jan]]);
    renderThread();
    expect(screen.getByRole('button', { name: /Removed message/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Photograph$/ })).toBeInTheDocument();
  });

  it('heads a quote of the viewer’s own message with You', () => {
    db.messages = [
      message({ id: 'm1', authorId: 'me', body: 'Mine first.' }),
      message({ id: 'm2', authorId: 'me', body: 'And again.', replyTo: 'm1' }),
    ];
    renderThread();
    expect(screen.getByRole('button', { name: /Mine first/ })).toHaveTextContent(/^You/);
  });

  it('offers no Reply once the other member has left the club', () => {
    db.thread = thread({ otherMemberId: null });
    db.messages = [message({ id: 'm1', authorId: null })];
    renderThread();
    expect(screen.queryByRole('button', { name: /^Reply to/ })).toBeNull();
  });
});

// A change to a group is recorded, not said (20260930020000): no Reply, no
// Edit, no Remove — the database refuses all three — and Report on somebody
// else's, since a hostile name is done to everybody in the group.
describe('a change to the group', () => {
  const group = () =>
    thread({ kind: 'group', name: 'Tuesday swimmers', otherMemberId: null, memberCount: 3 });

  it('is a line that says who did what, not a bubble', () => {
    db.thread = group();
    db.messages = [message({ id: 'n1', notice: 'renamed', body: 'Tuesday swimmers' })];
    renderThread();
    expect(screen.getByText(/Jan renamed the group to “Tuesday swimmers”/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reply/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Edit/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
  });

  it('can be reported when somebody else made it', async () => {
    const user = userEvent.setup();
    db.thread = group();
    db.messages = [message({ id: 'n1', notice: 'renamed', body: 'Something rude' })];
    renderThread();
    await user.click(screen.getByRole('button', { name: 'Report Jan’s change to the group' }));
    await user.click(screen.getByRole('button', { name: 'Send report' }));
    await waitFor(() => {
      expect(db.reports.map(([id]) => id)).toEqual(['n1']);
    });
  });

  it('says You, and offers nothing, on the reader’s own', () => {
    db.thread = group();
    db.messages = [message({ id: 'n1', authorId: 'me', notice: 'unpictured', body: '' })];
    renderThread();
    expect(screen.getByText(/You took the group’s picture away/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Report/ })).toBeNull();
  });

  it('shows the new picture beside the line, and in the header', () => {
    db.urls = new Map([['threads/th1/p.webp', 'https://signed/p']]);
    db.thread = { ...group(), photoPath: 'threads/th1/p.webp' };
    db.messages = [
      message({ id: 'n1', notice: 'pictured', body: '', attachments: ['threads/th1/p.webp'] }),
    ];
    renderThread();
    expect(screen.getByText(/Jan changed the group’s picture/)).toBeInTheDocument();
    const pictures = [...document.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    // Once in the header's tile, once beside the line.
    expect(pictures.filter((src) => src === 'https://signed/p')).toHaveLength(2);
  });
});
