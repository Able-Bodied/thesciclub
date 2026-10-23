import { describe, expect, it } from 'vitest';
import { addressInPlace, addressInText, placeInOwnWords } from './address.js';

// BlazeSports' Wheelchair Basketball, as the import stores its description.
const BASKETBALL = [
  'Wheelchair Basketball 2026-2027',
  'Practice Time: Saturdays',
  '8:00am – 11:30am – Varsity',
  'Location: St James United Methodist Church',
  '',
  '4400 Peachtree Dunwoody Rd, Atlanta, GA 30342',
  '',
  'Competition: In a typical season, the BlazeSports Jr. Hawks travels within and outside of the South Eastern Conference (SEC).',
  'Please visit our website at https://blazesports.org/ For questions, please email erobinson@blazesports.org.',
].join('\n');

describe('addressInPlace', () => {
  it('reads the city and state after a street, past a suite', () => {
    expect(
      addressInPlace(
        'St. James United Methodist Church, 4400 Peachtree Dunwoody Rd NE, Atlanta, GA 30342',
      ),
    ).toEqual({
      venue: 'St. James United Methodist Church',
      street: '4400 Peachtree Dunwoody Rd NE',
      city: 'Atlanta',
      state: 'GA',
      zip: '30342',
    });
    expect(
      addressInPlace(
        'DRIVEN NeuroRecovery Center, 701 E Bridger Ave, Suite 150, Las Vegas, NV 89101',
      ),
    ).toMatchObject({ city: 'Las Vegas', state: 'NV' });
    expect(addressInPlace('Vista Yoga, 2836 Lavista Rd, Unit D, Decatur, GA 30033')).toMatchObject({
      city: 'Decatur',
    });
    expect(
      addressInPlace('Mill Springs Academy, 13660 New Providence Road, Alpharetta, Georgia'),
    ).toMatchObject({ city: 'Alpharetta', state: 'GA', zip: null });
  });

  it('takes a venue, city and ZIP with no street, but not a building as a town', () => {
    expect(addressInPlace('Ed Roberts Campus, Berkeley, CA 94703')).toMatchObject({
      street: null,
      city: 'Berkeley',
      state: 'CA',
    });
    expect(addressInPlace('Hart Senior Center, CA 95816')).toBeNull();
    expect(addressInPlace('CSUS, The Welcome Center, Sacramento, CA')).toBeNull();
  });

  it('says nothing where the city cannot be told from the street', () => {
    // NorCal SCI and ActiveNet run the street into the city with spaces.
    expect(
      addressInPlace("Gino's Pizza 1761 Monterey Street San Luis Obispo, CA, 93401 United States"),
    ).toBeNull();
    expect(addressInPlace('Hart Senior Center, 915 27th Street Sacramento CA 95816')).toBeNull();
    expect(addressInPlace('St. James United Methodist Church')).toBeNull();
    expect(addressInPlace('Rincon Beach Life Rolls on California')).toBeNull();
    expect(addressInPlace('')).toBeNull();
  });
});

describe('addressInText', () => {
  it('finds the address under a Location line, with that line’s venue', () => {
    expect(addressInText(BASKETBALL)).toEqual({
      venue: 'St James United Methodist Church',
      street: '4400 Peachtree Dunwoody Rd',
      city: 'Atlanta',
      state: 'GA',
      zip: '30342',
    });
  });

  it('reads the other shapes the feeds write', () => {
    // BlazeSports' Adaptive Fitness, with a pin before the street.
    expect(
      addressInText(
        'Where: CrossFit Iconz\n📍 5345 Five Forks Trickum Rd, Lilburn, GA 30047\n\nSign up today',
      ),
    ).toMatchObject({ venue: 'CrossFit Iconz', city: 'Lilburn', state: 'GA' });
    // BlazeSports' Track and Field, all on one line.
    expect(
      addressInText('Where: Mill Springs Academy, 13660 New Providence Rd, Alpharetta, GA 30004'),
    ).toMatchObject({ venue: 'Mill Springs Academy', city: 'Alpharetta', zip: '30004' });
    // A Santa Cruz group's Address block.
    expect(
      addressInText(
        'Address: Dignity Health Wellness Center\n21340 East Cliff Drive, Santa Cruz, CA 95062\nContact: Roger',
      ),
    ).toMatchObject({ venue: 'Dignity Health Wellness Center', city: 'Santa Cruz', state: 'CA' });
  });

  it('takes nothing that is not a whole address, or one of two', () => {
    // BlazeSports' Yoga: a city and the street apart, in no order.
    expect(
      addressInText(
        'Where: Vista Yoga\n\nDecatur, GA 30033\n\nSuite D, Building Number: 2836 Lavista Road',
      ),
    ).toBeNull();
    // ActiveNet's Get Fit: no commas to tell the street from the city.
    expect(
      addressInText('Location: Hart Senior Center\nAddress: 915 27th Street Sacramento CA 95816'),
    ).toBeNull();
    expect(addressInText('Founded in 1996, Atlanta, GA')).toBeNull();
    expect(
      addressInText('Practice: 1 Main St, Decatur, GA 30030\nGames: 9 Elm St, Atlanta, GA 30342'),
    ).toBeNull();
    expect(addressInText('')).toBeNull();
  });
});

describe('placeInOwnWords', () => {
  it('gives a venue-only event the address its description gives', () => {
    expect(
      placeInOwnWords({
        title: 'Wheelchair Basketball',
        location: 'St. James United Methodist Church',
        description: BASKETBALL,
      }),
    ).toEqual({
      location: 'St. James United Methodist Church, 4400 Peachtree Dunwoody Rd, Atlanta, GA 30342',
      city: 'Atlanta',
      state: 'GA',
    });
  });

  it('keeps a full location and reads its city', () => {
    const location = 'CrossFit Iconz, 5345 Five Forks Trickum Rd SW, Lilburn, GA 30047';
    expect(placeInOwnWords({ title: 'Adaptive Fitness', location, description: '' })).toEqual({
      location,
      city: 'Lilburn',
      state: 'GA',
    });
  });

  it('places an event with no location from a labelled address', () => {
    expect(
      placeInOwnWords({
        title: 'SCI peer group',
        location: '',
        description:
          'Address: Dignity Health Wellness Center\n21340 East Cliff Drive, Santa Cruz, CA 95062',
      }),
    ).toMatchObject({
      location: 'Dignity Health Wellness Center, 21340 East Cliff Drive, Santa Cruz, CA 95062',
      city: 'Santa Cruz',
    });
  });

  it('leaves an online event, and a location it cannot read, alone', () => {
    expect(
      placeInOwnWords({
        title: 'Peer support',
        location: 'Zoom',
        description: 'Our office: 4400 Peachtree Dunwoody Rd, Atlanta, GA 30342',
      }),
    ).toBeNull();
    expect(
      placeInOwnWords({
        title: 'Get Fit',
        location: 'Hart Senior Center, 915 27th Street Sacramento CA 95816',
        description: 'Location: Hart Senior Center',
      }),
    ).toBeNull();
    expect(
      placeInOwnWords({ title: 'Gala', location: 'The Ritz', description: 'Join us!' }),
    ).toBeNull();
  });
});
