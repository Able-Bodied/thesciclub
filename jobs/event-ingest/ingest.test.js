import { describe, expect, it } from 'vitest';
import { eventChanged, matchOrganization } from './ingest.js';

const ORGANIZATIONS = [
  { id: 'ncs', name: 'NorCal SCI', short_code: 'NCS' },
  { id: 'wwm', name: 'Wheel with Me Foundation', short_code: 'WWM' },
  { id: 'hf', name: 'High Fives Foundation', short_code: 'HF' },
];

describe('matchOrganization', () => {
  it('matches an exact name', () => {
    expect(matchOrganization('High Fives Foundation', ORGANIZATIONS)).toBe('hf');
  });

  it('ignores case and punctuation', () => {
    // A hub writing "Wheel With Me Foundation," should not lose the match to a
    // capital letter and a comma.
    expect(matchOrganization('Wheel With Me Foundation,', ORGANIZATIONS)).toBe('wwm');
    expect(matchOrganization('norcal sci', ORGANIZATIONS)).toBe('ncs');
  });

  it('refuses a near match', () => {
    // Deliberately not fuzzy. An organization's name is a vouching signal here,
    // so crediting an event to the wrong body is worse than crediting it to
    // nobody.
    expect(matchOrganization('NorCal SCI Foundation', ORGANIZATIONS)).toBeNull();
    expect(matchOrganization('High Five', ORGANIZATIONS)).toBeNull();
  });

  it('is null for a host the club does not have', () => {
    expect(matchOrganization('BORP Adaptive Sports', ORGANIZATIONS)).toBeNull();
  });

  it('is null for no host at all', () => {
    expect(matchOrganization(null, ORGANIZATIONS)).toBeNull();
    expect(matchOrganization('', ORGANIZATIONS)).toBeNull();
    expect(matchOrganization('   ', ORGANIZATIONS)).toBeNull();
  });
});

describe('eventChanged', () => {
  const scraped = {
    title: 'Wheelchair rugby',
    description: 'Bring nothing.',
    description_html: '<p>Bring nothing.</p>',
    start_time: '2026-09-05T17:00:00.000Z',
    end_time: null,
    location: 'Independence Sports Complex',
    url: 'https://example.org/rugby',
    registration_url: null,
  };

  it('is true for an event we have never seen', () => {
    expect(eventChanged(undefined, scraped)).toBe(true);
  });

  it('is false for a byte-for-byte re-scrape', () => {
    expect(eventChanged({ ...scraped }, scraped)).toBe(false);
  });

  it('notices a changed time', () => {
    expect(eventChanged({ ...scraped, start_time: '2026-09-05T18:00:00.000Z' }, scraped)).toBe(
      true,
    );
  });

  it('notices a rewritten description', () => {
    expect(eventChanged({ ...scraped, description: 'Bring a chair.' }, scraped)).toBe(true);
  });

  it('ignores updated_at, which we write every run', () => {
    // Including it would make every event look changed on every pass, which
    // makes the signal worthless.
    const prior = { ...scraped, updated_at: '2020-01-01T00:00:00.000Z' };
    expect(eventChanged(prior, { ...scraped, updated_at: new Date().toISOString() })).toBe(false);
  });

  it('treats null and an empty string as the same absence', () => {
    // Scrapers are inconsistent about which they emit for "no end time", and a
    // spurious diff would re-flag every event forever.
    expect(eventChanged({ ...scraped, end_time: '' }, { ...scraped, end_time: null })).toBe(false);
    expect(
      eventChanged({ ...scraped, registration_url: null }, { ...scraped, registration_url: '' }),
    ).toBe(false);
  });

  it('ignores the geocoded columns, which the source never states', () => {
    const prior = { ...scraped, city: 'San Jose', latitude: 37.3 };
    expect(eventChanged(prior, scraped)).toBe(false);
  });
});
