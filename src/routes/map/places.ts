import type { MapContents, MapOrganization, MapPoint } from '@/lib/map-data';
import type { BrowseMember, ClubEvent, Organization } from '@/types/domain';

/**
 * What the map draws, from what the list already shows: the map's places
 * (lib/map-data.ts) kept only for the events and members the list's filters
 * kept, so the two always agree. Pure, for tests.
 */

export type Layer = 'events' | 'peers' | 'organizations';
export const LAYERS: readonly Layer[] = ['events', 'peers', 'organizations'];

/** Events at one point: one venue, or the middle of one city. */
export interface EventSpot extends MapPoint {
  key: string;
  /** False: at its city's middle, not its address. */
  exact: boolean;
  events: ClubEvent[];
}

export interface PeerCity extends MapPoint {
  key: string;
  city: string;
  state: string;
  members: BrowseMember[];
}

/** Organizations' places at one point; a place is exact only at a public address. */
export interface OrganizationSpot extends MapPoint {
  key: string;
  exact: boolean;
  organizations: Organization[];
  places: MapOrganization[];
}

const at = (point: MapPoint) => `${point.latitude},${point.longitude}`;

/** The spot an event is drawn in: one venue, or one city's middle. */
export const spotKeyOf = (place: MapContents['events'][number]) =>
  `${at(place)}|${place.exact ? 'exact' : 'city'}`;

/** The list's events that have a place, grouped by point; list order kept within each. */
export function eventSpots(placed: MapContents['events'], shown: ClubEvent[]): EventSpot[] {
  const where = new Map(placed.map((event) => [event.id, event]));
  const spots = new Map<string, EventSpot>();
  for (const event of shown) {
    const place = where.get(event.id);
    if (!place) continue;
    const key = spotKeyOf(place);
    const spot = spots.get(key);
    if (spot) spot.events.push(event);
    else
      spots.set(key, {
        key,
        latitude: place.latitude,
        longitude: place.longitude,
        exact: place.exact,
        events: [event],
      });
  }
  return [...spots.values()];
}

/** Each city's count is of the members the list shows, so the Peers filters count too. */
export function peerCities(cities: MapContents['peerCities'], shown: BrowseMember[]): PeerCity[] {
  const byId = new Map(shown.map((member) => [member.id, member]));
  return cities.flatMap((city) => {
    const members = city.memberIds.flatMap((id) => {
      const member = byId.get(id);
      return member ? [member] : [];
    });
    return members.length > 0
      ? [
          {
            key: `${city.city}|${city.state}`,
            city: city.city,
            state: city.state,
            latitude: city.latitude,
            longitude: city.longitude,
            members,
          },
        ]
      : [];
  });
}

/**
 * Each place of the organizations shown, one badge per point, and those with
 * no place the map can draw, by name: never a guessed place.
 */
export function organizationSpots(
  placed: MapContents['organizations'],
  organizations: Organization[],
): { spots: OrganizationSpot[]; unplaced: Organization[] } {
  const byId = new Map(organizations.map((organization) => [organization.id, organization]));
  const spots = new Map<string, OrganizationSpot>();
  const onMap = new Set<string>();
  for (const place of placed) {
    const organization = byId.get(place.id);
    if (!organization) continue;
    onMap.add(organization.id);
    const key = `${at(place)}|${place.exact ? 'exact' : 'city'}`;
    const spot = spots.get(key);
    if (spot) {
      spot.places.push(place);
      if (!spot.organizations.includes(organization)) spot.organizations.push(organization);
    } else
      spots.set(key, {
        key,
        latitude: place.latitude,
        longitude: place.longitude,
        exact: place.exact,
        organizations: [organization],
        places: [place],
      });
  }
  const unplaced = organizations.filter((organization) => !onMap.has(organization.id));
  return {
    spots: [...spots.values()],
    unplaced: unplaced.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/* ------------------------------------------------------------------ GeoJSON */

interface Feature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    key: string;
    count: number;
    exact?: boolean;
    orgs?: string;
    organizationId?: string;
    /** The one member of a city, whose photograph its box shows (peer-photos.ts). */
    photo?: string;
    /** The name under the mark: a city's one member, or the organization whose logo it is. */
    label?: string;
  };
}

export interface Features {
  type: 'FeatureCollection';
  features: Feature[];
}

function feature(point: MapPoint, key: string, count: number, exact?: boolean): Feature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [point.longitude, point.latitude] },
    properties: exact === undefined ? { key, count } : { key, count, exact },
  };
}

