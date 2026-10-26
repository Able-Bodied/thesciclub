import type { AddProtocolAction, AddProtocolResponseData, RequestParameters } from 'maplibre-gl';

type Load = (params: RequestParameters, abort: AbortController) => Promise<{ data: unknown }>;

interface Entry {
  data: Promise<unknown>;
  controller: AbortController;
  waiting: number;
  settled: boolean;
}

/**
 * One fetch per tile, however many ask. Past z7 outside California every
 * screen tile is cut from the same few `us` tiles, and MapLibre asked for each
 * again (2026-10-25: one 100 KB range six times). Each caller gets its own
 * copy, as MapLibre hands the bytes to its worker. Aborted once nobody waits.
 */
export function shareTiles(load: Load, keep = 64): AddProtocolAction {
  const entries = new Map<string, Entry>();
  return async (params: RequestParameters, abort: AbortController) => {
    // The archive's description, not a tile.
    if (params.type === 'json') {
      return { data: (await load(params, abort)).data as AddProtocolResponseData };
    }
    const { url } = params;
    let entry = entries.get(url);
    if (entry) entries.delete(url);
    else {
      const controller = new AbortController();
      const data = load(params, controller).then((response) => response.data);
      entry = { data, controller, waiting: 0, settled: false };
      const made = entry;
      data.then(
        () => {
          made.settled = true;
        },
        () => {
          if (entries.get(url) === made) entries.delete(url);
        },
      );
    }
    // Most recent last; the oldest is dropped.
    entries.set(url, entry);
    for (const old of entries.keys()) {
      if (entries.size <= keep) break;
      entries.delete(old);
    }
    const mine = entry;
    mine.waiting++;
    const onAbort = () => {
      mine.waiting--;
      if (mine.waiting === 0 && !mine.settled) {
        mine.controller.abort();
        if (entries.get(url) === mine) entries.delete(url);
      }
    };
    abort.signal.addEventListener('abort', onAbort, { once: true });
    try {
      const data = await mine.data;
      abort.signal.throwIfAborted();
      return {
        data: (data instanceof Uint8Array ? data.slice() : data) as AddProtocolResponseData,
      };
    } finally {
      abort.signal.removeEventListener('abort', onAbort);
      if (!abort.signal.aborted) mine.waiting--;
    }
  };
}
