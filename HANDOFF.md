# Handoff

Last updated 2026-10-01, for the next session.

It is the whole context needed; you should not need to re-read the previous
conversation.

This file lives at `thesciclub/HANDOFF.md` and nowhere else. There was a
symlink to it from `/home/alfred/projects/` for a while; it is gone, so that
there is one path to quote and one file to edit.

**Start the session in `/home/alfred/projects`**, not inside either repo:

```
/home/alfred/projects/
  thesciclub/            <- the app. All bare paths below are relative to here.
  ab-peers-prototype/    <- reference only. Never commit to it.
```

Every `pnpm` and `supabase` command runs from inside `thesciclub`.

---

# Start here — 2026-10-01

**Home is built and live, and the plan that built it is gone.** The owner
asked for Home on 2026-09-29; it went out in eight steps over three days, each
reviewed and pushed at the owner's word, and `HOME-PLAN.md` was deleted on
2026-10-01 once "What Home is" (below, near the end) held everything in it
that stays true. `git show fe96183:HOME-PLAN.md` reads the plan as it last
stood; the sections "Home, step 1" to "Home, step 6" say what each step
changed and how it was checked.

**Where everything stands.** `origin/main` and `origin/scaffold-and-peers-deck`
sit at the same commit, and Netlify builds `main`. The hosted database has 87
migrations applied; **the 88th, `20261002000000`, waits for the owner's
push** — see "Start fresh carries nothing" (`pnpm exec supabase migration
list`).
1,544 tests pass; `pnpm check` and `pnpm build` are clean. Check all of that
rather than trusting it: `git log --oneline origin/main..HEAD` should be
empty, and a blank Remote column in the migration list is a pending
migration.

**What is open, in order of urgency**, each with its own section:

1. **Twilio approval, in progress** — the owner is working with Twilio
   (2026-10-01). Once texts arrive, the sign-in clean-up in "Twilio — the
   owner's next job" follows. Not a session's job until then.
2. **"Start fresh" carries nothing — built, not yet released.** The owner
   pushes `20261002000000` first, from a dry run, then the client. See its
   section below.
3. **Things only a phone can check**: an hour with VoiceOver; the
   notifications test; signed photographs on an iPhone (every face is a
   signed URL since 2026-10-01 — the owner saw production draw in a
   browser, not on a phone). "Still open".
4. **The advisor's remaining findings** — `before_user_created` callable
   by `anon`, functions without a fixed `search_path`, definer views to
   confirm. "Security — the advisor's findings", items 1 and 2.

**What landed, by day**, newest first. Each has a section:

| Day | What | Database |
| --- | --- | --- |
| 2026-10-01 | "Start fresh" on a claim carries nothing of the seed — built, the migration not yet pushed | `20261002000000` |
| 2026-10-01 | Home step 6: the photos bucket takes 2MB and three image types, and is **private** — every face and logo a signed URL, the signing client released before the bucket closed | `20260930040000`, `20261001000000` |
| 2026-09-30 | Home step 5: the app opens on Home; CONTEXT.md and this file say what the app is | — |
| 2026-09-30 | Home step 4: Filter your feed; the filter sheet and the report sheet move focus (`useDialogFocus`) | — |
| 2026-09-30 | Home step 3b: the probes read as expected again (all 30 on a fresh stack); the chat bucket's policies name `authenticated`; Like on every topic card | `20260930030000` |
| 2026-09-30 | Group names and pictures, a side job | `20260930020000` |
| 2026-09-30 | Home step 3: Likes, with names shown | `20260930010000` |
| 2026-09-29 | Home step 2b: rooms open to write without joining; editing with earlier versions for administrators; replies under a post, quotes in a conversation | `20260930000000` |
| 2026-09-29 | A photograph from an iPhone was refused — two faults fixed | — |
| 2026-09-29 | Home steps 1 and 2: the feed, and asking or sharing from Home | — |
| 2026-09-29 | The owner's brand, with Atkinson Hyperlegible Next for reading text | — |
| 2026-09-29 | `admin_invites` stops reading `auth.users` | `20260929000000` |

**How the Home work was run**, since it worked and is worth repeating: one
session wrote the plan; a fresh session built each step from it and stopped;
the planning session reviewed each step on the local stack with its own
scripts, not the builder's word, then gated the push on `pnpm check` at the
exact commit in a scratch worktree. Migrations were pushed by the owner,
before the client that needed them, from a dry run shown first — except step
6's closing migration, which went *after* the signing client, because the old
client against a closed bucket would have broken every face at once.

## Start fresh carries nothing — built 2026-10-01, the migration not yet pushed

The owner asked on 2026-10-01. Somebody whose invite names a seeded profile
is asked "Is this you?"; under "Start fresh" the screen says "Starting fresh
removes the old profile too." It did remove it — after copying its
photograph, bio, lists, level and the rest into the new row, because the
insert never said which button was pressed. On a mistyped invite that hands
a stranger's face and bio to the wrong person.

- **`20261002000000`**: `members.start_fresh boolean not null default
  false`, an instruction to `consume_invite_for_new_member()` rather than a
  fact. The trigger copies only when it is false, retires the seed and
  consumes the invite either way, then sets it back to false; the check
  `members_start_fresh_not_stored` holds it there, so an update cannot set
  it. The default keeps an installed app that is not yet updated on the old
  behaviour, so the migration goes first.
- **Client** (`fa43c3a`): `startFresh` in `OnboardingData`, set by Start
  fresh, sent by `submitOnboarding` as `start_fresh`. Two tests, each seen to
  fail with its line removed.

Checked on a throwaway stack started fresh: `claim-carries-profile.sql` read
against every expect line before and after — steps 1 to 8 the same, step 9
refused before (no column) and as expected after; with `and not
new.start_fresh` taken out of the function, step 9 carried the photograph,
bio, three interests, five topics and the level. All 31 probes ran after;
only that one names the column. In a browser on the same stack, as
`11111111111` (its invite names Bob): Start fresh, "Sam", a birthday, Finish
later, Home — the row has no photograph, bio, lists or level, the seed is
gone, the invite consumed and linked, and Me shows "S" and 0%. Applied to the
working local stack too.

**To release:** the owner runs `pnpm exec supabase db push --linked
--dry-run`, which should list `20261002000000` alone, then the push; then
the client goes to `main`. In the other order the client's insert names a
column the live database does not have, and every new member's signup is
refused (PostgREST's `PGRST204`, which `describeError` does not count as
drift, so it reads "Something went wrong").

## Security — the advisor's findings

Found 2026-09-29 by running Supabase's own advisor against the live project
(`pnpm exec supabase db advisors --linked --type security --level info`) and
reading the live auth settings through the Management API. The sign-in
codes it also found are waiting on Twilio, the owner's decision of
2026-10-01; see "Twilio — the owner's next job".