/** Longest name drawn under a mark, before it is cut with an ellipsis. */
export const LABEL_MAX = 18;

/**
 * A name short enough to sit under its mark (the owner, 2026-10-28): cut at
 * a word where it can, with an ellipsis.
 */
export function shortLabel(name: string, max = LABEL_MAX): string {
  const clean = name.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const atWord = cut.lastIndexOf(' ');
  return `${(atWord >= max / 2 ? cut.slice(0, atWord) : cut).trimEnd()}…`;
}

export function eventFeatures(spots: EventSpot[]): Features {
  return {
    type: 'FeatureCollection',
    features: spots.map((spot) => feature(spot, spot.key, spot.events.length, spot.exact)),
  };
}

export function peerFeatures(cities: PeerCity[]): Features {
  return {
    type: 'FeatureCollection',
    features: cities.map((city) => {
      const point = feature(city, city.key, city.members.length);
      const [only] = city.members;
      if (city.members.length === 1 && only) {
        if (only.photoPath) point.properties.photo = only.id;
        point.properties.label = shortLabel(only.displayName);
      }
      return point;
    }),
  };
}

/** The members alone in their city with a photograph, whose boxes show it. */
export function lonePeers(cities: PeerCity[]): BrowseMember[] {
  return cities.flatMap((city) =>
    city.members.length === 1 && city.members[0]?.photoPath ? [city.members[0]] : [],
  );
}

/**
 * `orgs` lets a layer pick out one organization's places while its sheet is
 * open; `organizationId` is whose logo the point shows, the first by name, as
 * the sheet lists them.
 */
export function organizationFeatures(spots: OrganizationSpot[]): Features {
  return {
    type: 'FeatureCollection',
    features: spots.map((spot) => {
      const point = feature(spot, spot.key, spot.organizations.length, spot.exact);
      point.properties.orgs = `,${spot.organizations.map((o) => o.id).join(',')},`;
      const [first] = [...spot.organizations].sort((a, b) => a.name.localeCompare(b.name));
      if (first) {
        point.properties.organizationId = first.id;
        point.properties.label = shortLabel(first.name);
      }
      return point;
    }),
  };
}

/** The other places of these organizations, for "Also in" and their rings. */
export function otherPlaces(
  placed: MapContents['organizations'],
  organizationIds: ReadonlySet<string>,
  here: ReadonlySet<string>,
): MapOrganization[] {
  return placed.filter((place) => organizationIds.has(place.id) && !here.has(place.placeId));
}

/** Members the list shows that no city bubble counts: the map is off for them, or their city is not placed. */
export function notOnMap(cities: MapContents['peerCities'], shown: BrowseMember[]): number {
  const counted = new Set(cities.flatMap((city) => city.memberIds));
  return shown.filter((member) => !counted.has(member.id)).length;
}

/* ------------------------------------------------------------------ in view */

/** [west, south, east, north]. */
export type Box = [number, number, number, number];

export function inBox(point: MapPoint, [west, south, east, north]: Box): boolean {
  return (
    point.longitude >= west &&
    point.longitude <= east &&
    point.latitude >= south &&
    point.latitude <= north
  );
}

/** What a set of places holds, as one sheet lists it. */
export interface PlaceContents {
  events: { event: ClubEvent; exact: boolean }[];
  members: BrowseMember[];
  organizations: Organization[];
}

export function contentsOf(
  spots: EventSpot[],
  cities: PeerCity[],
  organizations: OrganizationSpot[],
): PlaceContents {
  return {
    events: spots
      .flatMap((spot) => spot.events.map((event) => ({ event, exact: spot.exact })))
      .sort((a, b) => a.event.startTime.localeCompare(b.event.startTime)),
    members: cities.flatMap((city) => city.members),
    organizations: organizations
      .flatMap((spot) => spot.organizations)
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** "3 events, 6 members", for the sheet's title and the in-view button. */
export function countWords(contents: PlaceContents, layers: ReadonlySet<Layer>): string {
  const parts: string[] = [];
  const say = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (layers.has('events')) parts.push(say(contents.events.length, 'event', 'events'));
  if (layers.has('peers')) parts.push(say(contents.members.length, 'member', 'members'));
  if (layers.has('organizations'))
    parts.push(say(contents.organizations.length, 'organization', 'organizations'));
  return parts.join(', ');
}
