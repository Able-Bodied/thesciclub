import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Attachments from '@/lib/chat/attachments';
import type * as Likes from '@/lib/chat/likes';
import type * as Reactions from '@/lib/chat/reactions';
import type * as ChatRooms from '@/lib/chat/rooms';
import type { ChatAuthor, ChatPost, ChatRoom } from '@/lib/chat/types';
import type * as HomeTopics from '@/lib/home/topics';
import type { HomeTopicSummary } from '@/lib/home/types';
import type * as NotificationsModule from '@/lib/notifications';
import { makeEvent, makeMember, makePost, makeRoom } from '@/test/factory';
import type { BrowseMember, ClubEvent } from '@/types/domain';

/**
 * Home, with every hook that reads the database stubbed and every pure
 * function real: `toHomeTopics`, `buildFeed` and `inSegment` decide what is
 * on screen here exactly as they do in the app. Posts alone since 2026-11-18;
 * the events and members stubbed here are what search would read, and what
 * the feed must not.
 */

const db = vi.hoisted(() => ({
  topics: [] as HomeTopicSummary[],
  posts: [] as ChatPost[],
  topicsLoading: false,
  topicsError: null as string | null,
  rooms: [] as ChatRoom[],
  events: [] as ClubEvent[],
  members: [] as BrowseMember[],
  /** How often the events and the members were asked for. */
  eventsAsked: 0,
  membersAsked: 0,
  authors: new Map<string, ChatAuthor>(),
  likes: new Map<string, string[]>(),
  likesAskedFor: [] as string[][],
  liked: [] as string[],
  /** The posts whose likes are still being read. */
  likesLoading: new Set<string>(),
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
      loading: db.likesLoading.size > 0,
      loadingFor: (id: string) => db.likesLoading.has(id),
      error: null,
      failure: null,
      toggle: (id: string) => {
        db.liked.push(id);
      },
      downvote: () => undefined,
      boost: () => undefined,
      isAdmin: false,
      scoreOf: (id: string) => ({
        score: (db.likes.get(id) ?? []).length,
        myVote: (db.likes.get(id) ?? []).includes('me') ? (1 as const) : (0 as const),
        boost: null,
      }),
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

vi.mock('@/lib/chat/authors', () => ({
  useChatAuthors: () => db.authors,
}));

// Photographs are signed under the reader's token: a storage call.
vi.mock('@/lib/chat/attachments', async (importOriginal) => ({
  ...(await importOriginal<typeof Attachments>()),
  useAttachmentUrls: (paths: readonly string[]) =>
    new Map(paths.map((path) => [path, `https://signed/${path}`])),
  // No small copies here: tiles and viewer draw the same URL.
  useSmallCopies: (paths: readonly string[]) => {
    const found = new Map(paths.map((path) => [path, `https://signed/${path}`]));
    return { small: found, full: found };
  },
}));

vi.mock('@/lib/events', () => ({
  useEvents: () => {
    db.eventsAsked += 1;
    return { events: db.events, loading: false, error: null };
  },
}));

vi.mock('@/lib/organizations', () => ({
  useOrganizations: () => ({ organizations: [], byId: new Map(), loading: false, error: null }),
}));

vi.mock('@/lib/members', () => ({
  useBrowseMembers: () => {
    db.membersAsked += 1;
    return { members: db.members, loading: false, error: null, signedOut: false };
  },
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
  db.eventsAsked = 0;
  db.membersAsked = 0;
  db.members = [
    makeMember({ id: 'me', displayName: 'Alex' }),
    makeMember({ id: 'kerry', type: 'mentor', displayName: 'Kerry' }),
  ];
  db.authors = new Map();
  db.likes = new Map();
  db.likesAskedFor = [];
  db.liked = [];
  db.likesLoading = new Set();
});

// Display is on Me only (the owner, 2026-10-22).
it('has no Display button in its header', () => {
  renderPage();
  expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Display settings' })).toBeNull();
});

// The owner, 2026-11-06: the bell back on Home, right of Filter.
it('has the notifications bell after Filter', () => {
  renderPage();
  const filter = screen.getByRole('button', { name: 'Filters' });
  const bell = screen.getByRole('link', { name: 'Notifications' });
  expect(filter.compareDocumentPosition(bell) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

describe('likes on Home', () => {
  it('offers Like on both the reader’s own topic and photograph, with zero counts', async () => {
    db.posts = db.posts.map((post) => ({ ...post, authorId: 'me' }));
    db.topics = db.topics.map((topic) => ({ ...topic, authorId: 'me' }));
    renderPage();
    await userEvent.click(
      screen.getByRole('button', { name: 'Upvote Morning or evening routine?' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Upvote Wheel covers I made' }));
    expect(db.liked).toEqual(['plain-opening', 'photo-opening']);
    expect(screen.getAllByText('0')).toHaveLength(2);
    expect(screen.getAllByText('0 views')).toHaveLength(2);
  });

  it('offers Share on a topic and a photograph, named for each', () => {
    renderPage();
    expect(
      screen.getByRole('button', { name: 'Share “Morning or evening routine?”' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share “Wheel covers I made”' })).toBeInTheDocument();
  });

  it('asks for the likes of every opening post on Home, and nothing else', () => {
    renderPage();
    expect([...(db.likesAskedFor.at(-1) ?? [])].sort()).toEqual(['photo-opening', 'plain-opening']);
  });

  // The robots, 2026-11-04: a liked post drew "Like" until its likes were read.
  it('never draws Like on a liked card before its likes are read', () => {
    db.likes = new Map([
      ['photo-opening', ['me']],
      ['plain-opening', ['me']],
    ]);
    db.likesLoading = new Set(['photo-opening', 'plain-opening']);
    renderPage();
    expect(screen.queryByText(/^Liked?$/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Upvote / })).toBeNull();
    expect(
      screen.getAllByRole('button', { name: 'Your vote on Wheel covers I made is not known' })[0],
    ).toBeDisabled();
    expect(
      screen.getAllByRole('button', {
        name: 'Your vote on Morning or evening routine? is not known',
      })[0],
    ).toBeDisabled();
  });

  it('likes a photograph from its card, and counts it', async () => {
    db.likes = new Map([['photo-opening', ['kerry']]]);
    renderPage();
    expect(
      screen.getByRole('button', { name: 'Score 1 on Wheel covers I made. Show who upvoted.' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Upvote Wheel covers I made' }));
    expect(db.liked).toEqual(['photo-opening']);
  });

  it('likes a topic from its card, and counts it', async () => {
    db.likes = new Map([['plain-opening', ['kerry']]]);
    renderPage('/home?segment=topics');
    expect(
      screen.getByRole('button', {
        name: 'Score 1 on Morning or evening routine?. Show who upvoted.',
      }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Upvote Morning or evening routine?' }),
    );
    expect(db.liked).toEqual(['plain-opening']);
  });
});

/** What the pills did: through the filter now. */
async function show(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: /^Filters/ }));
  await user.click(screen.getByRole('button', { name }));
  await user.click(screen.getByRole('button', { name: /^Show \d/ }));
}

describe('Home', () => {
  it('has exactly one h1, and it says Home', () => {
    renderPage();
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('Home');
  });

  // The owner, 2026-11-18: "let's skip loading events and peers for now in
  // the home feed. Just do posts." Home had waited for both before it drew a
  // post; now it asks for neither until search is opened.
  it('lists posts and photographs alone, and reads no events or members for them', async () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Morning or evening routine?' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Wheel covers I made' })).toBeInTheDocument();
    expect(screen.queryByText('Adaptive swim night')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Kerry' })).toBeNull();
    expect(feed()).toHaveLength(2);
    expect([db.eventsAsked, db.membersAsked]).toEqual([0, 0]);

    // Search still finds both: it reads them itself, once it is opened.
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search the club' }), 'swim');
    expect(screen.getByRole('link', { name: /Adaptive swim night/ })).toBeInTheDocument();
  });

  // A link saved while Home had an Events kind: everything, not an empty page.
  it('opens everything from an old link to the Events or People kind', () => {
    renderPage('/home?segment=events');
    expect(feed()).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
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
      db.topicsLoading = true;
      renderPage();
      expect(screen.getByRole('status')).toHaveTextContent('Loading…');
      expect(screen.getByRole('textbox', { name: 'Ask or post to the club' })).toBeInTheDocument();
    });
  });

  describe('the pills', () => {
    it('list only their own kind', async () => {
      const user = userEvent.setup();
      renderPage();

      await show(user, 'Posts');
      expect(feed()).toHaveLength(1);
      expect(screen.getByRole('link', { name: 'Morning or evening routine?' })).toBeInTheDocument();

      await show(user, 'Photos');
      expect(feed()).toHaveLength(1);
      expect(screen.getByRole('link', { name: 'Wheel covers I made' })).toBeInTheDocument();
    });

    it('list only questions under Questions, under the box to ask one', () => {
      const { unmount } = renderPage('/home?segment=questions');
      expect(screen.getByText(/^No questions yet\./)).toBeInTheDocument();
      unmount();

      db.topics = db.topics.map((topic) =>
        topic.id === 'plain' ? { ...topic, isQuestion: true } : topic,
      );
      renderPage('/home?segment=questions');
      expect(feed()).toHaveLength(1);
      expect(
        screen.getByRole('link', { name: /^Question ?Morning or evening routine\?$/ }),
      ).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Ask or post to the club' })).toBeInTheDocument();
    });

    it('read the pill from the URL', async () => {
      const user = userEvent.setup();
      renderPage('/home?segment=photos');
      expect(screen.getByRole('button', { name: 'Filters, 1 active' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /^Filters/ }));
      expect(screen.getByRole('button', { name: 'Photos' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await user.click(screen.getByRole('button', { name: /^Show \d/ }));
      expect(screen.queryByRole('link', { name: 'Morning or evening routine?' })).toBeNull();
    });

    it('write the pill to the URL, and a card carries it to the next screen', async () => {
      const user = userEvent.setup();
      renderPage();
      await show(user, 'Posts');
      await user.click(screen.getByRole('link', { name: 'Morning or evening routine?' }));
      expect(
        screen.getByText(
          'at /chat/rooms/bowel/topics/plain with {"from":"home","segment":"topics"}',
        ),
      ).toBeInTheDocument();
    });
  });

  it('does not say a failed pill is merely empty', () => {
    db.topicsError = 'Could not load the posts. You are offline.';
    renderPage('/home?segment=topics');
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the posts.');
    expect(screen.queryByText(/No posts yet/)).toBeNull();
  });

  it('never draws a count of zero', () => {
    renderPage();
    expect(document.body.textContent).not.toMatch(/\b0 (repl|topic|post|going|interested)/);
  });

  describe('an empty pill says which emptiness it is, with a way out', () => {
    beforeEach(() => {
      db.topics = [];
      db.posts = [];
    });

    it.each([
      ['everything', 'Nothing here yet.', null],
      [
        'topics',
        'No posts yet. Rooms open a few at a time, and anybody can start one.',
        ['See the rooms', '/chat?segment=rooms'],
      ],
      [
        'photos',
        'No photographs yet. A post with a photograph shows up here.',
        ['See the rooms', '/chat?segment=rooms'],
      ],
    ] as const)('%s', (segment, sentence, link) => {
      renderPage(segment === 'everything' ? '/home' : `/home?segment=${segment}`);
      expect(screen.getByText(sentence)).toBeInTheDocument();
      if (link) {
        expect(screen.getByRole('link', { name: link[0] })).toHaveAttribute('href', link[1]);
      } else {
        // No link in the list, only the header's bell: the way to ask is a box.
        expect(screen.queryAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
          '/notifications',
        ]);
        expect(
          screen.getByRole('textbox', { name: 'Ask or post to the club' }),
        ).toBeInTheDocument();
      }
    });
  });

  it('points to the rest of a single-kind list', () => {
    renderPage('/home?segment=topics');
    expect(screen.getByRole('link', { name: 'See the rooms' })).toHaveAttribute(
      'href',
      '/chat?segment=rooms',
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
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    expect(screen.getByRole('dialog', { name: 'Filter your feed' })).toBeInTheDocument();
    expect(screen.getByText('2 of 2 match')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Bowel management' }));
    await user.click(screen.getByRole('button', { name: 'Show 1' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: /^Filters, / })).toBeInTheDocument();
  });

  it('offers only the rooms something in this pill has', async () => {
    const user = userEvent.setup();
    renderPage('/home?segment=photos');
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    const dialog = within(screen.getByRole('dialog'));
    // The photograph is in Equipment; the other post is not a photograph.
    expect(dialog.getByRole('button', { name: 'Equipment & assistive tech' })).toBeInTheDocument();
    expect(dialog.queryByRole('button', { name: 'Bowel management' })).toBeNull();
    // A closed room is never a chip, not even for an administrator's read.
    expect(dialog.queryByRole('button', { name: 'Skin & pressure sores' })).toBeNull();
  });

  it('narrows by a room, and Clear puts everything back', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.click(screen.getByRole('button', { name: 'Bowel management' }));
    await user.click(screen.getByRole('button', { name: 'Show 1' }));
    expect(cards()).toHaveLength(1);
    await sheetAgreesWithList(user);
    await user.click(screen.getByRole('button', { name: /^Filters, / }));
    await user.click(screen.getByRole('button', { name: /^Clear/ }));
    await user.click(screen.getByRole('button', { name: /^Show / }));
    expect(cards()).toHaveLength(2);
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
