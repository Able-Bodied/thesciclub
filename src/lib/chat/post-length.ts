/**
 * The most characters in one post in a room: a first post or a reply
 * (20261117140000). It was 4,000, as a message in a conversation still is,
 * until the owner hit it starting a room for life stories (2026-11-17).
 * Nobody typing reaches this; it is there so a script cannot post a book.
 */
export const POST_MAX = 100_000;

/** The same number, as a sentence says it. */
export const POST_MAX_WORDS = POST_MAX.toLocaleString('en-US');

/** A box says how many characters are left only once it is down to this many. */
export const POST_COUNT_FROM = 1_000;
