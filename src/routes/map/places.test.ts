import { describe, expect, it } from 'vitest';
import type { MapContents } from '@/lib/map-data';
import {
  contentsOf,
  countWords,
  eventFeatures,
  eventSpots,
  inBox,
  lonePeers,
  notOnMap,
  organizationFeatures,
  organizationSpots,
  otherPlaces,
  peerCities,
  peerFeatures,
  shortLabel,
} from '@/routes/map/places';
import { filterMembers } from '@/routes/peers/filters';
import { makeEvent, makeMember, makeOrganization } from '@/test/factory';
import { EMPTY_MEMBER_FILTERS } from '@/types/domain';

const SAN_JOSE = { latitude: 37.33874, longitude: -121.88524 };
const OAKLAND = { latitude: 37.80437, longitude: -122.2708 };

describe('peers on the map', () => {
  const cities: MapContents['peerCities'] = [
    { city: 'San Jose', state: 'CA', ...SAN_JOSE, memberIds: ['ann', 'bo', 'cy'] },
    { city: 'Oakland', state: 'CA', ...OAKLAND, memberIds: ['dee'] },
  ];
  const members = [
    makeMember({ id: 'ann', type: 'mentor', city: 'San Jose' }),
    makeMember({ id: 'bo', type: 'peer', city: 'San Jose' }),
    makeMember({ id: 'cy', type: 'mentor', city: 'San Jose' }),
    makeMember({ id: 'dee', type: 'peer', city: 'Oakland' }),
  ];

  it('counts each city by the members the list shows', () => {
    const counted = peerCities(cities, members);
    expect(counted.map((city) => [city.city, city.members.length])).toEqual([
      ['San Jose', 3],
      ['Oakland', 1],
    ]);
  });

  it("follows the list's filters, and drops a city left empty", () => {
    const mentors = filterMembers(members, EMPTY_MEMBER_FILTERS, 'mentors');
    const counted = peerCities(cities, mentors);
    expect(counted).toHaveLength(1);
    expect(counted[0]?.members.map((member) => member.id)).toEqual(['ann', 'cy']);
  });

  it('never counts somebody the list does not show, such as the reader', () => {
    const counted = peerCities(cities, members.slice(1));
    expect(counted[0]?.members.map((member) => member.id)).toEqual(['bo', 'cy']);
  });

  it("is a point at the city's middle with a count, and nothing finer", () => {
    const features = peerFeatures(peerCities(cities, members)).features;
    expect(features[0]?.geometry.coordinates).toEqual([SAN_JOSE.longitude, SAN_JOSE.latitude]);
    expect(features[0]?.properties).toEqual({ key: 'San Jose|CA', count: 3 });
  });
});

describe('events on the map', () => {
  const placed: MapContents['events'] = [
    { id: 'rugby', latitude: 37.3, longitude: -121.9, exact: true },
    { id: 'coffee', ...SAN_JOSE, exact: false },
    { id: 'talk', ...SAN_JOSE, exact: false },
    { id: 'swim', latitude: 37.3, longitude: -121.9, exact: true },
  ];
  const events = [
    makeEvent({ id: 'rugby', startTime: '2026-11-01T10:00:00Z' }),
    makeEvent({ id: 'coffee', startTime: '2026-11-02T10:00:00Z' }),
    makeEvent({ id: 'talk', startTime: '2026-11-03T10:00:00Z' }),
    makeEvent({ id: 'swim', startTime: '2026-11-04T10:00:00Z' }),
    makeEvent({ id: 'zoom', format: 'online' }),
  ];

  it('puts events at the same place together, exact apart from approximate', () => {
    const spots = eventSpots(placed, events);
    expect(spots.map((spot) => [spot.exact, spot.events.map((event) => event.id)])).toEqual([
      [true, ['rugby', 'swim']],
      [false, ['coffee', 'talk']],
    ]);
  });

  it('marks an event at its city middle as approximate', () => {
    const features = eventFeatures(eventSpots(placed, events)).features;
    expect(features.map((feature) => feature.properties)).toEqual([
      { key: '37.3,-121.9|exact', count: 2, exact: true },
      { key: '37.33874,-121.88524|city', count: 2, exact: false },
    ]);
  });

  it('draws only what the filtered list holds, and nothing the map has no place for', () => {
    const spots = eventSpots(
      placed,
      [events[0], events[4]].flatMap((e) => (e ? [e] : [])),
    );
    expect(spots.flatMap((spot) => spot.events.map((event) => event.id))).toEqual(['rugby']);
  });

  it('lists a place in date order, saying which are approximate', () => {
    const contents = contentsOf(eventSpots(placed, events), [], []);
    expect(contents.events.map(({ event, exact }) => [event.id, exact])).toEqual([
      ['rugby', true],
      ['coffee', false],
      ['talk', false],
      ['swim', true],
    ]);
  });
});

