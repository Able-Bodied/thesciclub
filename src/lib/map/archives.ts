import './old-webkit';
import { addProtocol, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { PMTiles, Protocol } from 'pmtiles';
import { openByteStore } from './byte-store';
import { CachedSource, RetryingCache } from './cached-source';
import { shareTiles } from './shared-tiles';
import { firstGlyphsUrl } from './style';
import { archiveUrl } from './tiles';

/**
 * MapLibre's worker from our own origin (worker-src 'self', no blob:), and
 * pmtiles:// read by range requests, from the device's copy when it has one.
 * Both archives are registered up front so every read goes through it.
 */
const store = openByteStore();
const archives = (['us', 'ca'] as const).map(
  (name) => new PMTiles(new CachedSource(archiveUrl(name), store), new RetryingCache()),
);
const protocol = new Protocol();
for (const archive of archives) protocol.add(archive);
setWorkerUrl(workerUrl);
addProtocol('pmtiles', shareTiles(protocol.tilev4));

// Earlier builds' bytes, well after the map has had its turn.
setTimeout(() => {
  void store.keepOnly(archives.map((archive) => archive.source.getKey()));
}, 15_000);

let warming: Promise<void> | undefined;

/**
 * Fetches the worker script, the first glyphs (pin counts wait on them) and
 * both archives' header and root directory, which the protocol then reuses;
 * from the device after the first time. Never tiles. Silent on failure: the
 * map asks again when it opens.
 */
export function warmMap(): Promise<void> {
  warming ??= Promise.allSettled([
    fetch(workerUrl, { priority: 'low' }),
    fetch(firstGlyphsUrl(), { priority: 'low' }),
    ...archives.map((archive) => archive.getHeader()),
  ]).then(() => undefined);
  return warming;
}
