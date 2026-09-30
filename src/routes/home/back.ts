import { HOME_SEGMENTS, type HomeSegment } from '@/lib/home/types';

/**
 * Where a screen opened from Home goes back to, or null when it was not.
 *
 * Every card on Home hands the screen it opens `{ from: 'home', segment }`.
 * A topic, an event or a profile reached that way says "Home" on its back
 * link and returns to the pill it was opened from: back from an event opened
 * under Events should not land on Everything. The pill is rebuilt into the
 * URL, the way `routes/events/back.ts` rebuilds an Events segment.
 *
 * Router state is not trusted: a segment that is not one of Home's is
 * dropped, and the answer is plain `/home`.
 */
export function backToHome(state: unknown): string | null {
  const { from, segment } = (state ?? {}) as { from?: unknown; segment?: unknown };
  if (from !== 'home') return null;
  if (typeof segment !== 'string' || !HOME_SEGMENTS.includes(segment as HomeSegment)) {
    return '/home';
  }
  return segment === 'everything' ? '/home' : `/home?segment=${segment}`;
}
