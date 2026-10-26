import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { openByteStore } from './byte-store';

const US = 'https://tiles.example/us-20261025.pmtiles';
const OLD = 'https://tiles.example/us-20260901.pmtiles';
const bytes = (size: number, fill = 1) => new Uint8Array(size).fill(fill).buffer;
const sizeOf = (data: ArrayBuffer | undefined) => data?.byteLength;

describe('the device copy of map bytes', () => {
  it('gives back what it was given', async () => {
    const store = openByteStore({ idb: new IDBFactory() });
    expect(await store.get(`${US}|0|16384`)).toBeUndefined();
    await store.put(`${US}|0|16384`, US, bytes(16384, 7));
    const kept = await store.get(`${US}|0|16384`);
    expect(new Uint8Array(kept ?? new ArrayBuffer(0))[100]).toBe(7);
  });

  it('drops the least recently used past its cap', async () => {
    let now = 1000;
    const realNow = Date.now;
    Date.now = () => now;
    try {
      const store = openByteStore({ idb: new IDBFactory(), cap: 350, touchAfter: 0 });
      for (const key of ['a', 'b', 'c']) {
        now += 10;
        await store.put(key, US, bytes(100));
      }
      // Read a, so b is now the oldest.
      now += 10;
      await store.get('a');
      await store.idle();
      now += 10;
      await store.put('d', US, bytes(100));
      await store.idle();
      expect(sizeOf(await store.get('b'))).toBeUndefined();
      for (const key of ['a', 'c', 'd']) expect(sizeOf(await store.get(key)), key).toBe(100);
    } finally {
      Date.now = realNow;
    }
  });

  it("drops an earlier build's bytes", async () => {
    const store = openByteStore({ idb: new IDBFactory() });
    await store.put(`${OLD}|0|10`, OLD, bytes(10));
    await store.put(`${US}|0|10`, US, bytes(10));
    await store.keepOnly([US]);
    expect(await store.get(`${OLD}|0|10`)).toBeUndefined();
    expect(sizeOf(await store.get(`${US}|0|10`))).toBe(10);
  });

  it('is a miss, never an error, without working storage', async () => {
    const broken = {
      open: () => {
        throw new Error('SecurityError');
      },
    } as unknown as IDBFactory;
    for (const store of [openByteStore({ idb: broken }), openByteStore({ idb: undefined })]) {
      await expect(store.put('k', US, bytes(1))).resolves.toBeUndefined();
      await expect(store.get('k')).resolves.toBeUndefined();
      await expect(store.keepOnly([US])).resolves.toBeUndefined();
    }
  });

  it('is a miss once its database has closed under it', async () => {
    const idb = new IDBFactory();
    const store = openByteStore({ idb });
    await store.put('k', US, bytes(1));
    // Another tab opening a newer version closes this one's connection.
    await new Promise((resolve) => {
      idb.open('club-map', 2).onsuccess = resolve;
    });
    await expect(store.get('k')).resolves.toBeUndefined();
    await expect(store.put('j', US, bytes(1))).resolves.toBeUndefined();
  });

  it('counts a key put again once, so nothing is evicted for it', async () => {
    const store = openByteStore({ idb: new IDBFactory(), cap: 250 });
    await store.put('a', US, bytes(100));
    await store.put('b', US, bytes(100));
    for (let i = 0; i < 5; i++) await store.put('b', US, bytes(100));
    await store.idle();
    expect(sizeOf(await store.get('a'))).toBe(100);
    expect(sizeOf(await store.get('b'))).toBe(100);
  });

  it('holds its cap across tabs, reading the total again after a while', async () => {
    const idb = new IDBFactory();
    let now = 0;
    const one = openByteStore({ idb, cap: 250, now: () => now });
    const two = openByteStore({ idb, cap: 250, now: () => now });
    await one.put('a', US, bytes(100));
    await two.put('b', US, bytes(100));
    now = 60_000;
    await one.put('c', US, bytes(100));
    await one.idle();
    const kept = await Promise.all(['a', 'b', 'c'].map(async (key) => sizeOf(await one.get(key))));
    expect(kept.filter(Boolean).length).toBeLessThanOrEqual(2);
  });

  it('opens again after its connection closed under it', async () => {
    const real = new IDBFactory();
    const connections: IDBDatabase[] = [];
    const idb = {
      open: (name: string, version?: number) => {
        const request = real.open(name, version);
        request.addEventListener('success', () => {
          connections.push(request.result);
        });
        return request;
      },
    } as unknown as IDBFactory;
    const store = openByteStore({ idb });
    await store.put('k', US, bytes(3));
    // WebKit can drop a connection with no event: the next transaction throws.
    connections[0]?.close();
    expect(sizeOf(await store.get('k'))).toBe(3);
    await store.put('j', US, bytes(4));
    expect(sizeOf(await store.get('j'))).toBe(4);
    expect(connections).toHaveLength(2);
  });
});
