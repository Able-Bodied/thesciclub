import { canonicalTopics } from '@/routes/peers/topics';

/**
 * From what a member offered to be asked about to the room where that conversation exists.
 *
 * Built on `src/routes/peers/topics.ts`'s thirteen groups, not a second regex list that could
 * send a topic to the school filter but not the school room. Patterns only for rooms no group
 * names; a new group over there shows up as an omission here.
 *
 * Silent where unsure: a wrong room is worse than none (the mock sent "Living independently" to
 * Work & school). Visibility is `chat_rooms`' select policy, not this file.
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
 * Bladder and bowel: one group on Peers, two rooms in Chat, both on purpose. A discriminator,
 * not a second classifier: bowel if it says so, bladder otherwise.
 */
const BOWEL = /\b(bowel|colostomy|ileostomy|stoma|suppositor\w*|transanal)\b/i;

/** Each of `topics.ts`'s thirteen groups and its room. Null is a decision: no room for it. */
const ROOM_FOR_GROUP: Record<string, RoomId | null> = {
  'Back to school': 'work',
  'Back to work': 'work',
  'Adaptive sport': 'sport',
  'Exercise and fitness': 'sport',
  'Adaptive equipment': 'equip',
  'Driving and getting about': 'driving',
  // Not Pain (neuropathic pain, shoulders, spasticity), where the mock sent it.
  'Mental health': null,
  'Relationships and intimacy': 'intimacy',
  'Pain management': 'pain',
  'Pressure sores': 'skin',
  // Paying for an attendant is IHSS and Medi-Cal paperwork: Funding & benefits.
  Caregivers: 'funding',
  // No independent-living room. See the header.
  'Living independently': null,
  // Handled by BOWEL above, not by this table.
  'Bladder and bowel': null,
};

/**
 * Rooms no group names, and the words that reach them. Short on purpose: each line could
 * disagree with `topics.ts`.
 */
const UNGROUPED: [RegExp, RoomId][] = [
  [/\b(newly injured|freshly injured|first year|first weeks|new injury|rehab)\b/i, 'newsci'],
  // Not "shoulders": as often pain as aging, and "Shoulder pain" reaches Pain via its group.
  [/\b(aging|ageing|getting older|osteoporosis|bone density)\b/i, 'aging'],
  [
    /\b(ssi|ssdi|medi-?cal|medicare|medicaid|benefits?|grants?|funding|department of rehab)\b/i,
    'funding',
  ],
  // Fertility only: parenting and pregnancy have no room, and this one is not it.
  [/\b(fertility|infertility)\b/i, 'intimacy'],
];

/**
 * The room that covers one raw topic, or null. Pure: callers filter against the rooms the
 * database handed them, which already answers what this member may see.
 */
export function roomForTopic(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  for (const group of canonicalTopics(value)) {
    if (group === 'Bladder and bowel') return BOWEL.test(value) ? 'bowel' : 'bladder';
    const room = ROOM_FOR_GROUP[group];
    if (room) return room;
    // A null group stops the search: no room for this, not "try the next group".
    if (group in ROOM_FOR_GROUP) return null;
  }

  // Only reached by a topic no group claimed.
  for (const [pattern, room] of UNGROUPED) {
    if (pattern.test(value)) return room;
  }
  return null;
}

/** Every room a set of topics points at, once each, in first-seen order: one card per room. */
export function roomsForTopics(raws: readonly string[]): string[] {
  const found: string[] = [];
  for (const raw of raws) {
    const room = roomForTopic(raw);
    if (room && !found.includes(room)) found.push(room);
  }
  return found;
}
