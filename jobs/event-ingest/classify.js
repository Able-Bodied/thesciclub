/**
 * Working out what an event is, from what the feed wrote about it.
 *
 * ab-peers left both of these to an AI verification pass that was never wired
 * up, so in practice every event it ingested had a null format and no tags —
 * the filter sheet offered chips that matched nothing. This port has no AI
 * calls and no paid API keys, so the choice is between doing it with rules and
 * not doing it at all.
 *
 * Rules, for two reasons. The vocabulary is small and repetitive: these are
 * adaptive sport and peer support calendars, and they say "handcycle",
 * "monoski", "peer support group" in the title, not in code. And a rule is
 * inspectable — a wrong tag can be traced to the line that produced it and
 * fixed in a way that stays fixed, which is not true of a prompt.
 *
 * What that buys, and what it does not: these rules are confident on the
 * obvious cases and silent on the rest. An event nothing matches gets no tags
 * rather than a guessed one, because a wrong chip is worse than a missing one —
 * somebody filters for "Newly injured", gets a rugby match, and stops trusting
 * the filter.
 *
 * Everything here is a pure function over strings, so it can be tested without
 * a network or a database.
 */

/**
 * A venue or a title that means the event happens on a screen.
 *
 * Matched against the venue first, since "Zoom" in a location field is a much
 * stronger signal than "online" anywhere in a description — a description
 * saying "register online" is not an online event, and that exact phrase is
 * common enough in these feeds to matter.
 */
const ONLINE_VENUE = /\b(zoom|online|virtual|webinar|teams|google meet|livestream)\b/i;

/**
 * The same question asked of prose, where the bar has to be higher.
 *
 * Most of NorCal SCI's calendar is weekly Zoom groups with the location field
 * left blank, so the description is the only evidence there is — 89 of 101
 * events on a real pass. But a description is also where "please register
 * online by Friday" lives, which is not an online event and is common enough
 * in these feeds to matter.
 *
 * So this wants a platform named, or "online"/"virtual" attached to a word that
 * means the gathering itself. Bare "online" is not enough.
 */
const ONLINE_IN_COPY =
  /\b(zoom|google meet|microsoft teams|webex|webinar|livestream|virtually|(online|virtual) (group|meeting|event|session|class|workshop|support))\b/i;

/** Copy that says the event is both at a place and on a screen. */
const HYBRID = /\b(hybrid|in[- ]person (and|or) (online|virtual|zoom)|both in[- ]person)\b/i;

/**
 * Whether an event is in person, online or both.
 *
 * Returns null rather than guessing when nothing says. Null is a real answer —
 * "the feed did not tell us" — and it is different from "in person", which is
 * what an unconditional default would silently claim. The list treats null as
 * in person for display but never filters on it, so a wrong null costs a
 * filter match and never shows somebody a screen-only event as a place to go.
 */
export function classifyFormat({ location = '', title = '', description = '' } = {}) {
  const venue = location.trim();
  const copy = `${title}\n${description}`;

  if (HYBRID.test(copy)) return 'hybrid';

  // A venue is the strongest evidence there is, in both directions: "Zoom" in a
  // location field means online, and a street address is a positive statement
  // that there is somewhere to go. Either way the description is not consulted,
  // which is what keeps "register online" out of it.
  if (venue !== '') return ONLINE_VENUE.test(venue) ? 'online' : 'in_person';

  // No venue at all, so the prose is the only evidence — and the bar is higher.
  return ONLINE_IN_COPY.test(copy) ? 'online' : null;
}

/**
 * Tag rules: a slug from supabase/migrations/20260911210000_event_tags.sql, and
 * the pattern that earns it.
 *
 * Word boundaries throughout, so "ski" does not match "skill" and "rugby" does
 * not match inside a longer word. Ordered roughly by how specific the rule is,
 * though order does not affect the result — every rule is evaluated.
 */
