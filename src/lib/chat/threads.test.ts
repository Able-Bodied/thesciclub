import { describe, expect, it } from 'vitest';
import { FOLLOW_SCROLL_SLACK, shouldFollowScroll, threadTitle } from '@/lib/chat/threads';
import type { ChatThread } from '@/lib/chat/types';

/**
 * The pure half of threads.ts. Nothing here touches supabase, so nothing here
 * is mocked — the hooks in the same file are exercised by the screens.
 */

const thread = (o: Partial<ChatThread> = {}): ChatThread => ({
  id: 't1',
  kind: 'direct',
  name: null,
  eventId: null,
  createdAt: '2026-09-01T10:00:00Z',
  lastMessageAt: '2026-09-01T10:00:00Z',
  memberCount: 2,
  otherMemberId: 'other',
  lastBody: 'Hello.',
  lastAuthorId: 'other',
  lastAt: '2026-09-01T10:00:00Z',
  lastRemoved: false,
  unread: false,
  ...o,
});

describe('threadTitle', () => {
  it('calls a direct conversation by the other member’s name', () => {
    expect(threadTitle(thread(), 'Jan')).toBe('Jan');
  });

  it('calls a group by its name', () => {
    expect(threadTitle(thread({ kind: 'group', name: 'Saturday ride' }), null)).toBe(
      'Saturday ride',
    );
  });

  it('says Former member when the other half has left the club', () => {
    // Their words stay and their name does not — the owner's decision. The
    // roster row goes with the member, so a null other member is the fact.
    expect(threadTitle(thread({ otherMemberId: null }), null)).toBe('Former member');
  });

  it('says nothing at all while the name is still loading', () => {
    // Not "Unknown". The name is about to arrive, and a row that says Unknown
    // and then says Jan has told the reader something untrue on the way.
    expect(threadTitle(thread(), null)).toBe('');
  });
});

describe('shouldFollowScroll', () => {
  it('follows a new message when the reader is at the bottom', () => {
    expect(shouldFollowScroll(0)).toBe(true);
    expect(shouldFollowScroll(FOLLOW_SCROLL_SLACK)).toBe(true);
  });

  it('leaves somebody who has scrolled up where they are', () => {
    // A reader partway up is reading something. Yanking them down takes the
    // page away mid-sentence; the pill is what brings them back.
    expect(shouldFollowScroll(FOLLOW_SCROLL_SLACK + 1)).toBe(false);
    expect(shouldFollowScroll(900)).toBe(false);
  });
});
