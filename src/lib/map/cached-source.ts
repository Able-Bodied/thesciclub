import {
  type Entry,
  FetchSource,
  type Header,
  type RangeResponse,
  SharedPromiseCache,
  type Source,
} from 'pmtiles';
import type { ByteStore } from './byte-store';

/** Longest the device copy may take before the network is asked instead. */
const STORE_WAIT_MS = 80;
/** Waits after a 429 from the tiles Worker, whose limit is per minute. */
const BUSY_WAITS_MS = [15_000, 45_000];

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason as Error);
      },
      { once: true },
    );
  });
}

function within<T>(promise: Promise<T | undefined>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(undefined);
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}

/**
 * An archive read from the device first (byte-store.ts), then the network:
 * headers, directories and tiles alike, keyed by archive, offset and length.
 */
export class CachedSource implements Source {
  readonly url: string;
  private readonly store: ByteStore;
  private readonly network: Source;
  private readonly wait: number;
  private readonly busyWaits: readonly number[];

  constructor(
    url: string,
    store: ByteStore,
    {
      network,
      wait = STORE_WAIT_MS,
      busyWaits = BUSY_WAITS_MS,
    }: { network?: Source; wait?: number; busyWaits?: readonly number[] } = {},
  ) {
    this.url = url;
    this.store = store;
    this.network = network ?? new FetchSource(url);
    this.wait = wait;
    this.busyWaits = busyWaits;
  }

  getKey(): string {
    return this.url;
  }

  async getBytes(
    offset: number,
    length: number,
    signal?: AbortSignal,
    etag?: string,
  ): Promise<RangeResponse> {
    const key = `${this.url}|${offset}|${length}`;
    const kept = await within(this.store.get(key), this.wait);
    if (kept) return { data: kept };
    const response = await this.fetch(offset, length, signal, etag);
    // A copy: pmtiles keeps reading the one it was given.
    this.store.put(key, this.url, response.data.slice(0)).catch(() => undefined);
    return response;
  }

  // Over the Worker's limit, the tile waits and asks again rather than stay blank.
  private async fetch(offset: number, length: number, signal?: AbortSignal, etag?: string) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.network.getBytes(offset, length, signal, etag);
      } catch (error) {
        const wait = this.busyWaits[attempt];
        // pmtiles' FetchSource says only "Bad response code: 429".
        if (wait === undefined || !(error instanceof Error && /\b429\b/.test(error.message))) {
          throw error;
        }
        await sleep(wait, signal);
      }
    }
  }
}

/**
 * pmtiles' own cache, except that a failed read is forgotten rather than kept
 * as failed, so a map that opened offline recovers without a reload.
 */
export class RetryingCache extends SharedPromiseCache {
  override async getHeader(source: Source): Promise<Header> {
    try {
      return await super.getHeader(source);
    } catch (error) {
      this.cache.delete(source.getKey());
      throw error;
    }
  }

  override async getDirectory(
    source: Source,
    offset: number,
    length: number,
    header: Header,
    signal?: AbortSignal,
  ): Promise<Entry[]> {
    try {
      return await super.getDirectory(source, offset, length, header, signal);
    } catch (error) {
      // pmtiles 4.5's key for a directory.
      this.cache.delete(`${source.getKey()}|${header.etag ?? ''}|${offset}|${length}`);
      throw error;
    }
  }
}
