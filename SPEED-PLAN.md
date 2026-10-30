# Speed plan

Written 2026-10-29. Replaces `PERFORMANCE-PLAN.md` and `CHAT-SECURITY-PLAN.md`
(both 2026-10-15; read them at `837914c`), checked against the code as of
`2fd7c22`, and adds what the load test of 2026-10-27 to 29 found.

Nothing here changes what anyone can see or do. Where a step could, it says
how that is proven. Each step is released, and undone, on its own.

## What the load test found

Test copy only, never production. Full report:
`~/projects/sciclub-loadtest/evidence/REPORT.md`.

- **The free Supabase machine is the ceiling.** It held 5 members cleanly
  and failed at 10 once its daily disk burst was spent: a routine 2.9 MB save
  took 49 s, and members' reads timed out behind it. Disk writes and memory
  run out first, then CPU. Production runs on the same machine size.
- **Where the database's time went** (members' own requests):

  | What | Calls | Average |
  |---|---|---|
  | `chat_unread_count()` (Chat tab dot) | 2,603 | 202 ms |
  | `my_unseen_notification_count()` (bell) | 1,198 | 339 ms |
  | `my_unseen_notification_kinds()` (app icon) | 2,977 | 66 ms |
  | Home's topics list | 84 | 1.8 s |
  | Admin's members and invites | ~90 | 1.7 s |
  | `chat_my_threads()` (conversation list) | 512 | 279 ms |
  | `event_attendees` | 129 | 0.9 s |

- **Why:** the app recounts every badge on every chat message anywhere and
  on every focus. Each count builds a whole list just to count it. And
  `is_thread_member()` runs on every row of `chat_thread_members` before
  narrowing to the reader's own (a full scan; the member index goes unused).
- **Two fixes proven on the test copy**
  (`~/projects/sciclub-loadtest/fixes/`):
  - one recount per 1.5 s in the app, and a direct unread count: recounts
    fell from 2,603 to 328, and the bell's from 1,198 to 170;
  - conversation membership worked out once per request, on four rules:
    41 test identities saw identical rows before and after, a deliberately
    broken rule was caught, and the comparison itself went from 6 min to
    8.5 s.

  With both, 5 members passed with the machine at 31%. 10 still failed: the
  fixes cut the work, but not the free machine's disk.
- **Admin is a correctness bug, not only a speed one.** Its search sees only
  the first 1,000 members, since the whole roster is downloaded and the
  server returns at most 1,000 rows. Each open costs about 1.3 s per 500
  members.
- **Supabase's performance advisor** on the test copy (production's schema
  as of `bff1168`): 38 rules re-read the signed-in user on every row, and 45
  foreign keys have no index.

## What changed since the old plans

Followed as written, the old plans would now break things:

- **Blocking** (`20261022060000`) rewrote six chat read rules to hide
  blocked members (`my_blocked_member_ids()`). Every rewrite here starts from
  the live rule text, never from the 2026-10-15 plan.
- **Topic reads must keep writing.** `notifications_read_with_chat`
  (`20261028900000`) clears a conversation's notifications only when the read
  position moves, but a topic's on every read. Reopening a topic is what
  clears a like or reaction notification on it. So "only write when the
  position moves" is safe for conversations, and **not for topics**: topics
  are left alone.
- **The app icon's count** (`my_unseen_notification_kinds()`, new
  2026-10-28) calls `notification_badge()`, last changed by `20261029070000`
  (mentions), which also sets the number a push puts on the phone. Changing
  it changes both.
- **`src/lib/notifications.ts` changed after the test build**, so the test's
  app patch is redone by hand, not applied.
- **The old migration names are taken.** Each new migration takes the next
  free timestamp when it is written.
- **The old Step 0** (the 2026-10-14 work) is shipped. The 2026-10-22 speed
  work waits on its own push (HANDOFF).

## Order

Biggest measured gain and lowest risk first:

