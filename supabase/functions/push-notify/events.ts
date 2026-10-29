/**
 * The events push_notify_send may call with. Anything else is refused with
 * 400, which is how grant_open and profile_reminder went unsent for a day
 * (061dfb2); events.test.ts holds this to every push_notify_send in the
 * migrations.
 */
export const EVENTS: ReadonlySet<string> = new Set([
  'message',
  'post',
  'like',
  'reaction',
  'group_add',
  'report',
  'member_joined',
  'daily',
  'starting',
  'grant_open',
  'profile_reminder',
  'blocks_weekly',
]);
