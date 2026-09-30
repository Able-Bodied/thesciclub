import { describe, expect, it } from 'vitest';
import type { FeedItem } from '@/lib/home/types';
import { buildFeed, inSegment, pickEvents, suggestPeople } from '@/routes/home/feed';
import { makeEvent, makeHomeTopic, makeMember } from '@/test/factory';

/**
 * The mix on Home, without a database or a render. Everything the screen
 * lists comes out of these four functions.
 */

const NOW = new Date('2026-09-29T12:00:00Z');
const kinds = (items: FeedItem[]) => items.map((item) => item.kind);
const keys = (items: FeedItem[]) => items.map((item) => item.key);

describe('pickEvents', () => {
  it('is empty for no events', () => {
    expect(pickEvents([], NOW)).toEqual([]);
  });

  it('keeps upcoming events in the next thirty days, soonest first', () => {
    const picked = pickEvents(
      [
        makeEvent({ id: 'later', startTime: '2026-10-10T17:00:00Z' }),
        makeEvent({ id: 'past', startTime: '2026-09-28T17:00:00Z' }),
        makeEvent({ id: 'soon', startTime: '2026-09-30T17:00:00Z' }),
        makeEvent({ id: 'far', startTime: '2026-11-15T17:00:00Z' }),
      ],
      NOW,
    );
    expect(picked.map((event) => event.id)).toEqual(['soon', 'later']);
  });

  it('draws one card per series, the next date', () => {
    const picked = pickEvents(
      [
        makeEvent({ id: 'swim-2', seriesId: 'swim', startTime: '2026-10-09T17:00:00Z' }),
        makeEvent({ id: 'talk', startTime: '2026-10-05T17:00:00Z' }),
        makeEvent({ id: 'swim-1', seriesId: 'swim', startTime: '2026-10-02T17:00:00Z' }),
      ],
      NOW,
    );
    expect(picked.map((event) => event.id)).toEqual(['swim-1', 'talk']);
  });
});

describe('suggestPeople', () => {
  const viewer = makeMember({ id: 'me', state: 'CA', region: 'Thoracic' });
  const others = Array.from({ length: 14 }, (_, index) =>
    makeMember({
      id: `m${String(index).padStart(2, '0')}`,
      displayName: `Member ${index}`,
      // Earlier members share more with the viewer, so they rank higher.
      state: index < 7 ? 'CA' : 'NY',
      region: index % 2 === 0 ? 'Thoracic' : 'Cervical',
    }),
  );

  it('is empty when there is nobody but the viewer', () => {
    expect(suggestPeople([], 'me', new Set(), NOW)).toEqual([]);
    expect(suggestPeople([viewer], 'me', new Set(), NOW)).toEqual([]);
  });

  it('leaves out the viewer, the club account and anybody they already talk to', () => {
    const club = makeMember({ id: 'club', isAdmin: true, state: 'CA' });
    const friend = makeMember({ id: 'friend', state: 'CA' });
    const stranger = makeMember({ id: 'stranger', state: 'CA' });
    const picked = suggestPeople([viewer, club, friend, stranger], 'me', new Set(['friend']), NOW);
    expect(picked.map((member) => member.id)).toEqual(['stranger']);
  });

  it('draws from the best-ranked twelve, three at a time', () => {
    expect(suggestPeople([viewer, ...others], 'me', new Set(), NOW)).toHaveLength(3);
    // Twelve days in a row reach every one of the twelve, and nobody else.
    // The two lowest-ranked, New Yorkers with a different injury, never come up.
    const seen = new Set<string>();
    for (let day = 1; day <= 12; day += 1) {
      for (const member of suggestPeople(
        [viewer, ...others],
        'me',
        new Set(),
        new Date(2026, 9, day),
      )) {
        seen.add(member.id);
      }
    }
    expect(seen.size).toBe(12);
    expect(seen.has('m11') || seen.has('m13')).toBe(false);
  });

  it('is the same all day, and changes the next day', () => {
    const morning = suggestPeople([viewer, ...others], 'me', new Set(), new Date(2026, 8, 29, 8));
    const evening = suggestPeople([viewer, ...others], 'me', new Set(), new Date(2026, 8, 29, 22));
    const tomorrow = suggestPeople([viewer, ...others], 'me', new Set(), new Date(2026, 8, 30, 8));
    expect(evening.map((m) => m.id)).toEqual(morning.map((m) => m.id));
    expect(tomorrow.map((m) => m.id)).not.toEqual(morning.map((m) => m.id));
  });

  // Hidden from Peers means no row in browse_members, so there is nobody to
  // rank against. Mentors first, then the newest.
  it('puts mentors first, then the newest, for a viewer hidden from Peers', () => {
    const picked = suggestPeople(
      [
        makeMember({ id: 'old', createdAt: '2026-01-01T00:00:00Z' }),
        makeMember({ id: 'new', createdAt: '2026-09-01T00:00:00Z' }),
        makeMember({ id: 'mentor', type: 'mentor', createdAt: '2025-01-01T00:00:00Z' }),
      ],
      'me',
      new Set(),
      NOW,
    );
    expect(picked.map((member) => member.id)).toEqual(['mentor', 'new', 'old']);
  });

  it('gives six when asked, for the People pill', () => {
    expect(suggestPeople([viewer, ...others], 'me', new Set(), NOW, 6)).toHaveLength(6);
  });
});

