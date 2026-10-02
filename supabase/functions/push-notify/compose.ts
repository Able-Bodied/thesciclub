/**
 * What a notification says, from what `push_owed` returned for one device.
 *
 * Pure: no Deno, no network, so Vitest runs it (compose.test.ts). The owner's
 * wording, 2026-09-27 — every notification says what kind it is:
 *
 *   Direct message   "Direct message from Bo"   + the words, cut short
 *   Group message    "Group message from Bo"    + the words, cut short
 *   Topic reply      "Bo replied to your topic" + the words, cut short
 *
 * And the six added the same day (20260927020000):
 *
 *   Added to group   "Added to a group"          + "Bo added you to a group."
 *   Reply elsewhere  "Bo replied in a topic you posted in" + the words, cut short
 *   Report           "New report"                + nothing about it
 *   Invite joined    "Somebody you invited joined" + "Ana joined the club."
 *   Event reminder   "Tomorrow: <event title>"   + "You're going. It starts at 10:00am."
 *   Org digest       "New from <organization>"   + "3 new events."
 *
 * A reply carries its words since 2026-10-01 (the owner; 20261003000000 has
 * `push_owed` return them), cut as a message's are. Until then it said only
 * who replied. Nothing here names a room, a topic or a group — those are
 * named for what they are about, and a lock screen is read by whoever is next
 * to it. Event titles and organization
 * names are public (CONTEXT.md), which is why those two may.
 */

/** How much of a message a lock screen gets. iOS shows about four lines. */
export const PREVIEW_LENGTH = 120;

/** One row of `push_owed`. */
export interface Owed {
  endpoint: string;
  p256dh: string;
  auth: string;
  kind: string;
  /** Who did it: the author, the adder, the member who joined. */
  actor_name: string | null;
  body: string | null;
  photo_count: number;
  /** An event's title or an organization's name, for the two daily kinds. */
  subject: string | null;
  /** A start time ("10:00am") or a count ("3"). */
  detail: string | null;
  url: string;
  tag: string;
  /** The recipient's unread conversations, on message pushes only. */
  badge: number | null;
}

/** The payload the service worker reads (src/lib/push/payload.ts). */
export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
  /** Set on the app icon when present. */
  badge?: number;
}

/**
 * At most `max` characters, whitespace collapsed, cut at a word where one is
 * near, with an ellipsis when anything was cut. Counts code points, so an
 * emoji is never split into half a character.
 */
export function shorten(text: string, max: number = PREVIEW_LENGTH): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const chars = Array.from(flat);
  if (chars.length <= max) return flat;
  const cut = chars.slice(0, max - 1).join('');
  const space = cut.lastIndexOf(' ');
  // A word boundary in the last fifth is worth backing up to; further back
  // loses more than a split word costs.
  const kept = space > cut.length * 0.8 ? cut.slice(0, space) : cut;
  return `${kept.trimEnd()}…`;
}

function photographs(count: number): string {
  return count === 1 ? 'Sent a photograph.' : `Sent ${count} photographs.`;
}

/** What the message said, or what it carried when it said nothing. */
function words(owed: Owed): string {
  const text = shorten(owed.body ?? '');
  if (text !== '') return text;
  return owed.photo_count > 0 ? photographs(owed.photo_count) : '';
}

/** Null for a kind this file does not know, which is then not sent at all. */
export function compose(owed: Owed): PushMessage | null {
  // The author can be gone by the time this runs; the name is not.
  // A blank name falls back as well as a missing one.
  const given = (owed.actor_name ?? '').trim();
  const name = given === '' ? 'A member' : given;
  const where = {
    url: owed.url,
    tag: owed.tag,
    ...(typeof owed.badge === 'number' ? { badge: owed.badge } : {}),
  };
  const subject = shorten(owed.subject ?? '', 60);

  switch (owed.kind) {
    case 'direct':
      return { title: `Direct message from ${name}`, body: words(owed), ...where };
    case 'group':
      return { title: `Group message from ${name}`, body: words(owed), ...where };
    // A reply with neither words nor photographs cannot be posted, but an
    // older `push_owed` sends no body at all: then it says what it used to.
    case 'reply':
      return {
        title: `${name} replied to your topic`,
        body: words(owed) || `${name} replied to your topic.`,
        ...where,
      };
    case 'reply_participant':
      return {
        title: `${name} replied in a topic you posted in`,
        body: words(owed) || `${name} replied in a topic you posted in.`,
        ...where,
      };
    case 'group_add':
      return { title: 'Added to a group', body: `${name} added you to a group.`, ...where };
    case 'report':
      // Nothing about who, what or where: that is for /admin, behind sign-in.
      return {
        title: 'New report',
        body: 'A member reported something. Open Admin to see it.',
        ...where,
      };
    case 'invite_joined':
      return { title: 'Somebody you invited joined', body: `${name} joined the club.`, ...where };
    case 'event_reminder':
      if (subject === '') return null;
      return {
        title: `Tomorrow: ${subject}`,
        body: owed.detail ? `You're going. It starts at ${owed.detail}.` : "You're going.",
        ...where,
      };
    case 'org_events': {
      const count = Number(owed.detail);
      if (subject === '' || !Number.isInteger(count) || count < 1) return null;
      return {
        title: `New from ${subject}`,
        body: count === 1 ? '1 new event.' : `${count} new events.`,
        ...where,
      };
    }
    default:
      return null;
  }
}