1. Recount badges at most once per 1.5 s (app only).
2. Counts without building lists.
3. A conversation's read position only moves forward.
4. Missing indexes.
5. Rules read the signed-in user once.
6. Chat reads check membership once.
7. Admin finds every member.
8. Retest, then decide the Supabase plan.
9. Small items: the link-preview cache header, and `tw-animate-css`.

## Step 1: Recount badges at most once per 1.5 s (app only)

- **What:** a small `src/lib/coalesce.ts`, used by `src/lib/chat/unread.ts`,
  `src/lib/notifications.ts` and `src/lib/icon-badge.ts`.
  - The first trigger counts at once. A burst then becomes one more count,
    always run after the last trigger, so a badge is never left stale.
  - Unlike the test patch, the pending timer is cleared when the screen
    closes.
- **Trade-off:** a badge can change up to 1.5 s later than today.
- **Proof:**
  - unit tests for the coalescing: an immediate first count, one count per
    burst, a final count after the last trigger, and nothing after closing;
  - the existing tests pass, `icon-badge.test.ts` included;
  - `pnpm realtime-check`: the dot still appears on the other person's Chat
    tab.
- **Undo:** revert the commit. There is no database change.

## Step 2: Counts without building lists (one migration)

The function names, arguments and results stay the same. The app needs no
change.

- **`chat_unread_count()`:** a direct count, as on the test copy.
  - Same test as the conversation list's `unread`: a message newer than the
    reader's position and not their own.
  - It leaves out a direct conversation with someone the reader blocked.
  - It stays SECURITY INVOKER, so the rules still decide what is visible.
- **`my_unseen_notification_count()`:** counts the same 100, in the same
  30-day window, under the same who-may-see-it rules, without building names
  and previews.
  - Written from the live `my_notifications()`, which now covers mentions and
    invite requests.
- **`notification_badge()`:** given the same treatment only if it turns out
  to build a list. It sets the push badge too, so its probe covers both.
- **Probes**, following the probe standard:
  - `unread-count-matches-list.sql`: for an ordinary member, one with muted
    conversations, one who left a group, one with only their own messages, a
    suspended member, and one who blocked someone, the count equals the
    conversations `chat_my_threads()` marks unread.
  - `unseen-count-matches-list.sql`: the badge equals the unseen rows of
    `my_notifications()`, including:
    - a notification about a removed post;
    - a report notification for a non-administrator;
    - one in a closed room;
    - one older than 30 days;
    - one from a blocked member;
    - a mention;
    - more than 100 in all.
- **Undo:** a migration restoring the live bodies, copied before release.

## Step 3: A conversation's read position only moves forward

- **What:** `chat_mark_thread_read_through` gets `and last_read_at <
  delivered_at` on its update. The older `chat_mark_thread_read`, kept for
  older store apps, gets the same guard.
- **Why:** reopening a conversation rewrites the same position today, and
  disk writes were the measured limit. Each of those writes also makes every
  other open phone in the group reload its read receipts.
- **Why it is safe:** the trigger already ignores a write that moves nothing,
  so notifications behave exactly as before.
- **Not topics,** for the reason above.
- **Probe:** `read-through-moves-forward.sql`:
  - reading up to an older message writes nothing (no new row version);
  - a newer one moves the position and clears that conversation's
    notifications;
  - someone outside the conversation is still refused.
- **Undo:** restore the two bodies.

## Step 4: Missing indexes (one migration)

Every index also costs a write on every insert, and disk writes are the
limit. So only indexes that serve a measured read, or a delete that scans a
table, go in. Each one is listed in the migration's header with what it
serves.

- **Notifications:** `post_id`, `topic_id`, `message_id`, `thread_id`,
  `event_id`, `actor_id`, `joined_id`, `grant_id`, `organization_id` and
  `report_id`, each only where the column is set. Today, deleting any of
  those scans every notification once per deleted row. Plus `created_at`,
  for the nightly 30-day cleanup.
- **Invites and members:**
  - `invites(invited_by_member_id)`: mentors' "invites I sent";
  - `invites(claimed_by)`: sign-up and account deletion;
  - `members(invite_id)`;
  - `members(phone)`, if still missing.
