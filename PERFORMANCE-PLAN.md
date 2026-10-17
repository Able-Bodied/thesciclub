# Performance plan

Written 2026-10-15, after the speed audit of 2026-10-14. Four pieces of work.
The first ships what is already done; each of the other three is released and
reverted on its own.

Left out on purpose:

- the chat security-rule rewrite, and with it the `(select auth.uid())` change,
  which edits the same rules (see `CHAT-SECURITY-PLAN.md`);
- the Supabase plan upgrade, so there is no photo resizing for now;
- any change to Admin.

## Step 0: Ship the speed work already done

- **What:** the uncommitted changes in the working tree on 2026-10-14
  (40 files).
- **Before committing:** read the diff, and look at the visible changes on a
  phone:
  - grey placeholder cards while lists load;
  - the event cover in a 4:3 box;
  - chat rooms appearing together with your conversations;
  - event cards appearing with their "going" faces already in.
- **Commit:** by name only, never `-a`, since other sessions share the folder.
- **Order with the open migrations:** this needs no database change. But
  `20261015000000` and `20261015010000` are still waiting to go out (see
  HANDOFF). Push those first, so the new migrations below sit in a clean queue
  behind them.

## Step 1: Missing indexes (one migration, lowest risk)

- **File:** `supabase/migrations/20261016000000_indexes_for_lookups_and_deletes.sql`,
  with a header saying what each index serves.
- **Notifications (8):**
  - `post_id`, `topic_id`, `message_id`, `thread_id`, `event_id`,
    `actor_id`, `joined_id`, each only where the column is set. Deleting a
    post, topic, message, conversation, event or account currently scans the
    whole notifications table once per deleted row.
  - `created_at`, for the nightly 30-day cleanup.
- **Invites and members (4):**
  - `invites(invited_by_member_id)`: the rule that shows mentors their own
    invites currently scans every invite.
  - `invites(claimed_by)`: sign-up and account deletion look invites up by it.
  - `members(invite_id)` and `members(phone)`: these mostly speed up
    Admin → Invites without changing the panel itself.
- **Chat (5):**
  - `chat_topics(last_post_at desc, id)`: Home's newest-40 list currently
    sorts every topic.
  - `chat_topic_reads(member_id)`, plus `(topic_id, last_read_at)` for view
    counts.
  - `chat_thread_mutes(member_id)`.
- **For account deletion only (3):** `author_id` on chat posts, messages and
  topics.
- **One removal:** `event_rsvps_event_id_idx`. It duplicates the existing
  unique (event, member) index and only slows writes.
- **How it is checked:**
  - Restart the throwaway stack with the realistic test data.
  - Run `EXPLAIN ANALYZE` on each query before and after.
  - Run every existing probe in `supabase/tests/`, to show nothing changes
    behaviour.
- **Release:** a linked dry run, then `db push`. Building each index locks its
  table for a moment, which at today's sizes is milliseconds.
- **To undo:** drop the indexes. Nothing else depends on them.

## Step 2: Cheaper counts, and mark-read that only writes when something changed (two migrations)

The function names and results stay the same, so the app needs no change.

**`20261016010000_counts_without_building_lists.sql`**

- **`chat_unread_count()` (the unread dot):**
  - Today it builds the whole conversation list (`chat_my_threads()`: last
    message, member counts) just to count the unread ones.
  - It becomes a direct count using the same test: a message newer than the
    reader's read position, not written by them.
  - It keeps running as the reader, so the same rules decide which
    conversations they can see.
- **`my_unseen_notification_count()` (the bell badge):**
  - Today it builds 100 full notifications through `my_notifications()`, with
    eight table joins, names and preview text, just to count them.
  - It becomes a count of the same 100, with the same 30-day window and the
    same who-may-see-it rules, joining only the two tables those rules need
    (`chat_topics`, `chat_posts`).

**`20261016020000_mark_read_only_forward.sql`**

- **`chat_mark_thread_read_through`** gets `and last_read_at < delivered_at`
  on its update.
