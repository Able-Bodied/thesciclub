// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { type Place, RateLimited, Unreachable } from '../_shared/nominatim.ts';
import { type Deps, type DueRow, geocodeDue, MAX_LOOKUP_MS, RUN_LIMIT_MS } from './handler.ts';

const SECRET = 'from-the-vault';

const at = (state: string, latitude = 38.5): Place => ({
  city: 'Davis',
  state,
  postalCode: null,
  latitude,
  longitude: -121.7,
  precision: 'exact',
});

/** Each call to due() takes the next batch; then nothing. Each lookup takes `step`. */
function setup(
  batches: DueRow[][] | null,
  places: Record<string, Place | null | Error>,
  step = 1000,
) {
  const log = {
    asked: [] as string[],
    looked: [] as string[],
    done: [] as string[],
    slept: 0,
    lines: [] as string[],
    started: [] as number[],
  };
  let clock = 0;
  const deps: Deps = {
    due: (secret) => {
      log.asked.push(secret);
      if (secret !== SECRET) return Promise.resolve('refused');
      if (!batches) return Promise.resolve(null);
      return Promise.resolve(batches.shift() ?? []);
    },
    lookup: (query) => {
      log.looked.push(query);
      log.started.push(clock);
      clock += step;
      const place = places[query];
      return place instanceof Error ? Promise.reject(place) : Promise.resolve(place ?? null);
    },
    done: (row, place, error) => {
      log.done.push(`${row.target_id}:${error ?? (place ? `${place.latitude}` : 'nowhere')}`);
      return Promise.resolve();
    },
    sleep: (ms) => {
      log.slept += ms;
      clock += ms;
      return Promise.resolve();
    },
    now: () => clock,
    log: (line) => log.lines.push(line),
  };
  return { deps, log };
}

const row = (target_id: string, query: string, state: string | null = 'CA'): DueRow => ({
  kind: target_id.startsWith('p') ? 'place' : 'event',
  target_id,
  query,
  state,
});

describe('geocode-event', () => {
  it('places events and places once a query, a second apart, until the queue is empty', async () => {
    const { deps, log } = setup(
      [
        [row('e1', '1 Main St, Davis, CA'), row('p2', '1 Main St, Davis, CA')],
        [row('e3', 'Gym, Davis, CA')],
      ],
      { '1 Main St, Davis, CA': at('CA'), 'Gym, Davis, CA': at('CA', 38.6) },
    );
    expect(await geocodeDue(SECRET, deps)).toEqual({
      status: 200,
      body: { placed: 3, nowhere: 0, failed: 0 },
    });
    expect(log.looked).toEqual(['1 Main St, Davis, CA', 'Gym, Davis, CA']);
    expect(log.done).toEqual(['e1:38.5', 'p2:38.5', 'e3:38.6']);
    // One second between the two lookups, and before each later claim.
    expect(log.slept).toBe(3300);
    expect(log.asked).toHaveLength(3);
  });

  it('counts nowhere, a match in another state, and no state at all as nowhere', async () => {
    const { deps, log } = setup(
      [[row('e1', 'Nowhere, CA'), row('e2', 'Springfield', 'IL'), row('e3', 'Gym, Davis', null)]],
      { Springfield: at('MO'), 'Gym, Davis': at('CA') },
    );
    expect((await geocodeDue(SECRET, deps)).body).toEqual({ placed: 0, nowhere: 3, failed: 0 });
    expect(log.done).toEqual(['e1:nowhere', 'e2:nowhere', 'e3:nowhere']);
  });

  it('stops at a refusal or no answer, and leaves the rest claimed', async () => {
    for (const error of [new RateLimited('Nominatim answered 429'), new Unreachable('No answer')]) {
      const { deps, log } = setup(
        [[row('e1', 'A, CA'), row('e2', 'B, CA')], [row('e3', 'C, CA')]],
        {
          'A, CA': error,
        },
      );
      expect((await geocodeDue(SECRET, deps)).body).toEqual({ placed: 0, nowhere: 0, failed: 1 });
      expect(log.done).toEqual([`e1:${error.message}`]);
      expect(log.looked).toEqual(['A, CA']);
    }
  });

  it('starts no lookup that could end after its time, however slow each one is', async () => {
    const batch = Array.from({ length: 10 }, (_, i) => row(`e${i}`, `${i} Main St, CA`));
    const { deps, log } = setup([batch, batch], {}, MAX_LOOKUP_MS);
    await geocodeDue(SECRET, deps);
    expect(log.looked.length).toBeGreaterThan(0);
    for (const start of log.started)
      expect(start + MAX_LOOKUP_MS).toBeLessThanOrEqual(RUN_LIMIT_MS);
    expect(log.done).toHaveLength(log.looked.length);
  });

  it('refuses a caller without the secret before asking the database', async () => {
    const { deps, log } = setup([[row('e1', 'A, CA')]], {});
    expect(await geocodeDue(null, deps)).toEqual({
      status: 401,
      body: { error: 'not the database' },
    });
    expect(await geocodeDue('', deps)).toMatchObject({ status: 401 });
    expect(log.asked).toEqual([]);
  });

  it('refuses a wrong secret, and looks nothing up', async () => {
    const { deps, log } = setup([[row('e1', 'A, CA')]], {});
    expect(await geocodeDue('guess', deps)).toMatchObject({ status: 401 });
    expect(log.looked).toEqual([]);
    expect(log.done).toEqual([]);
  });

  it('says so when the queue cannot be read', async () => {
    const { deps } = setup(null, {});
    expect((await geocodeDue(SECRET, deps)).status).toBe(502);
  });
});
