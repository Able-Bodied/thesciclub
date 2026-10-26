import { describe, expect, it } from 'vitest';
import { RateLimited, Unreachable } from './scrapers/geocode.js';
import { placeStaleEvents } from './stale-places.js';

/** Each claim takes the next batch; then nothing. */
function fakeSupabase(batches) {
  const calls = [];
  const done = [];
  return {
    calls,
    done,
    rpc: (name, args) => {
      calls.push(name);
      if (name === 'geocodes_enqueue_stale') return Promise.resolve({ data: 3, error: null });
      if (name === 'geocodes_claim_for_import')
        return Promise.resolve({ data: batches.shift() ?? [], error: null });
      done.push(args);
      return Promise.resolve({ data: true, error: null });
    },
  };
}

const at = (state, latitude) => ({ state, latitude, longitude: -121.7, precision: 'exact' });
const row = (target_id, query, state = 'CA', kind = 'event') => ({ kind, target_id, query, state });

describe('placeStaleEvents', () => {
  it('queues once, then claims through the shared queue until it is empty', async () => {
    const supabase = fakeSupabase([
      [row('e1', '9 New St, Davis, CA'), row('p2', '9 New St, Davis, CA', 'CA', 'place')],
      [row('e3', 'Springfield', 'IL')],
    ]);
    const asked = [];
    await placeStaleEvents(
      supabase,
      { dryRun: false },
      (query) => {
        asked.push(query);
        return Promise.resolve(query === 'Springfield' ? at('MO', 37.2) : at('CA', 38.5));
      },
      0,
    );
    expect(supabase.calls.filter((c) => c === 'geocodes_enqueue_stale')).toHaveLength(1);
    expect(supabase.calls.filter((c) => c === 'geocodes_claim_for_import')).toHaveLength(3);
    expect(asked).toEqual(['9 New St, Davis, CA', 'Springfield']);
    expect(
      supabase.done.map((d) => [d.p_kind, d.p_target, d.p_latitude, d.p_precision, d.p_error]),
    ).toEqual([
      ['event', 'e1', 38.5, 'exact', null],
      ['place', 'p2', 38.5, 'exact', null],
      ['event', 'e3', null, null, null],
    ]);
  });

  it('stops at no answer or a limit, recording the one asked', async () => {
    for (const error of [new Unreachable('no answer'), new RateLimited('429')]) {
      const supabase = fakeSupabase([[row('e1', 'A'), row('e2', 'B')]]);
      await placeStaleEvents(supabase, { dryRun: false }, () => Promise.reject(error), 0);
      expect(supabase.done.map((d) => [d.p_target, d.p_error])).toEqual([['e1', error.message]]);
    }
  });

  it('asks nothing on a dry run', async () => {
    const supabase = fakeSupabase([[row('e1', 'A')]]);
    await placeStaleEvents(supabase, { dryRun: true }, () => Promise.resolve(at('CA', 38.5)), 0);
    expect(supabase.calls).toEqual([]);
  });
});
