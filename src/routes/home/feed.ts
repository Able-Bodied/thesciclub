import type { FeedItem, HomeSegment, HomeTopic } from '@/lib/home/types';
import { isPastEvent } from '@/routes/events/filters';
import { groupBySeries } from '@/routes/events/series-groups';
import { othersOnly } from '@/routes/peers/filters';
import { rankMembers } from '@/routes/peers/ranking';
import type { BrowseMember, ClubEvent } from '@/types/domain';

/**
 * What goes on Home, and in what order. All pure.
 *
 * The screen only draws what these return, so the mix is tested here and not
 * by rendering: a screen test that asserts an order is really a test of
 * `buildFeed`, and a slower one.
 */

/** How far ahead an event can be and still be worth putting in front of somebody. */
export const EVENT_HORIZON_DAYS = 30;

/** How many of the best-ranked members the day's suggestions rotate through. */
const PEOPLE_POOL = 12;

/** How many of each kind the Everything list mixes in, at most. */
const MIX_EVENTS = 4;
const MIX_PEOPLE = 3;

/** And how many a single-kind pill lists. */
const SEGMENT_TOPICS = 40;
const SEGMENT_EVENTS = 8;
export const SEGMENT_PEOPLE = 6;

/**
 * Upcoming events in the next thirty days, soonest first, one card per series.
 *
 * One per series because NorCal SCI's calendar is mostly the same fifteen
 * things weekly. Four Friday swims in a row would push everything else off
 * the list. The lead is the next date, which is the one worth deciding about.
 */
export function pickEvents(events: readonly ClubEvent[], now: Date = new Date()): ClubEvent[] {
  const horizon = now.getTime() + EVENT_HORIZON_DAYS * 86_400_000;
  const upcoming = events
    .filter((event) => !isPastEvent(event, now) && Date.parse(event.startTime) <= horizon)
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id));
  return groupBySeries(upcoming).map((group) => group.lead);
}

/** Days since 1970 on the viewer's own calendar, so the day turns at their midnight. */
function dayNumber(today: Date): number {
  return Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86_400_000);
}

/**
 * Members worth meeting today.
 *
 * - Nobody the viewer already talks to directly: a suggestion to meet
 *   somebody you are already messaging is noise.
 * - Not the club's own account, which is not a person.
 * - Ranked by `rankMembers`, the Peers deck's own order, with the viewer's
 *   own `browse_members` row as the viewer. A viewer hidden from Peers has no
 *   row there, so they get mentors first, then the newest members.
 * - The day picks where to start in the top twelve. The suggestions change
 *   from one day to the next and never within one, so Home does not reshuffle
 *   under somebody who comes back to it after lunch.
 *
 * Seeded directory members are included, the same as on the Peers deck.
 */
export function suggestPeople(
  members: readonly BrowseMember[],
  viewerId: string | null,
  talkedTo: ReadonlySet<string>,
  today: Date = new Date(),
  count: number = MIX_PEOPLE,
): BrowseMember[] {
  const candidates = othersOnly([...members], viewerId).filter(
    (member) => !member.isAdmin && !talkedTo.has(member.id),
  );
  const viewer = members.find((member) => member.id === viewerId) ?? null;
  const ranked = viewer
    ? rankMembers(candidates, viewer)
    : [...candidates].sort(
        (a, b) =>
          Number(b.type === 'mentor') - Number(a.type === 'mentor') ||
          b.createdAt.localeCompare(a.createdAt) ||
          a.id.localeCompare(b.id),
      );

  const pool = ranked.slice(0, PEOPLE_POOL);
  if (pool.length <= count) return pool;
  const start = dayNumber(today) % pool.length;
  return Array.from({ length: count }, (_, index) => pool[(start + index) % pool.length]).filter(
    (member): member is BrowseMember => member !== undefined,
  );
}

function topicItem(topic: HomeTopic): FeedItem {
  return topic.photo
    ? { kind: 'photo', key: `topic:${topic.id}`, topic }
    : { kind: 'topic', key: `topic:${topic.id}`, topic };
}

const eventItem = (event: ClubEvent): FeedItem => ({
  kind: 'event',
  key: `event:${event.id}`,
  event,
});

const personItem = (member: BrowseMember): FeedItem => ({
  kind: 'person',
  key: `person:${member.id}`,
  member,
});

export interface FeedSources {
  /** Newest activity first, as `toHomeTopics` returns them. */
  topics: readonly HomeTopic[];
  /** As `pickEvents` returns them. */
  events: readonly ClubEvent[];
  /** As `suggestPeople` returns them. */
  people: readonly BrowseMember[];
}

/**
 * The mix for Everything.
 *
 * Topics and photographs together, newest activity first, because they are
 * what members wrote. After every second one, one extra: an event, then a
 * person, then an event, alternating until both run out, at most four events
 * and three people. Extras left when the topics run out go at the end, so a
 * quiet week still lists what is on and who to meet. With no topics at all
 * the list is the extras alone.
 */
export function buildFeed({ topics, events, people }: FeedSources): FeedItem[] {
  const eventsLeft = events.slice(0, MIX_EVENTS).map(eventItem);
  const peopleLeft = people.slice(0, MIX_PEOPLE).map(personItem);
  let nextIsEvent = true;
  const nextExtra = (): FeedItem | undefined => {
    const first = nextIsEvent ? eventsLeft : peopleLeft;
    const second = nextIsEvent ? peopleLeft : eventsLeft;
    nextIsEvent = !nextIsEvent;
    return first.shift() ?? second.shift();
  };

  const feed: FeedItem[] = [];
  topics.forEach((topic, index) => {
    feed.push(topicItem(topic));
    if (index % 2 === 1) {
      const extra = nextExtra();
      if (extra) feed.push(extra);
    }
  });
  for (let extra = nextExtra(); extra; extra = nextExtra()) feed.push(extra);

  // No item twice, whatever the sources handed over.
  const seen = new Set<string>();
  return feed.filter((item) => {
    if (seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
}

/** What each pill lists. */
export function inSegment(segment: HomeSegment, sources: FeedSources): FeedItem[] {
  switch (segment) {
    case 'everything':
      return buildFeed(sources);
    case 'topics':
      return sources.topics
        .filter((topic) => !topic.photo)
        .slice(0, SEGMENT_TOPICS)
        .map(topicItem);
    case 'photos':
      return sources.topics.filter((topic) => topic.photo).map(topicItem);
    case 'events':
      return sources.events.slice(0, SEGMENT_EVENTS).map(eventItem);
    case 'people':
      return sources.people.slice(0, SEGMENT_PEOPLE).map(personItem);
  }
}
