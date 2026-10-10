import { SlidersHorizontal } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { NotificationBell } from '@/components/notification-bell';
import { SegmentPills } from '@/components/segment-pills';
import { useAnnounce } from '@/lib/announce';
import { useChatAuthors } from '@/lib/chat/authors';
import { usePostLikes } from '@/lib/chat/likes';
import { useChatRooms } from '@/lib/chat/rooms';
import { useMyThreads } from '@/lib/chat/threads';
import type { ChatPost } from '@/lib/chat/types';
import { rsvpSaved, setRsvp, useAttendeesByEvent, useEvents, useViewerEvents } from '@/lib/events';
import { toHomeTopics, useHomeTopics } from '@/lib/home/topics';
import { type FeedItem, HOME_SEGMENTS, type HomeSegment } from '@/lib/home/types';
import { useBrowseMembers } from '@/lib/members';
import { useOrganizations } from '@/lib/organizations';
import { useSession } from '@/lib/session';
import { QuickAsk } from '@/routes/chat/quick-ask';
import { EventCard } from '@/routes/events/event-card';
import { ComposeCard } from '@/routes/home/compose-card';
import { inSegment, pickEvents, SEGMENT_PEOPLE, suggestPeople } from '@/routes/home/feed';
import { HomeFilterSheet } from '@/routes/home/filter-sheet';
import {
  activeFilterCount,
  chipsFor,
  EMPTY_FEED_FILTERS,
  type FeedFilterContext,
  type FeedFilters,
  matchesFeedFilters,
  openRoomsById,
} from '@/routes/home/filters';
import { PersonCard } from '@/routes/home/person-card';
import { PhotoCard } from '@/routes/home/photo-card';
import { type CardLikes, TopicCard } from '@/routes/home/topic-card';
import type { RsvpStatus } from '@/types/domain';

/**
 * Home: what the club is doing, in one list.
 *
 * Recent topics and photographs from the open rooms, upcoming events and
 * members worth meeting, from the mock's `homePage()`. Home adds no new kind
 * of content. Every card is a way in to a room, an event or a member that
 * already exists, and reporting, removal, notifications and mutes are theirs.
 * The dashed card at the top is the way to ask or share, and what it writes is
 * a topic in a room, through /home/new and the New topic screen.
 *
 * ---------------------------------------------------------------------------
 * A column, for the reason Events is one
 * ---------------------------------------------------------------------------
 * A feed is read down, not scanned across. `src/routes/events/page.tsx` says
 * why the column is capped: for a member driving a head pointer, distance on
 * screen is effort.
 *
 * ---------------------------------------------------------------------------
 * It reads once, on arrival, and does not subscribe
 * ---------------------------------------------------------------------------
 * Chat's screens are realtime and this one deliberately is not. A list that
 * reorders while somebody is reading it is a list they lose their place in,
 * and Home is for finding things, not for watching them. A new reply is on
 * the topic page and in the room, both live. Do not add a subscription here as
 * a fix for "Home did not update".
 *
 * ---------------------------------------------------------------------------
 * Everything waits for all three sources
 * ---------------------------------------------------------------------------
 * The mixed list is decided by `buildFeed`, which interleaves topics, events
 * and people. Drawing each source as it lands would re-mix the list under the
 * reader three times, so Everything says "Loading…" until all three have
 * settled. A single-kind pill waits for its own source only. A source that
 * fails says so once, at the top, and the rest of the list still draws.
 *
 * ---------------------------------------------------------------------------
 * The filter narrows what a pill drew, and lives in component state
 * ---------------------------------------------------------------------------
 * "Filter your feed" keeps the cards on this pill that are in a room or a
 * place (`filters.ts` says what matches what). It runs after the pill's list
 * is built, not before, so "2 of 8 match" means two of the eight cards that
 * were on screen. The choices are component state, as they are on Events: they
 * carry from one pill to the next, and a visit starts with none.
 */

const SEGMENTS: [HomeSegment, string][] = [
  ['everything', 'Everything'],
  ['topics', 'Topics'],
  ['photos', 'Photos'],
  ['events', 'Events'],
  ['people', 'People'],
];

type Source = 'topics' | 'events' | 'people';

/** Which sources each pill draws from, and so waits for. */
const SOURCES: Record<HomeSegment, Source[]> = {
  everything: ['topics', 'events', 'people'],
  topics: ['topics'],
  photos: ['topics'],
  events: ['events'],
  people: ['people'],
};

