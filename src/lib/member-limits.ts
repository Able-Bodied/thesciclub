/**
 * The longest thing a member can write in each free-text field of their own
 * row. The database enforces the same numbers
 * (20261003100000_a_member_row_has_length_limits.sql); these are here so a
 * form stops the typing at the limit rather than letting someone write past
 * it and meet a refusal when they save. Change one, change both.
 *
 * Each is several times what anybody has written: the point is a bound on
 * size, not an editor's word count.
 */
export const MEMBER_TEXT_MAX = {
  display_name: 60,
  city: 100,
  how_injured: 1000,
  bio: 2000,
  detail: 1000,
  field_of_work: 200,
  /** A sentence, not an essay: enough for a scene, short enough to hear. */
  photo_alt: 200,
} as const;

/**
 * One "Add your own" answer on a multi-select. The database bounds the list
 * as a whole (40 items, 4,000 characters), which this keeps any one answer
 * far inside.
 */
export const MEMBER_LIST_ITEM_MAX = 100;

/** The limit for a survey question's column, if it is a free-text one. */
export function memberTextMax(column: string): number | undefined {
  return (MEMBER_TEXT_MAX as Record<string, number>)[column];
}
