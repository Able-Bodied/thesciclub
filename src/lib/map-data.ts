import { useCallback, useEffect, useState } from 'react';
import { useAccount } from '@/lib/account';
import { onForgetSharedReads } from '@/lib/shared-reads';
import { getSupabase } from '@/lib/supabase';

/**
 * What the map draws (20261025020000), read once per signed-in member and
 * kept in memory until sign-out. Nobody is placed finer than their city's
 * middle; an event is exact only when the database says so.
 */
export interface MapPoint {
  latitude: number;
  longitude: number;
}

export interface MapEvent extends MapPoint {
  id: string;
  /** False: placed at its city's middle. */
  exact: boolean;
}

export interface MapPeerCity extends MapPoint {
  city: string;
  state: string;
  memberIds: string[];
}

/** One of an organization's places (organization_places, 20261025015000). */
export interface MapOrganization extends MapPoint {
  placeId: string;
  /** The organization. */
  id: string;
  label: string | null;
  city: string;
  state: string;
  /** False: at its city's middle. */
  exact: boolean;
}

export interface MapContents {
  events: MapEvent[];
  peerCities: MapPeerCity[];
  organizations: MapOrganization[];
  /** The middle of the member's own city; null when it is not placed. */
  home: MapPoint | null;
}

export type MapDataStatus = 'loading' | 'ready' | 'error';

export interface MapData extends MapContents {
  status: MapDataStatus;
  /** The same object until the answer changes, for a map's sources. */
  contents: MapContents;
  /** Asks again after an error. */
  retry: () => void;
}

/** An answer older than this is read again when the map is shown. */
export const MAP_FRESH_MS = 60_000;

const EMPTY: MapContents = { events: [], peerCities: [], organizations: [], home: null };

interface Held {
  userId: string;
  read: Promise<MapContents>;
  value?: MapContents;
  at?: number;
}
let held: Held | null = null;
onForgetSharedReads(() => {
  held = null;
});

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isText = (v: unknown): v is string => typeof v === 'string';

function pointOf(row: Record<string, unknown>): MapPoint | null {
  return isNumber(row.latitude) && isNumber(row.longitude)
    ? { latitude: row.latitude, longitude: row.longitude }
    : null;
}

async function rows(name: string): Promise<Record<string, unknown>[]> {
  const answer = await getSupabase().rpc(name);
  if (answer.error) throw new Error(answer.error.message);
  const data: unknown = answer.data;
  return Array.isArray(data)
    ? data.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
    : [];
}

/** Each row narrowed; one in an unexpected shape is left off the map. */
export function toMapContents(
  events: Record<string, unknown>[],
  peers: Record<string, unknown>[],
  organizations: Record<string, unknown>[],
  home: Record<string, unknown>[],
): MapContents {
  const contents: MapContents = { events: [], peerCities: [], organizations: [], home: null };
  for (const row of events) {
    const at = pointOf(row);
    if (at && isText(row.id))
      contents.events.push({ id: row.id, ...at, exact: row.exact === true });
  }
  for (const row of peers) {
    const at = pointOf(row);
    if (!at || !isText(row.city) || !isText(row.state) || !Array.isArray(row.member_ids)) continue;
    const memberIds = row.member_ids.filter(isText);
    if (memberIds.length > 0) {
      contents.peerCities.push({ city: row.city, state: row.state, ...at, memberIds });
    }
  }
  for (const row of organizations) {
    const at = pointOf(row);
    if (!at || !isText(row.id)) continue;
    // Before 20261025015000's places: one row per organization.
    contents.organizations.push({
      placeId: isText(row.place_id) ? row.place_id : row.id,
      id: row.id,
      label: isText(row.label) && row.label.trim() ? row.label : null,
      city: isText(row.city) ? row.city : '',
      state: isText(row.state) ? row.state : '',
      ...at,
      exact: row.exact === true,
    });
  }
  const first = home[0];
  contents.home = first ? pointOf(first) : null;
  return contents;
}

/** `again`: a fresh read, the last answer standing until it lands. */
function readMap(userId: string, again = false): Promise<MapContents> {
  if (held?.userId === userId && !again) return held.read;
  const before = held?.userId === userId ? held : null;
  const read = Promise.all([
    rows('map_events'),
    rows('map_peer_cities'),
    rows('map_organizations'),
    rows('map_home'),
  ]).then(([events, peers, organizations, home]) =>
    toMapContents(events, peers, organizations, home),
  );
  const entry: Held = { userId, read };
  if (before?.value) {
    entry.value = before.value;
    entry.at = before.at ?? 0;
  }
  held = entry;
  read.then(
    (value) => {
      entry.value = value;
      entry.at = Date.now();
    },
    () => {
      if (held !== entry) return;
      // A failed refresh keeps the last answer; a failed first read is not kept.
      if (entry.value) entry.read = Promise.resolve(entry.value);
      else held = null;
    },
  );
  return read;
}

function isStale(userId: string): boolean {
  return held?.userId === userId && Date.now() - (held.at ?? 0) > MAP_FRESH_MS;
}

interface Settled {
  status: MapDataStatus;
  contents: MapContents;
}

function knownFor(userId: string | null): Settled {
  const value = userId && held?.userId === userId ? held.value : undefined;
  return value ? { status: 'ready', contents: value } : { status: 'loading', contents: EMPTY };
}

const same = (a: Settled, b: Settled) => a.status === b.status && a.contents === b.contents;

/**
 * Only a member asks; anyone else gets an empty map, which the database would
 * give them. While `active` (the map is shown), an answer over a minute old is
 * read again behind the one drawn, so a peer who left the map or a new block
 * shows without a reload; so is one found stale when the app comes back.
 */
export function useMapData(active = true): MapData {
  const account = useAccount();
  const userId = account.status === 'member' ? account.userId : null;
  const waiting = account.status === 'loading';
  const [attempt, setAttempt] = useState(0);
  const [returned, setReturned] = useState(0);
  const [settled, setSettled] = useState<Settled>(() => knownFor(userId));
  const settle = (next: Settled) => {
    setSettled((now) => (same(now, next) ? now : next));
  };

  useEffect(() => {
    if (!active) return;
    const onShow = () => {
      if (document.visibilityState === 'visible') setReturned((n) => n + 1);
    };
    document.addEventListener('visibilitychange', onShow);
    return () => {
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [active]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` and `returned` are triggers to look again.
  useEffect(() => {
    if (!userId) {
      settle({ status: waiting ? 'loading' : 'ready', contents: EMPTY });
      return;
    }
    if (!active) return;
    const known = knownFor(userId);
    settle(known);
    if (known.status === 'ready' && !isStale(userId)) return;
    let cancelled = false;
    readMap(userId, known.status === 'ready').then(
      (contents) => {
        if (!cancelled) settle({ status: 'ready', contents });
      },
      () => {
        if (!cancelled && known.status !== 'ready') settle({ status: 'error', contents: EMPTY });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [userId, waiting, attempt, active, returned]);

  const retry = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);
  return { status: settled.status, contents: settled.contents, ...settled.contents, retry };
}
