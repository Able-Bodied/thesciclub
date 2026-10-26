import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/map', () => ({ loadMapCanvas: () => Promise.resolve({}) }));
vi.mock('@/routes/map/club-map', () => ({ default: () => null }));

const { loadClubMap } = await import('@/routes/map/view-switch');

describe('loading the map screen', () => {
  it('reads it once but hands each caller a promise of its own', async () => {
    const one = loadClubMap();
    const two = loadClubMap();
    // React marks a promise it has seen; a second lazy screen given it replayed forever.
    expect(one).not.toBe(two);
    expect((await one).default).toBe((await two).default);
  });
});
