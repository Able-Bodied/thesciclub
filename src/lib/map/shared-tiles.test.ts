import type { RequestParameters } from 'maplibre-gl';
import { describe, expect, it, vi } from 'vitest';
import { shareTiles } from './shared-tiles';

const tile = (url: string): RequestParameters => ({ url, type: 'arrayBuffer' });

function deferred() {
  let resolve: (value: { data: unknown }) => void = () => undefined;
  const promise = new Promise<{ data: unknown }>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('shared tile fetches', () => {
  it('fetches a tile once for every caller, each with its own copy', async () => {
    const load = vi.fn(() => Promise.resolve({ data: new Uint8Array([1, 2, 3]) }));
    const share = shareTiles(load);
    const [a, b] = await Promise.all([
      share(tile('pmtiles://x/7/1/2'), new AbortController()),
      share(tile('pmtiles://x/7/1/2'), new AbortController()),
    ]);
    const again = await share(tile('pmtiles://x/7/1/2'), new AbortController());
    expect(load).toHaveBeenCalledTimes(1);
    expect(a.data).toEqual(new Uint8Array([1, 2, 3]));
    expect(a.data).not.toBe(b.data);
    expect(again.data).not.toBe(a.data);
  });

  it('keeps only the most recent tiles', async () => {
    const load = vi.fn(() => Promise.resolve({ data: new Uint8Array() }));
    const share = shareTiles(load, 2);
    for (const url of ['a/1/0/0', 'b/1/0/0', 'c/1/0/0', 'a/1/0/0']) {
      await share(tile(url), new AbortController());
    }
    expect(load).toHaveBeenCalledTimes(4);
  });

  it('aborts the fetch only once nobody waits for it', async () => {
    const pending = deferred();
    let signal: AbortSignal | undefined;
    const load = vi.fn((_: RequestParameters, controller: AbortController) => {
      signal = controller.signal;
      return pending.promise;
    });
    const share = shareTiles(load);
    const first = new AbortController();
    const second = new AbortController();
    const one = share(tile('t/1/0/0'), first);
    const two = share(tile('t/1/0/0'), second);
    first.abort();
    expect(signal?.aborted).toBe(false);
    second.abort();
    expect(signal?.aborted).toBe(true);
    pending.resolve({ data: new Uint8Array() });
    await expect(one).rejects.toThrow();
    await expect(two).rejects.toThrow();
    // Forgotten, so the next caller fetches afresh.
    void share(tile('t/1/0/0'), new AbortController());
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('forgets a failed fetch', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ data: new Uint8Array([9]) });
    const share = shareTiles(load);
    await expect(share(tile('u/1/0/0'), new AbortController())).rejects.toThrow('offline');
    await expect(share(tile('u/1/0/0'), new AbortController())).resolves.toEqual({
      data: new Uint8Array([9]),
    });
  });

  it("passes an archive's description straight through", async () => {
    const load = vi.fn(() => Promise.resolve({ data: { tiles: [] } }));
    const share = shareTiles(load);
    await share({ url: 'pmtiles://x', type: 'json' }, new AbortController());
    await share({ url: 'pmtiles://x', type: 'json' }, new AbortController());
    expect(load).toHaveBeenCalledTimes(2);
  });
});
