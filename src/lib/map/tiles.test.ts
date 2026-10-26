import { afterEach, describe, expect, it, vi } from 'vitest';
import { archiveUrl, TILES_BUILD, TILES_ORIGIN, tilesBase } from './tiles';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('where the tiles are', () => {
  it('is public/tiles/ under pnpm dev', () => {
    vi.stubEnv('DEV', true);
    expect(tilesBase()).toBe(`${window.location.origin}/tiles/`);
  });

  it('is the Worker in a build, the website and the store app alike', () => {
    vi.stubEnv('DEV', false);
    for (const mode of ['production', 'native']) {
      vi.stubEnv('MODE', mode);
      expect(archiveUrl('ca')).toBe(`${TILES_ORIGIN}/ca-${TILES_BUILD}.pmtiles`);
    }
  });

  it('is wherever VITE_MAP_TILES_BASE says, with or without a slash', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_MAP_TILES_BASE', 'https://tiles.example/v');
    expect(archiveUrl('us')).toBe(`https://tiles.example/v/us-${TILES_BUILD}.pmtiles`);
    vi.stubEnv('VITE_MAP_TILES_BASE', '');
    expect(tilesBase()).toBe(`${TILES_ORIGIN}/`);
  });

  it('names an https origin and nothing more', () => {
    expect(new URL(TILES_ORIGIN).origin).toBe(TILES_ORIGIN);
    expect(TILES_ORIGIN.startsWith('https://')).toBe(true);
  });
});
