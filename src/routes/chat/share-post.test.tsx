import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SharedPosts from '@/lib/chat/shared-posts';
import type { ShareTarget } from '@/lib/chat/shared-posts';
import type * as Threads from '@/lib/chat/threads';
import type { ChatAuthor, ChatThread } from '@/lib/chat/types';
import type * as Members from '@/lib/members';
import { makeMember } from '@/test/factory';
import type { BrowseMember } from '@/types/domain';

const db = vi.hoisted(() => ({
  threads: [] as ChatThread[],
  members: [] as BrowseMember[],
  shared: [] as { postId: string; target: ShareTarget; authorId: string; line: string }[],
  failure: null as string | null,
}));

vi.mock('@/lib/account', () => ({
  useAccount: () => ({ status: 'member', userId: 'me', isAdmin: false, displayName: 'Me' }),
}));
vi.mock('@/lib/chat/threads', async (importOriginal) => ({
  ...(await importOriginal<typeof Threads>()),
  useMyThreads: () => ({
    threads: db.threads,
    loading: false,
    error: null,
    reload: () => undefined,
  }),
}));
vi.mock('@/lib/chat/authors', () => ({
  useChatAuthors: () =>
    new Map<string, ChatAuthor>([
      [
        'jan',
        {
          id: 'jan',
          displayName: 'Jan',
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
vi.mock('@/lib/members', async (importOriginal) => ({
  ...(await importOriginal<typeof Members>()),
  useBrowseMembers: () => ({ members: db.members, loading: false, error: null, signedOut: false }),
}));
vi.mock('@/lib/chat/shared-posts', async (importOriginal) => ({
  ...(await importOriginal<typeof SharedPosts>()),
  sharePost: (postId: string, target: ShareTarget, authorId: string, line: string) => {
    db.shared.push({ postId, target, authorId, line });
    if (db.failure) return Promise.resolve({ ok: false, error: db.failure });
    const threadId = 'threadId' in target ? target.threadId : `thread-${target.memberId}`;
    return Promise.resolve({ ok: true, threadId });
  },
}));
vi.mock('@/components/member-avatar', () => ({
  MemberAvatar: () => null,
  GroupAvatar: () => null,
}));

const { SharePostButton } = await import('@/routes/chat/share-post');

function Where() {
  return <p>at {useLocation().pathname}</p>;
}

function renderButton() {
  return render(
    <MemoryRouter initialEntries={['/chat/rooms/general/topics/t1']}>
      <Routes>
        <Route
          path="/chat/rooms/general/topics/t1"
          element={<SharePostButton postId="p1" words="Which **cushion** do you use?" />}
        />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

const thread = (o: Partial<ChatThread>): ChatThread => ({
  id: 'th1',
  kind: 'direct',
  name: null,
  eventId: null,
  createdAt: '2026-10-20T09:00:00Z',
  lastMessageAt: '2026-10-20T10:00:00Z',
  memberCount: 2,
  otherMemberId: 'jan',
  lastBody: 'Hello.',
  lastAuthorId: 'jan',
  lastAt: '2026-10-20T10:00:00Z',
  lastRemoved: false,
  unread: false,
  photoPath: null,
  lastNotice: null,
  ...o,
});

beforeEach(() => {
  db.threads = [
    thread({ id: 'dm-jan' }),
    thread({ id: 'grp', kind: 'group', name: 'Wheel fixers', otherMemberId: null, memberCount: 5 }),
    // Somebody who has left: nobody to send to.
    thread({ id: 'dm-gone', otherMemberId: null }),
  ];
  db.members = [
    makeMember({ id: 'me', displayName: 'Me' }),
    makeMember({ id: 'sam', displayName: 'Sam', username: 'wheels' }),
  ];
  db.shared = [];
  db.failure = null;
});

describe('sharing a post into a conversation', () => {
  it('is a button named for the post, opening a sheet with its heading focused', async () => {
    const user = userEvent.setup();
    renderButton();
    await user.click(
      screen.getByRole('button', {
        name: 'Share “Which cushion do you use?” in a conversation',
      }),
    );
    const sheet = screen.getByRole('dialog', { name: 'Share post' });
    expect(within(sheet).getByRole('heading', { name: 'Share post' })).toHaveFocus();
  });

  it('lists the conversations as choices, and not one with nobody left in it', async () => {
    const user = userEvent.setup();
    renderButton();
    await user.click(screen.getByRole('button', { name: /^Share / }));
    const choices = within(screen.getByRole('group', { name: 'Send to' })).getAllByRole('radio');
    expect(choices.map((c) => c.closest('label')?.textContent)).toEqual([
      'JanDirect message',
      'Wheel fixersGroup · 5 members',
    ]);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('sends to the chosen group with a line, and offers the conversation after', async () => {
    const user = userEvent.setup();
    renderButton();
    await user.click(screen.getByRole('button', { name: /^Share / }));
    await user.click(screen.getByRole('radio', { name: /Wheel fixers/ }));
    await user.type(screen.getByRole('textbox', { name: 'Add a message (optional)' }), 'Look');
    await user.click(screen.getByRole('button', { name: 'Send to Wheel fixers' }));
    expect(db.shared).toEqual([
      { postId: 'p1', target: { threadId: 'grp' }, authorId: 'me', line: 'Look' },
    ]);
    await waitFor(() => {
      expect(screen.getByText('Shared with Wheel fixers.')).toHaveFocus();
    });
    await user.click(screen.getByRole('link', { name: 'Go to the conversation' }));
    expect(screen.getByText('at /chat/t/grp')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('starts a direct conversation with somebody else', async () => {
    const user = userEvent.setup();
    renderButton();
    await user.click(screen.getByRole('button', { name: /^Share / }));
    const more = screen.getByRole('button', { name: 'Someone else' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await user.click(more);
    expect(screen.queryByRole('radio', { name: /^Me/ })).toBeNull();
    await user.type(screen.getByRole('textbox', { name: 'Narrow the list by name' }), '@wheel');
    await user.click(screen.getByRole('radio', { name: /Sam/ }));
    await user.click(screen.getByRole('button', { name: 'Send to Sam' }));
    expect(db.shared[0]?.target).toEqual({ memberId: 'sam' });
    expect(db.shared[0]?.line).toBe('');
    expect(await screen.findByText('Shared with Sam.')).toBeInTheDocument();
  });

  it('says why when the database refuses, and keeps the choice', async () => {
    const user = userEvent.setup();
    db.failure = "You can't message this member.";
    renderButton();
    await user.click(screen.getByRole('button', { name: /^Share / }));
    await user.click(screen.getByRole('radio', { name: /Jan/ }));
    await user.click(screen.getByRole('button', { name: 'Send to Jan' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("You can't message this member.");
    expect(screen.getByRole('radio', { name: /Jan/ })).toBeChecked();
  });

  it('closes on Escape, giving focus back to Share', async () => {
    const user = userEvent.setup();
    renderButton();
    const share = screen.getByRole('button', { name: /^Share / });
    await user.click(share);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(share).toHaveFocus();
  });
});