- **Chat:**
  - `chat_topics(last_post_at desc, id)`: Home's newest 40 (1.8 s in the
    test);
  - `chat_topic_reads(member_id)` and `(topic_id, last_read_at)`;
  - `chat_thread_mutes(member_id)`;
  - `author_id` on chat posts, messages and topics, for account deletion.
- **Left out:** the advisor's other missing-index warnings on
  who-did-it columns (`added_by`, `decided_by` and the like), except any that
  account deletion walks.
- **One removal:** `event_rsvps_event_id_idx`, which duplicates the unique
  (event, member) index. Nothing on the advisor's "unused" list is dropped:
  that was measured on synthetic traffic.
- **Proof:** `EXPLAIN ANALYZE` before and after on the load-test data, and
  every probe in `supabase/tests/`.
- **Undo:** drop the new indexes. Nothing else depends on them.

## Step 5: Rules read the signed-in user once

- **What:** `auth.uid()` becomes `(select auth.uid())`, so Postgres reads it
  once per query instead of once per row. Same meaning.
  - All 38 rules the advisor names: members, invites, strikes, follows,
    RSVPs, room members, mutes, topic reads, reports, push subscriptions and
    muted kinds, notifications, QR codes, and the chat write rules.
  - The storage rules for photos and chat uploads too, which the advisor
    does not check. The photo read rule also gets `(select is_member())`.
- **Proof:**
  - the before-and-after comparison (Step 6) over these tables too;
  - every existing probe;
  - the advisor shows no `auth_rls_initplan` afterwards.
- **Undo:** the old rule text, copied from the live rules before release.

## Step 6: Chat reads check membership once (the real change)

- **Two helpers**, SECURITY DEFINER and STABLE. Each returns an array that
  is empty unless `is_member()`:
  - the conversations the reader is in (the same as `is_thread_member` for
    each);
  - the rooms they may read: every room for an administrator, the open ones
    otherwise (the same as `chat_room_is_readable` for each).

  They must run as the owner. Otherwise the roster's own rule would call the
  helper, which would read the roster, forever.
- **Granted to `authenticated` only**, as today's helpers are. A signed-out
  visitor is refused today, not shown an empty list, and stays refused. The
  test copy also granted the helper to signed-out visitors; that is not
  copied.
- **Rules use `= any ((select helper()))`.** This shape was proven on the
  test copy to run once per query. The query plans are checked for exactly
  that before release.
- **Nine read rules** keep their names and every other condition: blocked
  authors, removed posts and messages, and notices.
  - Conversations: `chat_messages`, `chat_threads`, `chat_thread_members`,
    `chat_message_reactions`. These four are what the test copy proved.
  - Rooms: `chat_topics`, `chat_posts`, `chat_post_likes`,
    `chat_post_reactions`.
  - `chat_rooms`, with `is_member()` and `is_admin()` run once.
- **Not changed:**
  - write rules, which check one row;
  - the existing helpers, which storage, write rules and functions still use;
  - chat photo files;
  - suspended members still reading, since `is_member()` includes
    'suspended' on purpose.

### How it is proven

On a fresh stack, then on the load-test copy:

1. **Comparison probe** (`chat-reads-unchanged.sql`, built like the test's
   `equiv-check.mjs`): for each test person, every visible row in every
   affected table, and in the chat functions that run as the reader, is
   recorded before and after. Any difference in either direction fails.
2. **Test people:**

   | Who | What it covers |
   |---|---|
   | active member | the ordinary case |
   | suspended member | still reads |
   | removed member | sees nothing |
   | administrator | sees closed rooms |
   | account part-way through sign-up | sees nothing |
   | signed-out visitor | refused, as today |
   | member who left a group | that group is gone |
   | member in a direct conversation | sees it; someone else does not |
   | member who blocked someone | that person's messages and posts are hidden |
   | member of a 300-person event group | the slow case today |

3. **Sabotage:** dropping the administrator condition, dropping the member
   check, including conversations someone left, or dropping the blocked
   condition must each make the comparison fail.