export default function HomePage() {
  const navigate = useNavigate();
  const session = useSession();
  const announce = useAnnounce();
  const memberId = session.status === 'signed-in' ? session.userId : null;

  // In the URL, for the reason Events and Chat keep theirs there: back from a
  // card lands on the pill it was opened from, and a pill can be linked to.
  const [searchParams, setSearchParams] = useSearchParams();
  const fromUrl = searchParams.get('segment');
  const segment: HomeSegment = HOME_SEGMENTS.includes(fromUrl as HomeSegment)
    ? (fromUrl as HomeSegment)
    : 'everything';
  const setSegment = useCallback(
    (next: HomeSegment) => {
      // Replace, not push: tapping through five pills should not mean five
      // presses of back to leave.
      setSearchParams(next === 'everything' ? {} : { segment: next }, { replace: true });
    },
    [setSearchParams],
  );
  // What every card hands to the screen it opens, so that screen's back link
  // says Home and returns to this pill.
  const linkState = useMemo(() => ({ from: 'home', segment }), [segment]);

  const topicRead = useHomeTopics();
  const rooms = useChatRooms();
  const eventsRead = useEvents();
  const { byEvent: attendeesByEvent } = useAttendeesByEvent();
  const { byId: organizationsById } = useOrganizations();
  const viewer = useViewerEvents(memberId);
  const membersRead = useBrowseMembers();
  const threadsRead = useMyThreads();
  const [writeError, setWriteError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FeedFilters>(EMPTY_FEED_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);

  const topics = useMemo(
    () => toHomeTopics(topicRead.topics, topicRead.posts, rooms.rooms),
    [topicRead.topics, topicRead.posts, rooms.rooms],
  );
  const events = useMemo(() => pickEvents(eventsRead.events), [eventsRead.events]);
  // Anybody the viewer has actually spoken with directly. A direct thread
  // nobody has written in is not a conversation, as Chat's own list agrees.
  const talkedTo = useMemo(
    () =>
      new Set(
        threadsRead.threads
          .filter((thread) => thread.kind === 'direct' && thread.lastAt !== null)
          .flatMap((thread) => (thread.otherMemberId ? [thread.otherMemberId] : [])),
      ),
    [threadsRead.threads],
  );
  const people = useMemo(
    () => suggestPeople(membersRead.members, memberId, talkedTo, new Date(), SEGMENT_PEOPLE),
    [membersRead.members, memberId, talkedTo],
  );

  const authors = useChatAuthors(
    topics.flatMap((topic) => [topic.authorId, topic.firstReply?.authorId ?? null]),
  );
  // Likes on every topic and photograph: one read for every opening post,
  // whichever pill is showing, so switching pills does not read again.
  const openingPostIds = useMemo(
    () => topics.flatMap((topic) => (topic.opening ? [topic.opening.id] : [])),
    [topics],
  );
  const likes = usePostLikes(openingPostIds);

  const loading: Record<Source, boolean> = {
    topics: topicRead.loading || rooms.loading,
    events: eventsRead.loading,
    // A failed conversations read is not waited on and not reported: the cost
    // is suggesting somebody the viewer already talks to, which is smaller
    // than losing the suggestions.
    people: membersRead.loading || threadsRead.loading,
  };
  const errors: Record<Source, string | null> = {
    topics: topicRead.error ?? rooms.error,
    events: eventsRead.error,
    people: membersRead.error,
  };
  // A topic is placed by its author's city, which comes from the members
  // read. With a city chosen, Topics and Photos wait for it too, rather than
  // drawing nothing and then filling in.
  const sources: Source[] =
    filters.cities.length > 0 && !SOURCES[segment].includes('people')
      ? [...SOURCES[segment], 'people']
      : SOURCES[segment];
  const settled = sources.every((source) => !loading[source]);
  const failures = sources.flatMap((source) => {
    const error = errors[source];
    return error ? [error] : [];
  });

  const items = useMemo(
    () => inSegment(segment, { topics, events, people }),
    [segment, topics, events, people],
  );
  const filterContext = useMemo<FeedFilterContext>(
    () => ({
      openRooms: openRoomsById(rooms.rooms),
      cityOf: new Map(membersRead.members.map((member) => [member.id, member.city])),
    }),
    [rooms.rooms, membersRead.members],
  );
  const shown = useMemo(
    () => items.filter((item) => matchesFeedFilters(item, filters, filterContext)),
    [items, filters, filterContext],
  );
  const filterCount = activeFilterCount(filters);

  const onRsvp = useCallback(
    (eventId: string, next: RsvpStatus | null) => {
      if (!memberId) return;
      setWriteError(null);
      void setRsvp(eventId, memberId, next).then((result) => {
        // Re-read rather than patch, as Events does: the tallies come from
        // the database, and a local edit would leave the number and the
        // button disagreeing.
        if (result.ok) {
          viewer.reload();
          announce(rsvpSaved(next));
        } else setWriteError(result.error ?? 'Could not save that.');
      });
    },
    [memberId, viewer, announce],
  );

  /** What a card's Like needs, or nothing while the likes load. */
  function likesFor(opening: ChatPost | null): CardLikes | undefined {
    if (!opening || likes.loading) return undefined;
    return {
      likedBy: likes.byPost.get(opening.id) ?? [],
      readerId: opening.authorId === memberId ? null : memberId,
      onToggle: () => {
        likes.toggle(opening.id);
      },
      failure: likes.failure?.postId === opening.id ? likes.failure.message : null,
    };
  }

  function draw(item: FeedItem) {
    switch (item.kind) {
      case 'topic':
        return (
          <TopicCard
            topic={item.topic}
            starter={item.topic.authorId ? (authors.get(item.topic.authorId) ?? null) : null}
            replier={
              item.topic.firstReply?.authorId
                ? (authors.get(item.topic.firstReply.authorId) ?? null)
                : null
            }
            linkState={linkState}
            likes={likesFor(item.topic.opening)}
            answerAs={memberId}
          />
        );
      case 'photo':
        return (
          <PhotoCard
            topic={item.topic}
            author={item.topic.authorId ? (authors.get(item.topic.authorId) ?? null) : null}
            linkState={linkState}
            likes={likesFor(item.topic.opening)}
          />
        );
      case 'event':
        return (
          <EventCard
            event={item.event}
            status={viewer.rsvps.get(item.event.id) ?? null}
            attendees={attendeesByEvent.get(item.event.id) ?? []}
            organization={
              item.event.organizationId
                ? (organizationsById.get(item.event.organizationId) ?? null)
                : null
            }
            onOpen={() => {
              void navigate(`/events/${item.event.id}`, { state: linkState });
            }}
            onRsvp={(next) => {
              onRsvp(item.event.id, next);
            }}
          />
        );
      case 'person':
        return <PersonCard member={item.member} linkState={linkState} />;
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex-none border-line border-b bg-paper px-[18px] pt-[18px]">
        <div className="mx-auto flex min-h-[38px] w-full max-w-[var(--events-measure)] items-center justify-between gap-2.5">
          <h1 className="font-extrabold font-display text-[1.5625rem] text-ink tracking-[-0.01em]">
            Home
          </h1>
          {/* Events' button, the same size and the same dot. There is no row of
              chosen chips under the pills (the mock has one): Events and Peers
              draw none, and the dot and the name say a filter is on. */}
          <span className="flex items-center gap-2">
            {/* A phone's way to the list; a desktop has it in the top bar. */}
            <NotificationBell variant="round" className="md:hidden" />
            <button
              type="button"
              onClick={() => {
                setSheetOpen(true);
              }}
              aria-label={filterCount ? `Filters, ${filterCount} active` : 'Filters'}
              data-target="small"
              className="relative grid h-[38px] w-[38px] flex-none place-items-center rounded-full bg-tint transition-colors hover:bg-line"
            >
              <SlidersHorizontal className="h-[17px] w-[17px] text-emphasis" strokeWidth={2} />
              {filterCount ? (
                <span className="absolute top-[5px] right-[5px] h-2 w-2 rounded-full border-[1.6px] border-paper bg-gold" />
              ) : null}
            </button>
          </span>
        </div>
        <SegmentPills
          segments={SEGMENTS}
          value={segment}
          onChange={setSegment}
          className="max-w-[var(--events-measure)]"
        />
      </header>

      <div className="flex-1 overflow-y-auto px-4 pt-3.5 pb-[18px] md:px-6">
        <div className="mx-auto w-full max-w-[var(--events-measure)]">
          {/* On every pill, and before anything has loaded: asking should
              not wait for the list. Typed into here and posted from here
              (the owner, 2026-10-09: the least friction there can be); the
              Photos pill keeps its card to the photograph picker. */}
          {segment === 'photos' ? (
            <ComposeCard segment={segment} linkState={linkState} />
          ) : (
            <QuickAsk rooms={rooms.rooms} linkState={linkState} className="mb-[11px]" />
          )}
          {writeError ? <Problem sentences={[writeError]} /> : null}

          {!settled ? (
            <p role="status" className="px-6 py-10 text-center text-[0.875rem] text-grey">
              Loading…
            </p>
          ) : (
            <>
              {failures.length > 0 ? <Problem sentences={failures} /> : null}
              {shown.length > 0 ? (
                <>
                  <ul>
                    {shown.map((item) => (
                      // An event card carries its own bottom margin; the
                      // others are given the same one here.
                      <li key={item.key} className={item.kind === 'event' ? '' : 'mb-[11px]'}>
                        {draw(item)}
                      </li>
                    ))}
                  </ul>
                  <SeeMore segment={segment} />
                </>
              ) : failures.length > 0 ? null : items.length > 0 ? (
                // The pill has cards and the filter kept none of them. The
                // sentence names the filter, which is what is holding it shut.
                <p className="px-6 py-10 text-center text-[0.875rem] text-grey leading-relaxed">
                  Nothing matches that yet. Try fewer filters.
                </p>
              ) : (
                <EmptyList segment={segment} />
              )}
            </>
          )}
        </div>
      </div>

      {sheetOpen ? (
        <HomeFilterSheet
          chips={chipsFor(items, filters, filterContext)}
          filters={filters}
          matchCount={shown.length}
          total={items.length}
          activeCount={filterCount}
          onChange={setFilters}
          onClear={() => {
            setFilters(EMPTY_FEED_FILTERS);
          }}
          onClose={() => {
            setSheetOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

/** A failure, said once, above whatever did load. */
function Problem({ sentences }: { sentences: string[] }) {
  return (
    <div
      role="alert"
      className="mb-3 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.8125rem] text-destructive leading-[1.45]"
    >
      {sentences.map((sentence) => (
        <p key={sentence}>{sentence}</p>
      ))}
    </div>
  );
}

const LINK_CLASS =
  'inline-flex min-h-[2.75rem] items-center font-semibold text-[0.875rem] text-emphasis underline decoration-line underline-offset-2 hover:decoration-emphasis';

/** Where the rest of a single-kind list lives. Everything has no "rest". */
function SeeMore({ segment }: { segment: HomeSegment }) {
  const more: Partial<Record<HomeSegment, [string, string]>> = {
    topics: ['/chat?segment=rooms', 'See the rooms'],
    photos: ['/chat?segment=rooms', 'See the rooms'],
    events: ['/events', 'See the whole calendar'],
    people: ['/peers', 'See everyone in Peers'],
  };
  const link = more[segment];
  if (!link) return null;
  return (
    <p className="text-center">
      <Link to={link[0]} className={LINK_CLASS}>
        {link[1]}
      </Link>
    </p>
  );
}

/**
 * Each empty pill says which emptiness it is, and where to go instead.
 *
 * An empty Topics pill is the ordinary day for this club: rooms open a few at
 * a time. The sentence says so rather than apologising, and the way out is a
 * link, not a button.
 */
function EmptyList({ segment }: { segment: HomeSegment }) {
  const empty: Record<HomeSegment, [string, [string, string] | null]> = {
    everything: ['Nothing here yet.', null],
    topics: [
      'No topics yet. Rooms open a few at a time, and anybody can start one.',
      ['/chat?segment=rooms', 'See the rooms'],
    ],
    photos: [
      'No photographs yet. A topic with a photograph shows up here.',
      ['/chat?segment=rooms', 'See the rooms'],
    ],
    events: ['Nothing on the calendar in the next 30 days.', ['/events', 'See the whole calendar']],
    people: ['Nobody new to suggest today.', ['/peers', 'See everyone in Peers']],
  };
  const [sentence, link] = empty[segment];
  return (
    <div className="px-6 py-10 text-center">
      <p className="text-[0.875rem] text-grey leading-relaxed">{sentence}</p>
      {link ? (
        <p className="mt-2">
          <Link to={link[0]} className={LINK_CLASS}>
            {link[1]}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
