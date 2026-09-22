/**
 * Who is in the deck.
 *
 * Kept apart from ranking, which decides who is on top. Everything here is a
 * pure function over plain data so the rules can be tested without a database
 * or a component.
 *
 * The filters are the ones members actually reach for in an SCI community:
 * region of injury, city, and the topics somebody is willing to be asked about.
 * Search is names only (owner, 2026-09-21). It used to read across place,
 * level, topics, interests and the bio as well, on the argument that somebody
 * typing "SmartDrive" wants whoever mentioned it anywhere — but typed one
 * letter at a time, "a" is somewhere in every bio, the deck never moved, and
 * the box looked broken. Place, level and topics are what the filter sheet
 * is for; the box finds a person by name and moves on the first keystroke.
 */

import { canonicalTopicsOf } from '@/routes/peers/topics';
import type { BrowseMember, InjuryRegion, MemberFilters, PeersSegment } from '@/types/domain';

/** Cities that count as the South Bay for the "Near me" segment. */
const NEARBY_CITIES = ['San Jose', 'Santa Clara', 'Sunnyvale', 'Campbell', 'Fremont'];

export function activeFilterCount(filters: MemberFilters): number {
  return filters.regions.length + filters.cities.length + filters.topics.length;
}

/** Toggle a value in one of the list-shaped filters. */
export function toggleFilter<K extends 'regions' | 'cities' | 'topics'>(
  filters: MemberFilters,
  key: K,
  value: MemberFilters[K][number],
): MemberFilters {
  const current = filters[key] as string[];
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  return { ...filters, [key]: next };
}

/** Whether `q` begins a word somewhere in `text`. Both already lowercased. */
function beginsAWord(text: string, q: string): boolean {
  let at = text.indexOf(q);
  while (at !== -1) {
    if (at === 0 || !/[\p{L}\p{N}]/u.test(text[at - 1] ?? '')) return true;
    at = text.indexOf(q, at + 1);
  }
  return false;
}

/** The start of any word of the name: "an" finds Mary Ann, "ry" finds nobody. */
function matchesSearch(member: BrowseMember, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return beginsAWord(member.displayName.toLowerCase(), q);
}

function matchesSegment(member: BrowseMember, segment: PeersSegment): boolean {
  if (segment === 'mentors') return member.type === 'mentor';
  if (segment === 'near') return member.city !== null && NEARBY_CITIES.includes(member.city);
  return true;
}

/**
 * The club's own account sorts last.
 *
 * It arrived first by accident: the query orders by display_name and the
 * account is called "Admin". That put a full-height card for a non-person at
 * the top of the deck, so every visit to Peers opened on the one card that is
 * not a peer and you scrolled past it to reach one.
 *
 * Last rather than removed. It is how somebody reaches the club with a problem,
 * and a deck that never shows it makes that harder to find than it was.
 */
function officialLast(a: BrowseMember, b: BrowseMember): number {
  return Number(a.isAdmin) - Number(b.isAdmin);
}

export function filterMembers(
  members: BrowseMember[],
  filters: MemberFilters,
  segment: PeersSegment,
): BrowseMember[] {
  const kept = members.filter((member) => {
    if (!matchesSegment(member, segment)) return false;
    if (filters.regions.length && !filters.regions.includes(member.region)) return false;
    if (filters.cities.length && (!member.city || !filters.cities.includes(member.city))) {
      return false;
    }
    // A member matches a topic filter if any selected topic appears in their
    // topics *or* their interests — people file the same thing under both.
    //
    // Matched on the grouped form, so "Back to school" finds the member who
    // wrote "Going back to school" as well. See topics.ts for why that is not
    // a nicety: the raw strings split six members wanting one conversation
    // across four chips, none of which found more than two of them.
    if (filters.topics.length) {
      const theirs = new Set(
        canonicalTopicsOf([...member.topics, ...member.interests]).map((t) => t.toLowerCase()),
      );
      const hit = filters.topics.some((t) => theirs.has(t.toLowerCase()));
      if (!hit) return false;
    }
    return matchesSearch(member, filters.search);
  });

  // Stable, so everyone else keeps the query's display_name order.
  return [...kept].sort(officialLast);
}

/**
 * Everyone but the person reading.
 *
 * The deck answers "who could I talk to", and you are not one of them — every
 * other card is a conversation that could happen and your own is a dead end.
 * It skewed the counts too: "25 of 25 members" counted the reader, and in a
 * club this size a filter down to one city could say three when it means two
 * other people and you.
 *
 * Done here rather than in `browse_members`, deliberately. The view backs
 * `/peers/:id` as well as the deck, and dropping yourself from it would take
 * your own profile with it — which is the page Me now links to so you can see
 * what you are presenting.
 */
export function othersOnly(members: BrowseMember[], viewerId: string | null): BrowseMember[] {
  if (!viewerId) return members;
  return members.filter((member) => member.id !== viewerId);
}

/** The distinct values present in a deck, for building the filter sheet's options. */
export function regionsIn(members: BrowseMember[]): InjuryRegion[] {
  return [...new Set(members.map((m) => m.region))].sort();
}

export function citiesIn(members: BrowseMember[]): string[] {
  return [...new Set(members.map((m) => m.city).filter((c): c is string => Boolean(c)))].sort();
}

/**
 * Topics, most-shared first.
 *
 * Grouped before counting (topics.ts), which is what makes the count mean
 * anything: the raw strings are free text and 53 of the 61 in the seeded
 * directory were named by exactly one person, so ordering by frequency was
 * ordering a list of ones. Grouped, that falls to 17 of 29.
 *
 * Sorting alphabetically would bury the topics that actually narrow a deck
 * under the singletons that remain, so this orders by how many members share
 * one and lets the caller cap the list.
 */
export function topicsIn(members: BrowseMember[], limit?: number): string[] {
  const counts = new Map<string, number>();
  for (const member of members) {
    // Deduplicated per member, so somebody who wrote both "Back to school" and
    // "Returning to college" counts once toward the group rather than twice.
    for (const topic of canonicalTopicsOf(member.topics)) {
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
    }
  }
  const sorted = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([topic]) => topic);
  return limit === undefined ? sorted : sorted.slice(0, limit);
}
