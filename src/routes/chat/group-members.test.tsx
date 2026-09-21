import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Router from 'react-router-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Groups from '@/lib/chat/groups';
import type * as Threads from '@/lib/chat/threads';
import type { ChatAuthor, ChatThread } from '@/lib/chat/types';
import { makeMember } from '@/test/factory';
import type { BrowseMember } from '@/types/domain';

/**
 * Who is in a group, adding to it, and leaving it.
 *
 * The one thing this screen must not grow is a way to remove somebody else:
 * the delete policy is own-row-only and there is no function that evicts, so a
 * control for it would be a refusal drawn as a button.
 */

const db = vi.hoisted(() => ({
  threads: [] as ChatThread[],
  roster: [] as string[],
  authors: new Map<string, ChatAuthor>(),
  members: [] as BrowseMember[],
  added: [] as [string, string][],
  addFailure: null as string | null,
  left: [] as [string, string][],
  navigated: [] as string[],
  reloaded: 0,
}));

vi.mock('@/lib/account', () => ({
  useAccount: () => ({ status: 'member', userId: 'me', isAdmin: false, displayName: 'Alex' }),
}));

vi.mock('@/lib/members', () => ({
  useBrowseMembers: () => ({ members: db.members, loading: false, error: null, signedOut: false }),
}));

vi.mock('@/lib/chat/authors', () => ({
  useChatAuthors: () => db.authors,
}));

vi.mock('@/lib/chat/threads', async (importOriginal) => ({
  ...(await importOriginal<typeof Threads>()),
  useMyThreads: () => ({ threads: db.threads, loading: false, error: null, reload: vi.fn() }),
}));

vi.mock('@/lib/chat/groups', async (importOriginal) => ({
  ...(await importOriginal<typeof Groups>()),
  useThreadRoster: () => ({
    memberIds: db.roster,
    loading: false,
    error: null,
    reload: () => {
      db.reloaded += 1;
    },
  }),
  addToGroup: (threadId: string, memberId: string) => {
    db.added.push([threadId, memberId]);
    return Promise.resolve(
      db.addFailure ? { ok: false, error: db.addFailure } : { ok: true, value: null },
    );
  },
  leaveGroup: (threadId: string, memberId: string) => {
    db.left.push([threadId, memberId]);
    return Promise.resolve({ ok: true, value: null });
  },
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof Router>()),
  useNavigate: () => (to: string) => {
    db.navigated.push(to);
  },
}));

const { default: GroupMembersPage } = await import('@/routes/chat/group-members');

const author = (o: Partial<ChatAuthor> = {}): ChatAuthor => ({
  id: 'jan',
  displayName: 'Jan',
  photoPath: null,
  photoAlt: null,
  avatarColor: null,
  level: 'T4',
  isAdmin: false,
  hasProfile: true,
  ...o,
});

const thread = (o: Partial<ChatThread> = {}): ChatThread => ({
  id: 'g1',
  kind: 'group',
  name: 'Saturday ride',
  eventId: null,
  createdAt: '2026-09-01T10:00:00Z',
  lastMessageAt: '2026-09-01T10:00:00Z',
  memberCount: 3,
  otherMemberId: null,
  lastBody: null,
  lastAuthorId: null,
  lastAt: null,
  lastRemoved: false,
  unread: false,
  ...o,
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/chat/t/g1/members']}>
      <Routes>
        <Route path="/chat/t/:threadId/members" element={<GroupMembersPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  db.threads = [thread()];
  db.roster = ['me', 'jan'];
  db.authors = new Map([
    ['me', author({ id: 'me', displayName: 'Alex' })],
    ['jan', author()],
  ]);
  db.members = [
    makeMember({ id: 'me', displayName: 'Alex' }),
    makeMember({ id: 'jan', displayName: 'Jan' }),
    makeMember({ id: 'bo', displayName: 'Bo' }),
  ];
  db.added = [];
  db.addFailure = null;
  db.left = [];
  db.navigated = [];
  db.reloaded = 0;
});

describe('who is in a group', () => {
  it('names everybody in it and marks which one is the reader', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: '2 members' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Jan' })).toHaveAttribute('href', '/peers/jan');
    expect(screen.getByText('— you')).toBeInTheDocument();
  });

  it('offers no way to put anybody else out', () => {
    // There is no function that evicts and the delete policy is own-row-only,
    // so a Remove here would be a refusal drawn as a button.
    renderPage();
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull();
  });

  it('does not offer to add somebody already in it', () => {
    renderPage();
    expect(screen.queryByRole('checkbox', { name: /Jan/ })).toBeNull();
    expect(screen.getByRole('checkbox', { name: /Bo/ })).toBeInTheDocument();
  });

  it('adds who was picked and reads the roster back', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('checkbox', { name: /Bo/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Add 1 member' }));
    await waitFor(() => {
      expect(db.added).toEqual([['g1', 'bo']]);
    });
    // Not spliced in optimistically: the roster the database has is the one
    // this screen is about.
    expect(db.reloaded).toBe(1);
  });

  it('says why an add was refused', async () => {
    db.addFailure = 'That member cannot be added to a group.';
    renderPage();
    await userEvent.click(screen.getByRole('checkbox', { name: /Bo/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Add 1 member' }));
    expect(await screen.findByText('That member cannot be added to a group.')).toBeInTheDocument();
  });

  it('asks before leaving, and says what leaving costs', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Leave this group' }));
    expect(db.left).toEqual([]);
    expect(screen.getByText(/stop being able to read this conversation/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Leave the group' }));
    await waitFor(() => {
      expect(db.left).toEqual([['g1', 'me']]);
    });
    // Replacing, so the back button does not land on a thread that no longer
    // loads for them.
    expect(db.navigated).toEqual(['/chat']);
  });

  it('lets somebody change their mind about leaving', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Leave this group' }));
    await userEvent.click(screen.getByRole('button', { name: 'Stay in it' }));
    expect(screen.getByRole('button', { name: 'Leave this group' })).toBeInTheDocument();
    expect(db.left).toEqual([]);
  });

  it('adds nobody by hand to an event’s group, and says why', () => {
    db.threads = [thread({ eventId: 'ev1' })];
    renderPage();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByText(/can join from the event/)).toBeInTheDocument();
    // Leaving is still theirs to do.
    expect(screen.getByRole('button', { name: 'Leave this group' })).toBeInTheDocument();
  });

  it('has nothing to manage for a conversation between two people', () => {
    db.threads = [thread({ kind: 'direct', name: null, otherMemberId: 'jan' })];
    renderPage();
    expect(screen.getByText(/no members to manage/)).toBeInTheDocument();
  });
});
