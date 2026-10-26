import { describe, expect, it } from 'vitest';
import { canShowOnMap, mapLinkFor } from '@/routes/map/show-on-map';
import { makeEvent } from '@/test/factory';

const NOW = new Date('2026-10-26T18:00:00Z');

describe('which events can be viewed on the map', () => {
  it('those in person or hybrid, still to come or under way', () => {
    expect(canShowOnMap(makeEvent({ startTime: '2026-10-27T18:00:00Z' }), NOW)).toBe(true);
    expect(
      canShowOnMap(makeEvent({ format: 'hybrid', startTime: '2026-10-27T18:00:00Z' }), NOW),
    ).toBe(true);
    expect(
      canShowOnMap(
        makeEvent({ startTime: '2026-10-26T16:00:00Z', endTime: '2026-10-26T19:00:00Z' }),
        NOW,
      ),
    ).toBe(true);
  });

  it('never online only, nor one over', () => {
    expect(
      canShowOnMap(makeEvent({ format: 'online', startTime: '2026-10-27T18:00:00Z' }), NOW),
    ).toBe(false);
    expect(
      canShowOnMap(
        makeEvent({ startTime: '2026-10-25T16:00:00Z', endTime: '2026-10-25T18:00:00Z' }),
        NOW,
      ),
    ).toBe(false);
  });

  it('keeps an all-day event for its whole day', () => {
    const today = makeEvent({ startTime: '2026-10-26T07:00:00Z', endTime: null, allDay: true });
    expect(canShowOnMap(today, NOW)).toBe(true);
  });
});

describe('the link to it', () => {
  it('opens the Events map on that event', () => {
    expect(mapLinkFor('e1')).toBe('/events?view=map&show=e1');
  });

  it('keeps an RSVP list chosen, and nothing else', () => {
    expect(mapLinkFor('e1', 'going')).toBe('/events?segment=going&view=map&show=e1');
    expect(mapLinkFor('e1', 'upcoming')).toBe('/events?view=map&show=e1');
    expect(mapLinkFor('e1', 'orgs')).toBe('/events?view=map&show=e1');
  });
});
