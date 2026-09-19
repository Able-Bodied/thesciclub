import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  sent: [] as string[],
  sendFailure: null as string | null,
  removed: [] as string[],
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
    send: (body: string) => {
      db.sent.push(body);
      return Promise.resolve(db.sendFailure);
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
  ...o,
});

const message = (o: Partial<ChatMessage> & { id: string }): ChatMessage => ({
  threadId: 'th1',
  authorId: 'jan',
  body: 'Something.',
  createdAt: '2026-09-18T10:00:00Z',
  removedAt: null,
  removedByAdmin: false,
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
  db.removed = [];
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
      expect(db.sent).toEqual(['Saturday works.']);
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
      expect(db.sent).toEqual(['Yes']);
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
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(1);
  });

  // Unlike a topic. An administrator is in a conversation as a member of it,
  // and one they could reach as an administrator would not be private —
  // moderating that happens by an id somebody hands them, not on a screen.
  it('offers an administrator no more than anybody else here', () => {
    db.isAdmin = true;
    db.messages = [message({ id: 'm1' })];
    renderThread();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('removes the viewer’s own message', async () => {
    db.messages = [message({ id: 'm2', authorId: 'me' })];
    renderThread();
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
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
    expect(screen.getByRole('heading', { name: 'Former member' })).toBeInTheDocument();
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
    expect(screen.getByText('6 members')).toBeInTheDocument();
    // A group is not a pair, so nobody has left it and the composer stays.
    expect(screen.getByRole('button', { name: 'Send this message' })).toBeInTheDocument();
  });

  it('says a conversation cannot be shown rather than printing nothing', () => {
    db.thread = null;
    renderThread();
    expect(screen.getByText('This conversation cannot be shown.')).toBeInTheDocument();
  });
});
