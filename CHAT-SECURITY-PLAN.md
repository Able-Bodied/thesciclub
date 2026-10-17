# Chat security rules plan

Written 2026-10-15, from the live rules (`pg_policies`) and helper functions on
that date. Ships after the migrations in `PERFORMANCE-PLAN.md`.

## The problem

Every chat row checks the reader's membership separately. Reading Home's 40
topics with their posts, or a conversation of 1,000 messages, runs "is this
person a member, and can they read this room or conversation?" once per row,
and up to four times per row for likes and reactions. Postgres cannot merge
these checks, because the helpers (`is_member`, `is_thread_member`,
`chat_room_is_readable`) are SECURITY DEFINER functions with a fixed
search_path, which it never inlines.

## The fix

Work out the reader's readable rooms and conversations **once per request**,
and check each row against that list. The rules mean exactly what they mean
today; only the cost changes.

**Two new helper functions**, SECURITY DEFINER and STABLE, granted to
`authenticated` only:

- **`chat_readable_room_ids()`:** the rooms this person may read. Every room
  for an administrator, the open ones otherwise, and none unless
  `is_member()`. The same as `chat_room_is_readable(room)` for each room.
- **`chat_my_thread_ids()`:** the conversations this person is in, and none
  unless `is_member()`. The same as `is_thread_member(thread)` for each
  conversation.

They must run as the owner, not as the reader. Otherwise
`chat_thread_members`' own rule would call the helper, which would read the
roster, which would call the rule again, forever.

**Nine read rules rewritten** to "the row's room or conversation is in that
list" (`room_id in (select public.chat_readable_room_ids())`, and the same for
threads). Every rule keeps its name.

- **Conversations:** `chat_messages`, `chat_threads`, `chat_thread_members`,
  `chat_message_reactions`.
- **Rooms:** `chat_topics`, `chat_posts`, `chat_post_likes`,
  `chat_post_reactions`.
- **The rooms list:** `chat_rooms`, where `is_member()` and `is_admin()` are
  each run once instead of per room.

**Not changed:**

- **Every write rule** (posting, liking, muting, joining, leaving). These check
  one row at a time, so there is nothing to save.
- **The existing helper functions.** Storage, write rules and other database
  functions still use them.
- **Chat photo files** (`chat_file_is_readable`). They are checked per file,
  which is how they are asked for.

**What stays exactly as it is, and the tests must prove it:**

- **Suspended members still read chat.** `is_member()` counts
  `status in ('active', 'suspended')`, which is how it works today. Changing
  that would be a product decision, not part of a speed fix.
- **Administrators see closed rooms;** members see only open ones.
- **Leaving a conversation ends access** to its messages, roster, reactions
  and the conversation itself, immediately.
- **Removed posts' reactions stay hidden,** and so do removed messages' and
  notices'.
- **Realtime delivers exactly what the screen could read,** since it runs the
  same rules.

## Phase A: wrapping `auth.uid()` (mechanical, low risk, ships first)

- **What:** about 25 rules across the app compare a column to `auth.uid()`
  directly, and so may re-read the signed-in user for every row. Writing it as
  `(select auth.uid())` makes Postgres read it once. This is Supabase's
  security advisor rule `auth_rls_initplan`.
- **Where:**
  - members, event RSVPs, notifications, invites, organization follows, push
    subscriptions and muted kinds, QR codes, member strikes, chat reports,
    and the chat mutes, room members and topic reads tables;
  - the chat insert rules' `author_id = auth.uid()`;
  - storage: the photo and chat upload, update and delete rules, and the photo
    read rule, which also gets `(select is_member())`.
- **Migration:** `20261017000000_rules_read_the_signed_in_user_once.sql`.
- **Biggest single gain here:** the mentors' "invites I sent" rule. It
  currently scans every invite and re-reads the user per row. This phase plus
  the invite index in `PERFORMANCE-PLAN.md` Step 1 fixes it.

## Phase B: membership checked once (the real change)

- **Migration:** `20261017010000_chat_reads_check_membership_once.sql`.
- **Header:** says why; what is equivalent to what; which callers still use
  the old helpers; and that every policy keeps its name, so existing probes and
  Supabase's dashboard still match.

