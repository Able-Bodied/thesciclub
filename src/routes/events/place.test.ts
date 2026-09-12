import { describe, expect, it } from 'vitest';
import { placeLine, tidyLocation, venueName } from '@/routes/events/place';

/**
 * Every `location` string in here is a real one from the ingested feeds, not an
 * invented shape. The failures this replaces were all in real data.
 */

describe('venueName', () => {
  it('takes the name in front of a street number', () => {
    expect(
      venueName('Archer Bicycle 431 13th Street Oakland, California, 94607 United States'),
    ).toBe('Archer Bicycle');
  });

  it('takes the name in front of a comma', () => {
    expect(
      venueName('DeLaveaga County Park Archery Range, 141 Brookwood Dr, Santa Cruz, CA 95065'),
    ).toBe('DeLaveaga County Park Archery Range');
  });

  it('drops a plus code', () => {
    expect(venueName('QG9J+VH6 Golden Gate Park, San Francisco, CA')).toBe('Golden Gate Park');
  });

  it('drops a suite number', () => {
    expect(
      venueName(
        'Bay Area Outreach and Recreation Program 3075 Adeline Street, Suite 200 Berkeley, CA 94703-2578',
      ),
    ).toBe('Bay Area Outreach and Recreation Program');
  });

  it('finds no name in a bare street address', () => {
    expect(venueName('200 E Santa Clara St, San Jose, CA 95113')).toBeNull();
  });

  it('finds no name in nothing', () => {
    expect(venueName('')).toBeNull();
    expect(venueName(null)).toBeNull();
  });
});

describe('tidyLocation', () => {
  it('keeps the street when there is no venue name to find', () => {
    // The floor. Returning null for these rendered six real events with no
    // location at all, which is worse than the address being untidy.
    expect(tidyLocation('1720 Eighth St, Berkeley, CA 94710')).toBe('1720 Eighth St, Berkeley');
  });

  it('sheds the country and then the state behind it', () => {
    expect(tidyLocation('6 Medical Plaza Drive Roseville, California, 95661 United States')).toBe(
      '6 Medical Plaza Drive Roseville',
    );
  });
});

describe('placeLine', () => {
  it('pairs the venue with the city', () => {
    expect(
      placeLine({
        location: 'Archer Bicycle 431 13th Street Oakland, California, 94607 United States',
        city: 'Oakland',
        format: 'in_person',
      }),
    ).toBe('Archer Bicycle · Oakland');
  });

  it('does not print the city twice', () => {
    // The card already showed a geocoded "Oakland" on the line above, and the
    // raw address ends in another one. Both were rendered.
    const line = placeLine({
      location: 'Movement San Francisco  924 Mason St, San Francisco, CA 94129',
      city: 'San Francisco',
      format: 'in_person',
    });
    expect(line).toBe('Movement San Francisco');
    expect(line?.match(/San Francisco/g)).toHaveLength(1);
  });

  it('says nothing for an online event with no venue', () => {
    // 47 of the 124 ingested events. The format badge answers this already, and
    // inventing a location line for them would be wrong rather than empty.
    expect(placeLine({ location: '', city: null, format: 'online' })).toBeNull();
  });

  it('points at the source for an in-person event with no venue', () => {
    // 42 events, every one of which has a url. Saying nothing made them look
    // identical to the online ones minus a badge.
    expect(placeLine({ location: '', city: null, format: 'in_person' })).toBe(
      'Location on the organizer’s page',
    );
  });

  it('treats an unclassified event as one with somewhere to be', () => {
    expect(placeLine({ location: '', city: null, format: null })).toBe(
      'Location on the organizer’s page',
    );
  });

  it('treats hybrid as having a physical leg', () => {
    // Hybrid is reachable from a chair *and* from a room. The room is unknown,
    // which is not the same as there not being one.
    expect(placeLine({ location: '', city: null, format: 'hybrid' })).toBe(
      'Location on the organizer’s page',
    );
  });

  it('falls back to the city when that is all there is', () => {
    expect(placeLine({ location: '', city: 'Berkeley', format: 'in_person' })).toBe('Berkeley');
  });
});
