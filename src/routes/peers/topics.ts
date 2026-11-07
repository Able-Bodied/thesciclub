/**
 * Grouping what members said they are happy to talk about.
 *
 * `members.topics` is free text, so one subject arrives under several names (61 strings across 18
 * members, 53 used once; the sheet caps chips at 24). Rules map it onto a small taxonomy, as
 * jobs/event-ingest/classify.js does for events, so each group traces to a line.
 *
 * - Unmatched topics keep the member's words: a wrong grouping puts somebody in a conversation
 *   they did not offer to have.
 * - A topic can be in several groups ("Back to school and work" is both).
 * - Grouping is for the filter only; profiles keep the member's own words.
 */

/** A canonical topic, and the patterns that earn it. */
const GROUPS: [label: string, pattern: RegExp][] = [
  ['Back to school', /\b(school|college|university|studying|student)\b/i],
  // "and work" catches "Back to school and work". Not plain "work": it would swallow
  // "Working out", which is exercise.
  [
    'Back to work',
    /\b(back to work|returning to work|and work|working while|employment|career)\b/i,
  ],
  [
    'Adaptive sport',
    /\b(adaptive (sports?|recreation)|wheelchair rugby|handcycl\w*|adaptive cycling)\b/i,
  ],
  [
    'Adaptive equipment',
    /\b(adaptive (equipment|gear)|assistive tech\w*|wheelchair assist|smartdrive|biking gear)\b/i,
  ],
  ['Exercise and fitness', /\b(exercises?|working out|workouts?|fitness)\b/i],
  [
    'Bladder and bowel',
    /\b(bladder|catheter\w*|suprapubic|colostomy|ileostomy|bowel|utis?|botox)\b/i,
  ],
  ['Driving and getting about', /\b(driving|vehicles?|paratransit|transport\w*)\b/i],
  ['Mental health', /\b(mental health|depression|anxiety|therapy)\b/i],
  ['Relationships and intimacy', /\b(intimacy|dating|romantic|relationships?|sex)\b/i],
  [
    'Living independently',
    /\b(living independently|independence|live independently|home adaptations|adaptive home)\b/i,
  ],
  ['Caregivers', /\b(caregiv\w*|carers?|personal care attendant|pca)\b/i],
  ['Pain management', /\b(pain)\b/i],
  ['Pressure sores', /\b(pressure (sores?|ulcers?)|skin breakdown)\b/i],
];

/** The groups a raw topic belongs to, or the topic itself when none claim it ([] if blank). */
export function canonicalTopics(raw: string): string[] {
  const value = raw.trim();
  if (!value) return [];

  const matched = GROUPS.filter(([, pattern]) => pattern.test(value)).map(([label]) => label);
  return matched.length > 0 ? matched : [value];
}

/** Every group present across a set of raw topics, deduplicated. */
export function canonicalTopicsOf(raws: readonly string[]): string[] {
  return [...new Set(raws.flatMap(canonicalTopics))];
}
