import type { Location } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { backLabel, backToEvents } from '@/routes/events/back';

function location(state: unknown): Location {
  return { pathname: '/events/x', search: '', hash: '', state, key: 'k' } as Location;
}

describe('backToEvents', () => {
  it('returns to the segment the detail page was opened from', () => {
    // The bug this exists for: opening an organization and pressing back
    // landed on Upcoming, because the segment lived in component state that
    // died with the unmounted page.
    expect(backToEvents(location({ segment: 'orgs' }))).toBe('/events?segment=orgs');
  });

  it('handles every segment', () => {
    expect(backToEvents(location({ segment: 'going' }))).toBe('/events?segment=going');
    expect(backToEvents(location({ segment: 'online' }))).toBe('/events?segment=online');
    expect(backToEvents(location({ segment: 'sport' }))).toBe('/events?segment=sport');
  });

  it('leaves the URL clean for the default segment', () => {
    expect(backToEvents(location({ segment: 'upcoming' }))).toBe('/events');
  });

  describe('a detail page reached without going through the list', () => {
    it('still goes somewhere sensible from a shared link', () => {
      // No router state at all — a link somebody sent, or a refresh. This is
      // why the arrow is not navigate(-1), which would do nothing or leave
      // the app.
      expect(backToEvents(location(null))).toBe('/events');
    });

    it('ignores a segment that is not one of ours', () => {
      // The value reaches this through router state and a URL, so it is not
      // trusted — an unknown one would otherwise build a URL that selects
      // nothing.
      expect(backToEvents(location({ segment: 'nonsense' }))).toBe('/events');
    });

    it('ignores a non-string segment', () => {
      expect(backToEvents(location({ segment: 42 }))).toBe('/events');
      expect(backToEvents(location({}))).toBe('/events');
    });
  });
});

describe('backLabel', () => {
  it('names the place it is going back to', () => {
    expect(backLabel(location({ segment: 'orgs' }))).toBe('Organizations');
  });

  it('says Events for everything else', () => {
    expect(backLabel(location({ segment: 'going' }))).toBe('Events');
    expect(backLabel(location(null))).toBe('Events');
  });
});
