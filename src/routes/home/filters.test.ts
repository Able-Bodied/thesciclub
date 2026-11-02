import { describe, expect, it } from 'vitest';
import type { FeedItem, HomeTopic } from '@/lib/home/types';
import {
  activeFilterCount,
  chipsFor,
  EMPTY_FEED_FILTERS,
  type FeedFilterContext,
  type FeedFilters,
  matchesFeedFilters,
  openRoomsById,
  roomsIn,
  roomsOf,
  toggleRoom,
} from '@/routes/home/filters';
import { makeEvent, makeHomeTopic, makeMember, makeRoom, makeTag } from '@/test/factory';
import type { BrowseMember, ClubEvent } from '@/types/domain';

/**
 * What "Filter your feed" keeps, without a render. The sheet and the page draw
 * what these return; the rules are here.
 */

const topic = (o: Partial<HomeTopic> & { id: string }): FeedItem => ({
  kind: 'topic',
  key: `topic:${o.id}`,
  topic: makeHomeTopic(o),
});
const photo = (o: Partial<HomeTopic> & { id: string }): FeedItem => ({
  kind: 'photo',
  key: `topic:${o.id}`,
  topic: makeHomeTopic({ photo: true, ...o }),
});
const event = (o: Partial<ClubEvent> & { id: string }): FeedItem => ({
  kind: 'event',
  key: `event:${o.id}`,
  event: makeEvent(o),
});
const person = (o: Partial<BrowseMember> & { id: string }): FeedItem => ({
  kind: 'person',
  key: `person:${o.id}`,
  member: makeMember(o),
});

const ROOMS = [
  makeRoom({ id: 'bowel', name: 'Bowel management', sortOrder: 1 }),
  makeRoom({ id: 'sport', name: 'Adaptive sport', sortOrder: 9 }),
  makeRoom({ id: 'equip', name: 'Equipment & assistive tech', sortOrder: 11 }),
  makeRoom({ id: 'skin', name: 'Skin & pressure sores', sortOrder: 3, openedAt: null }),
];

const context: FeedFilterContext = {
  openRooms: openRoomsById(ROOMS),
};

const filters = (o: Partial<FeedFilters>): FeedFilters => ({ ...EMPTY_FEED_FILTERS, ...o });
const kept = (items: FeedItem[], chosen: FeedFilters) =>
  items.filter((item) => matchesFeedFilters(item, chosen, context)).map((item) => item.key);

describe('openRoomsById', () => {
  it('leaves out a closed room, which only an administrator reads', () => {
    expect([...openRoomsById(ROOMS).keys()]).toEqual(['bowel', 'sport', 'equip']);
  });
});

describe('roomsOf', () => {
  it('puts a topic and a photograph in their own room', () => {
    expect(roomsOf(topic({ id: 't', roomId: 'bowel' }), context)).toEqual(['bowel']);
    expect(roomsOf(photo({ id: 'p', roomId: 'equip' }), context)).toEqual(['equip']);
  });

  it('puts a sport event in Adaptive sport, and no other event anywhere', () => {
    const swim = event({ id: 'swim', tags: [makeTag('swimming', 'sport')] });
    const talk = event({ id: 'talk', tags: [makeTag('benefits', 'money')] });
    expect(roomsOf(swim, context)).toEqual(['sport']);
    expect(roomsOf(talk, context)).toEqual([]);
  });

  it('puts a sport event nowhere while Adaptive sport is closed', () => {
    const closedSport: FeedFilterContext = {
      ...context,
      openRooms: openRoomsById([makeRoom({ id: 'sport', openedAt: null })]),
    };
    const swim = event({ id: 'swim', tags: [makeTag('swimming', 'sport')] });
    expect(roomsOf(swim, closedSport)).toEqual([]);
  });

  it('puts a member in every open room their topics name', () => {
    const kerry = person({
      id: 'kerry',
      topics: ['Adaptive sports', 'Bowel programme', 'Pressure sores', 'Living independently'],
    });
    // Pressure sores names Skin, which is closed; Living independently names
    // no room at all.
    expect(roomsOf(kerry, context)).toEqual(['sport', 'bowel']);
  });
});

describe('matchesFeedFilters', () => {
  const items = [
    topic({ id: 'routine', roomId: 'bowel', authorId: 'alex' }),
    photo({ id: 'cushion', roomId: 'equip', authorId: 'jan' }),
    topic({ id: 'hidden', roomId: 'bowel', authorId: 'not-in-peers' }),
    topic({ id: 'former', roomId: 'bowel', authorId: null }),
    event({ id: 'swim', city: 'San Jose', format: 'in_person', tags: [makeTag('swim')] }),
    event({ id: 'circle', city: null, format: 'online' }),
    event({ id: 'talk', city: 'Oakland', format: 'hybrid' }),
    person({ id: 'kerry', city: 'San Jose', topics: ['Adaptive sports'] }),
    person({ id: 'dante', city: 'Aptos', topics: ['Bowel programme'] }),
  ];

  it('keeps everything with nothing chosen', () => {
    expect(kept(items, EMPTY_FEED_FILTERS)).toHaveLength(items.length);
  });

  it('narrows to a room: its topics, its members, and for sport its events', () => {
    expect(kept(items, filters({ rooms: ['bowel'] }))).toEqual([
      'topic:routine',
      'topic:hidden',
      'topic:former',
      'person:dante',
    ]);
    expect(kept(items, filters({ rooms: ['sport'] }))).toEqual(['event:swim', 'person:kerry']);
  });

  it('widens within a group: this room or that one', () => {
    expect(kept(items, filters({ rooms: ['bowel', 'equip'] }))).toEqual([
      'topic:routine',
      'topic:cushion',
      'topic:hidden',
      'topic:former',
      'person:dante',
    ]);
  });
});

describe('roomsIn', () => {
  it('offers the open rooms something in the list belongs to, in Chat’s order', () => {
    const items = [
      topic({ id: 't', roomId: 'equip' }),
      person({ id: 'kerry', topics: ['Adaptive sports', 'Pressure sores'] }),
      topic({ id: 'u', roomId: 'bowel' }),
    ];
    expect(roomsIn(items, context).map((room) => room.id)).toEqual(['bowel', 'sport', 'equip']);
  });

  it('offers nothing for a list that belongs to no room', () => {
    expect(roomsIn([event({ id: 'talk' })], context)).toEqual([]);
  });
});

describe('chipsFor', () => {
  const people = [person({ id: 'a', city: 'Aptos', topics: ['Bowel programme'] })];

  it('is what the list offers when nothing is on', () => {
    expect(chipsFor(people, EMPTY_FEED_FILTERS, context)).toEqual({ rooms: [ROOMS[0]] });
  });

  it('keeps a room that is on, even where nothing in this list matches it', () => {
    const chips = chipsFor(people, filters({ rooms: ['equip'] }), context);
    expect(chips.rooms.map((room) => room.id)).toEqual(['bowel', 'equip']);
  });
});

describe('activeFilterCount and toggleRoom', () => {
  it('counts every room, and a distance', () => {
    expect(activeFilterCount(EMPTY_FEED_FILTERS)).toBe(0);
    expect(activeFilterCount(filters({ rooms: ['bowel'], withinMiles: 20 }))).toBe(2);
    expect(activeFilterCount(filters({ withinMiles: null }))).toBe(0);
  });

  it('turns a room on, and off again', () => {
    const on = toggleRoom(EMPTY_FEED_FILTERS, 'bowel');
    expect(on.rooms).toEqual(['bowel']);
    expect(toggleRoom(on, 'bowel').rooms).toEqual([]);
  });
});
