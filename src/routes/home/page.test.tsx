import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Attachments from '@/lib/chat/attachments';
import type * as Likes from '@/lib/chat/likes';
import type * as Reactions from '@/lib/chat/reactions';
import type * as ChatRooms from '@/lib/chat/rooms';
import type * as Threads from '@/lib/chat/threads';
import type { ChatAuthor, ChatPost, ChatRoom, ChatThread } from '@/lib/chat/types';
import type * as Events from '@/lib/events';
import type * as HomeTopics from '@/lib/home/topics';
import type { HomeTopicSummary } from '@/lib/home/types';
import type * as NotificationsModule from '@/lib/notifications';
import { makeEvent, makeMember, makePost, makeRoom, makeTag } from '@/test/factory';
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
  likes: new Map<string, string[]>(),
  likesAskedFor: [] as string[][],
  liked: [] as string[],
}));

// Likes are a read and a write of the club; the hook has its own test.
// The bell reads its number from the database; stubbed so this test reads nothing.
vi.mock('@/lib/chat/views', () => ({
  usePostViews: (ids: readonly string[]) => ({
    byPost: new Map(ids.map((id) => [id, 0])),
    loading: false,
  }),
}));

vi.mock('@/lib/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof NotificationsModule>()),
  useUnseenNotifications: () => ({ count: 0, refresh: () => undefined }),
}));
vi.mock('@/lib/chat/likes', async (importOriginal) => ({
  ...(await importOriginal<typeof Likes>()),
  usePostLikes: (ids: readonly string[]) => {
    db.likesAskedFor.push([...ids]);
    return {
      byPost: db.likes,
      loading: false,
      error: null,
      failure: null,
      toggle: (id: string) => {
        db.liked.push(id);
      },
      reload: () => undefined,
    };
  },
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

vi.mock('@/lib/events', async (importOriginal) => ({
  rsvpSaved: (await importOriginal<typeof Events>()).rsvpSaved,
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
  isQuestion: false,
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
    makePost({ id: 'plain-opening', topicId: 'plain', body: 'Evenings for six years.' }),
    makePost({
      id: 'photo-opening',
      topicId: 'photo',
      body: '',
      attachments: ['rooms/bowel/a.webp'],
    }),
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
  db.likes = new Map();
  db.likesAskedFor = [];
  db.liked = [];
});

describe('likes on Home', () => {
  it('offers Like on both the reader’s own topic and photograph, with zero counts', async () => {
    db.posts = db.posts.map((post) => ({ ...post, authorId: 'me' }));
    db.topics = db.topics.map((topic) => ({ ...topic, authorId: 'me' }));
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Like Morning or evening routine?' }));
    await userEvent.click(screen.getByRole('button', { name: 'Like Wheel covers I made' }));
    expect(db.liked).toEqual(['plain-opening', 'photo-opening']);
    expect(screen.getAllByText('0 likes')).toHaveLength(2);
    expect(screen.getAllByText('0 views')).toHaveLength(2);
  });

  it('asks for the likes of every opening post on Home, and nothing else', () => {
    renderPage();
    expect([...(db.likesAskedFor.at(-1) ?? [])].sort()).toEqual(['photo-opening', 'plain-opening']);
  });

  it('likes a photograph from its card, and counts it', async () => {
    db.likes = new Map([['photo-opening', ['kerry']]]);
    renderPage();
    expect(
      screen.getByRole('button', { name: '1 like on Wheel covers I made. Show who.' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Like Wheel covers I made' }));
    expect(db.liked).toEqual(['photo-opening']);
  });

  it('likes a topic from its card, and counts it', async () => {
    db.likes = new Map([['plain-opening', ['kerry']]]);
    renderPage('/home?segment=topics');
    expect(
      screen.getByRole('button', { name: '1 like on Morning or evening routine?. Show who.' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Like Morning or evening routine?' }));
    expect(db.liked).toEqual(['plain-opening']);
  });
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
    it('comes before the list, typed into where it is', () => {
      renderPage('/home?segment=topics');
      const ask = screen.getByRole('textbox', { name: 'Ask or post to the club' });
      const [first] = feed();
      if (!first) throw new Error('the list should have a card in it');
      expect(ask.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      // Nothing but the box until something is typed.
      expect(screen.queryByRole('button', { name: 'Post' })).toBeNull();
    });

    it('opens on sharing from the Photos pill', async () => {
      const user = userEvent.setup();
      renderPage('/home?segment=photos');
      await user.click(screen.getByRole('link', { name: 'Share a photograph' }));
      expect(
        screen.getByText('at /home/new?kind=share with {"from":"home","segment":"photos"}'),
      ).toBeInTheDocument();
    });

    // It reads nothing, so asking does not wait for the list.
    it('is there while the list is still loading', () => {
      db.membersLoading = true;
      renderPage();
      expect(screen.getByRole('status')).toHaveTextContent('Loading…');
      expect(screen.getByRole('textbox', { name: 'Ask or post to the club' })).toBeInTheDocument();
    });

    // A box to ask the club on top of a list of events read as part of it.
    it('is not on the Events pill, and is on Topics', () => {
      const { unmount } = renderPage('/home?segment=events');
      expect(screen.queryByRole('textbox', { name: 'Ask or post to the club' })).toBeNull();
      unmount();
      renderPage('/home?segment=topics');
      expect(screen.getByRole('textbox', { name: 'Ask or post to the club' })).toBeInTheDocument();
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
        // No link in the list: the way to ask is a box, and the bell is in
        // the header.
        expect(
          screen.getAllByRole('link').filter((a) => a.getAttribute('href') !== '/notifications'),
        ).toEqual([]);
        expect(
          screen.getByRole('textbox', { name: 'Ask or post to the club' }),
        ).toBeInTheDocument();
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

describe('filtering the feed', () => {
  beforeEach(() => {
    db.rooms = [
      makeRoom({ id: 'bowel', name: 'Bowel management' }),
      makeRoom({ id: 'sport', name: 'Adaptive sport' }),
      makeRoom({ id: 'equip', name: 'Equipment & assistive tech' }),
      makeRoom({ id: 'skin', name: 'Skin & pressure sores', openedAt: null }),
    ];
    db.topics = [
      summary({ id: 'plain', title: 'Morning or evening routine?', authorId: 'me' }),
      summary({ id: 'photo', roomId: 'equip', title: 'Wheel covers I made', authorId: 'jan' }),
    ];
    db.posts = [
      makePost({ id: 'plain-opening', topicId: 'plain', authorId: 'me' }),
      makePost({
        id: 'photo-opening',
        topicId: 'photo',
        authorId: 'jan',
        body: '',
        attachments: ['rooms/equip/a.webp'],
      }),
    ];
    db.events = [
      makeEvent({
        id: 'swim',
        title: 'Adaptive swim night',
        city: 'San Jose',
        startTime: soon(3),
        tags: [makeTag('swimming', 'sport')],
      }),
      makeEvent({
        id: 'circle',
        title: 'Peer support circle',
        city: null,
        format: 'online',
        startTime: soon(5),
      }),
    ];
    db.members = [
      makeMember({ id: 'me', displayName: 'Alex', city: 'San Jose' }),
      makeMember({
        id: 'kerry',
        displayName: 'Kerry',
        city: 'San Jose',
        topics: ['Adaptive sports'],
      }),
      makeMember({ id: 'dante', displayName: 'Dante', city: 'Aptos', topics: ['Bowel programme'] }),
      makeMember({ id: 'jan', displayName: 'Jan', city: 'Santa Cruz' }),
    ];
  });

  /**
   * The feed's own cards. Not `feed()`: a person card with topics draws them as
   * a list of its own, and every item in it would be counted as a card.
   */
  const cards = () =>
    [...screen.getByRole('list', { name: '' }).children].filter((child) => child.tagName === 'LI');
  /** The list behind the sheet: its cards, or none when it says nothing matches. */
  const shownCount = () =>
    screen.queryAllByRole('list', { name: '' }).length ? cards().length : 0;

  /** Open the sheet, read its count, and check it against the list behind it. */
  async function sheetAgreesWithList(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    const dialog = screen.getByRole('dialog', { name: 'Filter your feed' });
    const count = shownCount();
    expect(within(dialog).getByText(new RegExp(`^${count} of \\d+ match`))).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: `Show ${count}` }));
  }

  it('opens from a button that counts what is on', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.getByRole('dialog', { name: 'Filter your feed' })).toBeInTheDocument();
    expect(screen.getByText('7 of 7 match')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Bowel management' }));
    await user.click(screen.getByRole('button', { name: 'Show 2' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Filters, 1 active' })).toBeInTheDocument();
  });

  it('offers only the rooms and places something in this pill has', async () => {
    const user = userEvent.setup();
    renderPage('/home?segment=events');
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    const dialog = within(screen.getByRole('dialog'));
    // The swim is sport; the circle is online. No topic, no member.
    expect(dialog.getByRole('button', { name: 'Adaptive sport' })).toBeInTheDocument();
    expect(dialog.queryByRole('button', { name: 'Bowel management' })).toBeNull();
    expect(dialog.getByRole('button', { name: 'San Jose' })).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Online' })).toBeInTheDocument();
    expect(dialog.queryByRole('button', { name: 'Aptos' })).toBeNull();
    // A closed room is never a chip, not even for an administrator's read.
    expect(dialog.queryByRole('button', { name: 'Skin & pressure sores' })).toBeNull();
  });

  it('narrows every pill by a room and a place, and Clear puts everything back', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.click(screen.getByRole('button', { name: 'Adaptive sport' }));
    await user.click(screen.getByRole('button', { name: 'San Jose' }));
    expect(screen.getByText('2 of 7 match')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show 2' }));
    expect(screen.getByText('Adaptive swim night')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kerry' })).toBeInTheDocument();
    expect(cards()).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Topics' }));
    expect(screen.getByText('Nothing matches that yet. Try fewer filters.')).toBeInTheDocument();
    await sheetAgreesWithList(user);

    await user.click(screen.getByRole('button', { name: 'Events' }));
    expect(cards()).toHaveLength(1);
    expect(screen.getByText('Adaptive swim night')).toBeInTheDocument();
    await sheetAgreesWithList(user);

    await user.click(screen.getByRole('button', { name: 'People' }));
    expect(cards()).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Kerry' })).toBeInTheDocument();
    await sheetAgreesWithList(user);

    await user.click(screen.getByRole('button', { name: 'Filters, 2 active' }));
    await user.click(screen.getByRole('button', { name: 'Clear (2)' }));
    await user.click(screen.getByRole('button', { name: /^Show / }));
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
    for (const [pill, count] of [
      ['Everything', 7],
      ['Topics', 1],
      ['Photos', 1],
      ['Events', 2],
      ['People', 3],
    ] as const) {
      await user.click(screen.getByRole('button', { name: pill }));
      expect(cards()).toHaveLength(count);
    }
  });

  it('places a topic by its author’s city, and not an author hidden from Peers', async () => {
    const user = userEvent.setup();
    db.members = db.members.filter((member) => member.id !== 'jan');
    renderPage('/home?segment=photos');
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    // Jan wrote the only photograph and is not in Peers: no place to offer.
    expect(screen.queryByRole('heading', { name: 'Where' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show 1' }));

    await user.click(screen.getByRole('button', { name: 'Topics' }));
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.click(screen.getByRole('button', { name: 'San Jose' }));
    await user.click(screen.getByRole('button', { name: 'Show 1' }));
    expect(screen.getByRole('link', { name: 'Morning or evening routine?' })).toBeInTheDocument();
  });

  it('keeps a chip that is on, on a pill where nothing matches it', async () => {
    const user = userEvent.setup();
    renderPage('/home?segment=people');
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.click(screen.getByRole('button', { name: 'Aptos' }));
    await user.click(screen.getByRole('button', { name: 'Show 1' }));

    await user.click(screen.getByRole('button', { name: 'Events' }));
    await user.click(screen.getByRole('button', { name: 'Filters, 1 active' }));
    expect(screen.getByRole('button', { name: 'Aptos' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Aptos' }));
    expect(screen.getByText('2 of 2 match')).toBeInTheDocument();
  });

  it('with a city on, waits for the members before drawing Topics', async () => {
    const user = userEvent.setup();
    const { rerender } = renderPage('/home?segment=topics');
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.click(screen.getByRole('button', { name: 'San Jose' }));
    await user.click(screen.getByRole('button', { name: 'Show 1' }));

    db.membersLoading = true;
    rerender(
      <MemoryRouter initialEntries={['/home?segment=topics']}>
        <Routes>
          <Route path="/home" element={<HomePage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(screen.queryByText('Nothing matches that yet. Try fewer filters.')).toBeNull();
  });
});

vi.mock('@/lib/chat/reactions', async (importOriginal) => ({
  ...(await importOriginal<typeof Reactions>()),
  useReactions: () => ({
    rows: [],
    loading: false,
    error: null,
    pending: new Set(),
    failure: null,
    choose: vi.fn(),
    reload: vi.fn(),
  }),
}));
