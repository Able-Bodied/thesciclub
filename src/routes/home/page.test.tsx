import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Attachments from '@/lib/chat/attachments';
import type * as ChatRooms from '@/lib/chat/rooms';
import type * as Threads from '@/lib/chat/threads';
import type { ChatAuthor, ChatPost, ChatRoom, ChatThread } from '@/lib/chat/types';
import type * as HomeTopics from '@/lib/home/topics';
import type { HomeTopicSummary } from '@/lib/home/types';
import { makeEvent, makeMember, makePost, makeRoom } from '@/test/factory';
import type { BrowseMember, ClubEvent, RsvpStatus } from '@/types/domain';

/**
 * Home, with every hook that reads the database stubbed and every pure
 * function real: `toHomeTopics`, `pickEvents`, `suggestPeople`, `buildFeed`
 * and `inSegment` decide what is on screen here exactly as they do in the
 * app. The order of the mix is their own tests' business, not this file's.
 */

const db = vi.hoisted(() => ({
  topics: [] as HomeTopicSummary[],
  posts: [] as ChatPost[],
  topicsLoading: false,
  topicsError: null as string | null,
  rooms: [] as ChatRoom[],
  events: [] as ClubEvent[],
  eventsLoading: false,
  eventsError: null as string | null,
  rsvps: new Map<string, RsvpStatus>(),
  members: [] as BrowseMember[],
  membersLoading: false,
  membersError: null as string | null,
  threads: [] as ChatThread[],
  authors: new Map<string, ChatAuthor>(),
  setRsvp: vi.fn(),
  reload: vi.fn(),
}));

vi.mock('@/lib/home/topics', async (importOriginal) => ({
  ...(await importOriginal<typeof HomeTopics>()),
  useHomeTopics: () => ({
    topics: db.topics,
    posts: db.posts,
    loading: db.topicsLoading,
    error: db.topicsError,
  }),
}));

vi.mock('@/lib/chat/rooms', async (importOriginal) => ({
  ...(await importOriginal<typeof ChatRooms>()),
  useChatRooms: () => ({ rooms: db.rooms, loading: false, error: null, reload: () => undefined }),
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
  useChatAuthors: () => db.authors,
}));

// Photographs are signed under the reader's token: a storage call.
vi.mock('@/lib/chat/attachments', async (importOriginal) => ({
  ...(await importOriginal<typeof Attachments>()),
  useAttachmentUrls: (paths: readonly string[]) =>
    new Map(paths.map((path) => [path, `https://signed/${path}`])),
}));

vi.mock('@/lib/events', () => ({
  useEvents: () => ({ events: db.events, loading: db.eventsLoading, error: db.eventsError }),
  useAttendeesByEvent: () => ({ byEvent: new Map(), loading: false, error: null }),
  useViewerEvents: () => ({ rsvps: db.rsvps, loading: false, error: null, reload: db.reload }),
  setRsvp: (...args: unknown[]): Promise<{ ok: boolean; error?: string }> =>
    db.setRsvp(...args) as Promise<{ ok: boolean; error?: string }>,
}));

vi.mock('@/lib/organizations', () => ({
  useOrganizations: () => ({ organizations: [], byId: new Map(), loading: false, error: null }),
}));

vi.mock('@/lib/members', () => ({
  useBrowseMembers: () => ({
    members: db.members,
    loading: db.membersLoading,
    error: db.membersError,
    signedOut: false,
  }),
}));

vi.mock('@/lib/session', () => ({
  useSession: () => ({ status: 'signed-in', userId: 'me' }),
}));

const { default: HomePage } = await import('@/routes/home/page');

function soon(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
}

const summary = (o: Partial<HomeTopicSummary> & { id: string }): HomeTopicSummary => ({
  roomId: 'bowel',
  title: `Topic ${o.id}`,
  authorId: 'alex',
  createdAt: soon(-1),
  lastPostAt: soon(-1),
  replyCount: 0,
  ...o,
});

function Where() {
  const location = useLocation();
  return (
    <p>
      at {location.pathname}
      {location.search} with {JSON.stringify(location.state)}
    </p>
  );
}

