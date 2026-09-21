import { canonicalTopics } from '@/routes/peers/topics';

/**
 * From what a member offered to be asked about, to the room where that
 * conversation already exists.
 *
 * A profile says "Happy to talk about: Bowel programme, Back to school". Those
 * are two conversations the club is already having, in two rooms with the whole
 * history in them — and until this existed the only way from one to the other
 * was to remember which room covered what. The mock had it (`ROOM_MAP` and
 * `roomFor`), pointed at a page that no longer exists in this shape.
 *
 * ---------------------------------------------------------------------------
 * Built on the groups, not on a second set of regexes
 * ---------------------------------------------------------------------------
 * `src/routes/peers/topics.ts` already solved the hard half: `members.topics`
 * is free text and the same subject arrives under four names, so it has
 * thirteen curated groups and the patterns that earn them. Writing a second
 * pattern list here would mean "Returning to college" reaching the school
 * *filter* and not the school *room*, or the reverse, with nothing to say which
 * was right.
 *
 * So the table below is thirteen lines of group → room, and patterns appear
 * only for the rooms no group names. That is a smaller surface to be wrong on,
 * and when somebody adds a group over there this file is where the omission
 * shows up.
 *
 * ---------------------------------------------------------------------------
 * Silent where it is not sure, which is the same bargain topics.ts makes
 * ---------------------------------------------------------------------------
 * A wrong room is worse than no room. Sending somebody who said "Living
 * independently" into Work & school, which is what the mock did, puts them in a
 * conversation about disclosure and accommodations when they asked about
 * getting through a morning — there is no independent-living room, and the
 * honest answer is to draw nothing. Two of the thirteen groups map to nothing
 * for that reason and are marked.
 *
 * Nothing here decides what a member sees. `chat_rooms`' select policy does:
 * a closed room is not in the list at all, so a caller that only offers rooms
 * it was handed cannot offer one that has not been opened.
 */

/** The twelve room slugs, as `chat_rooms.id` spells them. */
type RoomId =
  | 'bowel'
  | 'bladder'
  | 'skin'
  | 'pain'
  | 'aging'
  | 'newsci'
  | 'intimacy'
  | 'work'
  | 'sport'
  | 'funding'
  | 'equip'
  | 'driving';

/**
 * Bladder and bowel are one group on Peers and two rooms in Chat.
 *
 * Deliberately, on both sides. The filter merges them because a member who will
 * talk about one will usually talk about the other and two chips would halve
 * each list; the rooms split them because a bowel programme and a Mitrofanoff
 * are not the same conversation. So this is the one place a group's own words
 * have to be read again, and it is a discriminator rather than a second
 * classifier: bowel if it says so, bladder otherwise.
 */
const BOWEL = /\b(bowel|colostomy|ileostomy|stoma|suppositor\w*|transanal)\b/i;

/**
 * Each of `topics.ts`'s thirteen groups, and the room that covers it.
 *
 * Null is a group with no room, and the two of them are the argument for this
 * being a table rather than a lookup with a fallback: a group that maps to
 * nothing is a decision, and it should look like one.
 */
const ROOM_FOR_GROUP: Record<string, RoomId | null> = {
  // Both halves of "Back to school and work" land in the same room, which is
  // why that topic naming two groups costs nothing here.
  'Back to school': 'work',
  'Back to work': 'work',
  'Adaptive sport': 'sport',
  'Exercise and fitness': 'sport',
  'Adaptive equipment': 'equip',
  'Driving and getting about': 'driving',
  // The Pain room is "neuropathic pain, shoulders, spasticity — what worked,
  // what did not". Mental health is not that, and the club has no room for it.
  // The mock sent it to Pain; this does not, for the reason at the top.
  'Mental health': null,
  'Relationships and intimacy': 'intimacy',
  'Pain management': 'pain',
  'Pressure sores': 'skin',
  // Paying for an attendant in California is IHSS and Medi-Cal, which is what
  // the Funding & benefits room is: "the paperwork nobody explains". The mock
  // made the same call.
  Caregivers: 'funding',
  // No independent-living room. See the header.
  'Living independently': null,
  // Handled by BOWEL above, not by this table.
  'Bladder and bowel': null,
};

/**
 * Rooms that no group names, and the words that reach them.
 *
 * Short on purpose. Every line here is a pattern that could disagree with
 * `topics.ts`, so it is only worth writing where there is nothing over there to
 * disagree with — Newly injured, Aging with SCI and Funding & benefits have no
 * group of their own, and a member who wrote "SSDI paperwork" would otherwise
 * reach no room at all.
 */
const UNGROUPED: [RegExp, RoomId][] = [
  [/\b(newly injured|freshly injured|first year|first weeks|new injury|rehab)\b/i, 'newsci'],
  // Not "shoulders": a shoulder is as often a pain question as an aging one,
  // and "Shoulder pain" already reaches the Pain room through its group.
  [/\b(aging|ageing|getting older|osteoporosis|bone density)\b/i, 'aging'],
  [
    /\b(ssi|ssdi|medi-?cal|medicare|medicaid|benefits?|grants?|funding|department of rehab)\b/i,
    'funding',
  ],
  // Fertility only. Parenting and pregnancy after injury are real subjects with
  // no room, and Sex, dating & fertility is not where somebody asking about
  // raising a child was heading.
  [/\b(fertility|infertility)\b/i, 'intimacy'],
];

/**
 * The room that covers one raw topic, or null when none clearly does.
 *
 * Pure, and it knows nothing about which rooms are open — a caller filters
 * against the rooms the database handed it, because that list is already the
 * answer to "what may this member see".
 */
export function roomForTopic(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  for (const group of canonicalTopics(value)) {
    if (group === 'Bladder and bowel') return BOWEL.test(value) ? 'bowel' : 'bladder';
    const room = ROOM_FOR_GROUP[group];
    if (room) return room;
    // A group that maps to null is a decision and stops the search: it means
    // the club has no room for this, not that the next group should be tried.
    if (group in ROOM_FOR_GROUP) return null;
  }

  // Only reached by a topic no group claimed — `canonicalTopics` hands those
  // back as themselves, so `group in ROOM_FOR_GROUP` was false for every one.
  for (const [pattern, room] of UNGROUPED) {
    if (pattern.test(value)) return room;
  }
  return null;
}

/**
 * Every room a set of topics points at, once each, in the order they were
 * first pointed at.
 *
 * One card per room, not one per topic: a member with "Bowel programme" and
 * "Travelling with a stoma" has named one conversation twice, and drawing the
 * same room twice under their chips says the app is counting rather than
 * reading.
 */
export function roomsForTopics(raws: readonly string[]): string[] {
  const found: string[] = [];
  for (const raw of raws) {
    const room = roomForTopic(raw);
    if (room && !found.includes(room)) found.push(room);
  }
  return found;
}
