import { describe, expect, it } from 'vitest';
import { meetingService } from '../../../src/lib/meeting-link.ts';
import { cityOf, isMeetingLink, whereOf } from './place.ts';

const none = { url: null, conference: [], description: '' };

describe('the city of an address', () => {
  it.each([
    ['1 Hacker Wy, Menlo Park, CA 94025, USA', 'Menlo Park', 'CA'],
    ['Apple Park, 1 Apple Park Way, Cupertino, CA 95014, United States', 'Cupertino', 'CA'],
    ['Sacramento, CA', 'Sacramento', 'CA'],
    ['Archer Bicycle, 431 13th Street, Oakland, California, 94607 United States', null, null],
    ['431 13th Street, Oakland, California 94607', 'Oakland', 'CA'],
    ['500 Main St, Menlo Park CA 94025', 'Menlo Park', 'CA'],
    ['1 Main St, New York, New York 10001', 'New York', 'NY'],
  ])('%s', (address, city, state) => {
    expect(cityOf(address)).toEqual(city ? { city, state } : null);
  });

  it.each([
    'Lakeside Park, Oakland',
    'Lakeside Park, Washington',
    '10 Downing St, London SW1A 2AA, UK',
    'Toronto, ON M5V 2T6, Canada',
    '1 Hacker Wy Menlo Park CA 94025',
    'Room 4',
  ])('never guesses: %s', (address) => {
    expect(cityOf(address)).toBeNull();
  });
});

describe('a place and its link, apart', () => {
  it('splits an address glued to a Meet link, and is hybrid', () => {
    expect(
      whereOf({
        ...none,
        location: '1 Hacker Wy, Menlo Park, CA 94025, USA; https://meet.google.com/rgz-aaxe-xyf',
      }),
    ).toEqual({
      place: '1 Hacker Wy, Menlo Park, CA 94025, USA',
      link: 'https://meet.google.com/rgz-aaxe-xyf',
      format: 'hybrid',
      city: 'Menlo Park',
      state: 'CA',
    });
  });

  it('a link alone is online, with no city', () => {
    expect(whereOf({ ...none, location: 'https://us02web.zoom.us/j/123?pwd=abc' })).toEqual({
      place: '',
      link: 'https://us02web.zoom.us/j/123?pwd=abc',
      format: 'online',
      city: null,
      state: null,
    });
  });

  it('a label for a call is no place', () => {
    const teams = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_x%40thread.v2/0';
    expect(
      whereOf({
        ...none,
        location: 'Microsoft Teams Meeting',
        description: `Join the meeting now<${teams}>`,
      }),
    ).toMatchObject({ place: '', link: teams, format: 'online' });
  });

  it('keeps an address with no link in person', () => {
    expect(whereOf({ ...none, location: '123 J St, Sacramento, CA 95814' })).toEqual({
      place: '123 J St, Sacramento, CA 95814',
      link: null,
      format: 'in_person',
      city: 'Sacramento',
      state: 'CA',
    });
  });

  it('a conference link beside an address is the link, but not hybrid', () => {
    expect(
      whereOf({
        ...none,
        location: '123 J St, Sacramento, CA 95814',
        conference: ['https://meet.google.com/abc-defg-hij'],
      }),
    ).toMatchObject({ link: 'https://meet.google.com/abc-defg-hij', format: 'in_person' });
  });

  it('a meeting link wins over the invitation’s own URL; the URL is kept without one', () => {
    const page = 'https://example.org/picnic';
    expect(
      whereOf({ ...none, location: '', url: page, description: 'Zoom: https://zoom.us/j/9.' }).link,
    ).toBe('https://zoom.us/j/9');
    expect(whereOf({ ...none, location: 'Lakeside Park', url: page }).link).toBe(page);
  });

  it('a web page in the place is the link, and the place stays in person', () => {
    expect(
      whereOf({ ...none, location: 'Lakeside Park, Oakland | https://example.org/map' }),
    ).toMatchObject({
      place: 'Lakeside Park, Oakland',
      link: 'https://example.org/map',
      format: 'in_person',
      city: null,
    });
  });

  it('a non-US address keeps its place and gets no city', () => {
    expect(whereOf({ ...none, location: '10 Downing St, London SW1A 2AA, UK' })).toEqual({
      place: '10 Downing St, London SW1A 2AA, UK',
      link: null,
      format: 'in_person',
      city: null,
      state: null,
    });
  });

  it('nothing at all is left to the database', () => {
    expect(whereOf({ ...none, location: '' }).format).toBeNull();
  });
});

// The website's list (src/lib/meeting-link.ts) is a superset of this one: a link
// the importer keeps apart as a meeting must read "Join online" on the pages.
describe('the meeting hosts, against the website', () => {
  it.each([
    'meet.google.com',
    'zoom.us',
    'us02web.zoom.us',
    'zoomgov.com',
    'teams.microsoft.com',
    'teams.live.com',
    'acme.webex.com',
  ])('%s', (host) => {
    const url = `https://${host}/j/1`;
    expect(isMeetingLink(url)).toBe(true);
    expect(meetingService(url)).not.toBeNull();
  });
});
