import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ChatAuthor, ChatThread } from '@/lib/chat/types';
import { ThreadRow } from '@/routes/chat/thread-row';

vi.mock('@/components/member-avatar', () => ({
  MemberAvatar: () => null,
  GroupAvatar: () => null,
  FormerMemberAvatar: () => null,
}));

const thread = (o: Partial<ChatThread> = {}): ChatThread => ({
  id: 't1',
  kind: 'direct',
  name: null,
  eventId: null,
  createdAt: '2026-09-18T09:00:00Z',
  lastMessageAt: '2026-09-18T10:00:00Z',
  memberCount: 2,
  otherMemberId: 'jan',
  lastBody: 'See you Saturday.',
  lastAuthorId: 'jan',
  lastAt: '2026-09-18T10:00:00Z',
  lastRemoved: false,
  unread: false,
  photoPath: null,
  lastNotice: null,
  ...o,
});

const jan = (o: Partial<ChatAuthor> = {}): ChatAuthor => ({
  id: 'jan',
  displayName: 'Jan',
  username: 'jan.k',
  photoPath: null,
  photoAlt: null,
  avatarColor: null,
  level: 'T4 complete',
  isAdmin: false,
  hasProfile: true,
  ...o,
});

function renderRow(props: Partial<Parameters<typeof ThreadRow>[0]> = {}) {
  return render(
    <MemoryRouter>
      <ThreadRow thread={thread()} other={jan()} lastAuthor={jan()} viewerId="me" {...props} />
    </MemoryRouter>,
  );
}

describe('a conversation in the list', () => {
  it('names the other person’s @username beside their level', () => {
    renderRow();
    expect(screen.getByText('@jan.k · T4 complete')).toBeInTheDocument();
  });

  it('shows the level alone for a member without a username', () => {
    renderRow({ other: jan({ username: null }) });
    expect(screen.getByText('T4 complete')).toBeInTheDocument();
    expect(screen.queryByText(/@/)).toBeNull();
  });

  it('keeps a group’s line as its member count', () => {
    renderRow({ thread: thread({ kind: 'group', name: 'Ride', memberCount: 4 }), other: null });
    expect(screen.getByText('4 members')).toBeInTheDocument();
  });
});
