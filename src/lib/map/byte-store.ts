/**
 * The map's byte ranges kept on the device (IndexedDB), so a second visit asks
 * the tiles Worker for nothing it already had. WebKit does not reuse cached
 * 206 responses, and pmtiles turns the HTTP cache off on Chrome for Windows.
 * Archives are named by build, so an entry never goes stale; it is only
 * dropped when the build moves on, or least recently used past CAP.
 *
 * IndexedDB rather than the Cache API: it is there in WKWebView under
 * capacitor://localhost. Every failure here reads as a miss.
 */

export interface ByteStore {
  get(key: string): Promise<ArrayBuffer | undefined>;
  put(key: string, archive: string, data: ArrayBuffer): Promise<void>;
  /** Drops every entry from an archive not named. */
  keepOnly(archives: readonly string[]): Promise<void>;
  /** Resolves once pending writes are done (tests). */
  idle(): Promise<void>;
}

export const CAP = 50 * 1024 * 1024;
/** How long a running total is trusted before it is read again (other tabs write too). */
const TOTAL_FOR_MS = 30_000;

const DATA = 'bytes';
const META = 'meta';

interface Meta {
  key: string;
  archive: string;
  size: number;
  used: number;
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB request failed'));
    };
  });
}

function finished(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onerror = transaction.onabort = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    };
  });
}

export function openByteStore({
  name = 'club-map',
  cap = CAP,
  idb = typeof indexedDB === 'undefined' ? undefined : indexedDB,
  touchAfter = 2000,
  now = () => Date.now(),
}: {
  name?: string;
  cap?: number;
  idb?: IDBFactory | undefined;
  touchAfter?: number;
  now?: () => number;
} = {}): ByteStore {
  let opening: Promise<IDBDatabase | null> | undefined;
  let open: IDBDatabase | undefined;
  // Closed under us (another tab's upgrade, WebKit dropping it): opened again on next use.
  const forget = (db: IDBDatabase) => {
    if (open !== db) return;
    open = undefined;
    opening = undefined;
  };
  // Opened on first use, which is after the first paint (the map's own chunk).
  const database = () => {
    opening ??= new Promise<IDBDatabase | null>((resolve) => {
      try {
        if (!idb) {
          resolve(null);
          return;
        }
        const request = idb.open(name, 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore(DATA, { keyPath: 'key' });
          request.result.createObjectStore(META, { keyPath: 'key' }).createIndex('used', 'used');
        };
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => {
            db.close();
            forget(db);
          };
          db.onclose = () => {
            forget(db);
          };
          open = db;
          resolve(db);
        };
        request.onerror = request.onblocked = () => {
          resolve(null);
        };
      } catch {
        resolve(null);
      }
    });
    return opening;
  };

  // Runs `task`, opening again once if the connection was lost without a word.
  const withDb = async <T>(task: (db: IDBDatabase) => Promise<T>): Promise<T | undefined> => {
    for (let attempt = 0; ; attempt++) {
      const db = await database();
      if (!db) return undefined;
      try {
        return await task(db);
      } catch (error) {
        if (attempt > 0 || (error as { name?: unknown } | null)?.name !== 'InvalidStateError') {
          throw error;
        }
        forget(db);
      }
    }
  };

  let total: number | undefined;
  let totalAt = 0;
  let pending = Promise.resolve();
  // One write at a time, failures swallowed.
  const queue = (task: (db: IDBDatabase) => Promise<void>) => {
    pending = pending
      .then(() => withDb(task))
      .then(
        () => undefined,
        () => undefined,
      );
    return pending;
  };

  // Last-used times are written in batches, not on every read.
  const touched = new Map<string, number>();
  let touchTimer: ReturnType<typeof setTimeout> | undefined;
  const writeTouches = () => {
    touchTimer = undefined;
    const batch = [...touched];
    touched.clear();
    return queue(async (db) => {
      const transaction = db.transaction(META, 'readwrite');
      const metas = transaction.objectStore(META);
      for (const [key, used] of batch) {
        const read = metas.get(key);
        read.onsuccess = () => {
          const meta = read.result as Meta | undefined;
          if (meta) metas.put({ ...meta, used });
        };
      }
      await finished(transaction);
    });
  };

  const evict = async (db: IDBDatabase) => {
    if (total === undefined || now() - totalAt > TOTAL_FOR_MS) {
      const all = (await done(db.transaction(META).objectStore(META).getAll())) as Meta[];
      total = all.reduce((sum, meta) => sum + meta.size, 0);
      totalAt = now();
    }
    if (total <= cap) return;
    // Down to 90%, so the next few writes do not each evict.
    const transaction = db.transaction([DATA, META], 'readwrite');
    const cursor = transaction.objectStore(META).index('used').openCursor();
    cursor.onsuccess = () => {
      const at = cursor.result;
      if (!at || (total ?? 0) <= cap * 0.9) return;
      const meta = at.value as Meta;
      transaction.objectStore(DATA).delete(meta.key);
      at.delete();
      total = (total ?? 0) - meta.size;
      at.continue();
    };
    await finished(transaction);
  };

  return {
    async get(key) {
      try {
        const found = (await withDb((db) =>
          done(db.transaction(DATA).objectStore(DATA).get(key)),
        )) as { data: ArrayBuffer } | undefined;
        if (!found) return undefined;
        touched.set(key, Date.now());
        touchTimer ??= setTimeout(() => void writeTouches(), touchAfter);
        return found.data;
      } catch {
        return undefined;
      }
    },
    put(key, archive, data) {
      return queue(async (db) => {
        const transaction = db.transaction([DATA, META], 'readwrite');
        const metas = transaction.objectStore(META);
        // A key put again replaces its bytes: counted once.
        let grew = data.byteLength;
        const before = metas.get(key);
        before.onsuccess = () => {
          grew -= (before.result as Meta | undefined)?.size ?? 0;
          metas.put({ key, archive, size: data.byteLength, used: Date.now() } satisfies Meta);
        };
        transaction.objectStore(DATA).put({ key, data });
        await finished(transaction);
        if (total !== undefined) total += grew;
        await evict(db);
      });
    },
    keepOnly(archives) {
      return queue(async (db) => {
        const transaction = db.transaction([DATA, META], 'readwrite');
        const cursor = transaction.objectStore(META).openCursor();
        cursor.onsuccess = () => {
          const at = cursor.result;
          if (!at) return;
          const meta = at.value as Meta;
          if (!archives.includes(meta.archive)) {
            transaction.objectStore(DATA).delete(meta.key);
            at.delete();
            if (total !== undefined) total -= meta.size;
          }
          at.continue();
        };
        await finished(transaction);
      });
    },
    async idle() {
      if (touchTimer !== undefined) {
        clearTimeout(touchTimer);
        await writeTouches();
      }
      await pending;
    },
  };
}
