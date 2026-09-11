import { afterEach, describe, expect, it, vi } from 'vitest';
import { geocodeZip, reverseGeocode } from '@/lib/geocode';

const ok = (body: unknown) =>
  vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reverseGeocode', () => {
  it('turns a position into a city and a two-letter state', async () => {
    vi.stubGlobal(
      'fetch',
      ok({ address: { city: 'San Jose', state: 'California', country_code: 'us' } }),
    );
    expect(await reverseGeocode(37.3, -121.9)).toEqual({ city: 'San Jose', state: 'CA' });
  });

  it('falls back through town, village and county for places with no "city"', async () => {
    vi.stubGlobal(
      'fetch',
      ok({ address: { town: 'Aptos', state: 'California', country_code: 'us' } }),
    );
    expect(await reverseGeocode(36.9, -121.9)).toEqual({ city: 'Aptos', state: 'CA' });
  });

  it('refuses a result outside the US rather than storing a state it invented', async () => {
    vi.stubGlobal(
      'fetch',
      ok({ address: { city: 'Toronto', state: 'Ontario', country_code: 'ca' } }),
    );
    expect(await reverseGeocode(43.6, -79.3)).toBeNull();
  });

  it('returns null when the state is not one we know', async () => {
    vi.stubGlobal(
      'fetch',
      ok({ address: { city: 'Somewhere', state: 'Atlantis', country_code: 'us' } }),
    );
    expect(await reverseGeocode(0, 0)).toBeNull();
  });

  it('returns null rather than throwing when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await reverseGeocode(37.3, -121.9)).toBeNull();
  });

  it('returns null on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await reverseGeocode(37.3, -121.9)).toBeNull();
  });
});

describe('geocodeZip', () => {
  it('resolves a five-digit zip', async () => {
    vi.stubGlobal(
      'fetch',
      ok([{ address: { city: 'Sacramento', state: 'California', country_code: 'us' } }]),
    );
    expect(await geocodeZip('95814')).toEqual({ city: 'Sacramento', state: 'CA' });
  });

  it('does not call out at all for a partial zip', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await geocodeZip('958')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when nothing matches', async () => {
    vi.stubGlobal('fetch', ok([]));
    expect(await geocodeZip('00000')).toBeNull();
  });
});
