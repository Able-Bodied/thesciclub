import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { ChatReport } from '@/lib/chat/types';
import { ReportsSection } from '@/routes/admin/reports-section';

/**
 * The network calls are stubbed. `chatTimeLong` is left real — it is the one
 * formatter and a stub of it would let this file assert its own dates.
 */

const api = vi.hoisted(() => ({
  resolved: [] as [string, string][],
  removedPosts: [] as string[],
  removedMessages: [] as string[],
  failWith: null as string | null,
}));

vi.mock('@/lib/chat/reports', () => ({
  resolveReport: (id: string, resolution: string) => {
    if (api.failWith) return Promise.resolve({ ok: false as const, error: api.failWith });
    api.resolved.push([id, resolution]);
    return Promise.resolve({ ok: true as const, value: null });
  },
}));

// has_profile only. The panel takes both names from the report itself; this
// decides whether a name opens the profile or the member's row.
const authorsById = vi.hoisted(() => new Map<string, { hasProfile: boolean }>());
vi.mock('@/lib/chat/authors', () => ({
  useChatAuthors: () => authorsById,
}));

vi.mock('@/lib/chat/topics', () => ({
  removePost: (id: string) => {
    api.removedPosts.push(id);
    return Promise.resolve({ ok: true as const, value: null });
  },
}));

vi.mock('@/lib/chat/threads', () => ({
  removeMessage: (id: string) => {
    api.removedMessages.push(id);
    return Promise.resolve({ ok: true as const, value: null });
  },
}));

const report = (o: Partial<ChatReport> & { id: string }): ChatReport => ({
  kind: 'message',
  contextKind: 'direct',
  postId: null,
  messageId: 'm1',
  bodySnapshot: 'Buy my miracle supplement, cash only.',
  writtenAt: '2026-09-18T10:00:00Z',
  place: 'A direct conversation',
  topicId: null,
  roomId: null,
  note: null,
  createdAt: '2026-09-18T11:00:00Z',
  reporterId: 'ada',
  reporterName: 'Ada',
  reportedAuthorId: 'bo',
  reportedAuthorName: 'Bo',
  reportCount: 1,
  alreadyRemoved: false,
  resolvedAt: null,
  resolvedBy: null,
  resolvedByName: null,
  resolution: null,
  ...o,
});

let confirmSpy: MockInstance<typeof window.confirm>;
const went: string[] = [];
let reloads = 0;

