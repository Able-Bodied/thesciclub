import type { ClubEvent, EventsSegment } from '@/types/domain';

/**
 * "View on the map" (the owner, 2026-10-26): only for an event the map can
 * hold, as map_events chooses them: not online only, and not over more than
 * an hour ago.
 */
export function canShowOnMap(event: ClubEvent, now: Date = new Date()): boolean {
  if (event.format === 'online') return false;
  const start = Date.parse(event.startTime);
  const end = event.endTime
    ? Date.parse(event.endTime)
    : start + (event.allDay ? 24 * 60 * 60 * 1000 : 0);
  return end >= now.getTime() - 60 * 60 * 1000;
}

export const SHOW_PARAM = 'show';

/** The Events map, opened on one event; an RSVP list stays chosen. */
export function mapLinkFor(eventId: string, segment?: EventsSegment): string {
  const params = new URLSearchParams();
  if (segment === 'going' || segment === 'interested') params.set('segment', segment);
  params.set('view', 'map');
  params.set(SHOW_PARAM, eventId);
  return `/events?${params.toString()}`;
}