## How it is proven (both phases)

Following the probe standard: a fresh throwaway stack, signed-in roles, one
rolled-back transaction per probe, every check shown to fail once when
sabotaged in a scratch copy, and every log read against its expect lines.

**1. A before-and-after comparison probe** (`chat-reads-unchanged.sql`), the
main safety net:

- Inside one rolled-back transaction, for each test person, record every row
  they can see in every affected table and in each chat function that runs as
  the reader (`chat_my_threads`, `chat_unread_count`,
  `chat_topic_opening_posts`, `chat_post_view_counts`).
- Then apply the new rules and record again.
- Any row visible under one set and not the other fails the probe, in either
  direction.

**2. Test people**, built from the realistic test data plus the awkward cases:

| Who | What it covers |
|---|---|
| active member | the ordinary case |
| suspended member | still reads, as today |
| removed member | sees nothing |
| administrator | sees closed rooms |
| account with no member row (part-way through sign-up) | sees nothing |
| signed-out visitor | sees nothing |
| member who left a group | that group is gone |
| member in a direct conversation | sees it, and someone else does not |
| member of a large event group (300 people) | the slow case today |

The data also includes closed rooms, removed posts with reactions, removed
messages, notices, and replies under answers.

**3. Sabotage:** each test person is shown to catch a deliberately broken rule.
For example: drop the administrator condition, drop the member check, or
include conversations someone has left. Each of these must make the comparison
probe fail.

**4. Every existing chat probe passes unchanged.** The 17 `chat-*.sql` probes
plus `photos-bucket-reads.sql`, read against their expect lines.

**5. Realtime, two browsers:**

- `pnpm realtime-check` on a stack with realtime running: a message reaches
  the open conversation, and the dot appears on the other person's Chat tab.
- Plus a negative check added to that script: a third account that is not in
  the conversation, subscribed to all messages, receives nothing.

**6. Speed, before and after on the same data:**

- Run `EXPLAIN ANALYZE` on Home's topics read, a topic's posts, a
  1,000-message conversation, the conversation list, the unread count, likes
  and reactions, and the "Already asked" topic search.
- Re-run Lighthouse on Home, Chat and a topic page.
- Report the numbers, including anything that got slower.

## Release

1. **Order:** Phase A first, on its own. It goes out after the
   `PERFORMANCE-PLAN.md` migrations.
2. **For each phase:** a linked dry run, then `db push` at a quiet time. No app
   release is needed; nothing in the app changes.
3. **Check right away on the live site**, with the owner's account and a test
   account:
   - open a conversation and see a new message arrive;
   - as an administrator, see a closed room; as a non-administrator, confirm
     it is absent;
   - the unread dot and the bell both work.
4. **Watch the logs** for refused reads in the first hours; a wrongly strict
   rule shows up there.
5. **Have the undo ready:** the "put the old rules back" SQL is written in
   advance, taken from the live rules. If anything is wrong it is pushed as a
   new migration, and the old behaviour returns in one step.
6. **Update HANDOFF** in place, saying what is live.

## Risks, plainly

- **The worst case is silent:** a rule that is too generous looks like
  everything working. That is why the comparison probe (every row, every
  person, both directions) is the centre of this plan, not the ordinary
  pass/fail probes.
- **The other failure is loud:** a rule that is too strict makes chat look
  empty or refuse reads. It is easy to spot, and the undo fixes it.
- **Database functions that run as the owner are not affected,** since they
  skip these rules; the probe covers the ones that run as the reader.
- **One assumption to confirm early:** Postgres has to compute each new list
  once and reuse it (a hashed subplan), rather than once per row. Step 6 checks
  the query plans for exactly that before anything ships. If a plan does not
  come out that way, the rewrite does not go out.

## Out of scope (possible follow-ups)

- Rewriting slow chat functions: a topic page asking for its whole room to
  find one topic (`chat_topics_for`), room opening posts reading every post
  (`chat_topic_opening_posts`), room post counts (`chat_room_stats`).
- Checking chat photo files more cheaply.
- Admin's views.
