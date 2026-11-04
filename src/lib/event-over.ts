/**
 * When an event is over, for members and its public page alike (the owner,
 * 2026-11-03): once its end has passed, or its start when it has none. An
 * all-day event with no end lasts its day, as map_events and check-ins read
 * it. Instants, so the event's own time zone needs no handling here.
 */

const DAY = 24 * 60 * 60 * 1000;

export interface EventWhen {
  startTime: string;
  endTime: string | null;
  allDay: boolean;
}

/** The instant an event is over, in milliseconds. */
export function eventOverAt(event: EventWhen): number {
  if (event.endTime) return Date.parse(event.endTime);
  return Date.parse(event.startTime) + (event.allDay ? DAY : 0);
}

export function isEventOver(event: EventWhen, now: number = Date.now()): boolean {
  return eventOverAt(event) < now;
}
