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
 * And for administrators, weekly, 2026-10-22 (20261022090000):
 *
 *   Blocks           "Blocks this week"          + "3 members were blocked this week. …"
 *
 * And grants, 2026-10-20 (20261021010000):
 *
 *   Grant opened     "<organization>: applications open" + "<grant> is open until Nov 15."
 *
 * And one more, 2026-10-01 (20261003010000):
 *
 *   Like             "Bo liked your post"         + the start of that post, quoted
 *                    ("your topic" for a topic's opening post)
 *
 * And reactions, 2026-10-27 (20261028000000):
 *
 *   Reaction         "Bo reacted 👍 to your message" + the start of it, quoted
 *                    ("your post", or "your topic" for a topic's opening post)
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

/**
 * How much of a liked post is quoted back to its author: enough to say which
 * one, as they wrote it. Shorter than a message, which is news; this is a
 * reminder.
 */
export const LIKED_LENGTH = 80;

/** One row of `push_owed`. */
export interface Owed {
  /** A browser's push service URL, or the store app's `apns:<environment>:<token>`. */
  endpoint: string;
  /** A browser's keys; null for the app. */
  p256dh: string | null;
  auth: string | null;
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
  /** Kinds of notification the recipient's bell has not shown (20261028010000). */
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

/**
 * A room post's words without their formatting marks (2026-10-11): the first
 * post's toolbar writes a small Markdown, and a notification is plain text,
 * so "**Bring water**" arrives as "Bring water". The same rules as
 * src/lib/markdown.ts `markdownToPlain` — restated, since this function is
 * deployed on its own and cannot import the app — and only for posts:
 * conversations are not formatted, so a typed asterisk there stays.
 */
export function plainPost(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) =>
      line
        .replace(/^(\s*)#{1,3}\s+/, '$1')
        .replace(/^(\s*)[-*•]\s+/, '$1')
        .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, '$1')
        .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '$1')
        .replace(/(?<![\w*])\*(?=\S)(.+?)(?<=\S)\*(?![\w*])/g, '$1')
        .replace(/(?<![\w_])_(?=\S)(.+?)(?<=\S)_(?![\w_])/g, '$1'),
    )
    .join('\n');
}

/** What the message said, or what it carried when it said nothing. */
function words(owed: Owed, post = false): string {
  const said = owed.body ?? '';
  const text = shorten(post ? plainPost(said) : said);
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
    // A message with neither words nor photographs is a shared post
    // (20261025010000), which is never quoted.
    case 'direct':
      return {
        title: `Direct message from ${name}`,
        body: words(owed) || 'Shared a post.',
        ...where,
      };
    case 'group':
      return {
        title: `Group message from ${name}`,
        body: words(owed) || 'Shared a post.',
        ...where,
      };
    // A reply with neither words nor photographs cannot be posted, but an
    // older `push_owed` sends no body at all: then it says what it used to.
    case 'reply':
      return {
        title: `${name} replied to your topic`,
        body: words(owed, true) || `${name} replied to your topic.`,
        ...where,
      };
    case 'reply_participant':
      return {
        title: `${name} replied in a topic you posted in`,
        body: words(owed, true) || `${name} replied in a topic you posted in.`,
        ...where,
      };
    case 'like': {
      // The member's own words, quoted so they read as theirs and not Bo's.
      const own = shorten(plainPost(owed.body ?? ''), LIKED_LENGTH);
      const what = owed.detail === 'topic' ? 'topic' : 'post';
      return {
        title: `${name} liked your ${what}`,
        body:
          own !== ''
            ? `“${own}”`
            : owed.photo_count > 0
              ? 'Your photograph.'
              : `${name} liked your ${what}.`,
        ...where,
      };
    }
    // detail is 'message:👍', 'post:👍' or 'topic:👍' (20261028000000).
    case 'reaction': {
      const [target, ...rest] = (owed.detail ?? '').split(':');
      const what = target === 'message' || target === 'topic' ? target : 'post';
      const emoji = rest.join(':').trim();
      const reacted =
        emoji === ''
          ? `${name} reacted to your ${what}`
          : `${name} reacted ${emoji} to your ${what}`;
      // A message is not formatted; a post is.
      const own = shorten(
        what === 'message' ? (owed.body ?? '') : plainPost(owed.body ?? ''),
        LIKED_LENGTH,
      );
      return {
        title: reacted,
        body: own !== '' ? `“${own}”` : owed.photo_count > 0 ? 'Your photograph.' : `${reacted}.`,
        ...where,
      };
    }
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
    // A grant from a followed organization opened (20261021010000): body is
    // the grant's name, detail the day it closes ("Nov 15").
    case 'grant_open': {
      const grant = shorten(owed.body ?? '', 80);
      if (subject === '' || grant === '') return null;
      return {
        title: `${subject}: applications open`,
        body: owed.detail ? `${grant} is open until ${owed.detail}.` : `${grant} is open.`,
        ...where,
      };
    }
    // A reminder to finish a step of the profile (20261022040000); detail is
    // the step. The app's list words it the same (src/lib/notifications.ts).
    case 'profile_reminder':
      return owed.detail === 'details'
        ? {
            title: 'Finish Your details',
            body: 'A few details are still missing. Adding them helps other members find you.',
            ...where,
          }
        : {
            title: 'Finish your profile',
            body: 'A few more answers help members find what you have in common.',
            ...where,
          };
    // Administrators' weekly count (20261022090000); detail is the count.
    // Nobody is named: who blocked whom is on Admin, behind sign-in.
    case 'blocks_weekly': {
      const count = Number(owed.detail);
      if (!Number.isInteger(count) || count < 1) return null;
      return {
        title: 'Blocks this week',
        body:
          count === 1
            ? '1 member was blocked this week. Open Admin to see the list.'
            : `${count} members were blocked this week. Open Admin to see the list.`,
        ...where,
      };
    }
    default:
      return null;
  }
}
