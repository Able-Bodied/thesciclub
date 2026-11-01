/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** The map's tiles folder (src/lib/map/tiles.ts); /tiles/ when unset. */
  readonly VITE_MAP_TILES_BASE?: string;
  /** The day this copy of the app was built (vite.config.ts). */
  readonly VITE_APP_BUILT?: string;
}
