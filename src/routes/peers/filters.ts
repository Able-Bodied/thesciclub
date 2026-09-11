/**
 * Who is in the deck.
 *
 * Kept apart from ranking, which decides who is on top. Everything here is a
 * pure function over plain data so the rules can be tested without a database
 * or a component.
 *
 * The filters are the ones members actually reach for in an SCI community:
 * region of injury, city, and the topics somebody is willing to be asked about.
 * Search is deliberately broad — it reads across name, place, level, topics,
 * interests and the free-text bio, because somebody searching "SmartDrive" or
 * "Mitrofanoff" is looking for a person who mentioned it anywhere, not for a
 * field we decided in advance was the searchable one.
 */

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

function matchesSearch(member: BrowseMember, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    member.displayName,
    member.city,
    member.state,
    member.levelRange,
    member.exactLevel,
    member.completeness,
    member.fieldOfWork,
    member.education,
    member.bio,
    member.detail,
    ...member.topics,
    ...member.interests,
    ...member.selfCare,
    ...member.affiliations,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

function matchesSegment(member: BrowseMember, segment: PeersSegment): boolean {
  if (segment === 'mentors') return member.type === 'mentor';
  if (segment === 'near') return member.city !== null && NEARBY_CITIES.includes(member.city);
  return true;
}

export function filterMembers(
  members: BrowseMember[],
  filters: MemberFilters,
  segment: PeersSegment,
): BrowseMember[] {
  return members.filter((member) => {
    if (!matchesSegment(member, segment)) return false;
    if (filters.regions.length && !filters.regions.includes(member.region)) return false;
    if (filters.cities.length && (!member.city || !filters.cities.includes(member.city))) {
      return false;
    }
    // A member matches a topic filter if any selected topic appears in their
    // topics *or* their interests — people file the same thing under both.
    if (filters.topics.length) {
      const theirs = [...member.topics, ...member.interests].map((t) => t.toLowerCase());
      const hit = filters.topics.some((t) => theirs.some((v) => v.includes(t.toLowerCase())));
      if (!hit) return false;
    }
    return matchesSearch(member, filters.search);
  });
}

/** The distinct values present in a deck, for building the filter sheet's options. */
export function regionsIn(members: BrowseMember[]): InjuryRegion[] {
  return [...new Set(members.map((m) => m.region))].sort();
}

export function citiesIn(members: BrowseMember[]): string[] {
  return [...new Set(members.map((m) => m.city).filter((c): c is string => Boolean(c)))].sort();
}

export function topicsIn(members: BrowseMember[]): string[] {
  return [...new Set(members.flatMap((m) => m.topics))].sort();
}
