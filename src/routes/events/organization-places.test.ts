import { describe, expect, it } from 'vitest';
import type { Organization } from '@/types/domain';
import { placesOf } from './organization-places';

const base = { id: 'o1', name: 'Org', city: 'Palm Desert', state: 'CA' } as Organization;

describe('placesOf', () => {
  it('offers only confirmed places, never the directory city', () => {
    expect(placesOf(base)).toEqual([]);
    expect(placesOf({ ...base, places: [] })).toEqual([]);
  });

  it('keeps the confirmed places in order', () => {
    const places = [
      { id: 'p1', position: 0, label: null, address: '1 Main St', city: 'Oakland', state: 'CA' },
      { id: 'p2', position: 1, label: 'Center', address: null, city: 'Fremont', state: 'CA' },
    ];
    expect(placesOf({ ...base, places })).toEqual(places);
  });
});
