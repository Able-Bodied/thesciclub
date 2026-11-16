import type { Location } from 'react-router-dom';
import { backToHome } from '@/routes/home/back';
import { EVENTS_SEGMENTS, type EventsSegment } from '@/types/domain';

/**
 * Where a detail page's back arrow should go.
 *
 * The Events tab keeps its segment in the URL, and a detail page is opened with
 * the segment it was opened from in router state. So going back means
 * reconstructing that URL, not just navigating to `/events` — which is what it
 * used to do, and why opening an organization and pressing back dropped you on
 * Upcoming instead of on Organizations.
 *
 * Not `navigate(-1)`, which looks equivalent and is not: a detail page reached
 * from a shared link, a refresh, or a notification has no history to go back
 * to, and the arrow would either do nothing or leave the app entirely. This
 * always produces somewhere sensible, and the answer happens to match the
 * browser's back when there is history.
 */
export function backToEvents(location: Location): string {
  const reviews = backToReviews(location.state);
  if (reviews) return reviews.path;
  // Opened from a card on Home, which is where back should go.
  const home = backToHome(location.state);
  if (home) return home;
  const state = location.state as { segment?: unknown; view?: unknown; from?: unknown } | null;
  // Opened from the map on Peers.
  if (state?.from === 'peers-map') return '/peers?view=map';
  const map = state?.view === 'map';
  const segment = state?.segment;
  const known = typeof segment === 'string' && EVENTS_SEGMENTS.includes(segment as EventsSegment);
  // `upcoming` is the default and carries no parameter, so the URL stays clean
  // for the common case.
  const params = [
    ...(known && segment !== 'upcoming' ? [`segment=${segment}`] : []),
    ...(map ? ['view=map'] : []),
  ];
  return params.length ? `/events?${params.join('&')}` : '/events';
}

/** What the arrow should say, given where it will land. */
export function backLabel(location: Location): string {
  const reviews = backToReviews(location.state);
  if (reviews) return reviews.name;
  if (backToHome(location.state)) return 'Home';
  if ((location.state as { from?: unknown } | null)?.from === 'peers-map') return 'Peers';
  return backToEvents(location).includes('segment=orgs') ? 'Organizations' : 'Events';
}

/**
 * Opened from a review on another page (the owner, 2026-11-16): back returns
 * there, to that review, with the state that page was opened with.
 */
export interface FromReviews {
  from: 'reviews';
  path: string;
  name: string;
  state: unknown;
  review: string;
}

export function backToReviews(state: unknown): FromReviews | null {
  const s = (state ?? {}) as Partial<Record<keyof FromReviews, unknown>>;
  if (s.from !== 'reviews') return null;
  // Router state is not trusted: only an event or organization page.
  if (typeof s.path !== 'string' || !/^\/events\/(organizations\/)?[\w-]+$/.test(s.path))
    return null;
  if (typeof s.name !== 'string' || typeof s.review !== 'string') return null;
  return { from: 'reviews', path: s.path, name: s.name, state: s.state, review: s.review };
}

/** The router state to go back with: the page's own, and which review to show. */
export function backState(location: Location): unknown {
  const reviews = backToReviews(location.state);
  if (!reviews) return undefined;
  const own = typeof reviews.state === 'object' && reviews.state !== null ? reviews.state : {};
  return { ...own, showReview: reviews.review };
}
