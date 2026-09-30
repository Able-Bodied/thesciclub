import { describe, expect, it } from 'vitest';
import {
  FOLLOW_SCROLL_SLACK,
  noticeText,
  QUOTE_LENGTH,
  quoteText,
  shouldFollowScroll,
  threadTitle,
} from '@/lib/chat/threads';
import type { ChatMessage, ChatThread } from '@/lib/chat/types';

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
  photoPath: null,
  lastNotice: null,
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

describe('quoteText', () => {
  const message = (o: Partial<ChatMessage> = {}): ChatMessage => ({
    id: 'm1',
    threadId: 'th1',
    authorId: 'jan',
    body: 'Which frame do you ride?',
    attachments: [],
    createdAt: '2026-09-18T10:00:00Z',
    removedAt: null,
    removedByAdmin: false,
    editedAt: null,
    replyTo: null,
    notice: null,
    ...o,
  });

  it('is the words, whole when they are short', () => {
    expect(quoteText(message())).toBe('Which frame do you ride?');
  });

  it('cuts long words short and says so, with line breaks flattened', () => {
    const long = message({ body: `${'a'.repeat(70)}\n\n${'b'.repeat(70)}` });
    const quote = quoteText(long);
    expect(quote.endsWith('…')).toBe(true);
    expect(quote.length).toBeLessThanOrEqual(QUOTE_LENGTH + 1);
    expect(quote).not.toContain('\n');
  });

  // The quote stays over a reply to a message that has been taken back: the
  // reply still answers something, and a gap with a reason reads better than
  // a quote that silently disappears.
  it('says Removed message for one that has been taken back', () => {
    expect(quoteText(message({ body: '', removedAt: '2026-09-18T11:00:00Z' }))).toBe(
      'Removed message',
    );
  });

  it('says Photograph for one that was a picture alone', () => {
    expect(quoteText(message({ body: '', attachments: ['threads/th1/a.webp'] }))).toBe(
      'Photograph',
    );
  });

  it('says Earlier message for one that is not in the list', () => {
    expect(quoteText(undefined)).toBe('Earlier message');
  });
});

// One wording for a change to the group, in the conversation and the list.
describe('noticeText', () => {
  it('says who renamed the group and to what', () => {
    expect(noticeText('renamed', 'Jan', 'Tuesday swimmers')).toBe(
      'Jan renamed the group to “Tuesday swimmers”',
    );
  });

  // In the list the new name is already the row's title.
  it('leaves the new name out where the caller asks it to', () => {
    expect(noticeText('renamed', 'You', 'Tuesday swimmers', false)).toBe('You renamed the group');
  });

  it('says a picture changed, or was taken away, and by whom', () => {
    expect(noticeText('pictured', 'A former member', '')).toBe(
      'A former member changed the group’s picture',
    );
    expect(noticeText('unpictured', 'Jan', '')).toBe('Jan took the group’s picture away');
  });
});
