/**
 * Where the map's tiles are. Made by `pnpm map-tiles` (scripts/map-tiles.mjs),
 * which also moves TILES_BUILD on with --latest and uploads with --upload.
 * Named by build, so a file is never changed in place and can be cached for good.
 */
export const TILES_BUILD = '20261025';

/**
 * The tiles Worker (tiles-worker/), in front of R2. Change it here and in
 * netlify.toml's connect-src together; src/csp.test.ts checks they agree.
 */
export const TILES_ORIGIN = 'https://sciclub-tiles.thesciclub.workers.dev';

/** California's box, [west, south, east, north]; scripts/map-tiles.mjs cuts the same. */
export const CALIFORNIA: [number, number, number, number] = [-124.5, 32.5, -114.1, 42.05];

/** `ca` is drawn from here up; below it, `us` has the same tiles. */
export const CA_MINZOOM = 8;

/** Absolute, ending in a slash: the Worker in builds, public/tiles/ under `pnpm dev`. */
export function tilesBase(): string {
  const chosen = import.meta.env.VITE_MAP_TILES_BASE;
  const base =
    chosen !== undefined && chosen !== ''
      ? chosen
      : import.meta.env.DEV
        ? '/tiles/'
        : `${TILES_ORIGIN}/`;
  return new URL(base.endsWith('/') ? base : `${base}/`, window.location.href).href;
}

export function archiveUrl(name: 'us' | 'ca'): string {
  return `${tilesBase()}${name}-${TILES_BUILD}.pmtiles`;
}
