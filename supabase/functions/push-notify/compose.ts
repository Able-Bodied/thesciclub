/**
 * What a notification says, from what `push_owed` returned for one device.
 *
 * Pure: no Deno, no network, so Vitest runs it (compose.test.ts). The owner's
 * wording, 2026-09-27 — every notification says what kind it is:
 *
 *   Direct message   "Direct message from Bo"   + the words, cut short
 *   Group message    "Group message from Bo"    + the words, cut short
 *   Topic reply      "Reply to your topic"      + "Bo replied to your topic."
 *
 * A reply never carries its words, and this file could not add them if it
 * tried: `push_owed` returns no body for a post. Nor does anything here name a
 * room, a topic or a group — those are named for what they are about, and a
 * lock screen is read by whoever is next to it.
 */

/** How much of a message a lock screen gets. iOS shows about four lines. */
export const PREVIEW_LENGTH = 120;

/** One row of `push_owed`. */
export interface Owed {
  endpoint: string;
  p256dh: string;
  auth: string;
  kind: string;
  author_name: string | null;
  body: string | null;
  photo_count: number;
  url: string;
  tag: string;
}

/** The payload the service worker reads (src/lib/push/payload.ts). */
export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
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
  const given = (owed.author_name ?? '').trim();
  const name = given === '' ? 'A member' : given;
  const where = { url: owed.url, tag: owed.tag };

  switch (owed.kind) {
    case 'direct':
      return { title: `Direct message from ${name}`, body: words(owed), ...where };
    case 'group':
      return { title: `Group message from ${name}`, body: words(owed), ...where };
    case 'reply':
      return { title: 'Reply to your topic', body: `${name} replied to your topic.`, ...where };
    default:
      return null;
  }
}