function renderPage(entry = '/home') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/home" element={<HomePage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** The feed, as the list a screen reader announces. */
const feed = () => within(screen.getByRole('list', { name: '' })).getAllByRole('listitem');

beforeEach(() => {
  db.rooms = [
    makeRoom({ id: 'bowel', name: 'Bowel management' }),
    makeRoom({ id: 'skin', name: 'Skin & pressure sores', openedAt: null }),
  ];
  db.topics = [
    summary({ id: 'plain', title: 'Morning or evening routine?', lastPostAt: soon(-1) }),
    summary({ id: 'photo', title: 'Wheel covers I made', lastPostAt: soon(-2) }),
    // Only an administrator can read this one. Nobody should see it on Home.
    summary({ id: 'closed', roomId: 'skin', title: 'Seeded in a closed room' }),
  ];
  db.posts = [
    makePost({ topicId: 'plain', body: 'Evenings for six years.' }),
    makePost({ topicId: 'photo', body: '', attachments: ['rooms/bowel/a.webp'] }),
    makePost({ topicId: 'closed' }),
  ];
  db.topicsLoading = false;
  db.topicsError = null;
  db.events = [makeEvent({ id: 'swim', title: 'Adaptive swim night', startTime: soon(3) })];
  db.eventsLoading = false;
  db.eventsError = null;
  db.rsvps = new Map();
  db.members = [
    makeMember({ id: 'me', displayName: 'Alex' }),
    makeMember({ id: 'kerry', displayName: 'Kerry' }),
  ];
  db.membersLoading = false;
  db.membersError = null;
  db.threads = [];
  db.authors = new Map();
  db.setRsvp = vi.fn().mockResolvedValue({ ok: true });
  db.reload = vi.fn();
});

