import type { RangeResponse, Source } from 'pmtiles';
import { PMTiles } from 'pmtiles';
import { describe, expect, it, vi } from 'vitest';
import type { ByteStore } from './byte-store';
import { CachedSource, RetryingCache } from './cached-source';

const URL_ = 'https://tiles.example/ca-20261025.pmtiles';

function memoryStore(): ByteStore & { kept: Map<string, ArrayBuffer> } {
  const kept = new Map<string, ArrayBuffer>();
  return {
    kept,
    get: (key) => Promise.resolve(kept.get(key)),
    put: (key, _archive, data) => {
      kept.set(key, data);
      return Promise.resolve();
    },
    keepOnly: () => Promise.resolve(),
    idle: () => Promise.resolve(),
  };
}

function network(): Source & { getBytes: ReturnType<typeof vi.fn> } {
  return {
    getKey: () => URL_,
    getBytes: vi.fn((offset: number, length: number) =>
      Promise.resolve<RangeResponse>({ data: new Uint8Array(length).fill(offset % 256).buffer }),
    ),
  };
}

describe('an archive read from the device first', () => {
  it('asks the network nothing it already has', async () => {
    const store = memoryStore();
    store.kept.set(`${URL_}|0|4`, new Uint8Array([9, 9, 9, 9]).buffer);
    const net = network();
    const source = new CachedSource(URL_, store, { network: net });
    const { data } = await source.getBytes(0, 4);
    expect([...new Uint8Array(data)]).toEqual([9, 9, 9, 9]);
    expect(net.getBytes).not.toHaveBeenCalled();
  });

  it('fetches a miss and keeps it', async () => {
    const store = memoryStore();
    const net = network();
    const source = new CachedSource(URL_, store, { network: net });
    const { data } = await source.getBytes(5, 3);
    expect(data.byteLength).toBe(3);
    expect(net.getBytes).toHaveBeenCalledTimes(1);
    expect(store.kept.get(`${URL_}|5|3`)?.byteLength).toBe(3);
    await source.getBytes(5, 3);
    expect(net.getBytes).toHaveBeenCalledTimes(1);
  });

  it('goes to the network when storage fails or stalls', async () => {
    const net = network();
    const failing: ByteStore = {
      ...memoryStore(),
      get: () => Promise.reject(new Error('QuotaExceededError')),
      put: () => Promise.reject(new Error('QuotaExceededError')),
    };
    await expect(
      new CachedSource(URL_, failing, { network: net }).getBytes(0, 2),
    ).resolves.toHaveProperty('data');
    const stalled: ByteStore = { ...memoryStore(), get: () => new Promise(() => undefined) };
    const started = Date.now();
    await new CachedSource(URL_, stalled, { network: net, wait: 20 }).getBytes(0, 2);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(net.getBytes).toHaveBeenCalledTimes(2);
  });
});

describe("over the tiles Worker's limit", () => {
  const busy = new Error('Bad response code: 429');

  it('waits and asks again, then keeps what came', async () => {
    const store = memoryStore();
    const net = network();
    net.getBytes.mockRejectedValueOnce(busy);
    const source = new CachedSource(URL_, store, { network: net, busyWaits: [5] });
    await expect(source.getBytes(0, 2)).resolves.toHaveProperty('data');
    expect(net.getBytes).toHaveBeenCalledTimes(2);
    expect(store.kept.size).toBe(1);
  });

  it('gives up after its waits, and on any other error at once', async () => {
    const net = network();
    net.getBytes.mockRejectedValue(busy);
    const source = new CachedSource(URL_, memoryStore(), { network: net, busyWaits: [1, 1] });
    await expect(source.getBytes(0, 2)).rejects.toThrow('429');
    expect(net.getBytes).toHaveBeenCalledTimes(3);
    net.getBytes.mockClear().mockRejectedValue(new Error('Bad response code: 500'));
    await expect(source.getBytes(0, 2)).rejects.toThrow('500');
    expect(net.getBytes).toHaveBeenCalledTimes(1);
  });

  it('stops waiting when the tile is no longer wanted', async () => {
    const net = network();
    net.getBytes.mockRejectedValue(busy);
    const source = new CachedSource(URL_, memoryStore(), { network: net, busyWaits: [60_000] });
    const controller = new AbortController();
    const asked = source.getBytes(0, 2, controller.signal);
    await vi.waitFor(() => {
      expect(net.getBytes).toHaveBeenCalledTimes(1);
    });
    controller.abort();
    await expect(asked).rejects.toThrow();
  });
});

describe("pmtiles' cache, retrying", () => {
  it('reads a header again after one failed', async () => {
    const source: Source = {
      getKey: () => URL_,
      getBytes: vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValue({ data: new ArrayBuffer(16384) }),
    };
    const archive = new PMTiles(source, new RetryingCache());
    await expect(archive.getHeader()).rejects.toThrow('offline');
    // The second read gets past the network; an empty buffer is not an archive.
    await expect(archive.getHeader()).rejects.toThrow('Wrong magic number');
  });
});
