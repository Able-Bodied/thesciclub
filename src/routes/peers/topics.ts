/**
 * Grouping what members said they are happy to talk about.
 *
 * `members.topics` is free text — the club's directory was written by people,
 * not chosen from a list — so the same subject arrives under several names. In
 * the seeded directory alone, wanting to talk about going back to school is
 * written four ways: "Back to school", "Going back to school", "Back to school
 * and work" and "Returning to college". Six members want that conversation and
 * every one of those chips found at most two of them.
 *
 * The numbers are the argument: 61 distinct strings across 18 members, 53 of
 * them named by exactly one person. A filter built straight from that is a
 * wall of chips that each narrow the deck to a single member — and the sheet
 * caps the list at 24, so most of them could not be reached at all.
 *
 * ---------------------------------------------------------------------------
 * Rules, and the same bargain the event tags make
 * ---------------------------------------------------------------------------
 * jobs/event-ingest/classify.js solved this for events with a curated taxonomy
 * and patterns that map messy input onto it. This is the same shape, for the
 * same reason: the vocabulary is small and repetitive, and a rule can be traced
 * to the line that produced it.
 *
 * Confident on the obvious, silent on the rest. A topic nothing matches keeps
 * the member's own words and stands as its own chip — a wrong grouping is worse
 * than an ungrouped one, because it puts somebody in a conversation they did
 * not offer to have.
 *
 * ---------------------------------------------------------------------------
 * A topic can belong to more than one group
 * ---------------------------------------------------------------------------
 * "Back to school and work" is both. Returning a single label would have filed
 * that member under school and lost them from work, which is the bug this file
 * exists to fix, one layer further down.
 *
 * ---------------------------------------------------------------------------
 * Nothing is rewritten
 * ---------------------------------------------------------------------------
 * This groups topics for the filter. A member's own profile keeps their own
 * words: "Suprapubic catheter" is how that member put it, and replacing it with
 * a tidier house phrase edits what somebody chose to say about their own body.
 */

/** A canonical topic, and the patterns that earn it. */
const GROUPS: [label: string, pattern: RegExp][] = [
  ['Back to school', /\b(school|college|university|studying|student)\b/i],
  // "and work" carries "Back to school and work", which names both and has to
  // reach both. Plain "work" is deliberately not here: it would swallow
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

/**
 * The groups a raw topic belongs to, or the topic itself when none claim it.
 *
 * Always returns at least one string, so a caller can treat every topic the
 * same way whether it was grouped or not.
 */
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
