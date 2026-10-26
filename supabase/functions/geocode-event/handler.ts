/**
 * The rules of geocode-event: each queued event or organization place is
 * looked up once, a second apart, and written back while its address is
 * still the one asked about (geocode_done). Nowhere, or a match in another
 * state, leaves the pin at the city's middle.
 *
 * A lookup starts only when even its slowest run (MAX_LOOKUP_MS) ends inside
 * RUN_LIMIT_MS, well inside the four-minute claim and the platform's limit,
 * so two calls never ask Nominatim at once. Rows not reached, or after a
 * failed lookup, wait for the claim to lapse.
 *
 * Only the database may call it: it sends the vault's geocode_event_secret,
 * which geocodes_due checks before claiming anything.
 */

import { MIN_REQUEST_INTERVAL_MS, type Place, placeInState } from '../_shared/nominatim.ts';

export interface DueRow {
  kind: 'event' | 'place';
  target_id: string;
  query: string;
  state: string | null;
}

export interface Deps {
  /** Claims what is due (geocodes_due); 'refused' for a wrong secret. */
  due(secret: string): Promise<DueRow[] | 'refused' | null>;
  /** lookUpPlace: null for nowhere; throws when not answered. */
  lookup(query: string): Promise<Place | null>;
  /** A null place with a null error: nowhere. */
  done(row: DueRow, place: Place | null, error: string | null): Promise<void>;
  sleep(ms: number): Promise<void>;
  now(): number;
  log(message: string): void;
}

/** Four tries of ten seconds, a second apart. */
export const MAX_LOOKUP_MS = 45_000;
/** The whole run, lookups and writes; the claim lasts four minutes. */
export const RUN_LIMIT_MS = 120_000;

export async function geocodeDue(
  secret: string | null,
  deps: Deps,
): Promise<{ status: number; body: Record<string, number | string> }> {
  if (!secret) return { status: 401, body: { error: 'not the database' } };
  const started = deps.now();
  const inTime = () =>
    deps.now() - started + MAX_LOOKUP_MS + MIN_REQUEST_INTERVAL_MS <= RUN_LIMIT_MS;
  const found = new Map<string, Place | null>();
  let asked = false;
  let placed = 0;
  let nowhere = 0;
  let failed = 0;
  const counts = () => ({ status: 200, body: { placed, nowhere, failed } });

  let batches = 0;
  while (inTime()) {
    // geocodes_due hands out nothing within 1.1s of the last lookup.
    if (batches > 0) await deps.sleep(MIN_REQUEST_INTERVAL_MS);
    batches += 1;
    const rows = await deps.due(secret);
    if (rows === 'refused') return { status: 401, body: { error: 'not the database' } };
    if (!rows) return { status: 502, body: { error: 'could not read the queue' } };
    if (rows.length === 0) break;
    for (const row of rows) {
      let place = found.get(row.query);
      if (place === undefined) {
        if (!inTime()) return counts();
        if (asked) await deps.sleep(MIN_REQUEST_INTERVAL_MS);
        asked = true;
        try {
          place = await deps.lookup(row.query);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          deps.log(`geocode-event: lookup failed: ${message}`);
          await deps.done(row, null, message);
          failed += 1;
          // Asking again now only makes a limit longer.
          return counts();
        }
        found.set(row.query, place);
      }
      const kept = placeInState(place, row.state);
      await deps.done(row, kept, null);
      if (kept) placed += 1;
      else nowhere += 1;
    }
  }
  return counts();
}