- **Why it matters:** today every reload of an open conversation writes the
  read position again, even when nothing changed. Each write tells every other
  open phone in the group to reload its read receipts. In a busy group that is
  a storm.
- **Why it is safe:** `notifications_read_with_chat` already acts only when
  `last_read_at` actually changes, so behaviour is identical.

**Probes**, following the probe standard: one rolled-back transaction each, run
as signed-in roles on a fresh stack, every fix shown to fail once when
sabotaged in a scratch copy.

- **`unread-count-matches-list.sql`:** for several members (one with muted
  conversations, one who left a group, one with only their own messages, a
  suspended member), the new count equals the number of conversations
  `chat_my_threads()` marks unread.
- **`unseen-count-matches-list.sql`:** the badge equals the unseen rows in
  `my_notifications()`, including:
  - a notification about a removed post;
  - a report notification for a non-admin;
  - one in a closed room;
  - one older than 30 days;
  - more than 100 notifications.
- **`read-through-moves-forward.sql`:**
  - reading up to an older message changes nothing (no new row version);
  - reading a newer one moves the position forward and marks that
    conversation's notifications read;
  - someone outside the conversation is still refused.

**Speed check:** time both functions before and after on the test data.
**Release:** dry run, then push. **To undo:** a migration that restores the old
function bodies, written in advance.

## Step 3: Cache header on link-preview pictures (edge function)

- **First, a check:** request one existing preview picture from production
  with a read-only `curl -I`, to confirm what cache header it carries. The
  audit believed it is "no-cache"; this is not verified.
- **The change:** in `supabase/functions/link-preview/index.ts` (the upload,
  around line 192), send `cache-control: max-age=604800` (one week) with the
  upload. Not "forever": a file is named after the picture's web address, and
  the same address can be fetched again with a new picture.
- **Effect:** only new previews. Existing ones keep their old header unless
  the backfill is re-run.
- **Release:** deploy `link-preview` as usual.
- **The size of this:** these pictures' links are re-signed each time the app
  opens (on purpose, for privacy: only `photos` URLs are kept across reloads,
  `src/lib/chat/attachments.ts`), and a new link means a new download whatever
  the header says. So this mainly saves repeat downloads within one visit.
  Making them survive a reopen would mean keeping preview links on the phone
  the way profile photos are, which records on the device which links appeared
  in conversations. That is a privacy call for the owner, and not part of this
  plan.

## Step 4: Remove `tw-animate-css`

- **Confirmed unused (2026-10-15):** the only animation classes in `src/` are
  `animate-pulse` and `animate-spin`, which are Tailwind's own.
- **Changes:**
  - delete `@import "tw-animate-css";` from `src/index.css`, line 10;
  - remove it from `package.json`;
  - update the comment in the reduced-motion block that mentions its classes.
- **Check:** compare the stylesheet before and after, `pnpm check`, tests,
  build, and a look at a few screens.
- **One trade-off:** the shadcn tool (`components.json`) expects it, so a
  component added with shadcn later might need it put back.
- **Release:** with any normal client release.

## Every step ends the same way

- `pnpm check` on its own, then `pnpm test` and `pnpm build`.
- Lighthouse re-run on the same pages for the database steps, with the numbers
  reported.
- Commits by named file only.
- HANDOFF updated in place with what is live. The agent's sandbox cannot push:
  the owner pushes and deploys.

## Not in this plan

- **Smaller stored copies of photos:** waits for the Supabase paid plan, whose
  image resizing makes them on the fly with no copies to keep in step.
- **A WebP encoder for iPhone uploads:** it would need WebAssembly allowed in
  the security policy, and the paid plan's resizing covers it.
- **Image resizing in `link-preview`:** edge functions' CPU limits make large
  pictures risky; revisit if link cards prove heavy.
- **Removing `tailwind-merge`:** about 8 KB compressed, against 83 call sites
  where a style override could silently change.
- **Admin → Invites view:** Admin is not being changed.
