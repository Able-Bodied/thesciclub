import { describe, expect, it } from 'vitest';
import {
  eventIdIn,
  isOrganizationsLink,
  isPreviewer,
  organizationMapPage,
  type PreviewEvent,
  previewPage,
  shortLinkIn,
  whenLine,
} from '../netlify/edge-functions/event-preview';

const ID = '11111111-1111-4111-8111-111111111111';
const event: PreviewEvent = {
  id: ID,
  title: 'Peer Coffee & Rolling',
  start_time: '2026-11-07T23:00:00Z',
  all_day: false,
  timezone: 'America/Los_Angeles',
  location: 'Blue Bottle',
  city: 'Oakland',
  state: 'CA',
  photo_path: 'events/x/cover.webp',
};

describe('a link to an event in a text message', () => {
  it('finds an event in either address, and nothing else', () => {
    expect(eventIdIn(`/e/${ID}`)).toBe(ID);
    expect(eventIdIn(`/events/${ID}`)).toBe(ID);
    expect(shortLinkIn('/e/49ers')).toBe('49ers');
    expect(shortLinkIn(`/e/${ID}`)).toBeNull();
    expect(shortLinkIn('/events/49ers')).toBeNull();
    expect(shortLinkIn('/e/49ers/register')).toBeNull();
    expect(eventIdIn(`/events/${ID}/review`)).toBeNull();
    expect(eventIdIn('/events/new')).toBeNull();
    expect(eventIdIn('/events')).toBeNull();
  });

  it('answers what fetches previews, and leaves a member’s browser alone', () => {
    const iMessage =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0';
    const safari =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
    expect(isPreviewer(iMessage)).toBe(true);
    expect(isPreviewer(safari)).toBe(false);
    expect(isPreviewer(null)).toBe(false);
  });

  it('says when in the event’s own zone, without a time all day', () => {
    expect(whenLine(event)).toBe('Sat, Nov 7, 3:00 PM');
    expect(whenLine({ ...event, all_day: true })).toBe('Sat, Nov 7');
  });

  it('puts the name, the date and the picture in the tags', () => {
    const page = previewPage(event, 'https://photos.example/cover.webp?token=a&b=1');
    expect(page).toContain(
      '<meta property="og:title" content="Peer Coffee &amp; Rolling · Sat, Nov 7, 3:00 PM" />',
    );
    expect(page).toContain('content="https://photos.example/cover.webp?token=a&amp;b=1"');
    expect(page).toContain(`<meta property="og:url" content="https://thesciclub.com/e/${ID}" />`);
    expect(page).toContain('Blue Bottle, Oakland, CA');
    expect(page).toContain('summary_large_image');
  });

  it('cannot be broken out of by an event’s name', () => {
    const page = previewPage({ ...event, title: '"><script>alert(1)</script>' }, null);
    expect(page).not.toContain('<script>');
  });

  it('gives a link to the organizations its own title and picture', () => {
    const link = (path: string) => isOrganizationsLink(new URL(`https://thesciclub.com${path}`));
    expect(link('/events?segment=orgs&view=map')).toBe(true);
    expect(link('/events?view=map&segment=orgs')).toBe(true);
    expect(link('/events?view=map')).toBe(false);
    expect(link(`/events/${ID}?segment=orgs`)).toBe(false);
    const page = organizationMapPage();
    expect(page).toContain(
      '<meta property="og:title" content="Map of SCI organizations on The SCI Club" />',
    );
    expect(page).toContain('content="https://thesciclub.com/share/organization-map.jpg"');
  });

  it('falls back to the club’s picture', () => {
    expect(previewPage({ ...event, photo_path: null }, null)).toContain('favicon-512x512.png');
  });
});