const TAG_RULES = [
  // Sport & recreation
  ['handcycling', /\b(handcycl\w*|hand cycl\w*|hand[- ]?bike\w*)\b/i],
  ['wheelchair-rugby', /\b(wheelchair rugby|quad rugby|murderball)\b/i],
  ['monoskiing', /\b(mono[- ]?ski\w*|sit[- ]?ski\w*|bi[- ]?ski\w*)\b/i],
  ['winter-sports', /\b(ski day|skiing|snowboard\w*|snow ?shoe\w*|winter sports?)\b/i],
  ['adaptive-climbing', /\b(climb\w*|bouldering)\b/i],
  ['kayaking', /\b(kayak\w*|canoe\w*|paddl\w*|row\w*|sail\w*)\b/i],
  ['hiking-trails', /\b(hik\w*|trail\w*|walk and roll)\b/i],
  ['outdoors', /\b(outdoor\w*|camp\w*|fish\w*|park|beach|garden\w*)\b/i],
  // The broad one. Anything that is clearly a sport also gets this, so the
  // "Adaptive sport" segment catches the specific activities too.
  // "clinic" and "practice" are deliberately absent. A real pass over NorCal
  // SCI's calendar tagged "Free Monthly Wheelchair Repair Clinic" as adaptive
  // sport on the strength of one of them, and a repair clinic is the opposite
  // of a sport — it is the thing you do so you can get to one.
  [
    'adaptive-sport',
    /\b(adaptive (sport|recreation|athletic)\w*|open gym|tournament|race|league|basketball|tennis|pickleball|softball|surf\w*|dance|yoga|fitness|cycling|swim\w*)\b/i,
  ],

  // Support & groups
  ['peer-support', /\b(peer support|support group|peer mentor\w*|coffee (and )?chat|meet ?up)\b/i],

  // Skills & services
  ['driving', /\b(driving|hand controls|driver'?s? (rehab|evaluation)|dmv)\b/i],
  [
    'equipment',
    /\b(equipment|wheelchair (clinic|maintenance|repair)|seating|cushion|assistive tech)\b/i,
  ],
  [
    'benefits',
    /\b(benefits?|social security|ssdi|ssi|medicaid|medicare|vocational rehab|department of rehab)\b/i,
  ],
  [
    'health',
    /\b(bowel|bladder|catheter\w*|pressure (sore|injury|ulcer)|spasticity|nutrition|physical therapy|occupational therapy)\b/i,
  ],
  ['independence', /\b(independen\w*|daily living|transfers?|home modification\w*)\b/i],

  // Social & travel
  ['travel', /\b(travel\w*|trip|retreat|getaway|flight|airport)\b/i],
  [
    'food-drink',
    /\b(dinner|lunch|brunch|breakfast|bbq|barbecue|potluck|happy hour|coffee|wine|brewery)\b/i,
  ],
  ['arts', /\b(art|music|concert|theat(er|re)|museum|craft\w*|paint\w*)\b/i],
  ['social-meetup', /\b(social|mixer|game night|hangout|holiday party|picnic)\b/i],

  // Advocacy
  ['policy-access', /\b(advocacy|accessib\w*|ada\b|policy|legislat\w*|civil rights)\b/i],
  [
    'fundraising',
    /\b(fundrais\w*|gala|auction|donate|benefit (dinner|concert)|walk[- ]?a[- ]?thon)\b/i,
  ],
];

/**
 * "Who it is for" tags, which need a higher bar than the subject ones.
 *
 * These read the TITLE only, plus the short list of description phrases below
 * that genuinely predicate the event rather than mention a word.
 *
 * The reason is a real event. NorCal SCI's Friday Happy Hour is a social Zoom
 * call whose description ends "Family members and caregivers are welcome to
 * join as well" — a hospitality line that appears across this whole calendar.
 * Matching "family" and "caregiver" anywhere in the copy tagged a happy hour as
 * a family event and a caregiver group, which is exactly the failure that
 * teaches somebody the filters are lying: you pick "Caregiver group", you get a
 * happy hour, you stop using the filter.
 *
 * A subject is safe to read out of a description — an event described as a
 * handcycle ride is one. An audience is not, because "X is welcome" is a note
 * about the door, not about the room.
 */
const AUDIENCE_RULES = [
  ['newly-injured', /\b(newly injured|new injury|recently injured|newly diagnosed)\b/i],
  [
    'beginner-welcome',
    /\b(beginner\w*|never (played|tried)|no experience|first[- ]time\w*|all levels)\b/i,
  ],
  ['small-group', /\b(small group|limited (to )?\d+ (people|spots))\b/i],
  ['parenting', /\b(parent\w*|mom\w*|motherhood|dad\w*|mamas?)\b/i],
  ['family', /\b(family|families|kids|children|all ages)\b/i],
  ['caregiver-group', /\b(caregiver\w*|carer\w*)\b/i],
  ['mens-group', /\b(men'?s|guys'?)\b/i],
  ['womens-group', /\b(women'?s|ladies'?|wheel good motherhood)\b/i],
];

/**
 * Description phrases that do predicate the event, so they are allowed to earn
 * an audience tag on their own. Each one states what the event is for, rather
 * than who may also come.
 */
const AUDIENCE_PHRASES = [
  [
    'newly-injured',
    /\b(for (anyone|people|those) (in their )?(first|newly)|newly injured|first (12 months|year) (after|since))/i,
  ],
  [
    'beginner-welcome',
    /\b(beginners? (are )?welcome|no experience (is )?(necessary|needed|required)|never (played|tried) before|open to all levels)\b/i,
  ],
  [
    'caregiver-group',
    /\b(for caregivers|caregiver support|caregivers? (group|meet)|support for caregivers)\b/i,
  ],
  ['parenting', /\b(for parents|parents? (group|meet)|parenting)\b/i],
  [
    'family',
    /\b(family[- ](friendly|event|day)|bring (the|your) (family|kids)|for families|all ages welcome)\b/i,
  ],
];

/**
 * The tag slugs an event's copy earns.
 *
 * Reads the title and description only — deliberately not the location, where a
 * venue called "Independence Sports Complex" would otherwise tag every event
 * held there as being about independence, and a "Park" would make everything
 * outdoors. Venue names are proper nouns and these rules read them as subjects.
 *
 * Capped, because an event whose description happens to sweep up nine tags
 * renders as a card that is mostly chips. The cap keeps the rules that fired
 * in source order, which puts the specific activity above the broad category.
 */
export function classifyTags({ title = '', description = '' } = {}, limit = 4) {
  const copy = `${title}\n${description}`;
  const slugs = [];

  for (const [slug, pattern] of TAG_RULES) {
    if (pattern.test(copy)) slugs.push(slug);
  }

  // Audience tags read the title, or a phrase that predicates the event.
  for (const [slug, pattern] of AUDIENCE_RULES) {
    if (slugs.includes(slug)) continue;
    const inTitle = pattern.test(title);
    const predicated = AUDIENCE_PHRASES.some(
      ([phraseSlug, phrase]) => phraseSlug === slug && phrase.test(description),
    );
    if (inTitle || predicated) slugs.push(slug);
  }

  return slugs.slice(0, limit);
}

/**
 * Whether the copy carries an organizer's email or phone number.
 *
 * Those are public — the organizer put them in a public calendar listing — so
 * storing them verbatim is allowed. This records which rows that call applies
 * to, so a later tightening does not mean re-scanning every description to find
 * them again. See events.needs_pii_review.
 */
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE = /\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}/;

export function containsContactDetails(...values) {
  return values.some((value) => {
    const text = value ?? '';
    return EMAIL.test(text) || PHONE.test(text);
  });
}
