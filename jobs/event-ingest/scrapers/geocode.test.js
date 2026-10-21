import { describe, expect, it } from 'vitest';
import { geocodeEvents, RateLimited } from './geocode.js';

const at = (city) => ({ city, postalCode: null, latitude: 1, longitude: 2, precision: 'exact' });

describe('geocodeEvents', () => {
  it('looks a place up once a run, however many events are there', async () => {
    const asked = [];
    const events = ['Gym, Decatur, GA', 'Gym, Decatur, GA', 'Gym, Decatur, GA'].map(
      (location, i) => ({
        external_id: String(i),
        location,
      }),
    );
    await geocodeEvents(events, new Map(), (place) => {
      asked.push(place);
      return Promise.resolve(at('Decatur'));
    });
    expect(asked).toEqual(['Gym, Decatur, GA']);
    expect(events.map((e) => e.city)).toEqual(['Decatur', 'Decatur', 'Decatur']);
  });

  it('stops asking once the service says too many, and leaves the rest for the next run', async () => {
    let asked = 0;
    const events = ['A, CA', 'B, CA', 'C, CA'].map((location, i) => ({
      external_id: String(i),
      location,
    }));
    await geocodeEvents(events, new Map(), () => {
      asked++;
      return Promise.reject(new RateLimited('Nominatim answered 429'));
    });
    expect(asked).toBe(1);
    expect(events.map((e) => e.city)).toEqual([null, null, null]);
  });
});