**1. Anybody can ask whether a number is on the invite list.**
`before_user_created(event jsonb)` — written as an auth hook — is executable by
`anon` and answers through `/rest/v1/rpc/`: "not on the club's list" for a
number that is not, `{}` for one that is. Confirmed on the live API with a
made-up number. Silent, unlimited, and a yes says the person is linked to an
SCI club. **The hook is not even switched on** in production
(`hook_before_user_created_enabled` is false, and `config.toml` has it
commented out), so invite-only is enforced by onboarding and RLS, not at
sign-up — which is also why two auth accounts exist with no member row. Fix in
a migration: revoke execute from `public, anon, authenticated` and grant it to
`supabase_auth_admin` only (Supabase's documented pattern for auth hooks).
Then decide with the owner whether to switch the hook on.

**2. Also from the advisor — a migration, not yet written:**
   - Callable by `anon` and needing not to be: `active_strike_count` (answers
     any member's strike count — strikes are meant to be private even between
     members, and `authenticated` can call it too), `live_invite_count`,
     `nearby_events`, and five trigger functions (`chat_bump_thread`,
     `chat_bump_topic`, `consume_invite_for_new_member`,
     `delete_member_for_deleted_user`, `invites_refuse_blocked` — not callable
     as RPC, revoke anyway). Check where each is used — a policy or an invoker
     view evaluated as the caller needs execute — before revoking from
     `authenticated`.
   - `has_active_invite` is the same oracle as item 1 for any signed-in
     account, and since sign-up is not gated, any stranger with a phone can
     become one.
   - Nine functions with no fixed `search_path` (`touch_updated_at`,
     `normalize_phone`, `protect_admin_flag`, `assert_adult`,
     `invites_require_inviter`, `members_admin_is_mentor`, `strike_window`,
     `strike_limit`, `mentor_invite_limit`).
   - Ten views flagged `security_definer_view`: every view here runs as its
     owner by design and is gated in its `where` (`is_admin()`,
     `is_active_member()`). Worth a pass to confirm each gate, and
     `security_barrier` on each, as `admin_invites` now has.
   - Fine as they are: RLS is on for every table; the four tables with RLS and
     no policy (`blocked_numbers`, `chat_removed_bodies`, `directory_seed`,
     `push_daily_runs`) are deny-all on purpose; leaked-password protection
     does not apply to phone sign-in.

**Not yet audited**: what a signed-in account with no member row can read
through the 52 definer functions `authenticated` may execute. The two
storage buckets are now set by migrations and probed — `chat` by
`20260930030000`, `photos` by `20260930040000` and `20261001000000` (see
"Home, step 6") — and the live `photos` bucket's settings were read back
through the storage API on 2026-09-30.

## Twilio — the owner's next job

**In progress**: the owner is working with Twilio on approval (2026-10-01).
Until then SMS does not reach anybody in production, and real members sign
in with codes set on the live project's test-number list.

The club only ever texts a sign-in code; notifications are web push. The
recommendation given to the owner on 2026-09-29, from Twilio's own docs:
**switch Supabase's SMS provider to Twilio Verify**, which "is exempt from A2P
10DLC registration when using a provided pooled sender" — no brand or
campaign approval, about $0.05 per successful sign-in, no number to rent, and
no app change. The owner's steps: upgrade the Twilio account if it is a trial;
create a Verify service (its name appears in the text — something neutral like
"Club sign-in" keeps "SCI" off a lock screen); copy the Account SID, a fresh
Auth Token and the Verify Service SID (`VA…`); set the provider to Twilio
Verify in Supabase (Authentication → Sign In / Providers → Phone, or the
Management API's `sms_twilio_verify_*` fields). Test on one real phone.

**Once texts arrive, clear the test-number list on the live project**
(Authentication → Sign In / Providers → Phone → Test phone numbers): the
real members' numbers and the three local test numbers in Environment. The
club's only administrator on the live database is the first of those test
numbers, so make the owner's own real account an administrator before
removing it. From then on `pnpm shoot` runs against the local stack only.
A live settings change, so a session asks the owner first.

The alternative — A2P 10DLC on the club's own number — needs the
organization's legal name and EIN, a public HTTPS privacy policy and terms
(required since June 2026; the policy must say numbers are never shared or
sold), an opt-in with STOP wording on the sign-in screen, and sample messages.
The club has no public privacy policy or terms today. Only worth it if the
club ever texts anything other than a code.

## Going back to the old look

**The git tag `brand-before-outfit`** (on `origin`) is the app exactly as it
looked before: Archivo and Public Sans, gold `#c9a227`, the drawn `ClubMark`,
the old icons. To restore the look without losing anything built since:

    git checkout brand-before-outfit -- public/ index.html src/index.css \
      src/components/club-mark.tsx vite.config.ts

then revert the colour and tracking edits in the routes — or, simpler, `git
revert` the rebrand commits (`2985e1c`..`9dc1142`, and `390c7d7` for the
Atkinson change). Netlify also keeps every earlier deploy; "Publish
deploy" on one from before the rebrand puts it back in a minute without
touching git. Before/after screenshots are in `screenshots/brand-before/` and
`screenshots/brand-after/` on the owner's machine (gitignored).

## What the rebrand changed, and what it left

- **`sci-club-logo/` stays the owner's**, untracked, and excluded from Biome
  and git like `logos-from-you/`. What the app uses is **copied** into
  `public/`: `fonts/` (Outfit Bold, Atkinson Hyperlegible Next, both
  licences), `brand/` (the
  badge and the compact reverse lockup), and the icons. If the owner updates a
  file there, copy it across again.
- **Two faces, both self-hosted** (the owner's decision — no request to
  Google), from `@font-face` in `src/index.css`, preloaded in `index.html`,
  precached by the service worker (`globPatterns` in `vite.config.ts`):
  - **Atkinson Hyperlegible Next** for every word a member reads — `font-sans`
    and `font-head`. The owner chose accessibility over the brand guide on
    2026-09-29: the guide sets Outfit for body copy, and Outfit's I, l and 1
    are near-identical at caption size. Atkinson was drawn by the Braille
    Institute for low-vision readers. Its zero is slashed on purpose. Variable
    200–800, so every weight is real.
  - **Outfit** (the owner's Bold) for `font-display` only: text 22px and up —
    page titles, profile names, the welcome headline. **A new large heading
    takes `font-display`; anything smaller takes `font-head`.**
- **Colours** follow `tokens.json`: `--gold` gold-500, `--gold-dp` gold-800,
  `--gold-hi` gold-300, `--navy-hi` navy-700, the brand's ink and ink-muted,
  and a new **`--on-gold`** (navy) for anything on a gold fill — use
  `text-on-gold`, never a hex. Two deliberate departures, both commented in
  `index.css`: the focus ring stays navy on light, and `--canvas` keeps
  `#f4f6f9` because the brand's `#f3f5f8` takes `--grey` under AA.
- **The logo** is the owner's SVGs drawn as `<img>` by `ClubMark` and
  `ClubWordmark` in `src/components/club-mark.tsx` — never redraw or recolour
  them in code; the README forbids it.
- **Icons**: the owner's ico, 32, 512 and apple-touch-icon; 16 and 192 rendered
  from their mark; a separate **maskable** pair (mark on full navy at 68%) —
  see the comment in `vite.config.ts`. Members who added the app to their Home
  Screen must remove and re-add it to see the new icon; the owner is telling
  them directly.
- **Not changed, on purpose**: `docs/` — the public mock at www.thesciclub.com
  keeps the old look (the owner's decision). The type sizes and radii are the
  app's own, tuned for the text-size setting; the brand's type scale was not
  imposed on them.

## What landed 2026-09-27 and 2026-09-28

Each has its own section further down; this is the index.

- **Notifications, live.** Web Push to the Home Screen app: direct and group
  messages (with the words), replies to your topic, replies in topics you
  posted in, being added to a group, reports (administrators), somebody you
  invited joining, tomorrow's events, new events from organizations you
  follow; mutes per conversation, topic and room; switches per kind on Me; the
  unread count on the app icon. **Not yet tried on a real iPhone** — that is
  the owner's test. See "Notifications on an iPhone — built and live
  2026-09-27", which is now a record rather than a plan.
- **A removed reply in a topic disappears** instead of saying "Removed by its
  author", and stops counting. Conversations still say "Removed by…".
- **An administrator can delete a topic** (Delete topic, in the topic header).
- **Web addresses are clickable** in posts, messages and bios, shortened for
  reading.
- **The room's sort row says "Sort by"**, not "Topic".
- **The Netlify CLI** is a devDependency (needs `--filter thesciclub`); the
  Supabase CLI is 2.118.0.

## Supabase's security email, 2026-09-27 — fixed in `20260929000000`, on the live database since 2026-09-29

Supabase's advisor flagged `auth_users_exposed`: `admin_invites` joined
`auth.users` to show whether an invited number has signed up. **Nothing leaked**
— checked on the live API: anon gets "permission denied", and a member who is
not an active administrator gets no rows because of `where is_admin()`. But
that one line was the only wall, so the lookup moved into
`private.account_created_at()`, which checks `is_admin()` itself and lives in a
schema the API does not publish; the view became a `security_barrier`, and
its grants are select-only (Supabase's defaults had also given `authenticated`
insert/update/delete on it — inert on a join view, gone anyway). No client
change. **Rule: no view in `public` names `auth.users`** — probe step 6 checks.
**Owner: push it with `pnpm exec supabase db push --linked`** — the dry run
on 2026-09-29 listed exactly this one migration. The client does not depend on
it, so it can go before or after the code. The advisor's warning should clear
on its next scan.

## Home, step 1 — built 2026-09-29, pushed the same day

The plan was `HOME-PLAN.md` at the repo root (deleted 2026-10-01; its
seven decisions are in "What Home is"). Step 1, "Home reads", is done: `/home` lists recent
topics and photographs from the open rooms, upcoming events with working
RSVPs, and members worth meeting, under Everything · Topics · Photos ·
Events · People. No migration, so it releases with a push alone. Before
that, the photograph viewer became a real dialog (the owner said yes to
fixing it first): `role="dialog"`, `aria-modal`, Tab kept inside, focus back
on the tile that opened it.

Files: `src/lib/home/` (types, the topic read and `toHomeTopics`),
`src/routes/home/` (`feed.ts` for the mix, three cards, the page, `back.ts`),
`src/routes/chat/back.ts`. `pnpm shoot` has `--scroll=<px>` now.

Where the build differs from the plan, on purpose:

- **`useHomeTopics` returns the raw reads; the page calls `toHomeTopics`.**
  So the screen test stubs the read and still runs the real join, including
  the closed-room filter.
- **A topic or person card is not one big link.** The link is on the title
  (or name) and stretched over the card with `after:absolute after:inset-0`.
  The whole card is still the target, but a screen reader reads the title as
  the link rather than the room, byline and four lines of a reply.
- **Back keeps the pill.** Cards hand over `{ from: 'home', segment }`, and
  `backToHome` rebuilds `/home?segment=…`, as Events does for its segments.
- **Extras left when the topics run out go at the end of Everything**, so a
  quiet week still lists events and people.
- **Reply links are named "Reply to <title>"**, so a links list is not a
  column of identical names.

Checked on the local stack as a member and as an administrator: every pill at
430 and 1280 with `--scroll`, `--text=larger`, 320px wide (no sideways
scroll), a keyboard walk from the skip link, axe on all five pills (clean),
and back from a topic, an event and a profile landing on the pill it came
from. **Not checked:** VoiceOver on a real iPhone, and production data.

Owed and noticed, not changed:

- **Before releasing step 1, ask the owner which rooms are open on the live
  project.** If none are, Topics and Photos open empty (HOME-PLAN.md,
  question 3).
- `EventCard`'s Interested and Going are 40px tall with no `data-target`, on
  Events as well as Home.
- Two zero counts drawn elsewhere: the topic page header ("0 replies ·
  1 view") and an event card's "1 going · 0 interested".
- Step 2 is built; see the next section.

## Home, step 2 — built 2026-09-29, pushed the same day

Step 2, "Asking and sharing from Home", is done. No migration, so it
releases with a push alone, like step 1. A member who has never opened Chat
can ask a question or share a photograph starting from Home, and both appear
in the room and on Home.

What landed, one commit each:

- **A single photograph fills its card on Home** (carried over from step 1,
  first). `AttachmentGrid` has a `fill` prop, false by default; with it one
  photograph is full width at 400:260, cropped, and whole in the viewer.
  Only `PhotoCard` passes it. Screenshots of a topic and a conversation that
  hold one photograph are byte-identical before and after.
- **`joinRoom(roomId, memberId)`** in `src/lib/chat/rooms.ts`: the same
  insert as `useRoomMembership().toggle` (now shared, `ignoreDuplicates`),
  but awaited, so the New topic screen is not reached before the join lands.
- **The New topic screen reads Home's state.** Handed `{ from: 'home',
  segment, kind }`, Back says Home and returns to the pill, and the posted
  topic is handed `{ from: 'home', segment }`. With `kind: 'share'` it is
  "Share a photograph": picker first, title labelled "Say something about
  it", first post optional once there is a photograph. `topicProblem` says
  why Post is waiting, shown under the button in share mode only. Asking
  changes nothing but Back. `new-topic.test.tsx` is new.
- **`/home/new`** (`src/routes/home/new.tsx`): two pills for the kind (also
  `?kind=share`), then the open rooms under Chat's category headings as one
  group of native radios, none chosen. "Continue", or "Join <room> and
  continue" with the line under it; an administrator is never asked to join.
  A refused join stays on the screen in its sentence. No open room: the
  sentence and "Start a room", no list, no button.
- **The dashed card** (`src/routes/home/compose-card.tsx`) at the top of every
  pill, drawn before the list loads. From Photos it opens on sharing.

Where the build differs from the plan, on purpose:

- **The state carries the pill as well as the kind**: `{ from: 'home',
  segment, kind }`, where the plan says `{ from: 'home', kind }`. It is step
  1's "Back keeps the pill" carried one screen further, so back from a
  photograph shared from Photos lands on Photos.
- **The compose card has an icon where the mock has the viewer's avatar.**
  The avatar would be one more read on Home for a picture of themselves.
- **Share mode says why Post is disabled**, under the button. Ask mode does
  not, as the plan says ask mode changes nothing.
- **Sentences the plan did not write** (HOME-PLAN.md question 5 covers the
  wording): "Which room does it go in?" (the group's heading), "Choose a
  room." (under a disabled Continue), "Optional when there is a photograph."
  (under The first post), "Say something about it. It is the line in the
  list." and "Add a photograph, or some words." (share mode's reasons), and
  "The cushion that finally worked" (share mode's title placeholder).

Checked on the local stack (dev server on 5183, confirmed pointing at
127.0.0.1:54321): a local member who had joined nothing (the third test
number, renamed Sam locally) asked a question from Everything and shared a
photograph with no words from Photos, joining each room on the way; both
landed in their rooms and on Home, and back from each topic returned to the
pill. The administrator posted without joining and was offered open rooms
only. Screenshots at 430, 1280 and `--text=larger` of Photos (a landscape, a
portrait and a square single photograph), `/home/new` both kinds, share mode
and the card. 320px wide with no sideways page scroll. axe clean on all five
pills, `/home/new` both kinds with and without a room chosen, and share mode
(it found a heading-order jump on `/home/new`, fixed). A keyboard walk from
the skip link to the card, through `/home/new` with the arrow keys, Enter on
the join button. **Not checked:** VoiceOver on a real iPhone; a refused join
in the real app (unit-tested only, as nothing refuses it locally); production.

Owed and noticed, not changed:

- Chat's room page draws "0 replies · 0 views" on every topic row with none,
  a third place zero counts are drawn (with the two above).
- On the New topic and topic screens opened from Home, the tab bar lights
  Chat, because they live under `/chat`. Step 1's topic links do the same.
- The compose card's dashed border is `border-line`, lighter than the
  mock's; the words carry it.
- Next was step 2b; see the next section.

## Home, step 2b — built 2026-09-29, migration on the live database the same day

Step 2b, "Rooms open to write; editing; replies to a post" — HOME-PLAN.md
decisions 8 to 12, asked for by the owner on 2026-09-29 before Likes. It
changes Chat as much as Home, and it reopens two of Chat's recorded
decisions at the owner's word: joining no longer buys anything, and a
member can edit their own words.

**The order of release was kept.** The migration
`20260930000000_rooms_open_to_write_editing_and_replies.sql` and five probes
(`chat-edits.sql` and `chat-replies.sql` new; `chat-posts.sql`,
`chat-attachments.sql` and `topic-removal-and-deletion.sql` changed) were
committed first; all 28 probes in `supabase/tests/` were run on the local
stack as signed-in roles on 2026-09-29 and every one reads as expected. The
owner pushed the migration to the live database the same evening. Only then
did the client land, as six commits in the plan's order — Join comes out;
editing; replies in topics; conversations; Home's first-reply rule; earlier
versions — then the documents, with `pnpm test` (1,384), `pnpm check` and
`pnpm build` clean at every step. (The client was built before the push and
held in the working tree as patches until it was done; the patches and the
replay script are still in `screenshots/step-2b-commits/`, gitignored, and
are of no further use.) Pushed to GitHub on 2026-09-29, with the hide-
replies change below.

What the migration does, one part each, with the header saying why:
`chat_can_post_in` stops asking for a membership row (rows and policies
stay; `chat_room_stats.member_count` stays for an older client and is not
read); `edited_at` and `reply_to` on `chat_posts` and `chat_messages`,
`reply_to` granted for insert and guarded by a `before insert` trigger on
each table — same topic or thread, not removed, and for posts not a reply;
`chat_edits` holds every earlier version, one select policy `is_admin()`;
`chat_edit_post` and `chat_edit_message` are its only writers and refuse
everybody but the author, an administrator included; `chat_remove_post`
nulls `reply_to` on the replies of a post it removes. No `admin_post_edits`
function, on purpose: an administrator selects the table.

What the client does:

- **Join is gone**: `joinRoom` and `useRoomMembership` deleted; the room
  page, room card, Chat page and `/home/new` draw no Join, Joined, Leave or
  member count; `canPost` is the room being open (or the reader being an
  administrator). The Chat page's sentence reads "Open to every member, to
  read and to write, with the whole history."
- **Editing** is the composer in place (`Composer` gains `edit`): Save and
  Cancel, Escape cancels, no photo picker, Save unavailable while nothing
  has changed or the words are blank on a row with no photographs. "Edited
  · 9:30am" under a post; "· Edited 9:30am" on a bubble's byline.
- **Replies in a topic**: `threadPosts` (pure, `topics.ts`) files each
  reply under its post; a reply whose post is gone stands on its own; a
  reply to a reply files under the same post, and the client sets
  `reply_to` to the parent so the trigger is never met in ordinary use.
  Numbering counts the top level; `firstUnreadThread` opens at the first
  thread with something new in it. The composer carries "Replying to Jan"
  with a ✕.
- **Replies in a conversation** are a quote (`quoteText`, pure,
  `threads.ts`): eighty characters, "Removed message", "Photograph".
  Tapping it scrolls to the message and lights it up once
  (`.message-flash` in `index.css`; reduced motion honoured). A quote of
  your own message is headed "You".
- **Controls are named for their post or message** — "Reply to Jan's
  post", "Remove your message" — so a topic is not twenty identical
  buttons in a screen reader's list. The tests that queried `Remove` and
  `Report` by exact name now match by prefix.
- **Earlier versions**: `useEdits` (`src/lib/chat/edits.ts`) reads
  `chat_edits` for an administrator and hands everybody else empty maps
  without asking; `EarlierVersions` (`routes/chat/earlier-versions.tsx`)
  is a `<details>` list drawn under an edited post on the topic page and
  under the snapshot on a report.
- **Home**: the first reply on a card is the earliest standing top-level
  post after the opener.
- **Replies can be hidden** (the owner, 2026-09-29, after the step landed):
  "Hide 3 replies" under a post's controls folds them away and becomes
  "Show 3 replies", named for its post, with `aria-expanded`. Shown by
  default on every visit, and shown again when their number changes, so a
  reply written under a folded post lands in view. No control on a post
  with no replies. Checked on the local stack at 430 and 1280, axe clean
  with the replies hidden, Enter on the control by keyboard, and a reply
  written while hidden landing visible.

Where the build differs from the plan, on purpose:

- **`/home/new`'s join step came out with the first commit**, not the
  fifth: nothing in the client could join once `joinRoom` went, and the
  first commit has to typecheck on its own.
- **Exactly one of `post_id` and `message_id` on `chat_edits` is a check
  constraint**, not a `kind` column: both foreign keys cascade, so the
  reason `chat_reports` needed `kind` does not apply.
- **The reply bar and the quote name the reader as "you"**, and the quote's
  heading as "You"; the plan did not say.

Checked on the local stack (the dev server on 5183, confirmed pointing at
127.0.0.1:54321), by a Playwright script kept in the session's scratch
folder: as Sam, a local member whose memberships were deleted so they had
joined nothing — a topic started in bowel with no Join; a reply nested; a
reply to the reply filed under the same post; a second post with a reply
under it taken back, the reply standing at the top level and numbered,
nothing saying "removed"; the opening post edited twice, "Edited · time"
shown, no versions offered; Jan's topic with no Edit and a Reply; a
conversation with Jan with a reply quoted, the quote tapped and the
message lit, a message edited; `/home/new` with Continue only. As Jan, the
edited post reported. As Alex, the administrator: no Edit on Sam's posts,
"Earlier versions" under the edited post with both drafts, and again under
the report on `/admin`. Screenshots at 430 and 1280, `--text=larger`, and
320 wide with no sideways page scroll, all read. axe clean on the topic
page (as a member and as the administrator with the versions open), the
thread page and `/home/new`. A keyboard walk: Tab to Edit, Enter, type,
Tab to Save, Enter; Tab to Reply, Enter, type, Tab to Post this reply,
Enter. **Not checked:** VoiceOver on a real iPhone; notifications for a
reply (unchanged by design — a reply is an ordinary post); production.

Owed and noticed, not changed:

- The topic rows on a room page still draw "0 views" (the zero-count
  bullet under step 2).
- A conversation with two messages sits at the bottom of a tall empty
  panel at 430, as it always has.
- Step 3, Likes, is built; see the next section.

## Home, step 3 — built 2026-09-30, migration on the live database the same day

Step 3, "Likes" — HOME-PLAN.md decision 4, likes with names shown to every
member who can read the room. A Like button on a photograph's card on Home
and on every post and reply in a topic; a count beside it once anybody has
liked it; the count opens the list of who.

**The order of release was kept.** The migration
`20260930010000_a_member_likes_a_post.sql` and its probe
`supabase/tests/chat-post-likes.sql` were committed first (`fb74a56`); the
owner pushed the migration on 2026-09-30 after the dry run listed it alone;
only then did the client land, four commits, each with `pnpm test`,
`pnpm check` and `pnpm build` clean on its own (1,431 tests at the end):
the likes library (`a8bfa5c`), the button and the list (`615188a`), the
topic page (`10b510c`), Home (`6c7f6f5`). Pushed to GitHub on 2026-09-30,
at the owner's word, and live.

The migration: one table, `chat_post_likes (post_id, member_id, liked_at)`,
primary key on the pair, the row being the whole fact (the shape of
`organization_follows`). One select policy — the post's room is readable
(`chat_room_is_readable`), so a closed room's likes are invisible to a
member as its posts are, and a suspended member still reads them. Insert:
as yourself, `is_active_member()`, a standing post that is not your own, in
a readable room. Delete: your own row. Insert granted by column
`(post_id, member_id)`, no update grant, not in the realtime publication, no
notification, no function. Removing a member or deleting a topic takes the
likes by cascade.

The client: `src/lib/chat/likes.ts` (`usePostLikes` — one read of
`post_id, member_id` for the posts on screen, so the count and the names
are the same rows; `likePost`, an insert with `ignoreDuplicates`;
`unlikePost`), `src/routes/chat/like-button.tsx` (`LikeButton`,
`LikesSheet`, and `PostLikes`, which both screens draw). The toggle is
optimistic and put back with a sentence under the post if the write fails;
a second tap on a post while its first write is in flight is ignored.
Likes are not live: the topic page reads them again whenever it reads its
posts.

Where the build differs from the plan, on purpose:

- **Controls are named for their post**, as step 2b's are: "Like Jan's
  post", "Liked Jan's post. Press to take it back.", "3 likes on Jan's
  post. Show who."; on Home, the topic's title in place of the post. The
  owner chose this on 2026-09-30 over the plan's bare "Like".
- **The thumb is solid navy when liked.** The mock fills it with a pale
  tint, which on paper is next to invisible; the word carries the state
  either way.
- **`PostLikes` is the button, the count and the sheet together**, drawn
  from `post.tsx` and `photo-card.tsx`, so neither screen wires the sheet
  itself. The sheet is `fixed`, like the photograph viewer, because it opens
  from inside a card or a post.
- **Sentences the plan did not write:** the list's title "Who liked this",
  and "Your like is still there." when taking a like back fails.
- The plan's order of release said the dry run would also name
  `20260929000000`; it was already live, and the list held the one file.

Checked on the local stack (the dev server on 5183, confirmed pointing at
127.0.0.1:54321): the new probe as signed-in members, all twelve steps as
expected, and a rolled-back run with the policies loosened flipped steps 3,
6 and 9. Every probe run twice, with and without the new table in the same
rolled-back transaction: the outputs are identical but for one flaky step
(below). All 29 run again on a throwaway second stack started fresh from
every migration: 21 read exactly as expected, the new one among them; the
other eight are older faults, below. In the app, by a Playwright script
kept in the session's scratch folder, 31 checks: Alex replied to Sam's
photograph and liked it; Jan liked it on Home (pressed at once, 2 likes,
still there after a reload), opened the list (Alex then Jan, focus on the
title, Tab kept inside, Escape closes, focus back on the count), found the
same count and state in the topic, liked Alex's reply, opened its list,
unliked the reply (no count drawn) and the photograph (1 like), and Home
agreed; Sam saw no Like on their own photograph and the count still. axe
clean on Home and the topic with the list open and closed. Screenshots at
430, 1280 and `--text=larger`, all read; 320 wide with larger text, no
sideways page scroll. **Not checked:** VoiceOver on a real iPhone;
production.

Owed and noticed, not changed:

- The probes that did not read as expected here are fixed: see "Home, step
  3b".
- **A probe with several transactions must not be wrapped in one.**
  `claim-carries-profile.sql` has three; stripping their `begin;` to wrap
  the file committed its second and third blocks to the local database
  (two test members and their invites, removed by the owner afterwards).
- On a local stack with rooms opened and topics written, the unscoped counts
  in `chat-rooms.sql`, `chat-posts.sql`, `chat-direct.sql` and others read
  wrong while the policies hold. A fresh stack is the fair reading: copy
  `supabase/` elsewhere, change `project_id` and the ports, `supabase start
  --workdir` it.
- Locally, Alex's avatar is a broken image (the photo path has no file in
  local storage). Local data only.
- Step 3b came next, at the owner's word; step 4, "Filter your feed", is
  after it. It has no migration.

## Home, step 3b — built 2026-09-30, migration on the live database the same day

HOME-PLAN.md step 3b: the probes, one storage policy, and Like on every
topic card on Home. Three parts, committed in the plan's order — probe
fixes, then the migration and its probe, the owner's push, then the
client. Since pushed to GitHub, and live.

**Part 1, the probes.** Every one of the 30 in `supabase/tests/` reads as
expected on a stack started fresh from all 85 migrations, twice, with the
two runs identical once ids and times are masked (and but for where
psql's error lines fall among the others, which varies) (step 3 counted 29; the
thirtieth is `chat-group-rename.sql`, from the side job). Every log was
read against its own `expect:` lines, which found seven files beyond the
eight step 3 named. What was wrong, and the fix:

- Text that no longer said what the step prints: `blocked-numbers.sql`
  step 10 (a uuid), `chat-groups.sql` steps 10 and 14, `chat-member-rooms`
  14, `chat-direct` 2, `chat-edits` 8, `chat-posts` 1 and 11, `chat-reports`
  0a, `topic-removal-and-deletion` 4 (the order was always "Starter,
  Replier", by first standing post; the query was already ordered).
  Several promised "a uuid" from a `\gset`, which stores and never prints.
- `chat-groups` 14: evicting somebody else is a silent `DELETE 0`, which is
  right; the step now reads Bo's row back as the superuser to prove it
  stayed.
- `restore-directory`: counts `directory_seed` instead of expecting 22.
- Ties on `now()`: `chat-member-removed` (posts a second apart; step 7
  scoped to its own two threads, since unscoped it listed every
  conversation on a local stack) and `chat-posts` (the opening post moved
  a second back — **not the reply forward**, which was the first attempt:
  it put the topic's activity after step 7b's read and 7b read unread t).
- `claim-preview` step 1 could not fail. Ajay's id is now read as the
  superuser before the role switch, and step 1b runs the same lookup as
  an active member. **Sabotaged to prove it**: with `browse_members`'
  viewer check dropped inside the probe's transaction, step 1 printed 1;
  the old step 1, under the same sabotage, still printed 0.
- `chat-group-rename` 17 read 0 then 0 on a fresh stack, which has no
  `push_notify_url`. The step makes one inside its transaction when it is
  missing, pointing at the discard port; the rollback takes it and the
  queued request, and pg_net sends only what commits.
- `photo-cleanup` 1: three delete policies. See part 2.

A file with several transactions is run as written, never wrapped:
`claim-carries-profile.sql` has three, each rolled back.

**Part 2, `20260930030000_chat_storage_policies_name_their_role.sql`.** The
chat bucket's read, upload and delete policies are made again with `to
authenticated` and nothing else. Before, a signed-out visitor was refused
with "permission denied for function chat_file_is_readable"; now a read
returns nothing and a write is a row-level security refusal. Checked:
`pg_policies` before and after on the local stack differ only in the
roles; `pnpm check-chat-photo-policy` passes all 14 against it;
`chat-attachments.sql` reads the same before and after. `photo-cleanup.sql`
step 1 expects three delete policies, **the photos bucket's member policy
still `{public}`** — the owner's call on 2026-09-30, since it calls only
`auth.uid()` and `storage.foldername()`, which anon may run; 1b lists the
chat bucket's three, each `{authenticated}`; 7 asks as anon. Pushed by the
owner after the dry run listed it alone.

**Part 3, Like on every topic card.** `TopicCard` takes `likes` as
`PhotoCard` does (the shape is `CardLikes`, exported from
`topic-card.tsx`), and Home reads likes for every opening post, not the
photographs' only. The card is a stretched link, so **the two buttons are
`relative`**, which paints them over the link's pseudo-element; the row
around them is not, so its gaps and the reply count still open the topic.
Both alternatives were tried in a browser: without `relative` the link is
what sits under a finger on Like and the tap opens the topic; the plan's
`relative z-10` on the row traps the likes sheet in the row's stacking
context, and the tab bar and the next card's buttons covered its Close.
The header of `topic-card.tsx` says so.

Checked on the local stack (the dev server on 5183, confirmed pointing at
127.0.0.1:54321), by a Playwright script in the session's scratch folder,
32 checks at 430 and 1280: Like is on top where a finger lands; a raw tap
at its centre counts (0 to 1) and stays on Home; still liked after a
reload; Tab goes from the title to Like; the list opens above everything,
names Alex, Escape closes it and focus returns to the count; axe clean on
Home with the list open and closed; the topic page shows the same count;
taking it back restores the count; a tap elsewhere on the card opens the
topic; photo cards keep their likes. Tests: eight new in
`topic-card.test.tsx`, and two in `page.test.tsx` that were seen to fail
against the old page. Screenshots at
430, 1280 and `--text=larger`, read; 320 wide at larger text, no sideways
scroll. Likes made while checking were taken back. **Not checked:**
VoiceOver, production.

Noticed, not changed: the accessible name reads "3 likes on Morning or
evening routine?. Show who." — a title ending in a question mark gets a
full stop after it. The plan's wording, and the photo card's since step 3.

## Home, step 4 — built 2026-09-30, pushed the same day (the report sheet's fix after it, also pushed)

HOME-PLAN.md step 4, "Filter your feed". No migration. Three commits, each
with `pnpm test` (1,498 at the end), `pnpm check` and `pnpm build` clean:
the rules (`066f38b`), the sheet (`128dd3a`), the page (`ef42789`).

- **`src/routes/home/filters.ts`**, pure: `roomsOf` and `cityOf` say what
  one card belongs to, `matchesFeedFilters` keeps or drops it, `roomsIn`
  and `placesIn` build the chips from a list, `chipsFor` is what the sheet
  draws, `activeFilterCount`, `toggleFeedFilter`, `openRoomsById`. What
  matches is the plan's table: a topic or photograph by its own room, and
  by its author's city only when the author is in Peers (`browse_members`
  on Home, already read for People); an event in Adaptive sport only when
  `isSport` and only while that room is open, and Online by `isOnline`
  (hybrid counts); a member in every open room `roomsForTopics` names, and
  their city. Within a group a choice widens, across groups it narrows.
  Rooms come from the open rooms something in the list belongs to — no
  membership, since step 2b there is none.
- **`src/routes/home/filter-sheet.tsx`** on `FilterSheetShell`: Rooms in
  Chat's order, then Where (cities most common first, Online last), then
  the mock's note. `--ink2` on `--gold-lt` for the note, a new pair in
  `theme-contrast.test.ts` (Events' note is a hex; not copied).
- **The page**: Events' 38px button with the gold dot and "Filters, 2
  active"; filters in component state, so they carry across pills and a
  visit starts with none.

Where the build differs from the plan, or says what the plan did not:

- **The filter narrows the list a pill drew**, after `inSegment`, not the
  sources before the mix. So "2 of 8 match" is two of the eight cards on
  screen. The cost: Everything mixes in four events at most, so a city can
  show one event on Everything and three on Events. The mock does the same.
- **The summary's second number is the pill's list**, not the whole feed
  as in the mock ("6 of 28" on Everything, "0 of 7" on Events).
- **A chip that is on is always offered**, even on a pill where nothing
  matches it. The plan's "only offered if something would match" would
  otherwise hide a chosen city on a pill it empties, leaving Clear as the
  only way to turn it off.
- **Online is a flag**, not a string among the cities, so a member whose
  city reads "Online" is not an online event.
- **With a city chosen, Topics and Photos wait for the members read**, as
  a topic is placed by its author's city; otherwise they drew "Nothing
  matches" and then filled in.
- **Sentences the plan did not write:** "1 of 31 matches" (singular), and
  "Nothing in this list has a room or a place to narrow by." when a pill
  offers no chip at all.

Checked on the local stack (the dev server on 5183, confirmed by fetching
`src/lib/supabase.ts` from it to inline `http://127.0.0.1:54321` and the
local key), by Playwright scripts in the session's scratch folder, signed
in as Jan (a member), with the Adaptive sport room opened and four sport
events tagged locally for the look and **put back afterwards** (room closed,
`event_tags` empty again, as it was). At 430 and 1280, two pairs —
Bowel management + San Jose, Adaptive sport + San Francisco — on all five
pills: every pill narrowed, the sheet's first number equalled the cards
behind it and its second the unfiltered pill (6 of 28, 5 of 14, 1 of 7,
0 of 7, 0 of 6; 2 of 28, 0, 0, 3 of 7, 1 of 6), every card kept was one
from before, an empty pill said "Nothing matches that yet. Try fewer
filters.", and Clear gave back each pill card for card. 71 checks, none
failed. As Alex, the administrator, no closed room is ever a chip. axe
clean on the open sheet, two filtered lists and four empty filtered pills.
Screenshots at 430, 1280 and `--text=larger` at 430, 1280 and 320, read;
no sideways page scroll with the sheet open. Tests: 23 for the rules, 8 for
the sheet, 6 on the page; two sabotages of the rules and two of the page
(drawing the unfiltered list; not waiting for members) each failed them. **Not checked:** VoiceOver, production.

**The filter sheet moved no focus, here and on Events and Peers — fixed
at the owner's word, `a2753e4`.** "What is next for accessibility", item 2,
said `filter-sheet-shell.tsx` did it right; it did not. It had
`role="dialog"`, `aria-modal`, Escape and the backdrop, but opening it left
focus on the Filters button behind it, Tab walked the page behind the
backdrop, and closing put nothing back. Measured on Home as Jan: 85 Tab
presses after Enter on Filters to reach the first chip.

Now, in the shell, so all three sheets have it: the title (`tabIndex=-1`,
and what names the dialog through `aria-labelledby`) takes focus on open;
Tab and Shift+Tab go round the sheet's own buttons, skipping a disabled
Clear and the panel's Close where a phone hides it; the backdrop is out of
the Tab order (still a named button for a pointer); and the shell puts
focus back on whatever had it when it unmounts, so no screen has to hand
it a ref. The likes list's rules. Tests: eight in
`src/components/filter-sheet-shell.test.tsx`, six of which fail against the
old shell and two against the shell with only the loop removed. In the
browser, by keyboard only, on Home, Events and Peers at 430 and 1280 (54
checks, none failed): Filters reached by Tab, the title focused on open,
the next Tab on the first chip at 430 (on Close, then the chip, at 1280),
round the sheet and never out, Shift+Tab from the title to Show, Escape and
Show each putting focus back on Filters, a chip chosen by Enter, and axe
clean with each sheet open.

**The report sheet moved no focus either — fixed at the owner's word.** It
was named as the pattern alongside the shell and had the same gap. Three
commits:

- `c517393`: the rules move out of the shell into **`useDialogFocus`**
  (`src/lib/dialog-focus.ts`), unchanged but for also going round text
  fields. The shell's tests and its three screens' pass untouched.
- `7ada33f`: `report-sheet.tsx` uses it — the title on open, Tab round the
  note, Cancel and Send report, the backdrop out of the Tab order, focus
  back on Report after Cancel or Escape. Six tests in
  `report-sheet.test.tsx`, all six failing against the old sheet.
- `8577087`: **`ReportControl`** (`src/routes/chat/report-control.tsx`),
  now drawn by `post.tsx`, `message-bubble.tsx` and `notice-line.tsx`. After
  a report is sent the screen reads the reports back and Report becomes
  "Reported"; focus given back to a button that then leaves the page falls
  to the top of the screen. "Reported" (`tabIndex=-1`) takes focus when it
  replaces a Report pressed there and focus has fallen to the page, and
  never when a screen opens on something already reported. Five tests, two
  rules each seen to fail by sabotage; the topic page's test stub now reads
  back what was sent, and a new test there fails against the old post.

Checked on the local stack as Jan, by keyboard only: one of Sam's posts at
430 and one of Sam's messages at 1280 — title focused on open, Tab round
the note and both buttons six times and never out, axe clean with the sheet
open, Escape back on "Report Sam's post" / "Report Sam's message", a report
sent by Enter, focus then on "Reported" with its ring drawn, and the next
Tab going on from there. The two local report rows were deleted afterwards
(six in `chat_reports`, as before). **Not checked:** VoiceOver.

Noticed, not changed: the filter button is now written three times
(Peers at 34px, Events and Home at 38px).

## Home, step 5 — built 2026-09-30, pushed the same day

HOME-PLAN.md step 5, "Home is the first screen, and the documents say so".
No migration, so it releases with a push alone. Each commit with
`pnpm test` (1,522 at the end, in 103 files), `pnpm check` and `pnpm build`
clean:

- `dea331b`: `/` goes to `/home` (`App.tsx`, the comment above it
  rewritten). `src/App.test.tsx` is new: the real routes and the real door
  at `/`, the screens stubbed, and it drew Peers against the old line. The
  manifest's `start_url` stays `/`, and so do the notifications' fallbacks,
  so an installed app and a tapped notification with no path both follow.
- `04835f5`: onboarding's three navigations — a member signing in, a new
  member finishing (or Finish later), somebody already in opening `/join` —
  go to `/home`. The test file renders real routes now; three tests say
  where somebody lands, and all three failed against the old code.
- `ecc7048`: the not-found page's button is "Go to Home" and goes there, an
  ordinary member opening `/admin` lands on Home, and `/dev-login` with no
  `next` lands on Home. dev-login had no test; it has two.
- `eaab657`: `app-nav.tsx`'s header comment.
- Then CONTEXT.md, this file, and HOME-PLAN.md's status note.

Before it, the report sheet's focus fix the brief asked for was found
already done and live (`7ada33f`, `8577087`, in "Home, step 4"). It was
checked rather than redone: the six focus tests in `report-sheet.test.tsx`
were run in a scratch worktree against the sheet as it was before
`7ada33f`, and all six failed. `3443eb9` corrected the sentences here that
still called the report sheet the pattern, or its fix unpushed.

Checked on the local stack (the dev server on 5183, confirmed by fetching
`src/lib/supabase.ts` from it: it inlines `http://127.0.0.1:54321` and the
local key), by a Playwright script in the session's scratch folder, 37
checks at 430 and 1280, none failed: signed out, `/` goes to `/join`;
signing in as Jan lands on `/home`, titled "Home · The SCI Club"; signed in,
`/` opens `/home`; `/no-such-place` says "Page not found", axe clean, Tab
reaches "Go to Home" and Enter lands on Home; Jan opening `/admin` lands on
Home; `/dev-login` with no `next` lands on Home. The report sheet on a topic
page, keyboard only: Tab from the top of the page to "Report Sam's post",
Enter opens it with focus on the title, eight Tabs go round the note,
Cancel and Send report and never out, Shift+Tab from the title stays
inside, axe clean with it open, Escape and Cancel each put focus back on
"Report Sam's post", and at 430 a report sent by Enter leaves focus on
"Reported". That report row was deleted afterwards (`chat_reports` back to
6).

**A new member finishing onboarding** could not be done on the working
stack: all three test numbers already have member rows. It was done on a
throwaway stack started fresh from every migration (`supabase/` copied to
the scratch folder, new `project_id` and ports, `start --workdir`) with a
second dev server on 5184 pointed at it and confirmed the same way: from
`/` signed out, Join the club, the seeded invite for `11111111111`, "Start
fresh" on the claim, a name, a birthday, Finish later — landing on `/home`
with Home drawn and a member row written. The stack and the server were
stopped and the stack's volumes removed; the working stack was not touched.

Screenshots read: Home just after signing in at 430, the not-found page at
1280 and at `--text=larger` at 430, the report sheet open and just sent at
430, and the new member's Home. **Not checked:** VoiceOver; production; an
installed app opening from the Home Screen (it opens `/`, which redirects,
but no phone was tried).

Noticed, not changed:

- The not-found page says "Everything in the club is reachable from the
  tabs below." At 768px and up the tabs are a top bar. Older than step 5.
- On a club with no open rooms and no events, a new member's Home is the
  compose card and three "Worth meeting" cards. That is the fresh stack;
  the owner says every room is open on the live club.

## Home, step 6 — built 2026-09-30 to 2026-10-01, both migrations on the live database

HOME-PLAN.md step 6, the photos bucket, in two parts released differently.
`pnpm test` (1,542 at the end, in 105 files), `pnpm check` and `pnpm build`
clean before every commit. All looking was on the local stack: the dev
server on 5183, confirmed by its process environment and by fetching
`src/lib/supabase.ts` from it, both naming `http://127.0.0.1:54321`.

**Part 1, limits — `20260930040000`, on the live database since 2026-09-30.**
The live bucket was listed first, read-only, through the storage API with
the service key: 49 files (the plan's 50 less one), the largest 329KB, 28
webp, 15 PNG, 6 JPEG — nothing over 2MB and nothing of another type. The
migration sets `file_size_limit` 2MB and webp, JPEG and PNG, the chat
bucket's numbers, and touches nothing else. The owner pushed it after a
dry run that listed it alone. Commits:

- `d3d59d0`: the migration; `photo-cleanup.sql` step 8 reads the row back
  (empty before the migration was applied, the two limits after).
- `449d8d9`: `check-photo-policy` uploaded `probe.txt` as text/plain and
  ignored the result — against the limit, two checks failed and two passed
  with no file there. It puts a PNG now, stops if refused, and has an
  over-size and a wrong-type upload refused through the API (each failed
  with the limits cleared).
- `a25ed00`: `pnpm logos --upload` refuses an SVG before trying. No live
  logo is one; an SVG can carry script.
- `1dda5b3`: the details form left a refusal under the photograph that
  replaced it, "not saved" about one that was. `onPhoto` clears it.
- `472d2e8`: onboarding's **Skip for now uploaded the photograph it
  skipped** — it `set` the file away and submitted from the same render.
  `finish` takes the skip as a patch.
- `a88d1bb`: onboarding dropped a refused photograph in silence and
  entered the club. **The owner's call, 2026-09-30**: "Enter the club"
  uploads first; if storage refuses, the member stays on the photo step
  with the sentence, the file let go and no member row written; "Skip for
  now" still lets them in.

The refusal sentences were seen in Chromium on the local stack with files
it cannot shrink (a HEIC, a 3MB undecodable JPEG — anything it can read
it shrinks under the limit): "That file is not a kind of photograph the
club can hold" and "still too large after shrinking", on the details form
and, on a throwaway stack with a new member, on onboarding's photo step at
430, 1280 and `--text=larger`.

**Part 2, private — the owner's choice, 2026-09-30.** Released in the
reverse of every other step's order, as the plan said: client, then
migration.

- `fd5d69e`: `photoUrlFor` is gone. `usePhotoUrls` / `usePhotoUrl` in
  `src/lib/photos.ts` sign through the chat bucket's cache, which takes
  the bucket as a parameter (default `chat`). Paths asked for before the
  next turn of the event loop go in one `createSignedUrls` per bucket, and
  a path already signed is there on the first render. Every caller moved;
  the organization page's member list draws `MemberAvatar` instead of its
  own copy of it, and two hooks moved above early returns (details form,
  profile).
- `6b0d59e`: signed URLs for `photos` are kept in `localStorage`
  (`thesciclub.signed-photos`) until they expire; chat's stay in memory, as
  they open private conversations' photographs. `signOut` clears them —
  nothing called the cache's reset before.
- `6b2edd6`: `reprocess-photos` downloads through the storage API.
- **The owner pushed to GitHub at `6b2edd6` and saw every face draw on
  production** before anything closed.
- `692e1b3`: `20261001000000`. `public = false`; one select policy, `to
  authenticated`: a member (suspended included) reads everything; **any
  signed-in account reads `organizations/` and its own folder**; **somebody
  mid-signup reads the photograph of the profile they may claim**, through
  `photo_is_my_claimable()`, which asks `my_claimable_profile()`. The logo
  and claim reads were the owner's calls, 2026-10-01 — the turned-away
  screen draws logos and the claim card a face, both for somebody who is
  not a member. **The own-folder read was not in the plan and is
  necessary**: storage refuses an upsert without a select policy on the
  row, even a first upload, and onboarding uploads with upsert before the
  member row exists. Tried without it: a plain upload stored, an upsert was
  refused. The owner pushed it after a dry run listing it alone, and
  confirmed the bucket closed.
- `6458195`: `check-photo-policy` has the read side — 14 checks, all
  passing; without the own-folder read the upsert check failed, and with
  the bucket public again the public-URL check failed.

**The probes.** `photos-bucket-reads.sql` is new (see the table). Before
the migration every one of its six readers, anon included, read all five
files; after, each reads what its `expect:` line says, the same on the
working stack and a fresh one. With the claim clause sabotaged inside its
transaction, step 5 lost "claimable". All 31 probes ran on a fresh stack
before and after the migration: only the two photo probes differ, beyond
the random four-character suffixes on rooms.

**What was looked at.** The local bucket was empty, so it was filled with
generated stand-ins (see Environment). Signed in as Alex, a Playwright
script visited Peers, a profile, Me, Home, a topic with a photograph and
a poster with a face, an organization page and Events, at 430, 1280 and
`--text=larger`, before and after the bucket closed: no image broken, none
on a public URL; screenshots read. The deck's faces sign in one request,
logos in a few small ones as their badges appear. On a throwaway stack,
with the bucket private: the turned-away screen draws both logos, the
claim card draws the seeded face, and a new member's photograph uploads
at signup (200) and draws on Me. The old public URL answers 400, and a
signed URL works until it expires, then answers 400 (signed for three
seconds to show it; the app's last an hour).

**The Peers deck's first paint, before and after.** A production build
pointed at the local stack (the dev server's unbundled modules made a
throttled load take 14s), 430 wide, Chromium with 150ms of latency and
1.25MB/s, the median of 7 runs, the time until every face in view has
loaded:

| | before (public URLs) | after (signed) |
| --- | --- | --- |
| Cold load | 1,516ms | 1,672ms |
| Reload | 576ms | 570ms |
| Home → Peers within the app | 406ms | 409ms |
| Cold load, no added latency | 204ms | 223ms |

The cold load pays one round trip to sign, and cannot avoid it: the paths
are not known until the rows arrive. Signing "earlier, in
`useBrowseMembers`" would save only the moment between the rows and the
cards mounting, so it was not built. **The reload was the real cost**:
1,064ms with the cache in memory only, because a reload re-signed every
face and a new token is a new URL to the browser, so every photograph was
downloaded again. Keeping the URLs (`6b0d59e`) brought it to 570ms. The
stand-ins were re-uploaded with `max-age=3600`, as supabase-js uploads
production's, before the final numbers; with `no-cache` the "before"
reload looked slower than it is.

**Not checked:** an iPhone (Playwright has no WebKit here), VoiceOver,
and production beyond the owner's own look. Not built: a public bucket of
its own for logos — the plan's alternative, unnecessary once any
signed-in account may read them.

Noticed, not changed:

- **"Start fresh" on a claim still carried the seeded profile's photograph
  and bio** (`consume_invite_for_new_member` copied whenever the invite
  named a seed), against its own fine print. The owner said leave it, then
  asked for it later the same day: see "Start fresh carries nothing".
- After a refusal on onboarding's photo step, focus is on the page body,
  as after every onboarding error: the button is disabled while
  submitting. The sentence is an alert, so it is announced.

## Group names and pictures — built 2026-09-30, live the same day

The owner asked for it on 2026-09-30 ("allow people to rename group chats and
add photos to group chats") and answered four questions the same day:

- **"Add photos" means a picture for the group itself**, on its tile in the
  Chat list and at the top of the conversation. Photographs in a group's
  messages already worked (decision 11, 2026-09-21).
- **Anybody in the group** can rename it or change its picture. A group has
  no owner, as for adding people.
- **An event's group keeps the event's name** and takes no picture.
- **Every change leaves a line in the conversation**: "Jan renamed the group
  to “Tuesday swimmers”", "Jan changed the group’s picture", "Jan took the
  group’s picture away".

How it is built (`20260930020000`, its header says why each part is shaped as
it is):

- `chat_rename_group(group_thread, new_name)` and
  `chat_set_group_picture(group_thread, picture_path)` (null takes it away).
  Both definer; both check an active member in the group, a group, not an
  event's; whitespace in a name collapses as a room's does.
- **The line is a `chat_messages` row with `notice` set** (`renamed`,
  `pictured`, `unpictured`), written by those two functions only: `notice` is
  not in the column insert grant, so it cannot be forged. So it is in time
  order, arrives over the realtime the thread already has, counts as unread
  for everybody else, and moves the group up the list. A notice cannot be
  edited, removed by its author (an administrator still can), or replied to,
  and it sends no notification.
- **The picture is a file in the group's own folder**, `threads/<id>/` in the
  private `chat` bucket, so the storage policies already there keep it as
  private as the words; `pnpm check-chat-photo-policy` passes. The function
  checks the file is the caller's own upload in that folder. A `pictured`
  line carries the path, which is what lets a report hand the picture to the
  administrators and keeps it undeletable once reported.
- `chat_my_threads` gains `photo_path` and `last_notice` (dropped and made
  again; the old client ignores the extra columns, so the migration can go
  first). A reported notice reaches `/admin` as a sentence, "Changed the
  group’s picture", with the picture.

Client: the members screen (`/chat/t/:id/members`) is headed by the group's
picture and name, with `GroupIdentity` (Rename the group, Choose or Change the
picture, Take the picture away) above the members; nothing is optimistic.
`NoticeLine` draws a notice in a conversation, with Report on somebody else's.
`GroupAvatar` takes a signed URL; the Chat list signs every group's picture
in one call. `noticeText` words a notice once for the line and the list.

Checked on the local stack: `supabase/tests/chat-group-rename.sql` (17 steps,
as a member; steps 3, 7 and 10 carry it); the chat, reports, attachments and
push probes still come out as they expect; Jan renamed a group and set a
picture while Alex had it open, and Alex's header, lines and list changed live;
Alex reported the picture line and `/admin` showed it; screenshots at 430,
1280 and larger text; axe clean on the conversation and the list; a keyboard
walk (focus goes into the name when the form opens, back to the button when it
closes, and to the picture button when the picture is taken away). **Not
checked:** production, and VoiceOver.

Noticed, not changed: axe flags `link-in-text-block` on the members list —
the member's name is a navy link beside "— you" with no underline. It was
there before this; the fix is an underline on that link.

## A photograph from an iPhone was refused — fixed 2026-09-29

The owner tried to put a photograph on a topic from Safari on their iPhone,
once Home was live, and read "Something went wrong. Try again in a minute."
Two faults, both older than Home, one behind the other:

1. **The shrink fell back to the original file on WebKit.** Safari, and
   every browser on an iPhone, cannot write webp from a canvas;
   `toBlob('image/webp')` hands back a PNG without complaint.
   `preparePhoto` caught that and returned the **original** — which for a
   profile photograph is merely large (the `photos` bucket had no limit
   until `20260930040000`),
   and for a chat photograph is refused, because the `chat` bucket takes 2MB
   and a phone's JPEG is usually more. The live bucket showed it: every
   photograph sent from a phone before the fix sits in `chat/threads/…` as
   `image/jpeg` at 440KB–1.26MB — originals that happened to fit — and
   `chat/rooms/` had nothing at all. Now `preparePhoto` tries webp, then
   **JPEG** at the same size and quality, and only then the original; and it
   asks `createImageBitmap` again without the orientation option if a
   browser refuses it (`src/lib/image.ts`, four new tests).
2. **The refusal read as "Something went wrong" instead of "too large".**
   `describeError` sorted every error with a `code` as unknown before it
   looked at storage's wording, and storage-js copies the API's own code
   ("EntityTooLarge", "InvalidMimeType") onto its errors. The tests had
   fixtures with no code — the trap this file names under "Errors read as
   sentences" — so they passed while the real thing did not. Storage errors
   are now sorted by name and wording first, the fixtures carry the codes
   provoked from the local stack and the hosted project, and a sabotage run
   showed four tests fail without the fix.

Chromium is unchanged (webp as before). **Checked on the owner's iPhone,
2026-09-29, after the deploy**: a photograph went onto a topic, and the live
bucket holds it at `rooms/…/….jpg`, `image/jpeg`, 843KB — the JPEG path,
since a phone cannot write webp, and the first file `chat/rooms/` had ever
received. Playwright has no WebKit here, so the phone stays the only test of
this path; a conversation photograph from a phone has not been tried since
the fix.

## Still open

- **An hour with VoiceOver on a real iPhone**, then the rest of "What is next
  for accessibility, in order" — `photo_alt` is read by every avatar and
  written by nothing, a save that worked announces nothing. (The photograph
  viewer became a dialog on 2026-09-29.)
- **The owner's iPhone test of notifications**: add to the Home Screen, sign
  in there, turn on, close the app, have somebody send a direct message.
- **Staying Driven Wheelchair Fitness** still has no format; ask NorCal SCI
  (see "Next up: the owner's call").
- **Signed photographs on an iPhone.** Every face and logo is a signed URL
  since 2026-10-01, and Playwright here has no WebKit. The owner saw
  production drawing in their own browser; a phone has not been tried.

## Standing rules this session learned

- **Gate every push on `pnpm check`'s exit status**, run on its own. Twice a
  push went out after check failed, because `pnpm check | tail` takes `tail`'s
  status and `;` does not stop — both times over an untracked local file.
- **A session cannot write to the live database.** `supabase db push` to the
  hosted project was refused by the permission system twice, even with the
  owner's go-ahead: the owner runs it, after a session has run `--dry-run` and
  shown the list. Push migrations *before* the code that needs them — a
  button calling a function that is not there yet reads "The club is being
  updated".
- **The owner's terminal needs Node 24 for `pnpm`** — the system Node is 22
  and has no pnpm. `nvm use 24`, or `nvm alias default 24` once.

---

## What this is

**The SCI Club** — a private, invite-only PWA for people living with spinal
cord injury. Vite 8 / React 19 / TypeScript strict / Tailwind 4 / Supabase /
Vitest, pnpm, Node 24.

Branch `scaffold-and-peers-deck`. Work happens here and lands on `main` by
push; do not commit to `main` directly.

**`Able-Bodied/thesciclub` (`origin`) is the home of record, as of 2026-09-18.**
The owner got write access that day and moved everything to it. `origin/main`
carries the whole history — 212 commits went across in one fast-forward, clean
because `origin/main` sat at `851fcb1`, an ancestor of the branch, with nothing
on it that was not already here.

**`Alfredx48/TheSciClub` (`personal`) is retired and is no longer a remote.**
It was the home of record while `origin` was read-only, and for a few days it
was production: Netlify built from it and the nightly ingest ran from it. It was
removed on 2026-09-18 once `origin` held everything — checked before removing,
with `git rev-list --count origin/main..personal/main` returning 0, so nothing
existed there that is not here. The repository itself still exists on GitHub
with its Event ingest workflow disabled; it is simply not wired to anything.

**There is one remote now and both branches track it.** That is worth stating
because the failure it prevents is silent: a branch left tracking a retired
remote makes a bare `git push` succeed against a repository nobody reads, and
nothing anywhere reports it. Check with:

    git config --get-regexp '^branch\..*\.remote'   # every line should say origin

**The handover is complete and every part of it was verified the same day.**
Four things had to move, and the first three are the ones that break *quietly*
— none of them raises an error when it is wrong, so each was checked by
observing the thing itself rather than by assuming the setting took:

| what | state | how it was checked |
| --- | --- | --- |
| Netlify's connected repository | repointed at `origin` | the deployed bundle contains strings that exist only in the day's commits, and none of the copy removed that day |
| The two ingest secrets on `origin` | set | a dry run reported "93 usable, 0 new or changed" — a comparison it can only make by reading the live database |
| The Event ingest workflow | enabled on `origin`, `disabled_manually` on `personal` | `gh workflow list` on both |
| GitHub Pages | untouched, still building | `status: built`, CNAME and source intact |

Check a sha with `git ls-remote --heads origin` rather than trusting one
written here.

**All five surfaces are built, and the app is live** at
https://thesciclub.netlify.app/ — see "Hosting on Netlify". Peers (deck,
profiles, filters), onboarding + the profile survey, and Events (list, detail,
RSVPs, organizations, series collapsing) with 125 real events ingested from
NorCal SCI's and AdaptiveRecHub's live calendars. Also: admin tools, the invite
system, an 18+ gate, a details editor, and a three-strike system behind Good
standing.

**Chat is the fourth and is live** — conversations, groups, rooms, reporting,
rooms a member starts, and photographs. Its twenty-two migrations have been on
the hosted project since 2026-09-23; the section below says how to check that
rather than trust it. See "What Chat is".

**Home is the fifth, and where the app opens** — built in steps from
2026-09-29 to 2026-10-01, every step live. See "What Home is".

1,542 tests pass, in 105 files (2026-10-01). `pnpm check` and `pnpm build` are clean. **Keep
them that way — do not commit with either failing.**

## 87 migrations, all of them on the hosted project

**As of 2026-10-01 the hosted project (`erijdvqnxavwezsbbojv`) and
`supabase/migrations/` agree: 87 applied, 0 pending** (75 on 2026-09-23,
then the twelve listed below). For weeks before
2026-09-20 the hosted database was ahead of `origin`; from the 20th to the
23rd it was the other way round, with the whole of Chat applied locally and
nowhere else; the owner pushed the twenty-one Chat migrations between
sessions, and the twenty-second (`20260923000000`, photographs on a new
room's first post) went up on the 23rd with their word. Check rather than
trust — a blank `Remote` column is a pending migration:

    pnpm exec supabase migration list          # hosted
    pnpm exec supabase migration up --local    # bring a local stack up

`pnpm exec supabase db push --linked` is what sends them and **the owner is
asked first**, every time: it writes to the live database that real members
are in. `--dry-run` first, so the list of what will go is read before it goes.
Never `config push` — see Environment for why that one is dangerous in a
different way. After a push that adds a realtime table, confirm Realtime is
enabled on the hosted project, in the dashboard: a publication with the
service switched off is the failure Environment describes, every
subscription SUBSCRIBED and delivering nothing.

The twelve since 2026-09-23, each pushed by the owner after a dry run that
listed it, oldest first — the sections named say more:

| migration | what it adds |
| --- | --- |
| `20260927000000` | `push_subscriptions` and `push_subscribe` — see "Notifications on an iPhone" |
| `20260927010000` | the three mute tables, `push_owed`, `push_forget` and the trigger that notifies on messages and replies |
| `20260927020000` | the six later kinds of notification, `push_daily()` and the badge count |
| `20260927030000` | a removed reply in a topic is left out and stops counting |
| `20260927040000` | `admin_delete_topic` |
| `20260929000000` | `admin_invites` stops reading `auth.users` — "Supabase's security email" |
| `20260930000000` | Home step 2b: rooms open to write without joining, editing with `chat_edits`, replies under a post and quotes in a conversation |
| `20260930010000` | Home step 3: `chat_post_likes` |
| `20260930020000` | group names and pictures, and notices in the conversation |
| `20260930030000` | Home step 3b: the chat bucket's policies name `authenticated` |
| `20260930040000` | Home step 6: the photos bucket takes 2MB and three image types |
| `20261001000000` | Home step 6: the photos bucket is private |
| `20261002000000` | "Start fresh" on a claim carries nothing — **not yet on the live database** |

The Chat migrations, in the order they apply — each header says why, and the
"What Chat is" section below says what the member sees:

| migration | what it adds |
| --- | --- |
| `…010000` | `is_active_member`, `is_member`, `chat_authors` — one name for a post by anybody, including somebody hidden or removed |
| `…020000` | `chat_rooms`, the twelve seeded closed, `admin_set_room_open` |
| `…030000` | `chat_room_members` — joining, a roster nobody else can read, and the two gates `chat_room_is_readable` / `chat_can_post_in` |
| `…040000` | `chat_topics`, `chat_posts`, `chat_create_topic`, `chat_bump_topic` |
| `…050000` | `chat_topic_reads`, `chat_mark_topic_read`, `chat_topics_for`, `chat_room_stats` |
| `…060000` | `chat_remove_post`, `chat_removed_bodies` |
| `…070000` | `chat_threads`, `chat_thread_members`, `chat_messages`, `is_thread_member` |
| `…080000` | `chat_open_direct` — one conversation per pair, from either end, over `direct_key` (defined in `…070000`) |
| `…090000` | `chat_my_threads`, `chat_unread_count`, `chat_mark_thread_read` |
| `…100000` | `chat_remove_message` |
| `…110000` | column-level insert grants on `chat_topics` and `chat_posts` |
| `…120000` | `chat_messages`, `chat_posts`, `chat_topics`, `chat_threads` into the realtime publication — `chat_thread_members` deliberately not |
| `…130000` | `chat_create_group`, `chat_add_to_group`, `chat_group_cap`, `chat_is_findable` — and `chat_open_direct` replaced to call the last of them |
| `…140000` | `chat_join_event_group` |
| `…150000` | `chat_reports`, `chat_report_post`, `chat_report_message` |
| `…160000` | `admin_chat_reports`, `admin_resolve_chat_report` |
| `…170000` | `chat_create_room` — `created_by`, `unique (lower(name))`, a room born with its first topic, and `chat_rooms` into the publication |
| `…180000` | Mind, Family and Places join Body, Life and Kit — the constraint and `chat_create_room`'s check both; the client's `ROOM_CATEGORIES` is the third copy |
| `…190000` | `chat_reports.context_kind` (room, group or direct), written by both report functions; `admin_chat_reports` dropped and recreated to return it — the panel offers Remove for the first two only |
| `…200000` | photographs: `attachments text[]` on messages, posts, removed bodies and reports; the **private** `chat` bucket (2MB, three image types) and its three storage policies behind `chat_file_is_readable` / `_writable` / `_reported`; `chat_create_topic` takes a fourth argument; removal blanks the list |
| `…210000` | a photograph named on a report cannot be deleted by anybody — `chat_file_is_on_a_report()` in the delete policy. The owner spotted the gap the day photographs shipped: take the message back and the report kept the words and an empty space |
| `20260923000000` | `chat_add_first_post_photographs(room, paths)`: a new room's first post gets its photographs *after* the room exists, because the folder is named after an id the function makes — the one place the row comes first and the files second. Definer; once, by the starter, before any reply, files checked in `storage.objects`. Pushed 2026-09-23. |

The four from 2026-09-17, newest first:

- `20260917030000` — `members.declined`, and a check constraint refusing the
  name and the birthday. See "Prefer not to say".
- `20260917020000` — `organization_follows`. See "Following an organization".
- `20260917010000` — `mentor_invite_limit()`, ten rather than two, and the
  insert policy recreated under a name with no number in it.
- `20260917000000` — `strike_limit()`, `admin_add_strike` refusing a fourth and
  returning the new count. See "Strikes".

And the five from 2026-09-16, newest first:

- `20260916040000` — `member_strikes`, `admin_strikes`, `active_strike_count()`
  and the two functions that issue and withdraw. See "Strikes".
- `20260916030000` — an administrator is a mentor, by trigger.
- `20260916020000` — an administrator's membership cannot be paused or removed
  from the application.
- `20260916010000` — `grant select (series_id) on events`. The column was added
  on the 13th and never granted; the first client read of it failed the whole
  query. See "Adding a column to `events` is two steps".
- `20260916000000` — the Reeve Foundation's name made canonical in `members`
  and `directory_seed`.

Everything below about the earlier thirteen is still true and still worth
reading for the reasoning; it is history now rather than news.
The first three change how invites behave:

- `20260912000000` — deleting a member revokes their invite.
- `20260912010000` — `admin_invites` reports who holds each number.
- `20260912020000` — an invite nobody is on can be revoked.

And ten from 2026-09-13, all pushed, listed so that a database and a branch
that disagree can be told apart at a glance:

- `20260913000000` — `admin_invites` reports whether anybody ever signed up,
  and `admin_members` reports a mentor's spent allowance. **Pushed.**
- `20260913010000` — `blocked_numbers`, and `has_active_invite` answers false
  for a blocked number. **Pushed.**
- `20260913020000` — `my_claimable_profile()`, and Ajay's seeded row
  restored. **Pushed.**
- `20260913030000` — Ajay's photo path corrected, and `members.state` is
  nullable so onboarding can be finished later. **Pushed.**
- `20260913040000` — `directory_seed` and `admin_restore_directory()`.
  **Pushed.**
- `20260913050000` — claiming carries the seeded profile across instead of
  deleting it. **Pushed.**
- `20260913060000` — Ajay's prose moved from `detail` to `bio`. **Pushed.**
- `20260913070000` — an administrator can invite in their own name, and
  `admin_invites` says whether the member inviter is one. **Pushed.**
- `20260913080000` — and may attach a directory claim while doing it.
  **Pushed.**
- `20260913090000` — `event_series`, and `events.series_id`. **Pushed**, and
  the live calendar was grouped at the time: 124 events, 35 series. It grows —
  125 and 36 on 2026-09-18 — so count it rather than quoting this.

**That asymmetry is gone, and this section is kept for the lesson rather than
the warning.** While `origin` was read-only, the migrations reached `personal`
only and the hosted project ran schema that existed nowhere in
`Able-Bodied/thesciclub` — so rolling the database back to `origin/main` would
have broken an app whose code was fine. Since the 2026-09-18 handover
`origin/main` *is* the branch head, so the two agree.

What survives is the habit: **the database and the repository are updated by
different commands and can disagree without either looking wrong.** `supabase
migration list` is the only thing that settles it. The nightly ingest runs that same `main`,
so it executes against this schema *with* the code that understands it. See
"The scraper runs itself, daily".

One more migration has landed since the thirteen above:

- `20260916000000` — Bob's and Matt's affiliations say "Christopher Reeve
  Foundation" while the club's organization row says "Christopher & Dana Reeve
  Foundation", so the name matched nothing and their peer cards drew a letter
  tile instead of a logo that exists. It rewrites the string in **both**
  `members` and `directory_seed` — the second because `admin_restore_directory()`
  reads the snapshot, so fixing only `members` leaves the old name waiting to
  come back the next time somebody presses Restore directory. **Pushed.**

  **Applied 2026-09-16.** Both tables now read "Christopher & Dana Reeve
  Foundation" and all seven affiliation strings in the directory resolve to an
  organization with a logo.

`supabase db push` is safe and was used deliberately; `supabase config push` is
still the one to never run — see Environment below.

## Read these first

- `CONTEXT.md` — the product definition. SCI-only and invite-only are
  constraints, not features, and it lists what is deliberately deferred.
- `docs/index.html` — the design mock, published at www.thesciclub.com. The
  visual reference.
- `src/routes/events/organization-badge.tsx` — the one way an organization is
  drawn, logo with a short-code fallback. Do not hand-roll a second gold
  tile: the blocked screen, the deck card and the profile each had one and
  none of them could show a logo. Pair it with `organizationByName()` in
  `lib/organizations.ts` where all you have is an affiliation string, which
  is free text and often names a body the club has no row for.
- Migration headers in `supabase/migrations/` — every schema decision's
  reasoning lives there.

## What claiming actually does, now that it works

The client pre-fills five fields — display name, exact level, completeness,
city, state — because those are the five the wizard asks for. Everything else
is carried across **in `consume_invite_for_new_member`**, server-side, before
the seeded row is retired: photograph, bio, the interests, topics, self-care
and affiliations, the injury date, employment, education and the rest. Until
20260913050000 none of that happened and a claimed profile came out emptier
than the directory entry it replaced.

The copy is in the trigger and not the client on purpose. The alternative is
`my_claimable_profile()` returning the whole profile to somebody who is not
yet a member and, on a mistyped invite, is not the person on the card — that
function is ten columns deliberately. Keep it that way.

Three rules to preserve if you touch it:

- **Their answers win.** Every field copies only where the incoming row is
  null or an empty array.
- **`type` is not carried.** Several seeded rows are mentors and a mentor can
  put two numbers on the list, so inheriting it would turn a mistyped invite
  into an invite-rights grant. Promotion stays an administrator's decision.
- **"Start fresh" copies nothing** (`20261002000000`). The insert carries
  `start_fresh`; the trigger retires the seed either way and copies only
  when it is false, then clears it. An insert that leaves it out copies, as
  before.

`supabase/tests/claim-carries-profile.sql` covers all of it.

## Rehearsing the claim flow costs a seeded profile — put it back with a button

Claiming retires the seeded row, whether the person carried its data across
or not, because declining still means they have a real row and leaving the
seeded one behind is the duplicate the mechanism prevents. So every rehearsal
of that flow spends one of the 23.

**`/admin` → Members → "Restore directory"** puts them back: missing rows
re-inserted, rows still there reset to how they shipped. It reads
`directory_seed`, a snapshot taken from `members` itself by 20260913040000,
so there is no second copy of the directory to drift. It will not overwrite a
real member's row, and it skips anybody whose number now belongs to somebody
who joined — that is the claim having worked, and re-inserting would put two
of them in the deck.

Which means: after rehearsing a claim, remove the test member first, then
restore. The other order leaves the number taken and the profile skipped.

## Onboarding is two required questions, then a door

Name and birthday are required — a row needs a name and the club is 18+, and
the database enforces the second with a trigger. Everything after that can be
left: `level_range` has a 'Not sure yet' value, `exact_level`, `injury_date`,
`city`, `state` and the photograph are all nullable. "Finish later — enter
the club" appears **on the birthday step**, as soon as the date entered is a
real and adult one, and on every step after it. Not before that: skipping
with an empty or under-age birthday writes a row the database refuses, and
the refusal reaches the member as a sentence about a trigger.

What is skipped gets filled in from Me, which carries a **gold count of what
is still blank** on the Your details row and names them underneath.
`missingDetails()` in `details-api.ts` returns the labels rather than a
number so the badge and the sentence cannot disagree. It deliberately does
not count 'Do not know' for completeness — an honest answer, not a gap — nor
the name and birthday, which cannot be absent.

`state` became nullable for this (20260913030000) and is null rather than '',
because an empty string sorts, filters and compares as though it were a
place — `relevanceScore` was scoring two members who had both skipped it as
neighbours. Anything reading `state` should expect null.

**Claiming a seeded profile goes straight to the birthday**, not to the name.
The organization has already asserted the name, level, completeness and
place; asking somebody to retype their own profile to confirm it is the
thing that flow exists to avoid. One question, then in.

## A view's own security check can break a caller who is not its audience

Worth its own heading because it has now happened once and cost a real
seeded profile.

`browse_members` requires the *viewer* to be an active member — correctly,
since 20260911110000, which is the fix that stopped a verified-but-uninvited
session reading everybody's bio. Onboarding was reading the claimable profile
out of that same view, on behalf of somebody who by definition is not a
member yet. It got nothing, treated that as "no claim", and skipped a step
while the trigger retired the seeded row anyway.

Nothing failed. No error, no console, and the test fixture happened to mock
that read as `null`, so the broken behaviour was the fixture's expectation
too. The lesson is narrower than "check your views": **when a caller is
pre-membership — onboarding, the invite gate, the blocked screen — ask what
they are allowed to read before reusing a members-only view or table.**
`my_invite_status()` and `my_claimable_profile()` are the pattern: definer
functions, no arguments, keyed on the caller's own verified phone, returning
the fewest columns the screen needs.

## Conventions that are load-bearing

- **Commit as work lands, small, one change each, each typechecking on its
  own.** The owner asked for this explicitly.
- `pnpm fix` runs eslint then biome — in that order, deliberately. They fight,
  and the formatter has to run last.
- **`pnpm fix` reformats aggressively and will silently break a string-match
  edit you made moments earlier.** Re-read a file before patching it twice.
  This has bitten repeatedly.
- Comments explain *why*. Several decisions here look wrong without their
  reason attached.
- **Watch for tests that pass by not running.** Seven shapes now: a silent RLS
  no-op, a subquery that returned nothing, Testing Library renders leaking
  between tests, an assertion matching the prose that promised the thing rather
  than the thing, a `vi.mock` of a whole module that would have stubbed the
  pure function under test and let the test assert its own wording, and a test
  named for one case whose fixture put it in another — "offers no revoke on an
  invite somebody already used", with no holder set, was exercising the
  orphaned invite instead. The seventh is a screen test whose unstubbed hook
  read the hosted project and passed on production data — the last bullet in
  this list is the guard that now stops it.
- **A SQL probe run as the superuser proves nothing about RLS.** `postgres`
  is BYPASSRLS, so every policy is inert and a file full of passing steps says
  only that the constraints and triggers hold. To test a policy, switch to the
  role and set the claims — `set local role authenticated` plus
  `set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}'` —
  and print `current_user` in the output so a future run cannot quietly lose
  that. `supabase/tests/mentor-invites.sql` is the worked example;
  `invite-lifecycle.sql` is the superuser kind and is right to be, since what
  it exercises is constraints.
- **Look at what you changed.** `pnpm shoot <route>` writes a PNG; read it.
  Every layout problem in this project was found by eye, never by a test — and
  two were introduced by "fixes" that looked right in isolation. Check a
  component in its row, not cropped to itself.
- **No test may reach the network, and `src/test/setup.ts` enforces it.**
  `fetch` and `WebSocket` throw with the URL in the message. This exists
  because `.env.local` points at the *hosted* project and Vitest loads it like
  any other Vite process, so a screen test calling an unstubbed hook read
  production and went green. That happened three times while Chat was built and
  the fix each time was one more `vi.mock`, which fixes the test somebody
  noticed rather than the class. **When a screen gains a hook, its test stubs
  that hook** — the failure now names the URL and the module to stub, rather
  than passing. A test that genuinely needs to serve a request stubs `fetch`
  itself with `vi.stubGlobal`, in the file that needs it.

## The probes in `supabase/tests/`

SQL run by hand against a local stack, each in one transaction that rolls
back. They exist because policies and triggers are not covered by `pnpm test`
at all, and several of this project's bugs were found by running a path rather
than reading it.

Two rules, both learned the hard way:

- **Run them as a signed-in role**, not as the superuser — `postgres` is
  BYPASSRLS, so every policy is inert and the file passes while proving nothing.
- **Give every expected refusal its own savepoint.** Without one the first
  error aborts the transaction and every step after it prints "current
  transaction is aborted", which in a long log is indistinguishable from
  passing. `admin-is-protected.sql` shipped with that fault and reported eleven
  green steps having exercised one.

| file | what it exercises |
| --- | --- |
| `invite-lifecycle.sql` | deleting a member: their invite, the ones they issued, the constraint that used to block it |
| `mentor-invites.sql` | the two-invite cap, as a real mentor session |
| `blocked-numbers.sql` | all three places a ban is enforced |
| `claim-preview.sql` | that somebody mid-onboarding can see the profile they may claim; step 1 asserts the old lookup is refused, and 1b is its control — the same lookup as an active member finds Ajay (step 1 could not fail until 2026-09-30) |
| `claim-carries-profile.sql` | that claiming carries the whole profile and their own answers win; steps 9–12 (`20261002000000`) that "Start fresh" carries none of it, still retires the seed and consumes the invite, and that `start_fresh` is never stored. Four transactions — run as written, never wrapped |
| `restore-directory.sql` | restoring the seeded directory without touching anybody real |
| `admin-vouches-directly.sql` | an administrator inviting in their own name |
| `admin-is-protected.sql` | that no administrator can be paused, removed, blocked or made a peer — and that an ordinary member still can be |
| `strikes.sql` | the strike arithmetic (withdrawn and year-old ones leave the count, the rows stay), the cap at three, and the visibility (another member sees none of them) |
| `organization-follows.sql` | that a member can follow, and that nobody sees anybody else's — step 6 is the one that matters |
| `declined.sql` | that "rather not say" is recorded, and that the name and the birthday cannot be |
| `chat-authors.sql` | that a member can put a name to a post by anybody — hidden, suspended or removed — and that a session without a member row can put a name to nobody |
| `chat-rooms.sql` | that a closed discussion room is invisible to a member and visible to an administrator, that only an administrator can open one, and that a member cannot reach the table around the function |
| `chat-posts.sql` | that a member who has joined nothing reads a room's whole history **and writes in it** (step 1 inverted on 2026-09-29 with `20260930000000`), that a suspended one reads and does not write, that an administrator seeds a closed room and a member cannot post in one, that an author and an administrator can remove a post and a third member cannot, and that nobody sees which rooms another member joined or which topics they have read |
| `chat-edits.sql` | `20260930000000`: the author edits their post and message; another member cannot; an administrator cannot edit but reads every earlier version (step 3); a member reads none of `chat_edits`, their own included (step 4); removed, unchanged, blank-without-photographs, too long and closed-room edits are refused; deleting the topic takes its edits with it (step 12) |
| `chat-replies.sql` | `20260930000000`: a reply lands under a post in the same topic; another topic, a missing id, a removed post and a reply to a reply are refused (step 3); removing the parent leaves the reply standing with `reply_to` null, still counted (step 5); a message quotes one in its thread, may quote a quote, cannot quote across threads or a removed one, and an existing quote of a removed message stays |
| `chat-post-likes.sql` | `20260930010000`: a member likes a post in an open room having joined nothing, twice is one row, not their own, not as somebody else, cannot choose `liked_at`; step 6 (a closed room's likes can be neither made nor read by a member — an administrator reads them) and 7 (another member, and the author, read who liked a post) matter most; paused cannot like but reads, a removed post cannot be liked, somebody else's like cannot be deleted, removing a member and deleting a topic take the likes, `anon` reads nothing |
| `chat-direct.sql` | that a third member sees nothing of a conversation — not the thread, not its roster, not a word of it, and nor does an administrator — that opening the same one twice from either end returns the same thread, that a hidden or suspended member cannot be found to start one while a conversation that already exists still opens, and that a member cannot reach the thread tables around the functions |
| `chat-groups.sql` | that somebody outside a group cannot add to it, that leaving one stops every read including the words written while they were in it, that an RSVP of Interested does not open the event's group chat, that a group has an order and a cap, and that an event's group takes no members by hand |
| `chat-member-removed.sql` | that ending a membership is not blocked by anything Chat added, that what they wrote in rooms and conversations stays without their name, that what they joined and read goes with them, and that the other half of a direct conversation can still read it |
| `chat-reports.sql` | that a member outside a conversation cannot report a message in it, that the reporter reads back three columns and not the snapshot, that the administrators' answer carries no thread id, that a second report is one row, that the snapshot survives the author taking the message back, and that somebody paused can still say what was done to them |
| `chat-attachments.sql` | photographs (Ada joins nothing since 2026-09-29; step 11 used to depend on her having joined): the row limits (step 12a–f is the new-room function, with its four refusals); (four, words *or* a picture, paths under the row's own folder) and the `chat` bucket's read policy as members — step 6 (an outsider cannot read a conversation's picture) and 9a (an administrator reads a reported picture and not its neighbour) are the ones that matter. Uploads and deletes cannot be tested from SQL; `pnpm check-chat-photo-policy` does those through the API |
| `chat-member-rooms.sql` | that a member can start a room and is its first member with a topic in it, that another member can read it at once, that two rooms cannot share a name however it is spaced or capitalised, and that nobody — not even an administrator — can rename or delete one |
| `push-subscriptions.sql` | notifications: step 5 (another member reads none of your devices) and 7 (a phone that changes hands notifies its new holder, not its old) are the ones that matter; no insert or update grant, five off-service endpoints refused, paused can turn off but not on |
| `topic-removal-and-deletion.sql` | a removed reply stops counting and a removed opening post leaves the replies as replies; the faces on a row are posters still standing; a member cannot delete a topic, even their own; an administrator's delete takes posts, mutes and reads and leaves a report its words (step 6) |
| `push-notify.sql` | who a notification goes to: step 1 (a direct message reaches the other member only) and 4 (a reply carries a name and no words) matter most; paused, muted (conversation, topic, room), closed room, taken-back message, wrong secret; the mute tables' policies as members |
| `push-notify-more.sql` | the six later kinds: step 3 (a report reaches administrators but the reporter and says nothing) and 6 (the badge agrees with `chat_unread_count`) matter most; adding yourself sends nothing, the daily run runs once a day, a device minutes old is not forgotten, the per-kind switches are private |
| `admin-invites-no-auth-users.sql` | 20260929000000, after Supabase's `auth_users_exposed` email: step 1 (an administrator still sees who has signed up — the first draft of the migration broke it, because Postgres checks a function inside a view against the reader) and 3–5 (a member reads nothing through the view or around it, anon cannot reach the lookup) matter most |
| `chat-group-rename.sql` | `20260930020000`: step 3 (somebody outside a group can neither rename it nor change its picture), 7 (a member cannot write a notice by hand) and 10 (a picture must be the caller's own upload in the group's folder) matter most; the name's rules, a pair and an event's group refused, paused refused, a notice not edited, not removed by its author, not answered; a reported notice reaches the administrators as a sentence with the picture; a rename queues no notification and a message still does (step 17 makes a `push_notify_url` inside its own transaction when the stack has none) |
| `photo-cleanup.sql` | that the `photos` bucket's policies exist and are scoped to the right roles, and that the insert side was not loosened when the delete side was added; since `20260930030000`, that the `chat` bucket's three name `authenticated` (step 1b) and that anon is refused without a function named (step 7); step 8 reads the bucket's own row — private, 2MB, webp/JPEG/PNG (`20260930040000`, `20261001000000`). **The delete side is not in here** — `storage.protect_delete()` refuses every direct delete before RLS is consulted, so those steps pass without proving anything; `pnpm check-photo-policy` is what settles them |
| `photos-bucket-reads.sql` | `20261001000000`: six readers against five files in the private `photos` bucket. Step 1 (a signed-out visitor reads nothing and is told nothing) and 5 (somebody mid-signup reads the logo, the face on their claim card and their own upload, and not a member's photograph) matter most; a member and a suspended one read all five, a removed member and an account on no invite read the logo only, anon cannot call `photo_is_my_claimable`. Its view is `security_invoker`, or it reads as the superuser and every step says five. `pnpm check-photo-policy` asks storage for the signed URLs |

**Run them as a signed-in role, not as the superuser**, unless what you are
testing is a constraint or a trigger — and read the note at the top of each
about which. Then read "A view's own security check can break a caller who is not its
audience" above before writing another: that trap has caught four of these
files, most recently by reporting a restore as broken when it had worked.

## Environment

- `.env.local` holds `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  (`sb_publishable_…`) and `SUPABASE_SERVICE_ROLE_KEY` (`sb_secret_…`).
  Project ref `erijdvqnxavwezsbbojv`.
- **Storage rejects the new-format secret key in `Authorization`** — it wants
  it as `apikey`.
- **The Supabase CLI is a devDependency, not a global.** Bare `supabase …`
  gives `command not found`; every invocation needs `pnpm exec supabase …`.
  Worth keeping that way: `pnpm exec` runs the version the project pins, and a
  globally installed CLI drifts from it — `db push` writes to the live
  database, which is not where a version surprise belongs.
- Local Supabase: `pnpm exec supabase start -x imgproxy,mailpit,studio,edge-runtime,logflare,vector,supavisor`
  is the light set. It used to exclude `storage-api` too; since chat carries
  photographs (2026-09-21) storage is part of the ordinary run, not the
  exception, and the exclusion below is kept only as the warning it is.

  **`realtime` came out of that exclusion list when Chat landed.** Chat
  subscribes to `chat_messages`, `chat_posts`, `chat_topics` and `chat_threads`,
  and with the service excluded every subscription connects, reports SUBSCRIBED
  and delivers nothing — which looks exactly like a chat that nobody is writing
  to. The CLI also remembers the last exclusion set, so adding it back needs
  `pnpm exec supabase stop` first; starting again without `-x` does not restore
  anything.

  `pnpm realtime-check` is the only thing that says delivery works: two
  browsers, two test numbers, a message into an open conversation and a dot onto
  somebody else's tab bar. Unit tests mock the channel and prove neither. It
  needs both test numbers to have member rows — `pnpm demo-member`, then again
  with `DEMO_PHONE=12222222222 DEMO_OTP=222222` — and a dev server pointed at
  the local stack, per the note further down about `.env.local`.

  **`-x storage-api` is the one exclusion that will lie to you.** With storage
  excluded, every storage call returns `name resolution failed` — uploads do not
  happen and reads come back empty, with no error anywhere near the code that
  cared. `pnpm check-photo-policy` reported two policy holes that did not exist
  before this was understood; it now refuses to run rather than produce results.
  **Anything touching photographs needs a plain `pnpm exec supabase start`.**

  The CLI also remembers the last exclusion set: starting again without `-x`
  does *not* add the missing services back. `pnpm exec supabase stop` first,
  then start. The stop keeps a backup and the next start restores it, so local
  data survives.
  After `pnpm exec supabase db reset`, run **`pnpm demo-member`** — a reset
  drops the auth schema, so the test account loses its member row and every
  sign-in lands back in onboarding.
- **The Netlify CLI is a devDependency too** (added 2026-09-27): `pnpm exec
  netlify …`. It needs a person once — `pnpm exec netlify login` opens a
  browser, then `pnpm exec netlify link` picks the site and writes
  `.netlify/` (gitignored). After that a session can read and set
  environment variables (`env:list`, `env:set`) and watch deploys. **Pass
  `--filter thesciclub`** to anything project-scoped (`env:get`, `env:list`,
  `status`): the CLI sees `jobs/event-ingest` as a second project, stops to
  ask which, and crashes when nobody answers. `netlify api …` does not need it. **An
  env var starting `VITE_` is not a secret** — it is inlined into the bundle —
  so it is never marked "contains secret values": Netlify's secret scan would
  find it in the build and fail the deploy. The four install scripts it
  brought are denied in `pnpm-workspace.yaml`; it runs without them.
- **Never run `pnpm exec supabase config push`** — `config.toml` holds
  placeholder local Twilio credentials and would overwrite the hosted project's
  real ones. `db push` is fine and is how the migrations above got there.
- Test numbers (fixed OTPs, no SMS) — for the local stack. The live project
  accepts them too until the Twilio clean-up (see "Twilio"): `11111111111`/`111111`,
  `12222222222`/`222222`, `13333333333`/`333333`. `11111111111` is **Admin**.
- Dev server: `pnpm dev` (5173), or
  `./node_modules/.bin/vite --port 5180 --strictPort` to leave 5173 free for
  whatever the owner has open. Screenshots:
  `SHOOT_BASE=http://localhost:5180 pnpm shoot /peers --both` — `pnpm shoot`
  defaults to 5181, so it nearly always needs SHOOT_BASE.

  **`.env.local` points at the hosted project, so the dev server — and
  therefore `pnpm shoot` — talks to production.** A migration applied only to
  the local stack is invisible to it, and what comes back is
  `Could not find the table '…' in the schema cache`, which reads like a broken
  query rather than like the wrong database. To look at local work, override
  the two variables in the environment; Vite lets a real env var beat
  `.env.local`:

  ```
  VITE_SUPABASE_URL=http://127.0.0.1:54321 \
  VITE_SUPABASE_ANON_KEY=$(pnpm exec supabase status -o json |
    python3 -c 'import json,sys; print(json.load(sys.stdin)["PUBLISHABLE_KEY"])') \
  ./node_modules/.bin/vite --port 5183 --strictPort
  ```

  A freshly applied migration also needs PostgREST's schema cache reloading
  before the first read — `notify pgrst, 'reload schema';` — and after a
  `db reset`, `pnpm demo-member` makes `11111111111` an ordinary member called
  Alex rather than the administrator it is on the hosted project.
- Sharing the dev server through a tunnel: ngrok and cloudflared hostnames are
  in `server.allowedHosts` in vite.config.ts. Vite refuses a Host header it does
  not recognise, and that check is load-bearing — it is what stops a page
  elsewhere pointing a hostname at 127.0.0.1 and reading back whatever this
  server inlines. Hot reload through a tunnel also needs **`TUNNEL=1 pnpm
  dev`**: the page loads over 443 but the reload client connects back on
  `server.port`, which no tunnel exposes, so without it the socket dies and the
  page quietly stops updating.
- **CLI clean but the editor red everywhere** means VS Code is not attached to
  WSL. Opened over `\\wsl.localhost\…` from Windows, its TypeScript server
  cannot follow pnpm's symlinks into `node_modules/.pnpm`, so every import
  fails to resolve and most components light up while `pnpm check` passes.
  Install the WSL extension and open the folder with `code .` from inside WSL;
  `~/.vscode-server` existing is the tell that it is attached. Then
  TypeScript: Select TypeScript Version → Use Workspace Version, since the
  project pins 6.0.3.
- **The local `photos` bucket holds stand-ins**, not photographs. It was
  empty until 2026-10-01 — every seeded face and logo was a broken image
  locally — and step 6 filled it with a generated tile for each of the 45
  paths the local database names (numbered gradients, short codes), by a
  script in that session's scratch folder; nothing was copied from
  production. A `db reset` empties it again.
- No host `psql`; use
  `docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine psql …`.

---

# What the 2026-09-18 session built

Mostly the owner trimming what the previous day had added, plus the handover
itself. In rough order:

- **The strike limit's follow-through**: the ring on Me retires at 100% on both
  profile cards rather than showing a full circle, and Your details gained the
  same ring the survey card has. One rule, stated once: the ring is progress, so
  it goes when there is no progress left.
- **Invites are mentors-only.** A peer used to get a heading, a card and an icon
  explaining a thing that would never happen to them. See the note below about
  what that argument does *not* extend to.
- **"Rather not say" on the onboarding injury step**, matching the survey's.
- **A great deal of copy removed** from Me — the profile cards are names and
  controls now, the visibility card is one word, and Display has no descriptions
  at all. What survives is listed with its reason in the commits; the only line
  left under a card in Your profile is the list of what is actually missing,
  which is information rather than explanation.
- **The house rules came off the Standing card**, behind a disclosure that opens
  on hover, on focus and on tap. **This changed CONTEXT.md**, which had said
  they must stay *visible*; it says *reachable* now, and the sentences move to
  the terms of service when there is one.
- **Bigger tap targets reached more than one button.** The setting worked and
  did almost nothing: 106 controls under 44px across four screens, and exactly
  one of them opted in. See "The setting that worked on one button" below.

## The rule about hiding things, and where it stops

Do not spend a card on something a member cannot do — that is why Invites is
mentors-only and why Club tools is admin-only.

It does **not** extend to things that are merely *absent*. Home still says
plainly that it is not built. A member who goes looking for a feature and finds
nothing at all reads the app as broken rather than as unfinished, and
CONTEXT.md defers it on purpose.

**The three other examples this paragraph used are spent** — Chat said the same
of itself, the official account said messaging was not switched on, and an
event said its group chat was coming. All three are real now. **The rule is
not spent**: what Chat does not do — editing, attachments, search, blocking —
it draws no control for at all, rather than a greyed-out one.

## The setting that worked on one button

`data-large-targets` grows a control's hit area by 10px through a pseudo
element, without changing how it is drawn. Opting in is per control, by
`data-target="small"`, and **there is nothing automatic about it** — for a long
time only the Events filter button had the attribute, so the setting was real,
measurable, and almost entirely useless.

It now covers the shared components (`SmallButton`, `FilterChip`, `BackLink`),
both filter buttons, the segment pills on both tabs, the Peers search clear, the
visibility switch and the standing disclosure. Measured after: 24px of reach
from centre against 15–18 with it off.

**Add the attribute when you add a control under 44px.** The way to check is to
walk the DOM of each screen for `getBoundingClientRect()` under 44 and list what
lacks the attribute; that audit is what found the ninety-two on `/admin`.

---

# What the 2026-09-17 session built

Seven things, all asked for by the owner in one go, all live. They were built
against `personal`, which was the home of record at the time; they reached
`Able-Bodied/thesciclub` with everything else at the 2026-09-18 handover.

## Three strikes is a limit, not a label

20260917000000. A fourth, fifth and sixth strike all used to go in, which made
"One more ends your membership" false on the members own card. `admin_add_strike`
refuses past `strike_limit()` now and returns the new count, and the strike that
reaches the limit opens a panel on `/admin` offering Pause, Remove, or Not now.
Still a person deciding — nothing in the database ends a membership.

## A mentor gets ten invites

20260917010000. `mentor_invite_limit()`, mirrored by `MENTOR_ALLOWANCE`.

**The policy was renamed, and that mattered.** It was "mentors can invite up to
two people"; a renamed policy is a *new* policy, so the old name is dropped
explicitly. Leaving it would have meant two insert policies ORed with the old
cap as the generous half.

`supabase/tests/mentor-invites.sql` had a step that started passing by not
running the moment the limit went up — "the third is refused" inserted a third
invite and succeeded. It fills the allowance from `mentor_invite_limit()` now
and tries one past it. **If you change a limit, look at what its test actually
exercises afterwards.**

## Following an organization

20260917020000. `organization_follows`, shaped after `event_dismissals`: the
row's existence is the whole fact, unfollowing is a delete, and the compound
primary key makes following idempotent.

**There is no follower count and no "members who follow this", deliberately.**
Who a member follows is a statement about them they did not make to the room.
The select policy is the whole protection — there is no view to hide behind. If
a count is ever wanted it is a `security definer` function, not a loosening of
that policy.

The payoff, so it is not a dead button: **"Ones you follow"** leads the Hosted
by group in the events filter sheet and sets the ordinary host filter. It is
built from the organizations *hosting something in the current list*, never the
directory — 18 of the 23 run nothing, and a directory-built chip would select
five bodies with no events and show an empty list.

The directory row had to stop being a single `<button>` for this. A button
inside a button is invalid HTML; browsers discard the inner one, so Follow would
have been a dead region that opened the organization instead.

## Peers has a search box

The search itself was already there and unreachable. `matchesSearch` has read
across name, place, level, topics, interests and the bio since the deck was
built, and the page had a chip to *clear* a search with nothing that could start
one. This is the missing input.

Two things found by looking rather than by a test: `type="search"` draws its own
clear button, so there were two ✕ side by side; and the empty-state advice said
"try widening the filters" when it is far more often three words in the search
box holding the deck shut.

## Prefer not to say

20260917030000. `members.declined`, one array for the survey and the details
form both.

**Skip and decline are different and both stay.** Skip leaves a null, which is
honestly indistinguishable from "have not got to it yet" and is counted as
undone. "Rather not say" is a decision and counts as answered. Collapsing them
would either nag the people who have decided or quietly finish a profile
somebody meant to come back to.

The name and the birthday cannot be declined — a check constraint, under both
spellings each, because the survey and the details form name them differently.

The details form writes a decline **on the tap, not on Save**, for the reason
`show_in_browse` already does: the survey writes this column too.

`loadAnswers` asks twice, with the column and without, because a select naming a
column the database does not have fails the whole query — the same shape as the
events page refusing to load over an ungranted `series_id`.

## Three wordings on Me

- The visibility switch says visibility, not "the deck". "Deck" appeared nowhere
  else on screen; the app says "Peers".
- "How you look to other members" is **"My profile view"**.
- Your details carries a **percentage**, not a count of what is missing. A count
  cannot say "finished" without saying 0, and a gold badge showing 0 reads as
  broken — it used to vanish exactly when it had good news.

## The trap this session kept walking into

**`textSize: 'largest'` is not a value.** The scale is `normal`/`large`/`larger`
and `parsePreferences` silently drops anything else, so a screenshot script
asking for 'largest' runs at the *default* size and proves nothing. One overflow
sweep was reported as "checked at the largest setting" on that basis and had to
be redone. **Print `document.documentElement.dataset.textSize` at the top of any
such script**, which is now what they do.

The other two, both already in this file and both hit again: an expected refusal
without its own savepoint aborts the transaction so every later step prints
"current transaction is aborted" and reads like a pass; and `pnpm fix`
reformats a file out from under a string-match patch made moments earlier.

---

# What Home is

Built 2026-09-29 to 2026-10-01, in the steps of `HOME-PLAN.md` (1, 2, 2b, 3,
3b, 4, 5, 6), and **where the app opens** from step 5. Every step is done and
the plan was deleted on 2026-10-01, as `CHAT-PLAN.md` was once "What Chat is"
held it; `git show fe96183:HOME-PLAN.md` reads it as it last stood. This
section holds what stays true of Home. Code comments that cite the plan by
step or decision number mean this section; the migrations and probes that
name the file were written before it went and are not edited.
The step sections near the top of this file ("Home, step 1" to "Home, step
6") say what each step changed and how it was checked.

**Home adds no new kind of content.** It is a second way in to rooms, events
and members that already exist, plus Likes. A question is a topic in a room,
a photograph is a topic whose first post has photographs, a comment is a
reply, a suggestion is a member from Peers. So reporting, removal,
notifications, mutes and the administrators' tools reach everything on Home
without a line of their own. That is how CONTEXT.md's old objection — "needs
four content types and a moderation story" — was answered.

## The owner's decisions, 2026-09-29

Settled; build to them, do not reopen them.

1. A question asked from Home lives **in a Chat room**, as a topic.
2. A photo post lives **in a room too**, as a topic whose first post has
   photographs. No post or comment tables, no second photo store.
3. **No anonymous asking.** No control is drawn for it.
4. **Likes, with names shown** to every member who can read the room (chosen
   over a count only). One table, `chat_post_likes`.
5. The pills read **Everything · Topics · Photos · Events · People**, not the
   mock's "Questions" and "Posts": a topic is not always a question, and
   "post" already means a reply.
6. **The app opens on Home** — the last step, once Home had real content on
   the live club.
7. **Ship everything, in steps**, each releasable on its own.

Added the same evening, for step 2b, and changing Chat as much as Home:

8. **Anybody writes in an open room without joining it.** Join is gone.
9. **A member can edit their own post or message**; readers see "Edited".
10. **Administrators can read every earlier version** (`chat_edits`).
11. **A reply to one post** sits under it, one level deep; in a conversation
    it is a quote.
12. **Rooms and conversations both** get editing and replies.

## Departures from the mock — do not "fix" these

- **No comments sheet.** "Reply" and "3 replies" go to the topic page, which
  already lists replies with a composer, Report, Remove and Mute.
- **No floating "Post" button.** The dashed card at the top of every pill
  does the job, and a fixed button covers the last card at larger text.
- **No brand row, search or bell in the header.** No other tab has them.
- **No chip row of active filters**, as on Events and Peers; the gold dot
  and "Filters, 2 active" say a filter is on.
- **Room names where the mock has categories**, and **"replies"** where it
  has "answers" and "comments".
- **No city on a topic or a photograph.** `ChatAuthor` leaves it out, so a
  member hidden from Peers is not placed on a map by what they wrote.
- **An icon on the compose card** where the mock has the viewer's avatar.
- **The like thumb is solid navy when liked**; the mock's pale tint is next
  to invisible on paper.

## Departures from the plan, made in the steps — these stand

- **A topic or person card is not one big link**: the link is on the title
  or name, stretched over the card with `after:absolute after:inset-0`. A
  screen reader reads the title as the link, not the whole card.
- **Back keeps the pill**: cards hand over `{ from: 'home', segment }`, and
  the New topic screen `{ from: 'home', segment, kind }`.
- **Controls are named for their post** — "Like Jan's post", "3 likes on
  Jan's post. Show who.", "Reply to <title>" — the owner's choice over the
  plan's bare "Like".
- **Like on a topic card is `relative` without `z-10`**: `z-10` on the row
  trapped the likes list under the tab bar and the next card.
- **The filter narrows the list a pill drew**, so "2 of 8" is two of the
  cards on screen, and Everything's four events are all it can narrow. A chip
  that is on is always offered; Online is a flag of its own.
- **`/home/new`'s join step went with step 2b's first commit**, since
  nothing could join once `joinRoom` went.
- **The photos bucket's member delete policy stays `{public}`** (the owner's
  call, 2026-09-30); the chat bucket's three name `authenticated`.

## Out of scope — draw no control for any of these

Search across the feed. A notification centre. Anonymous asking. "This
helped" and "Message" chips on an answer. Routing an unanswered question to
matching members. A notification for a like. Video. Like and Reply on a
single comment. If a task seems to need one, ask the owner.

## Traps

- **An administrator reads closed rooms.** Without the `openedAt` filter
  their Home shows topics no member can see, and a screenshot taken as the
  administrator looks fuller than any member's.
- **The first standing post is not always the opening post**, and a card's
  first reply is the earliest standing top-level post after the opener.
- **A photo card is not a link**; it holds buttons. A topic card is a
  stretched link with buttons painted over it — a button inside it must stay
  `relative` or the link is what a finger lands on.
- **Two select policies are ORed.** `chat_post_likes` has one on purpose; a
  second would make every "mine" read need to say so.
- **`AttachmentGrid` is drawn by four screens** and signs URLs under the
  reader's token. A change for Home goes behind the `fill` prop; a test
  stubs `useAttachmentUrls`.
- **The mixed feed is `buildFeed`, a pure function.** Test it, not an order
  on the rendered screen.
- **Screens opened from Home light the Chat tab**, because a topic and New
  topic live under `/chat`. Known, not changed.
- **A sheet's focus is `useDialogFocus`** (`src/lib/dialog-focus.ts`). The
  filter shell and the report sheet use it; the likes list and the
  photograph viewer keep older copies. A new sheet uses the hook.
- **A probe with several transactions is never wrapped in one**
  (`claim-carries-profile.sql` has three), and the fair count is a fresh
  stack. See "Home, step 3b".
- **`pnpm demo-member` after every `supabase db reset`**, and `pnpm shoot`
  signs in as `11111111111`, which a reset makes an ordinary member, Alex.
- **Every photograph and logo is a signed URL** (`usePhotoUrl` in
  `src/lib/photos.ts`, since step 6). A new screen drawing a face uses
  `MemberAvatar` or the hook, never a URL built by hand, and its test stubs
  `@/lib/photos`: unstubbed, the network guard's error is swallowed by
  storage-js and the test passes drawing initials.
- **Storage refuses an upsert without a select policy on the row**, even a
  first upload. Onboarding uploads with upsert before the member row
  exists, which is why the photos bucket lets an account read its own
  folder. See "Home, step 6".
- **Landing places are written in five files** — `App.tsx`, onboarding,
  dev-login, not-found and admin. A change to where the app opens touches
  all five, and `src/App.test.tsx` and the onboarding tests say where
  somebody lands.

## The files

- `src/routes/home/`: `page.tsx` (the screen, the pills, the filter
  button), `feed.ts` (`buildFeed`, `inSegment`), `topic-card.tsx`,
  `photo-card.tsx`, `person-card.tsx`, `compose-card.tsx`, `new.tsx`
  (`/home/new`, the kind and the room), `filters.ts` and `filter-sheet.tsx`,
  `back.ts`.
- `src/lib/home/`: `types.ts`, `topics.ts` (the topic read and
  `toHomeTopics`).
- Likes: `src/lib/chat/likes.ts`, `src/routes/chat/like-button.tsx`
  (`LikeButton`, `LikesSheet`, `PostLikes`), the migration
  `20260930010000_a_member_likes_a_post.sql` and the probe
  `supabase/tests/chat-post-likes.sql`.
- Shared with Chat and the other tabs: `src/routes/chat/new-topic.tsx`
  (reads Home's state), `src/routes/chat/back.ts`,
  `src/components/filter-sheet-shell.tsx`, `src/lib/dialog-focus.ts`,
  `src/routes/chat/report-control.tsx`, `EventCard`, and `rankMembers` from
  `src/routes/peers/ranking.ts` for the people.
- The photos bucket: `src/lib/photos.ts` over the signing cache in
  `src/lib/chat/attachments.ts`, the migrations `20260930040000` and
  `20261001000000`, the probes `photo-cleanup.sql` and
  `photos-bucket-reads.sql`, and `pnpm check-photo-policy`.

# What Chat is

Built 2026-09-18 to 2026-09-21, in nine phases, from a plan file that was
never committed and was deleted on 2026-09-21 once this section held
everything in it that was still true. The plan was wrong in a dozen places
and the code is right; where that mattered, the migration header or the
component's own comment says so. Six migration headers still call it
`CHAT-PLAN.md` by name — those files were applied before it went and a
migration is not edited after it has run, comments included. There is nothing
to go back to and nothing to trust over this file and the migrations.

**The migrations are on the hosted project since 2026-09-23.** See "87
migrations, all of them on the hosted project" for how that is checked
before deploying anything.

## The three kinds of thread, and what separates them

`/chat` has four segments — All · Direct · Groups · Rooms — and the segment is
in the URL (`/chat?segment=rooms`), the way `/events` does it, so a link can
open one.

| kind | who is in it | shape | privacy |
| --- | --- | --- | --- |
| **Direct** | two members | flat | nobody else, **including an administrator** |
| **Group** | up to 50, or an event's attendees | flat | members of it only |
| **Room** | every member | topics, then numbered posts | open to the club, never public |

**A room is a forum and the other two are chats.** Room → topics → posts, with
reply counts, a sort bar, and the whole history. Until 2026-09-29 joining a
room was what bought the right to write in it; the owner took joining out
with Home step 2b (`20260930000000`), and any member writes in any open
room. `chat_room_members` stays as history and nothing reads it. Direct and
group threads are flat message lists; since the same step a post can sit
under the post it answers, one level deep, and a message can quote the one
it answers.

**Rooms sit under six headings** — Body · Mind · Life · Family · Kit · Places,
in that order, from `ROOM_CATEGORIES`. The mock's three held the seeded twelve;
Mind, Family and Places arrived on 2026-09-21 once members could start rooms
(`20260918180000`). Whoever starts a room picks its heading and nobody changes
it afterwards. Three copies of the list: the constraint, `chat_create_room`'s
own check, and the client's constant, and a change is all three.

**An administrator may post in a closed room** to seed it —
`chat_can_post_in` short-circuits on `is_admin()`. Raised on 2026-09-21 and
kept on purpose. (Until 2026-09-29 the same short-circuit was also what let
an administrator post without joining; joining is history now.)

**An administrator is not in a conversation.** They cannot read a thread they
are not on the roster of, and this is deliberate and load-bearing: it is why
reporting exists at all. The one thing they can do from outside is
`chat_remove_message` by an id somebody hands them. So the thread screen offers
Remove on the reader's own messages only, unlike a topic.

## Seven decisions the owner made, and what each one costs

1. **Realtime everywhere**, not polling — `postgres_changes` on `chat_messages`,
   `chat_posts`, `chat_topics`, `chat_threads` and `chat_rooms`. The cost is
   that the local stack must run `realtime`; see Environment, which no longer
   excludes it.
2. **Rooms open one at a time.** The twelve seeded rooms are born closed and an
   administrator opens each from `/admin`. A member never sees a closed one; an
   administrator sees all twelve and can post in a closed room to seed it, with
   the card saying "No member can see this room yet". This is the answer to
   CONTEXT.md's emptiness objection, which has not stopped being true.
3. **Any member can start a room** (2026-09-20, the last thing built). The
   twelve are starters rather than the limit.
4. **A removed member's words stay, anonymised.** Their posts and messages keep
   their text and lose their name — "Former member". What they joined and what
   they read goes with them. `/admin`'s Remove panel says so; it used to promise
   everything went.
5. **Reporting, added mid-build** because decision 3 in the table above left
   harassment in a direct message witnessed only by the person it happened to.
   One post or one message, and nothing else about the conversation.
6. **Soft delete only.** An author removes their own post or message, an
   administrator removes anybody's; the row stays, and the body moves to
   `chat_removed_bodies` — RLS on, no policy, no grant to anybody, not even an
   administrator through the client. **Changed 2026-09-27 for topics**
   (`20260927030000`): a removed post in a topic is no longer drawn as
   "Removed by its author." — it is left out, the numbers close up, and it
   stops counting in `reply_count`, `chat_room_stats` and the faces on a
   topic row. The row still stays underneath. Messages in conversations are
   unchanged and still say "Removed by…". **And an administrator can delete a
   whole topic** (`20260927040000`, `admin_delete_topic`, the Delete topic
   button on the topic page): posts, reads and mutes go by cascade; reports
   keep their snapshot with `post_id` null; photographs are removed through
   the storage API except any named on a report. Probe:
   `supabase/tests/topic-removal-and-deletion.sql`.
7. **Not in this build, and no control is drawn for any of them**: ~~editing~~
   (built 2026-09-29, Home step 2b: your own post or message, with every
   earlier version kept for administrators), ~~attachments~~ (photographs,
   2026-09-21), search (the mock has a search box in the header — it is
   deliberately absent), member-to-member blocking, ~~push notifications~~
   (2026-09-27), anonymous posting, and any way to remove somebody else from
   a thread.

Four more from 2026-09-21, after the owner used the build:

8. **A reported direct message is not removed from `/admin`.** Removing a post
   or a group message protects everybody else who can see it; removing a direct
   message protects nobody who has not already read it. The remedy is on the
   member's row. `chat_reports.context_kind` (room / group / direct) is written
   at report time so the panel can still tell once the message is gone, and the
   row says why there is no button. Both names on a report link to the person:
   the profile when they have one, their `/admin` row when they are hidden from
   Peers.
9. **Me counts events and not Chat.** The Chat tab is one tap away with an
   unread dot; a count of it on Me is a number about a screen the member can
   already see. `src/routes/me/stats.tsx` says so, so the mock does not argue
   the tiles back in.
10. **The composer is a textarea, and on Windows it grew a scrollbar.** The
    auto-grow set the height to `scrollHeight` on a `border-box` element, so
    the border's 3px of overflow drew a ▲▼ scrollbar inside a one-line box —
    on Windows only, which is why no Linux screenshot caught it. Fixed by
    measuring the border; the header of `composer.tsx` explains it.
11. **Photographs in chat, and not video** (2026-09-21). Up to four on a
    message, a reply or a topic's first post, shrunk on the phone to 1,600px
    webp through `preparePhoto`, anything over 10MB refused before it is read.
    Video is out on cost: a phone cannot shrink one, and egress bills per view.
    **The bucket is private and that is the whole design**: a picture in a
    direct conversation is readable by its two members and nobody else,
    including an administrator, through the same `is_thread_member` gate the
    words are behind; a room's pictures are readable by whoever can read the
    room. Consequences worth knowing before anybody "fixes" them: an
    administrator cannot delete a picture they cannot read (the storage API
    deletes only what the caller can select), so a removed member's
    photographs stay the way their words do; and a *reported* picture becomes
    readable to administrators because the report names its path — one
    photograph, handed over by somebody who could see it, the same shape as a
    reported sentence, except that it is the original and not a copy. **So a
    reported picture cannot be deleted by anybody** (`…210000`): the owner
    saw the same day that otherwise a sender could wait to be reported and
    take the message back, leaving the report with words and an empty space.
    Deleting *before* anybody reports still works, as it always has for the
    words — there is nothing to report once it is gone. Files:
    `src/lib/chat/attachments.ts`, `routes/chat/attachment-grid.tsx`,
    `routes/chat/photo-picker.tsx`; `scripts/check-chat-photo-policy.mjs` is
    the through-the-API proof and `chat-attachments.sql` the SQL half.

## The screens

`src/routes/chat/`: `/chat`, `/chat/rooms/new`, `/chat/rooms/:roomId`,
`…/new`, `…/topics/:topicId`, `/chat/t/:threadId`, `…/members`,
`/chat/new-group`. Plus the Message button on a profile, the group card on an
event, the dot on the Chat tab, "Continue in <room>" under a profile's
topics, and a fourth **Reports** tab on `/admin` beside Rooms. (Me's counter
row does *not* count conversations or rooms — it did for a day, and the owner
took the two tiles out on 2026-09-21 because the Chat tab is one tap away and
already carries an unread dot. src/routes/me/stats.tsx says so.)

`src/lib/chat/`: `types`, `rooms`, `topics`, `threads`, `groups`, `reports`,
`authors`, `unread`, `realtime`, `time`, `attachments`, `mutes`, `edits`,
`likes`, and `routes/chat/room-map.ts`.

## What will bite the next person

Each of these was found by running something, not by reading it.

- **An `upsert` is `on conflict do update`, and `do update` needs an update
  grant.** Joining a room was refused for every non-admin member with
  `permission denied for table chat_room_members` — found by the owner on a
  second account on 2026-09-21, after the translator turned it into "Something
  went wrong". 20260918030000 grants `select, insert, delete` and is right to;
  the client's `upsert(row, { onConflict })` was what wanted `update`. The fix
  is `ignoreDuplicates: true`, which is `on conflict do nothing`, needs only
  insert, and still absorbs a double tap. `organization_follows` has the same
  upsert and only *works* because that table still carries Supabase's default
  privileges (update included); it now uses `ignoreDuplicates` too, so
  tightening its grants will not break following. Nobody noticed on the
  hosted project because the Chat migrations were not on it yet. Rule: a row
  a member only ever inserts or deletes is never upserted with `do update`.
- **A `security definer` function has RLS off inside it, so it must check
  visibility itself.** The first draft of `chat_topics_for` leaned on the
  `chat_rooms` select policy through a subquery — correct inside a *policy*,
  where RLS applies to the tables the policy names, and meaningless inside a
  definer function, where the same expression quietly means "a room that
  exists". `chat_room_is_readable`, `chat_can_post_in` and `is_thread_member`
  are the three gates; call one. `chat_my_threads` is the exception and only
  because it is `security invoker`.
- **Insert is granted column by column, never on the table.** A whole-table
  grant lets a member choose `created_at` — a message dated next year sits at
  the top of both lists forever — and `reply_count`, `last_post_at`,
  `removed_at`. **RLS cannot take any of those back**: it is a predicate over
  the finished row and every one of those rows passes it. The consequence is
  that an insert must name exactly the granted columns or fail with
  `permission denied for column`, which is the right failure and a loud one.
- **`now()` is the transaction's start, so two rows written together share it.**
  `chat_messages.created_at`, `chat_mark_thread_read` and every roster row
  `chat_create_group` writes use `clock_timestamp()` instead. Without it "the
  last message" is whichever row the planner returns first, and a new group's
  "oldest membership first" is no order at all — two reads listed the same four
  people differently. **Anything later that writes several rows in one
  transaction and then orders by their timestamp has this bug until it does the
  same.**
- **A parameter named after a column is ambiguous inside plpgsql.** Three times:
  `admin_set_room_open(is_open)`, `chat_create_group(group_name, member_ids)`,
  `chat_report_post(report_note)` / `admin_resolve_chat_report(report_resolution)`.
  PostgREST sends arguments by name, so the client spells these out.
- **`unread` is not "newer than I last looked".** By that rule a thread goes
  bold the moment *you* speak in it. It is: a message newer than you last
  looked **that somebody else wrote**, defined once in `chat_my_threads` and
  built on by `chat_unread_count`.
- **A new table is not live until it is in the publication, and
  `chat_thread_members` is deliberately out of it.** A roster on the wire is the
  membership list that `20260918030000` spends a paragraph keeping private.
  Somebody added to a group finds out on their next list read.
- **`unique (lower(name))` did not stop "SHOULDER   pain" beside "Shoulder
  pain"** — the extra spaces make a different string. Whitespace is collapsed
  before storing, in `chat_create_room` and mirrored by `normalizeRoomName`.
- **A volatile function in a `where` clause runs after the select policy's
  barrier qual.** `where t.id = chat_join_event_group(…)` returned nothing: the
  policy filtered the rows before the function created the one being looked
  for. Call it into a `\gset` variable first.
- **"Exactly one of `post_id` and `message_id`" cannot be a check constraint.**
  Every FK on `chat_reports` is SET NULL, so deleting a post nulls the report's
  `post_id` — and a check demanding one be set would refuse that update and
  block the delete. `kind` is the discriminator instead. Anything later that
  keeps a snapshot of a row it does not own has this shape.
- **A count of zero is not drawn**: no "0 topics · 0 posts", no empty nav
  badge. Found in a screenshot. Three places still break the rule, noticed
  and not fixed — a topic page's header ("0 replies · 1 view"), an event
  card ("1 going · 0 interested") and a room's topic rows ("0 views"); see
  the owed lists under "Home, step 1" and "Home, step 2".
- **An avatar is never its own link.** A link whose only content is an image or
  two initials has no accessible name — a screen reader reaches it and says
  "link, N". The profile link goes on the name and the tile beside it is
  `aria-hidden`.
- **`--full` cannot see below the fold.** The shell is `h-dvh` with an inner
  scroller, so `--full` captures one viewport. Use `pnpm shoot <route>
  --scroll=<px>` (added in Home step 1), which scrolls the inner container
  first; before it, a one-off Playwright script was needed to see the
  new-room form and the Start a room button.

## Components that must not be written twice

- **`src/components/member-avatar.tsx`** — `MemberAvatar`,
  `FormerMemberAvatar`, `GroupAvatar`, and `AttendeeAvatar` as a wrapper. Four
  things in one file; do not add a fifth elsewhere. A null author's tile is a
  dash, a member room's is the first letter of its name.
- **`SegmentPills`** — the segment row on Peers, Events and Chat, and the room
  sort bar. Not a fourth kind of pill.
- **`src/routes/chat/composer.tsx`** — takes `sendOnEnter`, true in a thread and
  false in a topic; `edit` makes it the in-place editor of a post or a
  message (no second textarea), and `replyingTo` draws the "Replying to Jan"
  bar.
- **`src/routes/chat/earlier-versions.tsx`** — the administrators' list of
  what an edited post or message said, under a topic's post and under a
  report. `useEdits` in `src/lib/chat/edits.ts` is its one read.
- **`useDialogFocus`** (`src/lib/dialog-focus.ts`) — focus in a sheet: the
  title on open, Tab kept inside, focus back on close. The filter shell and
  the report sheet use it; the likes list and the photograph viewer keep
  older copies of the same rules. A new sheet uses this, not a fourth copy.
- **`ReportControl`** (`src/routes/chat/report-control.tsx`) — Report, then
  "Reported" with focus moved onto it. Posts, messages and group-change
  lines draw it.
- **`src/routes/chat/report-sheet.tsx`** — the sheet to copy where
  `FilterSheetShell` does not fit, which is anywhere the footer is the moment
  something happens rather than Clear and Apply over filters already applied.
- **`SmallButton` and `ReasonField`** live in `src/routes/admin/controls.tsx`.
- **`src/lib/chat/time.ts`** — today `9:30am`, last six days `Mon`, older
  `12 Sep`, another year `12 Sep 2025`. The viewer's zone, not the writer's,
  which is the opposite of `events/format.ts` and right for the same reason
  that one is.

## The rule that cannot fire, and the owner's answer

**"Fill your last room before starting another" is not a rate limit**, and the
plan called it one. A room is born with its first topic and nothing in this
build deleted a topic — no delete policy, no delete grant, and removing a
member nulls an author rather than dropping the row. So the rule could not
fire; it was a latch for the day something did delete one. **That day was
2026-09-27**: an administrator deleting a member-started room's only topic
empties the room, and its starter cannot start another until they write a
topic there (which they can while it is open). Somebody who writes a real topic
each time can start as many rooms as they like.

**The owner's answer, 2026-09-21: leave it.** With a vetted membership of this
size the cap is the close switch on `/admin`; if it is ever abused, that is a
decision with a number in it, and not one to guess now.

---

# Errors read as sentences now — built 2026-09-21

**Done.** Refusals used to reach a member as the database's own words —
`new row for relation "chat_messages" violates check constraint
"chat_messages_check"`, `Could not find the function public.chat_my_threads
without parameters in the schema cache` — and a member who read one of those
read the app as broken rather than as having said no. Now every read hook and
write helper hands the **error object** to `describeError(error, context)` in
`src/lib/describe-error.ts` before it becomes a string, because that is the
last place it still carries its `code`. 53 helper sites, 21 route-level
`catch` blocks, and onboarding's three sign-in paths. The only raw text left
on a screen is `/dev-login`, deliberately — it is a developer's screen.

## How it sorts

- **Ours pass through untouched.** `P0001` (plpgsql's default — 102 of the
  159 raises), `P0002`, `22023`, and a `42501` whose message does *not* say
  "row-level security" ("Not an administrator"). The 18+ trigger's sentence
  reaches the join screen as it is.
- **The database's and PostgREST's are sorted by code**: a policy (`42501` +
  "row-level security") → the screen's `refused` sentence or "You cannot do
  that here."; a check constraint (`23514`) → the screen's sentence for that
  constraint **by name** (`constraints: { chat_posts_attachments_check: … }`)
  or a general one; the unique index (`23505`) → `duplicate`; `PGRST116` and
  `23503` → `missing`; schema drift (`PGRST202`/`PGRST205`/`42883`/`42P01`/
  `42703`) → "The club is being updated. Try again in a minute." with the raw
  body in the console; a missing grant (`42501` + "permission denied for
  table/column/function") → generic, loud in the console, because it is a bug.
- **Storage** ("mime type … is not supported", "exceeded the maximum allowed
  size") and **GoTrue** (`otp_expired` / "Token has expired or is invalid",
  `over_sms_send_rate_limit`) are keyed on their own codes and wording; they
  carry no SQLSTATE.
- **Offline** — supabase-js hands back `{ code: '', message: 'TypeError:
  Failed to fetch' }` rather than throwing; a `catch` sees the bare TypeError.
  Both read "You are offline."
- **Unknown code** → "Something went wrong. Try again in a minute." plus
  `console.error(raw)`. **No code and no recognisable phrase** → passed
  through, since PostgREST always sends a code and a bare message is a
  sentence somebody wrote (a test fixture's, usually).

`context` is either the attempt sentence ("Your reply was not posted.") or
`{ attempt, refused, duplicate, missing, constraints }`. The attempt leads the
translated sentence and is dropped when the message is one of ours, which is
already whole. `describeThrown(e, context)` is the same for a `catch`.

## What the strings are, and where they came from

Every string in `describe-error.test.ts` was provoked on the local stack and
copied out — PostgREST bodies with curl and a minted JWT, the psql ones as
`set local role authenticated`. Two things that would have been wrong from
memory: naming `created_at` in an insert through PostgREST says `permission
denied for **table** chat_messages`, not `for column` (psql says column; the
regex takes both); and `PGRST116`'s message is "Cannot coerce the result to a
single JSON object", with the row count in `details`.

## The proof it is wired, not only written

A pure function's test is a test of strings. The wiring was checked twice:

- **Sabotage.** `describeError` made to return a marker: the onboarding screen
  test failed with the marker in the rendered DOM, and the rooms hook and two
  write helpers with it. Restored before the commit.
- **Live**, against the local stack with the dev server on 5183: a wrong OTP
  reads "That code is not right, or it has expired. Ask for a new one." on the
  real join screen; `chat_my_threads` renamed for a minute put "The club is
  being updated." under the conversations list with the `PGRST202` body in
  the console. The function was renamed back and checked.

## What is left, and the traps

- **The two local translators are gone.** `describeFailure` in
  mentor-invites keeps its name and its two sentences but takes the error
  object and delegates; `describeUploadFailure` in attachments went, its
  wording now in the shared one.
- **A screen that learns a new constraint names it.** The general sentence
  for `23514` ("Something in it is not allowed: too long, blank, or too many
  of one thing.") is honest but vague; the constraint name in the message
  says which, and the fix is one line in that helper's `constraints`.
  `pg_constraint` on the local stack lists them all.
- **The same action still fails two ways** — that is what the `refused` /
  `duplicate` split is for. A room's `chat_create_room` says "There is already
  a room called X" itself (P0001) and the index behind it is only for two
  members racing; both are named in `createRoom`.
- **Tests that mock an error with no code** get phrase-sorting: `{ message:
  'relation "…" does not exist' }` reads as drift. Give a fixture a `code`
  when the test is about the code.

# The WAI design tips, and where the site stands — 2026-09-23

The owner asked for w3.org/WAI/tips/designing to be the standard. Audited
tip by tip against the real app: axe-core (WCAG 2.1 A/AA + best practice)
on ten screens as a signed-in member, a keyboard walk, a 320px measurement,
and a read of the code. Biome's a11y rules already run in `pnpm check`.

| tip | state | where |
| --- | --- | --- |
| 1 Contrast | met — axe passes every screen | tokens in `src/index.css` |
| 2 Not colour alone | met — the unread dot has an sr-only " — new" and the tab an aria-label; pills are `aria-pressed`; every error is text | `thread-row.tsx`, `app-nav.tsx`, `segment-pills.tsx` |
| 3 Interactive elements identifiable | **done 2026-09-23** — one `:focus-visible` ring, 3px navy, gold on navy; before it the browser's ring took `--ring/50` and was faint grey | `src/index.css` `@layer base` |
| 4 Consistent navigation | **done 2026-09-23** — skip link, and `RouteChange` in `App.tsx` retitles ("Chat · The SCI Club") and moves focus to `main` on every route change, not the first screen | `App.tsx`, `route-change.test.tsx` |
| 5 Form labels | met — axe's label rules pass; the search box has a visible placeholder and an aria-label | — |
| 6 Identifiable feedback | **done 2026-09-23** — every error paragraph is `role="alert"`, every "Loading…" is `role="status"`; before, 24 errors announced nothing | 23 files, mechanical |
| 7 Headings and spacing | met — one h1 per screen, h2 sections, axe's heading-order passes | — |
| 8 Viewport sizes | met — measured at 320px, no horizontal overflow on any tab; text-size and large-target preferences exist | `src/lib/accessibility.tsx` |
| 9 Image and media alternatives | **partly** — see below | — |
| 10 Auto-playing content | met — nothing autoplays; spinners honour `prefers-reduced-motion` | `src/index.css` |

**Tip 9 is the one that needs a decision, not code.** Two gaps:

- **Chat photographs have no description.** A picture is announced as
  "Photograph 2 of 4 from Bo" and the words beside it are its only
  description (the reasoning is in `attachment-grid.tsx`'s header). The WAI
  tip asks the *design* to make room for a text alternative. That means a
  field in the composer — "Say what is in it" — and a column to hold it, and
  it is the owner's call whether a chat is the place for that form.
- **A profile photograph's alt text is never written.** `members.photo_alt`
  exists and every avatar reads it, but no form sets it: the details form and
  onboarding upload the picture and leave it null, so every avatar is
  `alt=""` — decorative — with the name adjacent. Asking "Describe your
  photo, for members who use a screen reader" on the details form is one
  field and no migration, and is the honest fix. Recommended.

## What is next for accessibility, in order

Decided with the owner 2026-09-27. Ranked by what a member using a screen
reader, a switch or a keyboard would notice first. Each is small; none needs
a migration except the fourth.

1. **An hour with VoiceOver on a real iPhone, before any more code.** The
   join flow, the deck, a profile, sending a message with a photograph,
   starting a room. Everything below was found by a tool or by reading; what
   VoiceOver finds is wording and reading order, and it will reorder this
   list. Write down what it *says*, verbatim, the way the error strings were
   copied rather than remembered.
2. ~~**The photograph viewer is not a dialog.**~~ Done 2026-09-29, before
   Home step 1 (`5295556`): `role="dialog"`, `aria-modal`, Tab kept inside,
   focus back on the tile that opened it. This item used to name the two
   sheets as the pattern to copy; neither was — on 2026-09-30 both were found
   to move no focus, and both are fixed (see "Home, step 4"). **The pattern
   is `useDialogFocus`** in `src/lib/dialog-focus.ts`, which the filter
   shell and the report sheet now call. The viewer and the likes list keep
   older copies of the same rules.
3. **Write a profile photograph's alt text.** `members.photo_alt` exists and
   every avatar reads it; nothing sets it. One field on the details form
   under the photo — "Describe your photo, for members who use a screen
   reader" — saved by `saveDetails`. No migration. Onboarding's photo step
   can ask the same, optionally. Until then every avatar is `alt=""`.
4. **A description for a chat photograph** — the owner's call, not yet
   given. A field per picture in `PhotoStrip` and somewhere to keep it
   (`attachments` is `text[]` of paths; a parallel `attachment_alts text[]`
   is the small version). If yes, the viewer reads it instead of "Photograph
   2 of 4 from Bo".
5. **Say when a save worked.** WAI tip 6 asks for confirmation as well as
   errors. Errors are `role="alert"` now; success is mostly silent — the
   details form, the survey, an RSVP, a like and following an organization
   change what is on screen and announce nothing. A polite live
   region in the shell (`role="status"`, one at a time) that a write helper's
   caller can speak through — "Saved.", "You are following NorCal SCI." — is
   one component and a line at each site.
6. **Audit the toggles.** `follow-button.tsx` is the model: `aria-pressed`
   and a label that says what pressing will do. RSVP on an event swaps
   its words instead (Join/Leave on a room went with Home step 2b), which
   is fine to read and
   says nothing at the moment it changes — item 5 covers the announcement;
   this is checking each one has a name that is true in both states.
7. **Keep axe in the loop.** The run that found the landmark gap was a
   scratch script. It wants to be `pnpm a11y` beside `pnpm shoot` — same
   sign-in, same local stack, axe-core over the same ten screens, non-zero
   exit on a violation — so the next regression is found by a command and
   not by a member.

**Merged 2026-09-27:** the WAI work (`fab7455`, `95c24d1`, `e685383`) and
this section reached `main`, and so production. Nothing in them touches the
database.

**Two things a tool cannot check.** Half an hour with VoiceOver on an iPhone
— the club's platform — through the join flow, a profile, and sending a
message will find wording and reading-order problems that no audit here can.
And `RouteChange` keys the title on `main h1, h1`; a screen that gains a
second h1, or draws its h1 outside `main`, will name the page wrong.

# Notifications on an iPhone — built and live 2026-09-27

**Done — this section is now the record of how.** It was the owner's next job,
decided 2026-09-27. A member who is sent a message
finds out the next time they open the app. The club is phones, and mostly
iPhones, so this is Web Push to a web app on the Home Screen — no App Store,
no native wrapper.

**Where it stands, end of 2026-09-27: everything is built, tested end to end
on the local stack, and merged to `main`. All six go-live steps are done;
notifications are live on 2026-09-27.** What is left is an iPhone: nothing
here has been tested on one.

| step | state |
| --- | --- |
| 1. `pnpm exec supabase db push --linked` — `20260927000000`, `…010000`, `…020000` | **done 2026-09-27 by the owner**; `migration list` shows all three remote. (Two attempts from a session were refused by the permission system — a write to the live database is run by a person.) |
| 2. `supabase secrets set` VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY | **done 2026-09-27**, from the pair in `.env.local` |
| 3. `supabase functions deploy push-notify` | **done 2026-09-27**, version 1, `verify_jwt: false`; answers 405 to a GET and 400 to a bad body |
| 4. SQL editor: `select vault.create_secret('https://erijdvqnxavwezsbbojv.supabase.co/functions/v1/push-notify', 'push_notify_url');` | **done 2026-09-27 by the owner.** The sending switch; deleting that secret stops everything. Checked: the live function answers a wrong secret with 401 "not the trigger", so it reaches `push_owed` |
| 5. Netlify: `VITE_VAPID_PUBLIC_KEY` = the public key in `.env.local`, then redeploy | **done 2026-09-27** — set by the owner (not marked secret, correctly), checked equal to `.env.local` with `netlify env:get --filter thesciclub`, rebuilt with `netlify api createSiteBuild`; the live bundle carries the key and Me on production shows "Off on this device." with the button |
| 6. merge to `main` | **done 2026-09-27** — safe before 1, 4 and 5 because the controls stay hidden and nothing sends |

Then on a real iPhone: add to the Home Screen, sign in, turn on, and have
somebody send a direct message with the app closed.

**The VAPID pair was generated 2026-09-27 and lives in `.env.local`.**
Changing it later strands every existing subscription until the member
presses the button again (`turnOnNotifications` remakes a subscription made
under another key), and means `secrets set` again.

## What is sent — the owner's decisions, 2026-09-27

| event | who | lock screen |
| --- | --- | --- |
| direct message | the other member | **Direct message from Bo** · the words, cut at 120 characters on a word, or "Sent a photograph." |
| group message | everybody else in the group | **Group message from Bo** · the words, likewise |
| reply in a topic | the member who *started* the topic | **Reply to your topic** · "Bo replied to your topic." — never the words, never the room or topic |

Nobody paused, not the author, not a starter who can no longer read the room
(an administrator closed it). **A conversation, a topic and a room can each be
muted** — a room's mute means replies to *your* topics in it, since those are
the only notifications a room produces. No room, topic or group is ever named
on a lock screen.

Where each piece is:

- `supabase/migrations/20260927010000_…` — the three mute tables, `push_owed`
  (who is owed and what it may say; returns **no body for a reply**, so the
  function could not leak one), `push_forget`, and the trigger. Probe:
  `supabase/tests/push-notify.sql`.
- `supabase/functions/push-notify/` — `index.ts` (Deno), `compose.ts` (the
  words, Vitest-tested), `webpush.ts` (VAPID + aes128gcm on WebCrypto, and
  its test reproduces RFC 8291's worked example byte for byte).
- `src/lib/chat/mutes.ts`, `src/routes/chat/mute-button.tsx`.

**How the database reaches the function**: an `after insert` trigger on
`chat_messages` and `chat_posts` calls `net.http_post` with only the table
and id; pg_net sends after commit. The trigger swallows every error — a
notification must never cost the message. It carries the vault's
`push_notify_secret`, which the function passes back to `push_owed` for the
database to check; the function never holds it.

**Checked end to end on the local stack** (`supabase functions serve
push-notify --env-file …`, the vault's `push_notify_url` set to
`http://kong:8000/functions/v1/push-notify`): a direct message, a group
message and a topic reply each went trigger → function → Google's push
service → Chromium, which decrypted and showed exactly the words above; a
muted conversation's message produced nothing and the function said
`owed: 0`. **Not checked:** a 404/410 from a push service forgetting the
device — `push_forget` is probed in SQL but no push service was made to say
gone.

## Six more, built the same evening (20260927020000)

The owner said yes to the suggestions. Wording is in `compose.ts`; who is in
`push_owed`; the probe is `supabase/tests/push-notify-more.sql`.

| kind | who | lock screen | off switch |
| --- | --- | --- | --- |
| `group_add` | somebody added by somebody else — the trigger takes the adder from `auth.uid()`, so joining yourself or creating a group sends nothing, and an event's group never does | **Added to a group** · "Bo added you to a group." | Me |
| `reply_participant` | everybody who has posted in the topic, but not its starter (they get `reply`) or the replier | **Reply in a topic you posted in** · "Bo replied in a topic you posted in." | Me, and the topic's and room's Mute |
| `report` | every administrator but the reporter | **New report** · "A member reported something. Open Admin to see it." — nobody named, nothing quoted | Me |
| `invite_joined` | the member whose invite it was | **Somebody you invited joined** · "Ana joined the club." | Me (mentors) |
| `event_reminder` | members *going*, the day before, by the event's own zone | **Tomorrow: Adaptive handcycling** · "You're going. It starts at 10:00am." | Me |
| `org_events` | followers; events created in the last day and still ahead, one per organization | **New from NorCal SCI** · "3 new events." | Me |

The last two come from `push_daily()` via pg_cron at 16:00 UTC, after the
04:10 ingest; `push_daily_runs` makes a second run on one day do nothing.
Event titles and organization names are public, so those two may name
theirs; nothing names a room, topic or group.

**The badge**: a message push carries the recipient's unread count
(`push_unread_count`, held to `chat_unread_count`'s answer by the probe); the
service worker sets it on the app icon and `useUnreadThreads` keeps it true
while the app is open.

**Two things found by running it:**

- **A push a few seconds after a Chromium subscribed came back 404**, the
  function forgot the device, and every later notification went nowhere
  while the switch on Me still said On. Not reproduced since; the likely
  cause is the push service still settling a new registration.
  `push_forget` now spares a subscription younger than ten minutes, and the
  function logs every device it forgets.
- **In a Playwright page, `registration.getNotifications()` stopped at two**
  while the service worker's own count reached six. The worker is the truth:
  a log line in its push handler showed all six arriving and shown. A test
  of delivery should read the worker (`ctx.serviceWorkers()`, `console`),
  not the page.

## What iOS allows, checked against WebKit's own post

Read https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
before writing anything; these five were confirmed there on 2026-09-27.

- **iOS and iPadOS 16.4 or later.**
- **Only a web app that has been added to the Home Screen.** Not a Safari
  tab. The manifest's `display` must be `standalone` or `fullscreen` — ours
  is `standalone` already (`vite.config.ts`).
- **Permission is asked in response to a tap**, never on load. A request
  made any other way is ignored, and a member who says no is not asked
  again by the system.
- **The standard Push API, Notifications API and a service worker**, with
  VAPID. No Apple Developer Program membership. The endpoints are under
  `*.push.apple.com`.
- **The Badging API works** for a Home Screen web app — `setAppBadge` /
  `clearAppBadge`, foreground or background. `chat_unread_count()` is
  already the one definition of the number.

**Not confirmed, and to be before it is relied on:** that a push which shows
no notification costs the subscription. Safari has said so for the Mac; the
iOS post is silent. Assume every push must show something
(`userVisibleOnly: true`) until a real phone says otherwise — which decides
whether a message for the conversation already on screen can be swallowed.

## What the repo has, and what it does not

Written while pieces 1 to 3 were being built; the last column is brought up
to date, since everything here is live.

| | state |
| --- | --- |
| manifest, `display: standalone`, icons, `apple-touch-icon` | there |
| a service worker | **ours since 2026-09-27** (piece 1): `src/sw.ts`, `injectManifest`, IIFE. Keeps everything the generated one did and adds `push` / `notificationclick`; the words and the address are `lib/push/payload.ts` |
| anything that can send | **`supabase/functions/push-notify/`** (piece 4), deployed to the hosted project |
| somewhere to keep a subscription | **`push_subscriptions`** (piece 2), written only by `push_subscribe`. On the hosted project since 2026-09-27 |
| a way to say yes | **the Notifications row on Me** (piece 3), `lib/push/notifications.ts` + `routes/me/notification-settings.tsx`; sign-out forgets the device |
| VAPID keys | in `.env.local`, see above; the private key a function secret, the public one `VITE_VAPID_PUBLIC_KEY` in Netlify |
| a definition of "new" | there — `chat_my_threads()` / `chat_unread_count()` |
| in-app delivery | there — realtime on messages, posts, topics, threads, rooms |

## The shape of it

The plan as it was written, kept for its reasoning. All five pieces are
built; where the build differs (the function is `push-notify`, not `notify`,
and a trigger with `net.http_post` stands where a webhook is named), the
sections above are what is true.

Five pieces, and each can be finished and looked at before the next.

1. **The service worker becomes ours.** `strategies: 'injectManifest'` with
   a `src/sw.ts` that keeps Workbox's precache (`precacheAndRoute(
   self.__WB_MANIFEST)`) and adds `push` → `showNotification` and
   `notificationclick` → focus an open window or open the URL the push
   named. Check `autoUpdate` still updates and the app still opens offline
   afterwards; this is the change most likely to break something that works.
2. **`push_subscriptions`.** `member_id`, `endpoint` (unique), `p256dh`,
   `auth`, `user_agent`, `created_at`. A member reads, inserts and deletes
   their own and nobody else's. **Insert and delete, not update — so not an
   upsert**: that is the join-a-room bug exactly, see "What will bite the
   next person". One phone is one row; a member with a phone and a tablet is
   two.
3. **A row on Me, "Notifications"**, beside the accessibility settings. It
   has four states and must say which one it is in: *not on the Home Screen*
   (say how — Share, Add to Home Screen — because nothing can be asked until
   then; `navigator.standalone` / `display-mode: standalone` tells them
   apart), *not asked* (the button, and the tap is the gesture), *on* (with a
   way to turn it off, which deletes the row), *refused* (the system will
   not ask again; say where in Settings it is changed).
4. **The sender: one Edge Function.** `supabase/functions/notify`, called by
   a database webhook on insert into `chat_messages` (and `chat_posts`, if
   the owner says so). It works out who is owed — the thread's members but
   not the author, not anybody paused or removed — reads their subscriptions
   with the service role, signs with VAPID and sends. **A 404 or 410 from the
   push service means the subscription is dead: delete the row**, or the
   table fills with phones that were wiped. The private key is a function
   secret (`supabase secrets set`), the public key is a `VITE_` variable.
   Never `config push`.
5. **The badge.** `setAppBadge(chat_unread_count)` when a push lands and when
   the shell re-asks; `clearAppBadge()` at zero.

## What building pieces 1–3 found

Each by running it, not by reading.

- **Chromium's push endpoints are `https://jmt17.google.com/fcm/send/…`**, not
  the `fcm.googleapis.com` every guide quotes. `push_subscribe` refuses any
  endpoint that is not a push service's (the sender will POST to it, so an open
  column is a way to aim our function at any URL), and its first list refused
  every Chrome member. It allows any `google.com` host now. **If a new browser
  is refused, subscribe in it and read the host** — do not guess.
- **A device changes hands and keeps its endpoint.** Sign out, sign in as
  somebody else, and the browser returns the same subscription. So the
  endpoint is the primary key and `push_subscribe` *takes it over* from
  whoever held it; with a plain unique constraint the second member is refused
  and the first keeps getting their messages on a phone somebody else holds.
  Sign-out also deletes the row (`forgetThisDevice`, bounded at 3s), and the
  takeover is the backstop for when that did not run.
- **Playwright cannot test push by default, twice over.** The headless shell
  denies notification permission whatever `grantPermissions` says — launch
  with `channel: 'chromium'`. And every `newContext()` is incognito, where
  Chrome has no Push API at all; the error reads "Registration failed -
  permission denied". Use `launchPersistentContext` with a scratch profile.
- **`navigator.serviceWorker.ready` never settles where no worker registered**
  — the dev server, since `devOptions` is off. So the row cannot be exercised
  under `pnpm dev`: build against the local stack and `vite preview --outDir`
  it. `turnOnNotifications` races `ready` against ten seconds for the same
  reason.
- **Checked in the real browser**: a new deploy's worker takes over an open
  tab (autoUpdate still works), `/chat` opens offline, a delivered push
  (`ServiceWorker.deliverPushMessage` over CDP) becomes a notification with
  the payload's title and a garbage one with "The SCI Club", and the row runs
  on → reload → off → on → sign out with the table matching at every step.
  **Not checked: `notificationclick`**, which cannot be dispatched from a
  script (a synthetic event's `waitUntil` throws); `pickWindow` is unit-tested
  and the tap itself is for the phone.

## The decisions that were the owner's, before piece 4

Made 2026-09-27 and recorded in "What is sent" above. The recommendation here
had been no words on a lock screen by default; the owner chose the words for
direct and group messages and none for replies. iOS's own setting — Settings,
Notifications, Show Previews, *When Unlocked* — hides them on a locked phone
for any member who wants that, and is worth telling people about.

## Traps, most of them already in this file

- **It cannot be tested on a simulator or in a tab.** A real iPhone, the
  site over HTTPS, added to the Home Screen. The Netlify deploy is the easy
  way; a tunnel works (ngrok and cloudflared hostnames are in
  `server.allowedHosts`). Build the whole path in desktop Firefox or Chrome
  first — same API, and Playwright has Firefox — then take it to the phone
  for what only the phone does.
- **An installed web app is a separate browser.** It does not share Safari's
  storage, so a member who adds the club to the Home Screen signs in again
  there. The Notifications row should expect that, not be surprised by it.
- **No test may reach the network.** `pushManager.subscribe` and the
  function call go behind a module a screen test stubs, like every other
  hook. The four states of the row are a pure function of three booleans and
  are tested as one.
- **A probe as the superuser proves nothing about the table's policies.**
  `push_subscriptions` gets a probe that reads as a member and tries to read
  somebody else's row, with `current_user` printed at the top.
- **The webhook fires for every insert, including the ones the app is
  showing.** If every push must show a notification (see "Not confirmed"),
  the member looking at the conversation gets one for the message on their
  screen. The service worker can see its open windows
  (`clients.matchAll`); what it is allowed to do about it is the thing to
  settle on a real phone.
- **Errors read as sentences.** A refused subscription or a failed send goes
  through `describeError` like everything else; the push service's own
  words do not reach a member.

# Next up: the owner's call

Chat and Home are built, each has its own section above, and every
migration is on the hosted project. The app is live and the ingest is
running current code. Work on this branch ships when it is pushed to `main`,
which Netlify builds from — at the owner's word, and gated on `pnpm check`.

**One question is open and it is not a coding one.** The 29 "Staying Driven
Wheelchair Fitness" events have no format — NorCal SCI's own page never says
whether it is Zoom or a gym. It is one series, and collapsing the list means it
now occupies one card rather than nine, so it is less visible and no less
unanswered. **Ask NorCal SCI. Do not write a rule that guesses.**

Things that are real, wanted, and nobody has asked for yet:

- **The survey is linear only** (item 4 below). Twelve screens with Back and no
  overview of what you said. There is a "Finish later" on every screen now, so
  leaving is easy; changing one answer months later still means walking to it.
- **Series-level dismissal.** The ✕ was removed from event cards because hiding
  one Friday does nothing about next Friday. Now that series are grouped and
  collapsed, it finally has something to hang on.
- **The Peers filter *sheet* still has no search box.** The deck itself does
  now, and searching "SmartDrive" reaches anybody who mentioned it anywhere —
  so this is smaller than it was. What is left is the sheet's own topic list:
  29 grouped topics, capped at 24 by frequency, so a rare one-person topic
  cannot be *ticked*. Reachable by typing it, unreachable as a filter.

**Chat is done — see "What Chat is" above, and the error-message job is the
section before this one.** Home is done too: see "What Home is".

History, kept for its reason: until 2026-09-29 this said **"Do not build
Home without asking"** — it was deliberately deferred in CONTEXT.md and said
so on screen, and the mock renders it convincingly, which was the trap
rather than the mandate. The owner asked on 2026-09-29, and it was built
from a plan since deleted (see "What Home is"). The rule under it still stands for anything else the
mock draws: CONTEXT.md's "Deliberately deferred" list is not built without
the owner asking.

## What the 2026-09-17 session changed, in one place

For a new session, so the diff does not have to be read:

- **Events**: "I'm going" and "Interested" are upcoming-only; **Been to** is a
  third pill beside them. Past events draw as a line rather than a card and
  offer no RSVP, on the list and on the detail page. Repeating events collapse
  to their next date with "Weekly · 8 more dates through 14 Oct", opening in
  place. "Any time" starts at today.
- **Me**: three counters, always, including at zero. Deck visibility moved here
  from Your details and writes on the tap. Good standing is backed by strikes.
- **Admin**: strikes can be given and withdrawn, with a reason required for
  both. An administrator's row carries no controls at all. Removing somebody
  now says that their event history goes with them.
- **Everywhere**: buttons have hover states; boxes that hold text are sized in
  `em` off that text.

## Four traps the 2026-09-17 session walked into

Each cost real time, and each is the kind that repeats:

1. **A test that passes by not running, in a new shape.** The first
   `admin-is-protected.sql` run reported eleven steps and had exercised one —
   the first expected refusal aborted the transaction and the rest printed
   "current transaction is aborted", which reads like passing. **Every expected
   failure needs its own savepoint.**
2. **Verifying the wrong number.** The profile ring was declared fixed after
   measuring the label against the *box* (46px) when the constraint was the
   circle's *interior* (34px). It stayed broken through a release and two bug
   reports. **Measure the thing that actually constrains.**
3. **`pnpm fix` silently voiding an edit.** A string-match patch that no longer
   matched did nothing, and the sabotage check that was meant to prove a test
   worked reported a pass. **Assert that every scripted replacement applied.**
4. **Two RLS policies ORed.** `member_strikes` lets a member read their own
   *and* an administrator read every one, so an unfiltered select showed an
   administrator the whole club's strikes on their own card. **A policy written
   to be generous to one audience is not a filter for another.**

---

# Buttons answer a pointer now

Before this the whole app had exactly one hover state — `md:hover:bg-tint` on
the nav — so every button on every other screen was inert under a cursor.

One palette, used everywhere, so a control's family is legible from how it
responds: navy lifts to `--navy-hi`, tint darkens to `--line`, gold lifts to
`--gold-hi` (added for this), an outline fills with tint, a destructive tint
deepens, and a card-shaped link firms its border. Everything carries
`transition-colors`, which the reduced-motion kill switch at the bottom of
index.css already turns off for anybody who asked for none.

**Plain `hover:` is correct here, not `md:hover:`.** Tailwind 4 compiles the
hover variant inside `@media (hover: hover)` — confirmed in the built CSS — so
a touch device never gets the sticky hover that the `md:` prefix was guarding
against.

The two hover pairs that carry text are in `theme-contrast.test.ts` alongside
the rest of the palette. A hover colour picked by eye is exactly where a
palette quietly drops under AA.

# A box measured in pixels around text measured in rem

The club offers a text-size setting, and it multiplies the root font size — so
anything sized in `rem` grows and anything sized in `px` does not. Every bug of
this shape looks like a rendering glitch and is really that one mismatch.

Found by the owner on `/me`: at the largest setting the profile ring held
"13%" but clipped "100%" to "00%", because the ring was `h-[46px]` and the
number inside it was `text-[0.75rem]`. Measured, the label reached exactly 46px
— the full width of the circle including its stroke.

Swept the rest with a detector rather than by eye
(`scratchpad/overflow.mjs` in a session; it walks every element at the largest
setting looking for `scrollWidth > clientWidth` inside a clipping box). It found
two more:

- **The organization tile.** `h-[38px]` with `text-[0.6875rem]` letters, and
  the small variant on a peer card 22px. Both now size in `em` off their own
  letters. It also turned out a four-letter code never fitted at *any* size —
  CDRF overflowed by twelve pixels, and WWM by two, because letter widths are
  not equal. Long codes shrink by length now.
- **`/admin` member and invite rows.** `flex-1` with no basis, so the name
  column collapsed towards nothing to keep three buttons on one line: at the
  largest setting a member's phone and city wrapped into a four-character
  ribbon *underneath* the buttons. The column has a basis and the buttons wrap.

**The rule: if a box contains text, size the box in `em` off that text.** The
event date tile already did this and its comment says why — it is the one place
that got it right first.

Two things the detector reports that are correct and should stay: `sr-only`
elements (they are a clipped 1px box by definition) and the `sr-only` file
input on `/profile/details`.

# The owner's five, and what two of them turned out to be

Reported 2026-09-16, all fixed. Recorded because two were misdiagnosed in ways
that would have cost the next session the same afternoon.

**1. Going and Interested kept events that were over.** Both RSVP segments skip
the date window deliberately — a trip four months out must not vanish because
the window says "this week" — but skipping the window is not the same as
pretending an event has not happened, and a flat ascending sort left last month
above next week for ever. They run upcoming first, then a Past heading, then
what is over, most recent first. Me's counters count upcoming only; they used to
count every RSVP row ever written, so they climbed and never came down. The
dates reach Me through an embed on the RSVP query rather than by loading the
calendar on a screen that has no other use for it. `isPastEvent` and
`isPastStartTime` are one boundary, so the heading and the counter cannot
disagree about where today begins.

**1b. A past event is drawn as a line, not a card.** Follow-on from the above,
asked for once the Past group existed. Everything the full card carries answers
"should I go to this" — tags, place, the going counter, the faces, both buttons
— and none of it is live afterwards. What is left is when, what and whose.
Measured: 203px becomes 62px, so seven fit where one and a half did. It is
keyed off the event's date rather than the segment, so the "Past events" window
stops offering an RSVP to something that has already happened.

**2. Onboarding made you tap the box first.** `inputMode` and `autoComplete`
were already right, including `one-time-code`; there was simply no focus.
`useAutoFocus` in `onboarding/chrome.tsx` covers phone, code, name and the
injury year — not the birthday, which is a picker, and not the city step, whose
first offer is "use my location". A field that already has an answer is
selected, so going back means typing over it.

**3. "Firefox renders the top bar too small" was not Firefox.** Both engines
measure identically at every width; Firefox was a red herring and the window
width was the whole story. The shell widened at `lg`, so everything from 480 to
1023 got a 480px ribbon with dead margin either side and the tabs at the
bottom. It is `md` now. The deck had the mirror fault — two-up at `sm`, a
viewport width, while the shell was still capped at 480, so two cards shared a
phone-width column. **Before believing a browser-specific bug report, measure
both engines at the same width.** The cost of not doing so here would have been
a hunt through Tailwind 4's browser support for a number that was in `App.tsx`.

**4. An unknown address rendered the tab bar over nothing.** `/*` matched the
shell, matched no route inside it, and drew an empty page. There is a
`not-found` route inside the shell now, with a link out, because a member who
followed a stale link has nothing behind them.

**5. Every peer card showed the same organization.** `affiliations[0]`, and
NorCal SCI is first for all 23 members who have one — so Canine Companions, the
Christopher Reeve Foundation, High Fives, ReCARES, SCVMC and Wheel with Me
never appeared in the deck at all. The card draws every affiliation as a mark
and no name; the names are on the profile, which already listed them. The badge
is `aria-hidden` by contract, so the row carries an `sr-only` name list.

## The publishable key in `.env.local` was wrong, and nothing said so

Local dev could not reach the hosted project at all: every request came back
`401 Invalid API key`, and the only visible symptom was onboarding refusing to
advance past the phone step. The service role key was fine, which is why the
ingest and every script kept working — only the browser half was broken.

The stored key was four characters longer than the real one. Corrected from the
source of truth:

    pnpm exec supabase projects api-keys --project-ref erijdvqnxavwezsbbojv

The publishable key is browser-visible by design, so this is a correctness
problem rather than a secret to protect — but **whoever sets Netlify's
`VITE_SUPABASE_ANON_KEY` should take it from that command, not from a copy.**

## Firefox is installed for Playwright now

`pnpm exec playwright install firefox` refuses to finish because
`playwright install-deps` needs root, but it downloads the browser before it
validates, and the browser runs against the same unpacked libraries `pnpm shoot`
already puts on `LD_LIBRARY_PATH`. So a second engine is available for exactly
the kind of report item 3 turned out to be:

    LD_LIBRARY_PATH="$HOME/.cache/thesciclub-browser-libs/root/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH" node your-script.mjs

`pnpm shoot` itself is still chromium-only.

# The job: UI, UX, and the gaps

Roughly in order of how much they matter.

## 1. A UI and UX pass has been done — read this before redoing it

The event-card location problem that stood here is fixed, along with a batch of
others found by going through every screen at 430px and 1280px. What follows is
what changed and, more usefully, what was looked at and deliberately left.

**Fixed**

- `src/routes/events/place.ts` reads a feed's location out as a place: the
  venue name paired with the geocoded city, the country and postcode trimmed,
  and no more printing the city twice. Longest string 95 → 40 characters. The
  empty field is answered by format — silent for the 47 online events, "Location
  on the organizer's page" for the 42 in person or unclassified.
- `--grey` was #7c8899, which is 3.60:1 on white and under AA for text that
  size, in 81 places including an event's time and place. It is #667283 and
  `src/theme-contrast.test.ts` holds the palette there. Both grounds have to
  clear — grey sits on cards *and* on the page behind them, and the page is
  darker.
- `src/routes/peers/topics.ts` groups the free-text topics. 61 distinct strings
  across 18 members with 53 named by exactly one person, in a sheet that caps
  at 24; grouped, 29 and 17. Same shape as the event tags in classify.js, and it
  keeps a member's own words on their own profile.
- "/" opens Peers. It opened Home, a placeholder whose copy says the working
  surfaces are elsewhere. (History: Home is built, and from Home step 5,
  2026-09-30, "/" opens it again.)
- The nav is a top bar on a desktop and the Chat tab is no longer raised — the
  strongest mark in the bar was on the one tab that does nothing.
- Organizations are ordered by what they are running. 5 of 23 host anything.
- The club's own account sorts to the end of the Peers deck rather than the top.
- The survey's Continue follows the questions on a desktop: pinning it put 461
  measured pixels between the last answer and the button, twelve times over.
- Smaller: a calendar rather than a map pin in front of the date; one name for
  the RSVP button; the Going counter goes to the going list; Admin has its own
  heading rather than sitting under Invites.

**Looked at and left, with reasons — do not "fix" these**

- **Events is one 720px column and each card has space to its right.** Both are
  deliberate and the reasoning is in `--events-measure` in index.css: a card's
  title, host and buttons stay within one eye movement and one short pointer
  movement, which a member driving this with a head pointer or a mouth stick
  pays for in effort. Measured, four cards start above the fold at 1280×900.
  A review of this screen first called the space wasted; that was a screenshot
  read at the wrong scale, and widening the row would have cost exactly the
  people the measure protects.
- ~~**The house-rules sentence under Good standing.**~~ Removed 2026-09-18 at
  the owner's request — the card says where you stand, and the four things that
  end a membership sit behind "What can end a membership", which opens on hover,
  on focus and on tap. CONTEXT.md now says *reachable* rather than *visible*,
  and the sentences move to the terms of service when there is one.
- **Two links on an event detail.** The description's own "REGISTER HERE" and
  the "Details on their site" button go to different places, and the button
  already says "Register" when there is a registration URL.
- **Uneven column heights on `/me`.** Inherent to two columns of unequal
  content; rebalancing would fight the deliberate placement of the display
  settings above sign-out.

## 1b. A second pass, on the profile survey and the invite system

Everything below is done. It is here so the next session does not rediscover
the reasoning, and because two of the invite items changed behaviour that a
member can feel.

**The survey and profiles**

- Topics, interests, self-care and languages take an answer in the member's own
  words: "Add your own" opens a box, and what they type joins the row as one of
  their answers. The lists were a sample of an open set — every option came off
  a real directory — and the seeded data already held a neural implant and
  "being a mom in a wheelchair". Own answers are derived from what is saved,
  not held in state, so tapping one off removes it rather than leaving it
  unselected. The button is "Add your own" and not "Something else", which is
  already an option in the self-care list.
- "Other" is gone from languages. It recorded only "not one of these", which
  nobody can be searched by. Anybody who already picked it keeps it: a saved
  answer missing from the options renders as one of their own, and that is
  tested.
- Whether children came before or after the injury now shows on a profile.
  `children_when` has been asked since the first members migration and nothing
  ever displayed it. Rendered only for members who said yes — "Children: No" is
  not the fact it carries.
- The birthday chip is off the Me hero. Me is the only screen you see of your
  own, so it told you your own birthday. The date still feeds `ageFrom`.
- **Peers no longer lists the person reading it**, and the count under the
  deck no longer counts them. Nobody had decided it did: `browse_members`
  filters on `show_in_browse` and `status` and never excluded `auth.uid()`, and
  the client did not either. The deck answers "who could I talk to", and you
  are not one of them.

  The exclusion is `othersOnly` in `src/routes/peers/filters.ts`, applied in
  the page — **not** in `browse_members`, and that placement is the point. The
  view also backs `/peers/:id`, so dropping yourself from it would take your
  own profile with it.
- **Me links to your own card**, at `/peers/<your id>`, under "How you look to
  other members". The survey exists to shape what other members see and the
  only feedback on it was a percentage; a ring saying 62% does not tell you
  that your photograph crops badly. It renders through the ordinary profile
  page — no new screen — and it is the only route to that page now the deck
  excludes you.

  Its back button reads where it goes. It has always been `navigate(-1)`, so
  arriving from Me it returned to Me while saying "Peers"; `backFrom(state)` in
  `member-detail.tsx` takes a `{ from: 'me' }` on the link. Both the ordinary
  profile and the official-account variant use it.

  Signed in as **Admin** you see neither yourself nor the club's official card,
  because they are the same row. Every other member still gets the official
  card at the end of their deck, which is how they reach the club.
- A profile flows past the photograph rather than beside it. The picture is a
  float at `lg`, so the page takes the whole width once past the bottom of it,
  instead of leaving 776 measured pixels of empty column. The bordered cards
  are `flow-root` so they narrow beside the picture rather than sliding under
  it. Checked against a tall portrait.

  **On a phone the profile is the mock's hero now** (owner, 2026-09-21): the
  photograph cropped to a fixed 300px with the name, "Peer mentor" and the
  summary over its foot, then a navy band with one gold Message button. Fixed
  pixels and not `vh`, because most members open this in a browser where the
  URL bar takes its cut first. The mock's organization mark in the badge and
  its "Ask <name>" button are both left out on purpose. The picture used to be
  shown whole; the header of `member-detail.tsx` records the change.

**Events**

- There is an Interested segment. It ignores the date window for the same
  reason "I'm going" does, and the Interested counter on Me finally has
  somewhere to point.

**The invite system — read this before touching `admin_delete_member`**

Three bugs, all found by running the lifecycle rather than reading it. The
probe that found them is checked in as `supabase/tests/invite-lifecycle.sql`;
it runs in one transaction and rolls back.

- **Deleting a member did not keep them out.** Their invite stayed 'consumed',
  and `has_active_invite` accepts consumed, so they could sign in and recreate
  their row unasked with a null `invite_id`. The house rules say membership can
  be lost; it could not be. Deletion revokes now, so it can.
- **Deleting a mentor holding invites failed outright** — `on delete set null`
  against a check constraint that demanded exactly one inviter. The check is
  "never both" now, and the "at least one" half is an insert trigger.
- **A used invite nobody was on could not be cleared.** `admin_revoke_invite`
  refused it and advised removing the member instead, which was impossible
  because the member was gone, while the dead row kept the number off the list.
  It tests for a member on the number now, not for the invite having been used.

The admin list also says who holds each number rather than printing the raw
status. An invite nobody is on reads exactly like one never used — same words,
same weight, same Revoke — because for an administrator there is no difference
between them. The 'consumed' status stays in the database either way.

One trap worth naming: the holder is joined on `phone`, not on `invite_id`.
The phone is the club's identity and somebody who rejoined after a deletion has
a null `invite_id`, so an id join reports them missing while they sit there.

## 2. ~~There is no way for a mentor to use their two invites~~ — built

`/invites`, reached from the Invites card on Me, which stated the allowance
and then offered no way to spend it. Unlisted in the tab bar and redirects a
non-mentor to Me, the way `/admin` redirects a non-admin to Home (Peers
until Home step 5). Neither is
the permission check — the insert policy refuses a peer regardless.

No migration was needed, as this entry predicted. The three mentor policies
were already correct and the screen writes to `invites` directly rather than
through an `admin_*` function, because those policies grant exactly what a
mentor needs and nothing more.

**The cap is now actually exercised.** `supabase/tests/mentor-invites.sql` is
the probe this entry asked for: seventeen steps as the `authenticated` role
with `request.jwt.claims` set, the way PostgREST does it, so the policies are
the only thing deciding each statement. Two invites land, the third is
refused, withdrawing returns the slot, and a peer, a suspended mentor and a
signed-out visitor are each refused. Step 0 prints `current_user` on purpose:
run this file as the superuser again and every refusal turns into a pass.

Three things it turned up that were not obvious from reading the policies:

- **The same action fails two different ways.** With the allowance full, a
  number already on the list is refused by the *cap* and never reaches
  `invites_live_phone_idx`. So "refused" cannot be read as "that number is
  taken" — `describeFailure` in `src/routes/invites/mentor-invites.ts` gives
  `describeError` a sentence for each (the policy and the unique index are
  different codes), and the wrong sentence would appear exactly when a mentor
  was already confused.
- **A revoked invite cannot be brought back to pending**, which is the one way
  round the cap worth checking — withdraw, spend the freed slot, then
  resurrect the withdrawn row and hold three. The update policy only matches
  pending rows, so it fails. Step 12.
- **A mentor cannot see who used their invite.** Their select policy returns
  their own rows and `admin_invites` is admin-only, so the list says "joined
  the club", not "used by Dana". That is why the wording differs from
  `/admin`'s deliberately, and it is not an oversight to fix by joining
  `browse_members`.

### Who vouched: an organization, a mentor, or the administrator

`invites` records exactly one inviter and there are now three kinds:

- **An organization**, through `admin_create_invite` with one named.
- **A mentor**, through their own RLS policy, capped at
  `mentor_invite_limit()` — two at first, ten since 20260917010000.
- **The administrator**, through `admin_create_invite` with no organization
  — 20260913070000. It writes `invited_by_member_id = auth.uid()`, the same
  column a mentor's invite uses, so the one-inviter constraint governs both.
  The form defaults to this: a number an administrator adds by hand is
  usually theirs to answer for, and attributing it to NorCal SCI was a small
  lie in the record that exists to say who vouched.

`vouchedBy()` labels the last two apart using `invited_by_member_is_admin`.
A database that predates that column reports every member inviter as a
mentor, which is what they all were.

**An administrator vouching alone may attach a directory claim.** It could
not at first, and the rule was wrong: it was borrowed from 20260910130000,
which is about *mentors* — "a mentor could hand a seeded person's identity to
anyone they liked" — and that protection is a policy requiring
`seed_member_id is null` on a mentor's insert, still in force and still
tested. An administrator can already delete any member and block any number,
so withholding a claim protected nothing while forcing a false voucher into
the record. Withdrawn by 20260913080000.

The claim rule that is about safety rather than attribution stays, and
should: a claim may only point at a **seeded** row, because an invite aimed
at a real member would delete them when it was consumed.

## Strikes: what "Good standing" stands on

CONTEXT.md makes losing membership load-bearing and asks that it stay visible
in the product. Until 20260916040000 the only visible form of that was a
sentence listing the four things that end it, and the only mechanism was
Remove, which is all or nothing.

`member_strikes` — reason, who issued it, when, and a nullable `withdrawn_at`.
Four decisions worth keeping:

- **Three strikes flags; it does not fire.** No trigger removes or pauses
  anybody. `event_rsvps` and `event_dismissals` are `on delete cascade`, so an
  automatic removal would silently destroy a member's whole "Been to" record —
  and the club's shape is that membership is taken by a person, who can be
  asked why.
- **Three is a limit, and it asks a question** — 20260917000000. Until then a
  fourth, fifth and sixth strike all went in, which made "One more ends your
  membership" on the members own card false on the one screen where losing
  membership is meant to be visible. `admin_add_strike` refuses past
  `strike_limit()` now and returns the new count, and the strike that reaches
  the limit opens a panel on `/admin` offering Pause, Remove, or Not now.
  Remove goes into the panel Remove already opens, so a ban is still the tick
  on that panel and not a fourth button. Still a person deciding: "Not now" is
  one of the answers and the panel says nothing has happened yet.
- **A strike is withdrawn, never edited or deleted.** The case that matters is
  an administrator striking the wrong person: that should leave evidence of the
  correction, not of nothing having happened.
- **They stop counting after `strike_window()`, twelve months.** The row stays
  and leaves the count, so one bad week is not a permanent sentence.
- **The member sees the reason.** A strike somebody cannot read the cause of is
  unanswerable, and being unable to answer is what makes people leave quietly
  instead of correcting course.

An administrator cannot be struck, the same guard the other three carry.

`/admin` issues one behind **Strike**, and the count on the row is itself the
way into them — a separate button would be a second thing to find for something
the row already reports. Each strike that still counts lists its reason, date
and issuer with its own **Withdraw**, because an administrator withdrawing one
is almost always correcting a particular mistake rather than clearing a slate.
Withdrawn and expired strikes are not listed there: nothing can be done to them,
so a button beside one would offer nothing.

**Remove and Strike lost their ellipses at the owner's request**, which cost
something worth knowing: the confirm button inside the Remove panel was also
called "Remove", and two buttons with one name is what the ellipsis had been
preventing. The confirm says **"Remove them"** now — a confirm button should
name the consequence rather than repeat the button you just pressed.

### Two select policies are ORed, and that read as somebody else's strike

`member_strikes` lets a member read their own **and** an administrator read
every one. Postgres ORs them, so an unfiltered `select` returns the whole
club's rows to an administrator — and Me showed "Two strikes" to an
administrator holding one, the first time it ran against real rows.

The policies are right. `loadMyStrikes(memberId)` takes the id and filters, and
**that is not optional**. This is the mirror of "A view's own security check can
break a caller who is not its audience": a policy written to be generous to one
audience is not a filter for another, and a screen that means "mine" has to say
so. Step 11b of `supabase/tests/strikes.sql` pins both halves.

## An administrator is a mentor, and nothing about them is changed from here

Two rules that together mean an administrator's row on `/admin` carries no
controls at all — not their own row and not another administrator's.

**Their membership cannot be ended.** All three ways refuse an administrator as
a target, and each checks for itself, which is how the third came to be missing
for five days. See the table below.

**Their type is not a choice.** `20260916030000` adds a trigger: `is_admin`
implies `type = 'mentor'`, however the row is written — including the service
role promoting somebody, which is the only way anybody becomes one. Mentor
rather than peer because of what the word does: CONTEXT.md says a mentor
"appears first to newly injured members", and the person running the club is
the one member who has undertaken to answer. `admin_set_member_type` refuses an
administrator too, so it says no rather than appearing to work and being undone
by the trigger a moment later.

The row shows **nothing** beside an administrator. It briefly carried a
sentence explaining why, and that was worse than silence — an apology where an
action goes, on the row an administrator sees every time they open the page.

The mentor allowance line is also hidden for them: every administrator is a
mentor now, a mentor's row prints "N of 10 invites used" (2 when this was
written), and an administrator
invites through `admin_create_invite`, which the cap does not govern. The real
row read **"3 of 2 invites used"**.

## An administrator cannot lose membership from the application

All three ways of ending one refuse an administrator as a target, and each
checks for itself — there is no shared gate they pass through, which is exactly
how the third came to be missing for five days:

| function | refuses an admin target |
| --- | --- |
| `admin_delete_member` | since 20260911130000 |
| `admin_block_number` | since 20260913010000 |
| `admin_set_member_status` | **only since 20260916020000** |

The gap mattered more than it looks. A suspended administrator fails
`is_admin()`, which reads `status = 'active'` — so
`admin_set_member_status(the other admin, 'suspended')` was a way for one
administrator to take the club, walking past two guards written to prevent
exactly that. `'removed'` was available the same way.

An administrator is still removed by the service role, deliberately. `/admin`
says so in the row now rather than offering buttons whose only outcome is that
error; Make peer and Make mentor stay, because that is what somebody does, not
whether they are still here. `supabase/tests/admin-is-protected.sql` runs all
three as a signed-in administrator.

The self-guard on `admin_set_member_status` is a separate rule and stays: it is
about not locking *yourself* out by accident, and it says so in its own words.

## Losing membership: three different things

Worth keeping straight, because two of them look alike from `/admin` and the
third used to do nothing at all.

- **Pause** pauses a membership and keeps the row. Reversible with Resume.
  The button was called Suspend and the column still says `suspended`;
  renaming the check constraint and the rows under it is churn for a word
  nobody outside the schema reads, and the member-facing screen always said
  "paused". Until 20260913, this did nothing a member could perceive:
  `account.tsx` read the member row without selecting `status`, so a
  suspended member resolved to an ordinary one and walked into a club that
  showed them an empty deck and no events with no explanation anywhere.
  `statusFor` decides it now and `RequireMember` renders
  `suspended-screen.tsx` instead of the club.
- **Remove** replaces the old Delete and Block buttons with one action and a
  question. Unticked, the profile goes and the invite is revoked, but the
  number is free and anybody can invite them back. Ticked — "Block this
  number too" — the number is barred as well, and a reason field appears.
  The confirm button renames itself to "Remove and block", so the tick does
  not have to be remembered. Reversible with Unblock, which restores
  invitability and not the membership — that row is gone.

  The confirmation is a panel in the row, not `window.confirm`. Removing asks
  two questions at once — are you sure, and can they come back — and a native
  dialog can only ask one; stacking two made the more serious action the one
  with more clicking, which is not the same as the one with more thought. See `supabase/tests/blocked-numbers.sql`, which runs all three
  enforcement points as a signed-in administrator.

The reason there are three is that revoking deliberately does not keep a
number off the list: `invites_live_phone_idx` is partial over pending and
consumed exactly so a revoked number can be invited again. Block is the
opposite intent, and it needed somewhere to live — as the tick on Remove
rather than a third button nobody could tell from the second.

### What `/admin` gained alongside it

- **A mentor is named as one.** `invited_by_organization` and
  `invited_by_member` were always separate columns and the page collapsed
  them, so "NorCal SCI" and "Todd" read identically. `vouchedBy` in
  `members-admin.ts` distinguishes them.
- **"Signed up, never finished joining."** A pending invite with an auth
  account behind it is somebody who verified their number and abandoned
  onboarding — the invite is consumed by a trigger on the *member* insert, so
  nothing recorded the attempt. It was indistinguishable from a number nobody
  had touched. Needs `20260913000000`.
- **A mentor's spent allowance on the roster**, from `live_invite_count()` so
  it cannot disagree with the policy. Not shown on seeded rows: nobody can
  sign in as one.
- **Three lists on the Invites tab** — on the list, Withdrawn, Blocked, the
  last two only when they have rows. "The list" now means the numbers that
  are on it; withdrawn rows accumulating there is what made deleting them
  look necessary, and they cost nothing where they are.

  Withdrawn is grouped by `withdrawnNumbers()` in `members-admin.ts`, not a
  plain filter, and the reason is worth knowing before "simplifying" it:
  re-inviting a revoked number writes a *new* invite rather than reviving the
  old one — deliberately, since the second invitation is a separate act by
  possibly a different person. Withdraw that too and the number has two
  revoked rows, then three. The function collapses them to the most recent,
  says "withdrawn 3 times", and drops any number that now has a live invite
  or is blocked, so nothing appears in two lists at once. The history stays
  in `invites`.
- **Both screens have a back link to Me.** A `Link`, not `navigate(-1)` —
  they have one entrance, and history leaves the app on a refresh while the
  label still says Me.

A used invite stays in the list rather than disappearing when the slot is
accounted for — the slot is spent either way, and the screen that accounts for
the allowance is the right place for "you brought somebody in".

Verified by eye at 430 and 1280, and driven end to end against the local stack
as a signed-in mentor: withdraw freed a slot, adding spent it, and no error
banner appeared. Two layout problems were found that way and neither by a
test — see commit 0e73389.

## 3. ~~The blocked screen hardcodes three organizations~~ — already fixed

This was stale when it was written. `blocked.tsx` reads `can_invite` from the
database and has since commit 7cd2cd8, which landed *before* this file. The
file's own header explains that Wheel with Me lost invite rights, which is the
exact scenario the entry warned about, and the data agrees: only NorCal SCI and
SCVMC have `can_invite`. Left here rather than deleted, as a reminder to check
the code before trusting an entry in this list.

## 4. The survey is linear only

`/profile` walks twelve screens with Back. Somebody who wants to change one
answer months later has to walk to it. There is no overview of what they said,
and Me shows only a percentage. Consider a review screen, or making the ring
link to a list.

## 5. ~~Home is a placeholder~~ — built

It was the last placeholder, kept as a sentence on screen rather than
invented content until the owner asked. They asked on 2026-09-29; it was
built in steps to 2026-10-01, and the app opens on it. See "What Home is".
Chat was in the same position until 2026-09-18. No placeholder is left.

## 6. ~~Messaging does not exist~~ — built

It does now: direct conversations, groups and rooms. The official account's
"messaging is not switched on yet" sentence is gone and a Message button stands
where it was; an event's "group chat is coming" card is a real group.

**The pattern those sentences came from is still the rule**, and Chat kept it
for the things it does not do. A surface says so in words rather than offering
a dead button. A button that silently does nothing is worse than a sentence
explaining where things stand — which is why Chat has no search box and no
block, rather than greyed-out ones. (Photographs came 2026-09-21 and editing
2026-09-29; each arrived as a working control, never a dead one first.)

## Smaller things noticed but not fixed

- Peers filter sheet still caps topics at 24 by frequency and has no search
  box of its own. It matters much less than it did, twice over:
  `src/routes/peers/topics.ts` groups the free text first, so the list is 29
  entries rather than 61 with the ones that narrow a deck at the top — and the
  deck now has a search box, which reads the topics among everything else. A
  rare one-person topic can be found by typing it and still cannot be ticked.
- The deck crops photos at a fixed `object-[50%_28%]`. It suits all 23 seeded
  photographs — verified, every face is in frame — but an uploaded photo with
  an unusual composition could crop badly. No fix needed yet; know it exists.
- Events is one column at every width. This was considered and left alone
  deliberately: events are chronological, and a grid breaks the reading order
  that the dates depend on. Do not "fix" it without thinking about that.
- `/dev-login` now redirects to `/join` for anybody without a member row, which
  is correct, and makes the route nearly dead weight.

---

# The scraper runs itself, daily

`.github/workflows/event-ingest.yml` keeps the calendar current. It was only
ever mentioned here in passing, which is how a mirror of this repo ended up
running it by accident — see the bottom of this section.

- **Daily at 04:10 UTC**, which is 9:10pm Pacific. The offset from the hour is
  deliberate: GitHub delays jobs scheduled on the hour. Note that GitHub cron
  is UTC and does not track daylight saving, so this is 9:10pm PDT most of the
  year and 8:10pm PST from November to March — the workflow's own comment gives
  the alternative expression if it has to stay at 9pm through the winter.
- **Manually** from the Actions tab — `workflow_dispatch`, with a `dry_run`
  input that scrapes and prints without writing. Use it to re-pull a feed after
  a fix rather than waiting a day, and use `dry_run` first when the change is
  to a scraper rather than to data.
- **Two repository secrets**, Settings → Secrets and variables → Actions:
  `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Without them the job fails at
  the Ingest step, which is the safe failure — it cannot connect, so it writes
  nothing.
- **It writes to the live database with the service role key**, which bypasses
  RLS completely. That is what makes it the one workflow worth being careful
  with, and why the key is a secret rather than a variable and must never be
  given a `VITE_` prefix.
- Runs are queued rather than cancelled (`concurrency: event-ingest`), because
  a half-finished ingest leaves some feeds refreshed and others stale. A run
  takes minutes in the steady state and up to 45 on a cold one — Adaptive Rec
  Hub's robots.txt asks for a ten second crawl delay.
- **"N new or changed" in the log means something again.** It did not until
  2026-09-14: `eventChanged` compared `start_time` and `end_time` as strings,
  and the two sides never matched — PostgREST returns
  `2026-09-12T21:00:00+00:00`, the scrapers build `2026-09-12T21:00:00.000Z`.
  Every event reported as changed on every run, the job rewrote all 124 rows
  nightly, and the count was noise. The same scrape that announced 98 changed
  on the 13th now reports 0. If that line ever goes back to "everything
  changed", suspect a format, not a feed.
- A feed whose markup changed exits non-zero, so it shows up as a red run
  rather than as a calendar that quietly stopped growing.

**The scheduled run executes `origin/main`, which is the branch head.** It is
not running behind the code. It ran from `personal/main` until the 2026-09-18
handover; the paragraphs below were written then and the lesson in them is the
part that still matters.

This entry used to say the opposite, and the reason is worth keeping: the run
of 2026-09-13 checked out `ae984c8`, which is *on this branch's history* —
`personal/main` had been fast-forwarded once and then left there while 39 more
commits landed. Two of those 39 were the ones the job needed:

- **`6ed6f5e` — the ingest groups into series.** Without it a scheduled run
  left `series_id` null on anything genuinely new, so the grouping decayed a
  little each night and needed a backfill to repair.
- **`a9b0d6c` — event times compared as instants.** Without it the job rewrote
  all 124 rows nightly and the "N new or changed" line was noise.

Both are live now. Checked at the time of the push: 124 events, 35 series, and
**zero rows with a null `series_id`** — nothing had drifted, so the push was
preventive rather than a repair.

The lesson generalises past this job. `main` is a moving target that nothing
automatically advances, and the gap is invisible from inside the repo —
`git status` is clean and says nothing about it. **After landing work the
ingest depends on (`jobs/`, `scripts/backfill-series.mjs`), push `main` too**,
not only the branch:

    git push origin scaffold-and-peers-deck && git push origin HEAD:main

`git log --oneline origin/main..HEAD -- jobs/` is the one-line check for
whether that is owed.

**It runs from `Able-Bodied/thesciclub`.** Both repository secrets are set
there — `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, under Settings →
Secrets and variables → Actions — and a dry run on 2026-09-18 came back green
in 38 seconds: 93 events from NorCal SCI, 21 from Adaptive Rec Hub, 0 new or
changed on either.

**That "0 new or changed" is the proof the secrets work**, and it is worth
knowing why: the job can only decide nothing has changed by reading the rows
that are already there. A listing of secret *names* proves one exists, not that
it is correct. Run `gh workflow run "Event ingest" --repo Able-Bodied/thesciclub
-f dry_run=true` to repeat the check; it scrapes and prints and writes nothing.

38 seconds is not too fast, which it looks like against the "up to 45 minutes"
below. The 45 is Adaptive Rec Hub's ten-second crawl delay, and it only applies
to *detail* pages — that run fetched 0 of 21 because none had changed. A cold
run, or one after a real edit upstream, is the slow one.

Without the secrets the job fails at the Ingest step. That is the safe failure —
it cannot connect, so it writes nothing — and the *quiet* one, because a
calendar that stopped growing looks exactly like a calendar with nothing new in
it. **If events stop appearing, check the secrets before suspecting a feed.**

**Exactly one repository may write to the live tables, and that is the condition
to preserve.** GitHub schedules workflows from the default branch of *every*
repo that has one, so from the moment the branch existed on both, two crons were
upserting the same `(feed_id, external_id)` rows on the same schedule.
`concurrency` does not help: it serialises runs within one repository and knows
nothing about the other.

The handover of 2026-09-18 is the moment that mattered, and it was done in this
order for that reason:

    # on the repo that stops being the home of record
    gh workflow disable "Event ingest" --repo Alfredx48/TheSciClub

Reversible with `gh workflow enable`. Confirmed afterwards with
`gh workflow list` on both repos: `active` on `Able-Bodied`, `disabled_manually`
on `Alfredx48`.

**If the home of record ever moves again, disable before enabling elsewhere.**
An overlap of a single night is two writers, and the symptom is not an error —
it is the "N new or changed" count quietly ceasing to mean anything, which is
the same line that took a fortnight to be recognised as broken the first time.

Note that enabling is not a step. GitHub registers a workflow and enables it the
moment the file lands on a repository's default branch, so the *new* home needs
nothing done to it; only the old one needs turning off.

# The three RSVP segments, and Been to

"I'm going" and "Interested" are **upcoming-only**. They carried their past
occurrences under a Past heading for a day, and the heading was the tell: a list
whose name is future tense should not need a sign inside it saying half of it is
not. That half is `been-to`, which lists what you said yes to and has happened,
newest first, as compact lines.

`been-to` was **unlisted at first** — no pill, reached only from the counter on
Me, the /invites and /admin shape — to keep the pill row from growing. That was
wrong, and the owner said so twice before it was understood. "What am I going to
/ weighing up / have I been to" is one question asked three ways, and putting
the third on another screen made it the one a member had to already know about.
It is a pill beside the other two now, and the counter on Me still links to it.

`EVENTS_SEGMENTS` and the chip row in events/page.tsx are still separate lists,
because a segment can be linkable without being offered — there is just nothing
using that now.

Also: **"Any time" starts at today.** It had no bound at either end and the
browsing segments sort ascending, so the widest view of the calendar opened on
the oldest row in the database. Looking backwards is what the `past` window is
for.

# Repeating events collapse in the list

Done. A series is one card — the next occurrence, with its own Interested and
Going — carrying a line inside it that says how often it repeats and how many
more dates there are; opening that drops the rest in below as dates alone.
`groupBySeries` and `cadenceOf` are in `src/routes/events/series-groups.ts`.

Four decisions in it that are load-bearing:

- **The count is of the filtered list, never of the series.** "8 more dates"
  has to mean eight rows that opening it produces. Reading the series would put
  27 on a card whose expansion offers nine, under a window the member chose.
- **The RSVP stays on a real date.** `event_rsvps` is keyed to one event, so
  the card carrying the buttons is a card for a particular Wednesday. "Going to
  a series" is not something the schema can say.
- **Nothing collapses in `going`, `interested` or `been-to`**, which are lists
  of dates a member chose.
- **Cadence is a trimmed mean of the gaps — drop the largest, average the
  rest — and never stored.** Both halves were found by a failing test. A plain
  mean renames a weekly class when a holiday doubles one gap ([7, 14, 7, 7]
  averages 8.75). A median breaks on alternating rhythms: Staying Driven runs
  Wednesdays and Mondays, gaps 5, 2, 5, 2, and the median answers 3.5 with
  eight gaps and 5 with five — the same event changing rhythm with the size of
  the window. Three occurrences are required before anything is named at all,
  because one gap is a coincidence with a number attached: two climbing meet-ups
  two days apart were being announced as "Daily".

## Adding a column to `events` is two steps, and the second is the grant

`20260911180000` revokes `select` on `events` and re-grants a **named column
list**, so latitude and longitude cannot be read by asking for them. Correct,
and it has a trap: a column added afterwards is not in the list.

`20260913090000` added `events.series_id` and granted select on the new
`event_series` table — the visible half — and missed the column on `events`.
Nothing noticed for three days, because the only writer was the ingest, which
uses the service role and bypasses column privileges entirely. The first client
read of it failed with **`permission denied for table events`**: the whole
query, not the column, so the symptom was the Events page refusing to load and
it pointed nowhere near a grant. Fixed by `20260916010000`.

# The old note: repeating events are grouped into series

**Superseded**: the choice it leaves open was made — the list collapses a
series (see "Repeating events collapse in the list"). Kept for the matcher
below, which is still how series are found.

The calendar is 124 rows made of 36 distinct events. Three titles are half of
it: 29 Staying Driven Wheelchair Fitness, 16 Friday Happy Hour, 16 Weekly
Wednesdays. A member scrolling Events meets the same class 29 times.

`event_series` and `events.series_id` exist now and are populated, and
**Events still renders exactly as it did**. That is deliberate. Listing every
occurrence is correct for a calendar — you want to know when *this* Friday's
happy hour is — so the problem is scanning, not correctness, and collapsing
the list, a "weekly" badge, a filter and series-level dismissal are four
different answers to it. None could be judged before the grouping existed.
It exists; the choice is open.

It is also what the ✕ on an event card was removed for. Hiding one Friday
does nothing about next Friday, so a dismissal has to mean the series.

## How the matching works, and the trap in it

`jobs/event-ingest/series.js`, imported by both the ingest and
`pnpm backfill-series`. Never reimplement it in SQL — the grouping is a
stored identity and two implementations would drift.

Titles are the only signal: every occurrence has its own URL, so
`external_id` groups nothing, and start times move for holidays. Titles
drift, so it is normalise → exact → Levenshtein at 0.82.

**Levenshtein alone silently merges different events**, which running it over
the live calendar is what revealed:

    "Bombers Weekly Power Soccer Practice"
    "Shockers Weekly Power Soccer Practice"     similarity 0.892

Two teams, well past the threshold, because one distinct word inside a long
shared phrase is a small fraction of the string. So there is a second rule:
a candidate is rejected when either title has a substantive word — four
letters or more — that the other has no near-match for. Drift adds and
removes grammar; a different event substitutes the word carrying the
meaning. **Do not "simplify" the matcher down to the distance check**, and do
not tune the threshold to fix a single pair; both rules are pinned by tests
including a fixture of the real distribution.

`series_key` is identity and must never move. `title` is display only,
refreshed from the most recent occurrence and never an input to matching, so
a drifting title cannot walk a series away from its own key.

## Backfilling

    SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… pnpm backfill-series --dry-run

Reads the stored titles and regroups, without scraping — a full ingest takes
up to 45 minutes for a result computable from data already held. Safe to
re-run. The ingest does the same work on every run, over a feed's whole
calendar rather than the rows it touched, and logs rather than throws on
failure so a healthy scrape is not reported as a red run.

# The event format classifier

`jobs/event-ingest/classify.js` decides `event_format` from what the feed
wrote. Null is a deliberate fourth answer meaning "the feed did not say", and
`filters.ts:149` excludes null from every format chip — so an event the
classifier could not place never appears under "In person". That trade is
documented in the migration header and in `classify.js`, and it is the right
way round: the costly mistake is calling a Zoom event in person, which sends
somebody on a journey to nothing.

Thirty-nine events were null, and they are five distinct events repeating.
Two rules were added for ten of them:

- `ONLINE_IN_COPY` now allows one word between "virtual"/"online" and the
  gathering noun. It was adjacent-only, so "this virtual *annual* event" —
  NorCal SCI's Inspire 2026 — matched nothing.
- The prose is now read for evidence of a *place*, not only of a screen: a
  vocabulary of interior spaces ("2nd floor meeting room", "cafeteria") and
  the value of a "Where:" line, guarded so "Where: Online" is not a place.

Re-classifying all 124 live rows moves exactly those 10 and leaves 114
untouched.

**The remaining 29 are correct and should stay null.** They are all "Staying
Driven Wheelchair Fitness", and NorCal SCI's own page for it never says
whether it is Zoom or a gym. Do not add a rule that invents an answer.

Now that events are grouped, that is easier to state precisely: the 29 nulls
are **one series**, a quarter of the calendar hanging on a single unanswered
question. Worth asking NorCal SCI rather than guessing in code.

**Done — the re-ingest has run.** This entry stood for a while as pending,
because the classifier runs at ingest and `supabase db push` moves schema, not
feed data. The workflow has now run against the hosted project and the rows
carry the new formats.

    format      before  after
    in_person       35 ->  44
    online          47 ->  48
    hybrid           3 ->   3
    null            39 ->  29
    total          124 -> 124   (0 deleted)

Exactly ten events changed, and they are the ten the rules were written for:
Inspire 2026 to online, and the UC Davis, Sacramento and SCVMC meetups to in
person, across their recurring dates. Those ten now appear under the "In
person" filter, which excludes null formats — the bug that started the whole
thread.

**The 29 that remain null are correct and should stay that way.** They are all
"Staying Driven Wheelchair Fitness", and NorCal SCI's own page for it never
says whether it is Zoom or a gym. Do not add a rule to guess.

# Hosting on Netlify — live

**https://thesciclub.netlify.app/** — pushing is the deploy; there is nothing
to run.

**It builds from `Able-Bodied/thesciclub`, branch `main`**, repointed at the
2026-09-18 handover and confirmed deploying from it the same day.

Repointing is done in Netlify's own UI, not in this repo — Site configuration →
Build & deploy → Continuous deployment → link to a different repository — and
because `Able-Bodied` is an organization, the Netlify GitHub App needs access
granted to the org before the repo appears in the picker.

**The failure to watch for is silence.** Netlify rebuilds only when the
repository *it is watching* changes. Point it at a repo nobody pushes to and
production does not break, it stops moving: the site keeps serving the last
build, and nothing in the app says so. **If a change does not appear live,
check which repository Netlify is connected to before looking for a bug.**

Verifying a deploy from outside Netlify, which is what was done here: fetch the
site, read the bundle path out of `index.html`, and grep that bundle for a
string only the new code contains — plus one the new code *removed*, because
the second catches a stale build that happens to share a phrase with the new
one. Watch for the hash changing under you mid-check; a bundle fetched by its
old name after a deploy lands comes back as `index.html` through the SPA
redirect, which looks like a broken asset and is not one.

Two consequences worth holding:

- **Whichever `main` Netlify watches is production.** A push to it is not a
  backup any more.
- Netlify does **not** rebuild when the hosted database changes, only when the
  repo does. A migration applied by hand shows up immediately, because the
  browser talks to Supabase directly.

`netlify.toml` is committed. The mock stays on GitHub Pages at
www.thesciclub.com; Pages serves `docs/`, Netlify serves the built app from
`dist/`, and nothing in this config touches `docs/`.

**Pages is served by `Able-Bodied/thesciclub`, from `main` at `/docs`.**
`Alfredx48/TheSciClub` has no Pages site at all.

Now that the app is on the same repo and the same branch, `docs/` and the app
share a `main` — so **a push to `origin/main` rebuilds the mock as well as the
app**. It is only ever a rebuild from the same bytes unless `docs/` itself
changed, and `docs/` has not changed since the app work began: checked at the
handover push, where `docs/CNAME` and `docs/index.html` were byte-identical
blobs on both sides. If you do edit `docs/index.html`, www.thesciclub.com
follows on the next push, which it did not used to.

Its environment holds `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, set in
Netlify's own UI. **Never set `SUPABASE_SERVICE_ROLE_KEY` there.** It bypasses
RLS, and anything prefixed `VITE_` is inlined into the browser bundle.

If the anon key ever has to be re-entered, take it from the source of truth and
not from a copy — the one in `.env.local` was four characters too long for a
while and every browser request came back `401 Invalid API key`:

    pnpm exec supabase projects api-keys --project-ref erijdvqnxavwezsbbojv

The SPA redirect in the config is not optional: without it `/peers` works when
you navigate to it and 404s when you reload or open a shared link, which is the
confusing half of that bug.

## Real people have joined

**Since 2026-09-29 this section is wrong about Twilio, and "Twilio — the
owner's next job" at the top of this file is right.** SMS
does not work in production: the club is not approved by Twilio and the
credentials saved in Supabase are rejected (401). Real members sign in with a
fixed code from the live project's test-number list — nine real numbers, four
of them active members on 2026-09-29. What follows is kept as it was written.

**Three, on 2026-09-18**: Ran, Ajay and Wojtek, on real phone numbers, through
the real Twilio path. So the cautions below are no longer hypothetical — Twilio
is demonstrably delivering, and there are now real phone numbers and injury
details in the hosted database belonging to people who are not the owner.

Five non-seed members in total on 2026-09-18: those three, Admin, and the owner's own account
— which is on the test number `12222222222`, because the original on their real
number was removed while testing the Remove button. That is worth knowing
before reading anything into the roster.

**The app being public is fine.** A stranger sees the welcome screen and cannot
get further: `browse_members` requires an active member row, and creating one
requires an invite. That is tested, including against the live project.

**Two things to check first, because they involve real people and real money:**

1. Whoever you share with needs a row in `invites` for their real number —
   add it from `/admin`.
2. **No SMS will arrive** until Twilio Verify is set up (see "Twilio — the
   owner's next job"). Until then a new number signs in only once it is
   added to the live project's test-number list with a code — a live
   settings change, the owner's to make.

Signing somebody up also puts their phone number and injury details in a real
database. Worth their explicit yes rather than a surprise.