4. **Every existing chat probe passes unchanged,** plus
   `photos-bucket-reads.sql`.
5. **Realtime, two browsers:** `pnpm realtime-check`, plus a third account
   outside the conversation that receives nothing. Realtime runs these same
   rules for every listener, so this is where a mistake would show first.
6. **Speed:** `EXPLAIN ANALYZE` on Home's topics, a topic's posts, a
   1,000-message conversation, the conversation list, the unread count,
   likes, reactions and "Already asked". Anything slower is reported.

### Risks

- **A rule that is too generous looks like everything working.** That is
  why the comparison probe, every row for every person in both directions,
  is the centre of this step.
- **A rule that is too strict makes chat look empty.** It is loud, and the
  undo fixes it.
- **Release:** Step 5 first, on its own. After this one goes live, watch the
  logs for refused reads for the first hours.

## Step 7: Admin finds every member

- **The defect:** search sees only the first 1,000 members, and each open
  downloads the whole roster and invite list.
- **Fix:** search and paging in the database, 50 at a time, behind the same
  administrator check and returning the same columns. The test copy's "read
  every page" patch is correct but triples the cost, so it is not used.
- **Proof:**
  - a non-administrator is refused;
  - a search finds member number 1,001;
  - paging shows every member exactly once.
- **The old plan said "no change to Admin"** to keep speed work small. This
  is a correctness bug, so it is the owner's call whether it goes in here or
  on its own.

## Step 8: Retest, then decide the Supabase plan

- **On the load-test copy** (kept: `eokyhrntwbqegelcufrk`), after Steps 1 to
  6: 5, 10 and 20 members, on a fresh day, stopping at the first failure.
- **If 10 still fails on the free machine:** Pro with the Small compute
  size, about $30 a month. Run a few hours of the retest on Small before
  committing.
  - Pro also brings daily backups, which production lacks today (HANDOFF).
    Test a restore once.
  - Any spending is the owner's word.

## Step 9: Small items (no database change)

- **Cache header on link-preview pictures:**
  - First, a read-only `curl -I` on one live picture, to confirm today's
    header.
  - Then send `cache-control: max-age=604800` with the upload in
    `supabase/functions/link-preview/index.ts`, about line 196.
  - This only affects new previews, and mostly saves repeat downloads within
    one visit, since links are re-signed on each open (for privacy).
- **Remove `tw-animate-css`:** still imported at `src/index.css` line 10 and
  listed in `package.json`.
  - Only Tailwind's own `animate-pulse` and `animate-spin` are used. Check
    again before removing.
  - Update the reduced-motion comment that mentions its classes.
  - Compare the stylesheet before and after.
  - A later shadcn component might want it back.

## Every step

- **Built and proven on a fresh local stack first, then on the load-test
  copy.** Production only at the owner's word.
- **`pnpm check` on its own,** then `pnpm test` and `pnpm build`.
- **Probe standard:** rolled back, each check sabotaged once, every log read
  against its expect lines, a fresh stack.
- **Release:**
  - a linked dry run, then `db push` at a quiet time;
  - undo SQL written in advance from the live definitions;
  - right after, on the live site with the owner's account and a test
    account:
    - a message arrives in an open conversation;
    - the Chat dot, the bell and the app icon all work;
    - an administrator sees a closed room, and a non-administrator does not.
- **Commits by named file only.** HANDOFF updated in place.

## Not in this plan (measured or known, for later)

- An open conversation reloads its whole history on every live change.
- Views and read receipts written on every read. They cost disk writes, but
  Stats depends on them, so batching them is a product call.
- `event_attendees` averages 0.9 s.
- Slow chat functions: `chat_topics_for`, `chat_topic_opening_posts` and
  `chat_room_stats`.
- Waiting on the paid plan's image resizing: smaller stored photo copies,
  and WebP for iPhone uploads.
- Resizing pictures in `link-preview`, and removing `tailwind-merge`.
- **For the owner:** a paused member can read open rooms through the API,
  because `is_member()` includes 'suspended' on purpose. The app shows only
  the pause screen. Unchanged here.