describe('Home', () => {
  it('has exactly one h1, and it says Home', () => {
    renderPage();
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('Home');
  });

  it('lists topics, photographs, events and people under Everything', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Morning or evening routine?' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Wheel covers I made' })).toBeInTheDocument();
    expect(screen.getByText('Adaptive swim night')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kerry' })).toBeInTheDocument();
    expect(feed()).toHaveLength(4);
  });

  // An administrator reads closed rooms; no member can follow them in.
  it('does not draw a topic from a closed room, even when the read returned it', () => {
    renderPage();
    expect(screen.queryByText('Seeded in a closed room')).toBeNull();
  });

  describe('asking or sharing', () => {
    it('comes before the list, and opens /home/new with the way back', async () => {
      const user = userEvent.setup();
      renderPage('/home?segment=topics');
      const ask = screen.getByRole('link', { name: 'Ask something, or share something' });
      const [first] = feed();
      if (!first) throw new Error('the list should have a card in it');
      expect(ask.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      await user.click(ask);
      expect(
        screen.getByText('at /home/new with {"from":"home","segment":"topics"}'),
      ).toBeInTheDocument();
    });

    it('opens on sharing from the Photos pill', async () => {
      const user = userEvent.setup();
      renderPage('/home?segment=photos');
      await user.click(screen.getByRole('link', { name: 'Ask something, or share something' }));
      expect(
        screen.getByText('at /home/new?kind=share with {"from":"home","segment":"photos"}'),
      ).toBeInTheDocument();
    });

    // It reads nothing, so asking does not wait for the list.
    it('is there while the list is still loading', () => {
      db.membersLoading = true;
      renderPage();
      expect(screen.getByRole('status')).toHaveTextContent('Loading…');
      expect(
        screen.getByRole('link', { name: 'Ask something, or share something' }),
      ).toBeInTheDocument();
    });
  });

  describe('the pills', () => {
    it('list only their own kind', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(screen.getByRole('button', { name: 'Topics' }));
      expect(feed()).toHaveLength(1);
      expect(screen.getByRole('link', { name: 'Morning or evening routine?' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Photos' }));
      expect(feed()).toHaveLength(1);
      expect(screen.getByRole('link', { name: 'Wheel covers I made' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Events' }));
      expect(feed()).toHaveLength(1);
      expect(screen.getByText('Adaptive swim night')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'People' }));
      expect(feed()).toHaveLength(1);
      expect(screen.getByRole('link', { name: 'Kerry' })).toBeInTheDocument();
    });

    it('read the pill from the URL', () => {
      renderPage('/home?segment=photos');
      expect(screen.getByRole('button', { name: 'Photos' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.queryByRole('link', { name: 'Morning or evening routine?' })).toBeNull();
    });

    it('write the pill to the URL, and a card carries it to the next screen', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('button', { name: 'Topics' }));
      await user.click(screen.getByRole('link', { name: 'Morning or evening routine?' }));
      expect(
        screen.getByText(
          'at /chat/rooms/bowel/topics/plain with {"from":"home","segment":"topics"}',
        ),
      ).toBeInTheDocument();
    });
  });

  describe('waiting', () => {
    // Drawing each source as it lands would re-mix the list under the reader.
    it('draws nothing under Everything until all three sources have settled', () => {
      db.membersLoading = true;
      renderPage();
      expect(screen.getByRole('status')).toHaveTextContent('Loading…');
      expect(screen.queryByRole('link', { name: 'Morning or evening routine?' })).toBeNull();
      expect(screen.queryByText('Adaptive swim night')).toBeNull();
    });

    it('lets a single-kind pill draw once its own source has', () => {
      db.membersLoading = true;
      renderPage('/home?segment=topics');
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.getByRole('link', { name: 'Morning or evening routine?' })).toBeInTheDocument();
    });
  });

  it('says once that a source failed, and still draws the others', () => {
    db.eventsError = 'Could not load events. You are offline.';
    renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load events. You are offline.');
    expect(screen.getByRole('link', { name: 'Morning or evening routine?' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kerry' })).toBeInTheDocument();
  });

  it('does not say a failed pill is merely empty', () => {
    db.topicsError = 'Could not load the topics. You are offline.';
    renderPage('/home?segment=topics');
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the topics.');
    expect(screen.queryByText(/No topics yet/)).toBeNull();
  });

  it('saves an RSVP and reads the tallies again', async () => {
    const user = userEvent.setup();
    renderPage('/home?segment=events');
    await user.click(screen.getByRole('button', { name: /^Going/ }));
    expect(db.setRsvp).toHaveBeenCalledWith('swim', 'me', 'going');
    await waitFor(() => {
      expect(db.reload).toHaveBeenCalled();
    });
  });

  it('says so when an RSVP is refused', async () => {
    db.setRsvp = vi.fn().mockResolvedValue({ ok: false, error: 'Your answer was not saved.' });
    const user = userEvent.setup();
    renderPage('/home?segment=events');
    await user.click(screen.getByRole('button', { name: /^Going/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your answer was not saved.');
  });

  it('never draws a count of zero', () => {
    renderPage();
    expect(document.body.textContent).not.toMatch(/\b0 (repl|topic|post|going|interested)/);
  });

  describe('an empty pill says which emptiness it is, with a way out', () => {
    beforeEach(() => {
      db.topics = [];
      db.posts = [];
      db.events = [];
      db.members = [makeMember({ id: 'me' })];
    });

    it.each([
      ['everything', 'Nothing here yet.', null],
      [
        'topics',
        'No topics yet. Rooms open a few at a time, and anybody can start one.',
        ['See the rooms', '/chat?segment=rooms'],
      ],
      [
        'photos',
        'No photographs yet. A topic with a photograph shows up here.',
        ['See the rooms', '/chat?segment=rooms'],
      ],
      [
        'events',
        'Nothing on the calendar in the next 30 days.',
        ['See the whole calendar', '/events'],
      ],
      ['people', 'Nobody new to suggest today.', ['See everyone in Peers', '/peers']],
    ] as const)('%s', (segment, sentence, link) => {
      renderPage(segment === 'everything' ? '/home' : `/home?segment=${segment}`);
      expect(screen.getByText(sentence)).toBeInTheDocument();
      if (link) {
        expect(screen.getByRole('link', { name: link[0] })).toHaveAttribute('href', link[1]);
      } else {
        // The one link is the way to ask or share, which is on every pill.
        expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual([
          'Ask something, or share something',
        ]);
      }
    });
  });

  it('points to the rest of a single-kind list', () => {
    renderPage('/home?segment=events');
    expect(screen.getByRole('link', { name: 'See the whole calendar' })).toHaveAttribute(
      'href',
      '/events',
    );
  });
});