describe('buildFeed', () => {
  const topics = ['a', 'b', 'c', 'd', 'e'].map((id) => makeHomeTopic({ id }));
  const events = ['e1', 'e2', 'e3', 'e4', 'e5'].map((id) => makeEvent({ id }));
  const people = ['p1', 'p2', 'p3', 'p4'].map((id) => makeMember({ id }));

  it('is empty when every source is', () => {
    expect(buildFeed({ topics: [], events: [], people: [] })).toEqual([]);
  });

  it('puts an event or a person after every second topic, alternating', () => {
    expect(keys(buildFeed({ topics, events, people }))).toEqual([
      'topic:a',
      'topic:b',
      'event:e1',
      'topic:c',
      'topic:d',
      'person:p1',
      'topic:e',
      // The topics ran out; what is left of the extras follows, still
      // alternating, and capped at four events and three people.
      'event:e2',
      'person:p2',
      'event:e3',
      'person:p3',
      'event:e4',
    ]);
  });

  it('is the extras alone when nobody has written anything', () => {
    expect(kinds(buildFeed({ topics: [], events, people }))).toEqual([
      'event',
      'person',
      'event',
      'person',
      'event',
      'person',
      'event',
    ]);
  });

  it('carries on with one kind when the other runs out', () => {
    expect(keys(buildFeed({ topics: topics.slice(0, 4), events: [], people }))).toEqual([
      'topic:a',
      'topic:b',
      'person:p1',
      'topic:c',
      'topic:d',
      'person:p2',
      'person:p3',
    ]);
  });

  it('draws a photo topic as a photograph, in its place by activity', () => {
    const feed = buildFeed({
      topics: [makeHomeTopic({ id: 'a' }), makeHomeTopic({ id: 'p', photo: true })],
      events: [],
      people: [],
    });
    expect(kinds(feed)).toEqual(['topic', 'photo']);
  });

  it('never lists one thing twice', () => {
    const twice = makeHomeTopic({ id: 'a' });
    const event = makeEvent({ id: 'e' });
    const feed = buildFeed({ topics: [twice, twice], events: [event, event], people: [] });
    expect(keys(feed)).toEqual(['topic:a', 'event:e']);
  });

  it('comes out the same on every call', () => {
    expect(keys(buildFeed({ topics, events, people }))).toEqual(
      keys(buildFeed({ topics, events, people })),
    );
  });
});

describe('inSegment', () => {
  const sources = {
    topics: [
      makeHomeTopic({ id: 'plain' }),
      makeHomeTopic({ id: 'photo', photo: true }),
      makeHomeTopic({ id: 'plain-2' }),
    ],
    events: Array.from({ length: 10 }, (_, index) => makeEvent({ id: `e${index}` })),
    people: Array.from({ length: 6 }, (_, index) => makeMember({ id: `p${index}` })),
  };

  it('lists only plain topics under Topics', () => {
    expect(keys(inSegment('topics', sources))).toEqual(['topic:plain', 'topic:plain-2']);
  });

  it('lists only photo topics under Photos', () => {
    expect(keys(inSegment('photos', sources))).toEqual(['topic:photo']);
  });

  it('lists up to eight events and six people', () => {
    expect(kinds(inSegment('events', sources))).toEqual(Array(8).fill('event'));
    expect(kinds(inSegment('people', sources))).toEqual(Array(6).fill('person'));
  });

  it('mixes everything under Everything', () => {
    expect(new Set(kinds(inSegment('everything', sources)))).toEqual(
      new Set(['topic', 'photo', 'event', 'person']),
    );
  });

  it('is empty for every pill when there is nothing', () => {
    const none = { topics: [], events: [], people: [] };
    for (const segment of ['everything', 'topics', 'photos', 'events', 'people'] as const) {
      expect(inSegment(segment, none)).toEqual([]);
    }
  });
});