describe('organizations on the map', () => {
  const organizations = [
    makeOrganization({ id: 'borp', name: 'BORP', city: 'Berkeley' }),
    makeOrganization({ id: 'cil', name: 'Center for Independent Living', city: 'Berkeley' }),
    makeOrganization({ id: 'reeve', name: 'Reeve Foundation', city: '' }),
    makeOrganization({ id: 'abc', name: 'A national body', city: 'Springfield' }),
  ];
  const place = (
    placeId: string,
    id: string,
    city: string,
    latitude: number,
    exact = false,
  ): MapContents['organizations'][number] => ({
    placeId,
    id,
    label: null,
    city,
    state: 'CA',
    latitude,
    longitude: -122.27,
    exact,
  });
  const placed: MapContents['organizations'] = [
    place('p1', 'borp', 'Berkeley', 37.87),
    place('p2', 'cil', 'Berkeley', 37.87),
    place('p3', 'borp', 'Oakland', 37.8, true),
    place('p4', 'borp', 'Fremont', 37.55),
  ];

  it('draws one badge per place, organizations sharing a city middle together', () => {
    const { spots } = organizationSpots(placed, organizations);
    expect(spots.map((spot) => [spot.organizations.map((o) => o.id), spot.exact])).toEqual([
      [['borp', 'cil'], false],
      [['borp'], true],
      [['borp'], false],
    ]);
  });

  it('marks each place exact or at its city middle, and names its organizations', () => {
    const features = organizationFeatures(organizationSpots(placed, organizations).spots).features;
    expect(features[0]?.properties).toEqual({
      key: '37.87,-122.27|city',
      count: 2,
      exact: false,
      orgs: ',borp,cil,',
      organizationId: 'borp',
      label: 'BORP',
    });
    expect(features[1]?.properties.exact).toBe(true);
  });

  it("shows the first organization by name's logo where several share a point", () => {
    const together = [place('p5', 'cil', 'Albany', 37.88), place('p6', 'borp', 'Albany', 37.88)];
    const [point] = organizationFeatures(organizationSpots(together, organizations).spots).features;
    expect(point?.properties).toMatchObject({
      count: 2,
      orgs: ',cil,borp,',
      organizationId: 'borp',
    });
  });

  it("finds an organization's other places, for Also in", () => {
    const others = otherPlaces(placed, new Set(['borp']), new Set(['p1']));
    expect(others.map((p) => p.city)).toEqual(['Oakland', 'Fremont']);
  });

  it('draws only the organizations the directory shows', () => {
    const { spots } = organizationSpots(placed, organizations.slice(1, 2));
    expect(spots.map((spot) => spot.organizations.map((o) => o.id))).toEqual([['cil']]);
  });

  it('lists the rest as not on the map, by name, never guessing a place', () => {
    const { unplaced } = organizationSpots(placed, organizations);
    expect(unplaced.map((o) => o.id)).toEqual(['abc', 'reeve']);
  });
});

describe('peers the map cannot show', () => {
  it('counts those in the list that no city counts', () => {
    const cities: MapContents['peerCities'] = [
      { city: 'San Jose', state: 'CA', ...SAN_JOSE, memberIds: ['a', 'b'] },
    ];
    const shown = ['a', 'b', 'c', 'd'].map((id) => makeMember({ id }));
    expect(notOnMap(cities, shown)).toBe(2);
    expect(notOnMap(cities, shown.slice(0, 2))).toBe(0);
  });
});

describe('what is in view', () => {
  it('keeps a point inside the box, edges included', () => {
    expect(inBox(SAN_JOSE, [-122, 37, -121, 38])).toBe(true);
    expect(inBox(OAKLAND, [-122, 37, -121, 38])).toBe(false);
    expect(inBox({ latitude: 37, longitude: -122 }, [-122, 37, -121, 38])).toBe(true);
  });

  it('says what is there, for the layers that are on', () => {
    const contents = {
      events: [{ event: makeEvent(), exact: true }],
      members: [makeMember(), makeMember()],
      organizations: [],
    };
    expect(countWords(contents, new Set(['events', 'peers']))).toBe('1 event, 2 members');
    expect(countWords(contents, new Set(['organizations']))).toBe('0 organizations');
  });
});

// The owner, 2026-10-28: a city's one member shows their photograph, not "1".
describe('a city with one member', () => {
  const city = (name: string, memberIds: string[]) => ({
    city: name,
    state: 'CA',
    latitude: 37.8,
    longitude: -122.27,
    memberIds,
  });

  it('carries the member whose photograph its box shows', () => {
    const members = [
      makeMember({ id: 'sam', photoPath: 'sam/photo.webp' }),
      makeMember({ id: 'jo', photoPath: null }),
      makeMember({ id: 'ana', photoPath: 'ana/photo.webp' }),
      makeMember({ id: 'lee', photoPath: 'lee/photo.webp' }),
    ];
    const cities = peerCities(
      [city('Oakland', ['sam']), city('Fremont', ['jo']), city('San Jose', ['ana', 'lee'])],
      members,
    );
    const photos = peerFeatures(cities).features.map((feature) => feature.properties.photo);
    // Fremont's one member has no photograph; San Jose has two.
    expect(photos).toEqual(['sam', undefined, undefined]);
    expect(lonePeers(cities).map((member) => member.id)).toEqual(['sam']);
  });
});

// The owner, 2026-10-28: a name under each mark, cut when long.
describe('the name under a mark', () => {
  it('keeps a short name, and cuts a long one at a word', () => {
    expect(shortLabel('NorCal SCI')).toBe('NorCal SCI');
    expect(shortLabel('Bay Area Outreach and Recreation Program')).toBe('Bay Area Outreach…');
    expect(shortLabel('Supercalifragilisticexpialidocious')).toBe('Supercalifragilis…');
  });

  it('names a city by its one member', () => {
    const cities = peerCities(
      [{ city: 'Oakland', state: 'CA', latitude: 37.8, longitude: -122.27, memberIds: ['sam'] }],
      [makeMember({ id: 'sam', displayName: 'Sam Rivera', photoPath: null })],
    );
    expect(peerFeatures(cities).features[0]?.properties.label).toBe('Sam Rivera');
  });
});
