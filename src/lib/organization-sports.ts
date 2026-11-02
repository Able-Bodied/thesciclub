import type { Organization } from '@/types/domain';

/**
 * The sports in the organizations' filter (the owner, 2026-11-01). Organizations
 * have no column for this and their tags are too broad, so it is read from the
 * words of their name, description and tags, which name what they run.
 *
 * Whole words: `ski` must not find "risk". A gym's bikes are therapy rather than
 * a cycling club, so `not` leaves those out.
 */
export const ORGANIZATION_SPORTS: readonly {
  id: string;
  label: string;
  words: RegExp;
  not?: Organization['category'];
}[] = [
  {
    id: 'cycling',
    label: 'Cycling',
    words: /\b(hand ?cycl\w*|cycl\w*|bik\w*|e-assist)\b/i,
    not: 'gym',
  },
  {
    id: 'water',
    label: 'Water sports',
    words:
      /\b(water sports?|surf\w*|sail\w*|kayak\w*|canoe\w*|paddl\w*|swim\w*|scuba|diving|water ?ski\w*)\b/i,
  },
  {
    id: 'winter',
    label: 'Winter sports',
    words: /\b(winter sports?|skis?|skiing|snowboard\w*|sled\w*|monoski\w*)\b/i,
  },
  {
    id: 'team',
    label: 'Team sports',
    words: /\b(team sports?|rugby|basketball|soccer|softball|hockey)\b/i,
  },
  { id: 'climbing', label: 'Climbing', words: /\bclimb\w*\b/i },
  { id: 'racket', label: 'Tennis & pickleball', words: /\b(tennis|pickleball)\b/i },
];

/** What "Any sport" also counts, beyond the sports above. */
const ANY_SPORT = /\b(sports?|athlet\w*)\b/i;

export const ANY_SPORT_ID = 'any';

/** Whether an organization runs `sport`, one of the ids above or `ANY_SPORT_ID`. */
export function runsSport(organization: Organization, sport: string): boolean {
  const text = [organization.name, organization.description, ...organization.tags].join(' ');
  const runs = (id: string) =>
    ORGANIZATION_SPORTS.some(
      (one) => one.id === id && one.not !== organization.category && one.words.test(text),
    );
  if (sport !== ANY_SPORT_ID) return runs(sport);
  return ANY_SPORT.test(text) || ORGANIZATION_SPORTS.some((one) => runs(one.id));
}