function renderSection(reports: ChatReport[], o: { loading?: boolean; error?: string } = {}) {
  return render(
    <MemoryRouter>
      <ReportsSection
        reports={reports}
        loading={o.loading ?? false}
        error={o.error ?? null}
        reload={() => {
          reloads += 1;
        }}
        onGoToMember={(id) => {
          went.push(id);
        }}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  api.resolved = [];
  api.removedPosts = [];
  api.removedMessages = [];
  api.failWith = null;
  went.length = 0;
  reloads = 0;
  authorsById.clear();
  authorsById.set('ada', { hasProfile: true });
  authorsById.set('bo', { hasProfile: true });
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('the reports panel', () => {
  it('shows the words, where they were said and both names', () => {
    renderSection([report({ id: 'r1', note: 'He keeps doing it.' })]);
    expect(screen.getByText('Buy my miracle supplement, cash only.')).toBeInTheDocument();
    expect(screen.getByText(/A direct conversation/)).toBeInTheDocument();
    expect(screen.getByText('Bo')).toBeInTheDocument();
    // The name is its own element now that it is a link, so the sentence is
    // read as a whole rather than as one text node.
    expect(screen.getByText('Ada').closest('p')).toHaveTextContent(/Reported by Ada on/);
    expect(screen.getByText(/He keeps doing it/)).toBeInTheDocument();
  });

  it('offers no way into a conversation, only into a room', () => {
    // The whole point of the shape. admin_chat_reports() returns no thread id,
    // so there is nothing here to build a link out of — and a post, which a
    // member could already read, gets one.
    renderSection([report({ id: 'r1' })]);
    expect(screen.queryByRole('link', { name: 'Open the topic' })).toBeNull();
  });

  it('opens the topic a reported post is in', () => {
    renderSection([
      report({
        id: 'r1',
        kind: 'post',
        postId: 'p1',
        messageId: null,
        topicId: 't1',
        roomId: 'bowel',
        place: 'Bowel management › What fits in a rucksack',
      }),
    ]);
    expect(screen.getByRole('link', { name: 'Open the topic' })).toHaveAttribute(
      'href',
      '/chat/rooms/bowel/topics/t1',
    );
  });

  it('offers no strike control, because that decision lives on the member row', () => {
    // A second strike button on a screen showing one message out of context is
    // how somebody gets struck for a sentence. "Go to Bo" is the link instead.
    renderSection([report({ id: 'r1' })]);
    expect(screen.queryByRole('button', { name: /strike/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Go to Bo' })).toBeInTheDocument();
  });

  it('hands the member id back rather than acting on it', async () => {
    renderSection([report({ id: 'r1' })]);
    await userEvent.click(screen.getByRole('button', { name: 'Go to Bo' }));
    expect(went).toEqual(['bo']);
  });

  it('removes a group message by its id, after confirming', async () => {
    renderSection([
      report({ id: 'r1', messageId: 'm7', contextKind: 'group', place: 'Saturday ride' }),
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Remove the message' }));
    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(api.removedMessages).toEqual(['m7']);
    });
    // Re-read, so the row stops offering to remove what is already gone.
    expect(reloads).toBe(1);
  });

  // The owner's call: removing a direct message protects nobody who has not
  // already read it, and the remedy is on the member's row. The row says so
  // rather than leaving a gap where a control would be.
  it('offers no Remove for a direct message, and says why', () => {
    renderSection([report({ id: 'r1' })]);
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
    expect(screen.queryByText('Already removed')).toBeNull();
    expect(screen.getByText(/A direct message is not removed from here/)).toBeInTheDocument();
    // The other controls are still there.
    expect(screen.getByRole('button', { name: 'Go to Bo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settle it' })).toBeInTheDocument();
  });

  it('says nothing about direct messages on a group or room report', () => {
    renderSection([report({ id: 'r1', contextKind: 'group', place: 'Saturday ride' })]);
    expect(screen.queryByText(/A direct message is not removed from here/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove the message' })).toBeInTheDocument();
  });

  it('links both names to their profiles when they have one', () => {
    renderSection([report({ id: 'r1' })]);
    expect(screen.getByRole('link', { name: 'Bo' })).toHaveAttribute('href', '/peers/bo');
    expect(screen.getByRole('link', { name: 'Ada' })).toHaveAttribute('href', '/peers/ada');
  });

  // /peers/:id is built on browse_members, which does not know a hidden member
  // exists. Their row on this screen does.
  it('sends a name to the member row instead when they are hidden from Peers', async () => {
    authorsById.set('bo', { hasProfile: false });
    renderSection([report({ id: 'r1' })]);
    expect(screen.queryByRole('link', { name: 'Bo' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Bo' }));
    expect(went).toEqual(['bo']);
  });

  it('removes a reported post through the post function, not the message one', async () => {
    renderSection([
      report({
        id: 'r1',
        kind: 'post',
        contextKind: 'room',
        postId: 'p7',
        messageId: null,
        place: 'Bowel management › What fits in a rucksack',
      }),
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Remove the post' }));
    await waitFor(() => {
      expect(api.removedPosts).toEqual(['p7']);
    });
    expect(api.removedMessages).toEqual([]);
  });

  it('says so rather than offering to remove something already gone', () => {
    renderSection([report({ id: 'r1', contextKind: 'group', alreadyRemoved: true })]);
    expect(screen.getByText('Already removed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
  });

  it('will not settle a report without a sentence', async () => {
    renderSection([report({ id: 'r1' })]);
    await userEvent.click(screen.getByRole('button', { name: 'Settle it' }));
    const settle = screen.getByRole('button', { name: 'Settle it' });
    expect(settle).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/What was decided/), 'Removed it and spoke to Bo.');
    await userEvent.click(settle);
    await waitFor(() => {
      expect(api.resolved).toEqual([['r1', 'Removed it and spoke to Bo.']]);
    });
  });

  it('keeps what was decided, below, instead of deleting it', () => {
    renderSection([
      report({
        id: 'r1',
        resolvedAt: '2026-09-19T09:00:00Z',
        resolvedByName: 'Admin A',
        resolution: 'Spoke to Bo. First time.',
      }),
    ]);
    const settled = screen.getByText(/Admin A settled this/);
    expect(settled).toBeInTheDocument();
    expect(within(settled).getByText('Spoke to Bo. First time.')).toBeInTheDocument();
    // Settled ones are not waiting.
    expect(screen.getByText('nothing waiting')).toBeInTheDocument();
  });

  it('counts a second reporter and says nothing about the first', () => {
    // "1 member reported this" is a sentence saying what the row already says.
    renderSection([report({ id: 'r1', reportCount: 1 })]);
    expect(screen.queryByText(/reported this/)).toBeNull();
  });

  it('says how many reported the same thing once there is more than one', () => {
    renderSection([report({ id: 'r1', reportCount: 3 })]);
    expect(screen.getByText(/3 members reported this/)).toBeInTheDocument();
  });

  it('names somebody who has since left the club rather than printing nothing', () => {
    renderSection([
      report({
        id: 'r1',
        reportedAuthorId: null,
        reportedAuthorName: null,
        reporterId: null,
        reporterName: null,
      }),
    ]);
    expect(screen.getByText('Former member')).toBeInTheDocument();
    expect(screen.getByText(/Reported by a former member/)).toBeInTheDocument();
    // Nobody to go to.
    expect(screen.queryByRole('button', { name: /^Go to/ })).toBeNull();
  });

  it('invites nothing when there is nothing, rather than showing an empty frame', () => {
    renderSection([]);
    expect(screen.getByText(/Nothing has been reported/)).toBeInTheDocument();
  });
});
