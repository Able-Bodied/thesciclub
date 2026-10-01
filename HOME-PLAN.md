# Home — the build plan

Written 2026-09-29, for the session that builds it.

**Where it stands: steps 1, 2, 2b, 3, 3b and 4 are built and on GitHub**
(steps 1, 2 and 2b on 2026-09-29; step 3, Likes, on 2026-09-30, its
migration `20260930010000` on the live database first; step 3b the same
day, its migration `20260930030000` live first; step 4, Filter your feed,
the same day, no migration, both branches at `bb46b31`).
**Next is step 5**, Home is the first screen. HANDOFF.md, "Home, step 1"
through "Home, step 4", say where the build departed from this plan and
why; read them first, because those departures stand. Two from 3b: the
Like buttons on a topic card are `relative` without `z-10` (the plan's
`z-10` on the row trapped the likes list under the tab bar), and the
photos bucket's member delete policy stays `{public}` (the owner's call).
Three from 4: the filter narrows the list a pill drew (so Everything's
four events are all it can narrow), a chip that is on is always offered,
and Online is a flag of its own. Step 4 also found that
`FilterSheetShell` and the report sheet moved no focus; at the owner's
word both now do, through `useDialogFocus` (the filter sheet's fix is on
GitHub; the report sheet's is not).

Home was the last placeholder in the app. The owner asked for it on 2026-09-29,
modelled on `homePage()` in `docs/index.html`, shipped in steps. That request
is the "ask" HANDOFF.md says Home must wait for.

All bare paths are relative to `thesciclub/`. Every `pnpm` and `supabase`
command runs from inside it, on Node 24.

---

## Raise this first, every session

**The live project still accepts the published test sign-in codes, and one of
those numbers is the club's only administrator.** See HANDOFF.md, "Security —
open, do these first". Nothing in this plan fixes it. Say so to the owner at
the start of the session, then carry on with whatever they choose.

Because of it: **do all looking and testing on the local stack.** Do not sign
in to the hosted project with a test number, and do not point `pnpm shoot` at
production.

---

## What the owner decided, 2026-09-29

These are settled. Do not reopen them; build to them.

| # | Decision | What it means for the build |
| --- | --- | --- |
| 1 | A question asked from Home lives **in a Chat room**, as a topic | No question or answer tables. Home reads `chat_topics` and `chat_posts`. |
| 2 | A photo post lives **in a room too**, as a topic whose first post has photographs | No post or comment tables, no second photo store. A comment is a reply. |
| 3 | **No anonymous asking** | No control is drawn for it. Same as Chat. |
| 4 | **Likes, with names shown** | One new table. Any member who can read the room can see who liked a post. |
| 5 | The pills read **Everything · Topics · Photos · Events · People** | Not the mock's "Questions" and "Posts". A topic is not always a question, and "post" already means a reply. |
| 6 | **The app opens on Home**, once Home has real content | The last step, not the first. |
| 7 | Ship **everything, in steps** | Five steps below. Each one can be looked at, committed and released on its own. |

The consequence worth holding on to: **Home adds no new kind of content.** It
is a second way in to rooms, events and members that already exist, plus
Likes. Reporting, removal, notifications, mutes and the administrators' tools
are already built and are reused untouched.

**Added 2026-09-29, after steps 1 and 2 went live**, for step 2b:

| # | Decision | What it means for the build |
| --- | --- | --- |
| 8 | **Anybody can write in a room without joining it.** Join goes away entirely | `chat_can_post_in` stops asking for a membership row. The Join button, the Joined marks, the member count on a room card and the join step on `/home/new` all go. |
| 9 | **A member can edit their own post or message**, and readers see "Edited" | An `edited_at` column and a definer function on each table. No update grant. |
| 10 | **Administrators can read every earlier version** of an edited post or message | A table of earlier versions that only an administrator can select from. Reports keep their own copy as before. |
| 11 | **A reply to one post**, shown under it, one level deep | `reply_to` on `chat_posts`. In a conversation the same column on `chat_messages`, drawn as a quote rather than a nest — see step 2b for why. |
| 12 | **Rooms and conversations both** get editing and replies | Not rooms only. |

These reopen two of Chat's recorded decisions — "no editing" and "joining is
about writing" — at the owner's word. Both were the owner's to make and are
now made the other way.

---

## Read these before writing anything

1. `CONTEXT.md` — all of it. Where it and anything else disagree, it wins.
2. `HANDOFF.md` — "Start here", "Standing rules this session learned",
   "Conventions that are load-bearing", "What Chat is" (all of it, especially
   "What will bite the next person" and "Components that must not be written
   twice"), "Errors read as sentences now", "The WAI design tips", "A box
   measured in pixels around text measured in rem", "The setting that worked
   on one button", and "Environment".
3. The mock, `docs/index.html`:
   - Home: lines 1154–1269 (`homePage`, `feedItem`, `qCard`, `postCard`,
     `peerSuggest`).
   - The sheets: lines 2039–2093 (filter, compose) and 2114–2136 (comments).
   - The sample data: lines 640–698 (`Q`, `POSTS`, `FEED`).
   - The styles: lines 62–92, 174, 215–233.
   - **The mock is the reference for how it looks and reads. Its sample
     content is never copied into the app.**
4. The code Home is built from, each with its header comment:
   `src/routes/events/page.tsx`, `src/routes/chat/page.tsx`,
   `src/routes/events/event-card.tsx`, `src/routes/chat/new-topic.tsx`,
   `src/routes/chat/topic-page.tsx`, `src/routes/chat/continue-in-room.tsx`,
   `src/routes/chat/room-map.ts`, `src/routes/peers/ranking.ts`,
   `src/lib/chat/topics.ts`, `src/lib/chat/rooms.ts`,
   `src/lib/chat/attachments.ts`, `src/routes/events/follow-button.tsx`,
   `src/routes/chat/report-sheet.tsx`, `src/components/filter-sheet-shell.tsx`.

---

## What the mock draws, and what becomes of each piece

| In the mock | In the app | Step |
| --- | --- | --- |
| Title "Home" and the pills | The same header shape as Events and Chat: one `h1`, `SegmentPills`, segment in the URL | 1 |
| Question card (`qCard`) | **Topic card**: a recent topic from an open room, with its first reply | 1 |
| Post card (`postCard`) | **Photo card**: a topic whose first post has photographs | 1 |
| Event card (`evCard`) | The existing `EventCard`, unchanged, RSVP buttons working | 1 |
| "Worth meeting" (`peerSuggest`) | **Person card**, ranked by the existing `relevanceScore` | 1 |
| The dashed "Ask something, or share something" card | A link to a new screen, `/home/new` | 2 |
| The compose sheet | `/home/new` picks the kind and the room, then hands over to the existing New topic screen | 2 |
| Category chips in the compose sheet | **The open rooms.** A question goes to a room, so the room is the category | 2 |
| Like, and the count | `LikeButton`, on the photo card and on every post in a topic | 3 |
| "Filter your feed" sheet | `FilterSheetShell`, with Rooms and Where | 4 |
| Home as the first screen | `/` goes to `/home` | 5 |
| The question page (`qPage`) | **Already built**: it is the topic page, `/chat/rooms/:roomId/topics/:topicId` | — |
| The comments sheet | **Not built.** "Reply" and "3 replies" go to the topic page. See Departures | — |
| The floating "Post" button | **Not drawn.** See Departures | — |
| Search and the bell in the header | **Not drawn.** See Out of scope | — |
| "Ask anonymously" | **Not drawn.** Decision 3 | — |

---

## Rules that hold for every step

All of these are in HANDOFF.md with their reasons. They are repeated because
each one has been broken before.

- **Never push.** The owner says when. Nine commits already sit unpushed on
  `scaffold-and-peers-deck`. Before any push the owner asks for, run
  `pnpm check` **on its own** and stop if it exits non-zero. Never pipe it and
  never chain it with `;`.
- **A session cannot write to the live database.** For step 3's migration,
  run `pnpm exec supabase db push --linked --dry-run`, show the owner the
  list, and the owner runs the push. **Never `supabase config push`.**
- **Commit as work lands**: small, one change each, each typechecking on its
  own. `pnpm test`, `pnpm check` and `pnpm build` are clean before every
  commit.
- **No test may reach the network.** `src/test/setup.ts` throws on `fetch` and
  `WebSocket`. When a screen gains a hook, its test stubs that hook.
  `src/routes/chat/page.test.tsx` is the pattern: a hoisted `db` object,
  `vi.mock` per module, `importOriginal` so the pure functions stay real.
- **`.env.local` points at the hosted project.** Override both variables to
  look at local work (HANDOFF.md → Environment has the command, port 5183).
- **Look at what you changed.** `pnpm shoot /home --both` with `SHOOT_BASE`
  set, and read the PNG. Then again with `--text=larger`. The values are
  `normal`, `large`, `larger` — `largest` is silently ignored.
- **`pnpm shoot` cannot see below the fold**, and Home is mostly below the
  fold. Add a `--scroll=<pixels>` flag to `scripts/shoot.mjs` that scrolls
  the inner scroller before the shot. Its own commit, first thing in step 1.
- **`pnpm fix` reformats files.** Re-read a file before editing it a second
  time.
- **A box that holds text is sized in `em` or `rem`**, never `px`.
- **A control under 44px gets `data-target="small"`.**
- **Every error paragraph is `role="alert"`; every "Loading…" is
  `role="status"`.**
- **An avatar is never its own link.** The link goes on the name; the tile is
  `aria-hidden`.
- **A count of zero is not drawn.**
- **A button is never inside a button or a link.**
- **Every failure goes through `describeError` or `describeThrown`**, with
  the attempt sentence the screen owns.
- **Colours are tokens, never a hex.** The mock's card tints (`#FBFCFD`,
  `#FAFCFF`, `#B7C2D2`) are not copied; use `bg-paper`, `border-line`,
  `text-navy-hi`. Any new pair that carries text goes into
  `src/theme-contrast.test.ts`.
- **Type**: `font-display` for text 22px and up, `font-head` for anything
  smaller. When looks and legibility disagree, legibility wins.
- **Words**: member, mentor, organization, invite, room, topic, reply. Never
  "user". Never "peer" for a person.
- **Comments explain why.** Match the density of the files listed above.
- **One `h1` per screen, inside `main`.** `RouteChange` names the page from
  it.

---

## Before step 1

1. Confirm the starting point: `git status` clean, on
   `scaffold-and-peers-deck`, and `pnpm test`, `pnpm check`, `pnpm build` all
   pass. If any fails before you have changed anything, stop and tell the
   owner.
2. Start the local stack with storage and realtime: plain
   `pnpm exec supabase start` (run `pnpm exec supabase stop` first if an
   earlier run excluded services), then
   `pnpm exec supabase migration up --local`.
3. `pnpm demo-member`, then again with
   `DEMO_PHONE=12222222222 DEMO_OTP=222222`.
4. Make something to look at, locally only. Keep it in the session's scratch
   folder and do not commit it:
   - Make the first test member an administrator with one SQL update, and
     open two rooms from `/admin` → Rooms.
   - As each test member, join a room and write topics: two plain, one with
     two photographs, one with a reply from the other member.
   - The local database has no events. Insert one `data_feeds` row and about
     six `events` rows over the next three weeks, two of them sharing a
     `series_id`. Or run `jobs/event-ingest` against the local stack for real
     ones.
   - RSVP to one event as the second member.
5. Start the dev server against the local stack and confirm `/home` shows the
   placeholder.

**Recommended first, and the owner's call:** the photograph viewer in
`src/routes/chat/attachment-grid.tsx` is not a dialog (HANDOFF.md, "What is
next for accessibility", item 2). Home puts photographs on the first screen a
member sees, so this gap gets far more use. Ask the owner whether to fix it
before step 1. If yes, it is its own commit and `report-sheet.tsx` is the
pattern.

---

## Step 1 — Home reads

**No migration.** Everything here reads what is already in the database, so
it can be released by a push alone.

### What a member sees

A header with "Home" and five pills. Under it one column, 720px at most,
listing recent topics, photographs, upcoming events and members worth
meeting. Nothing can be written from Home yet.

### Files

| File | What it is |
| --- | --- |
| `scripts/shoot.mjs` | Gains `--scroll=<pixels>` |
| `src/lib/home/types.ts` | `HOME_SEGMENTS`, `HomeSegment`, `HomeTopic`, `FeedItem` |
| `src/lib/home/topics.ts` | `useHomeTopics()`, and the pure `toHomeTopics()` |
| `src/lib/home/topics.test.ts` | |
| `src/routes/home/feed.ts` | Pure: `pickEvents`, `suggestPeople`, `buildFeed`, `inSegment` |
| `src/routes/home/feed.test.ts` | |
| `src/routes/home/topic-card.tsx` | |
| `src/routes/home/photo-card.tsx` | |
| `src/routes/home/person-card.tsx` | |
| `src/routes/home/*.test.tsx` | One per card |
| `src/routes/home/page.tsx` | Replaced |
| `src/routes/home/page.test.tsx` | |
| `src/lib/chat/topics.ts` | Export `POST_COLUMNS` and `toPost`. Do not write a second mapping |
| `src/routes/chat/back.ts` (new) | `backFromTopic(state, room)`, pure, with a test |
| `src/routes/chat/topic-page.tsx` | Both `BackLink`s use `backFromTopic` |
| `src/routes/events/back.ts` | `backToEvents` and `backLabel` honour `state.from === 'home'` |
| `src/routes/peers/member-detail.tsx` | `backFrom` honours `'home'` |
| `src/components/placeholder-screen.tsx` | Deleted. Nothing else uses it |
| `src/components/app-nav.tsx` | Header comment: Home is no longer a placeholder |

### The reads

`useHomeTopics()` makes two reads and joins them in memory. RLS is the
filter; both tables are already granted to `authenticated`.

1. `chat_topics`: `id, room_id, title, author_id, created_at, last_post_at,
   reply_count`, newest `last_post_at` first, limit 40.
2. `chat_posts`: `POST_COLUMNS`, where `topic_id` is one of those forty,
   ordered by `created_at` then `id`, limit 1000. **Removed posts are
   included in this read on purpose.**

Then, per topic, in `toHomeTopics()`:

- The **opening post** is the earliest row for that topic. If it has been
  removed, the topic has no opening post: `opening` is null and the card
  draws the title alone. This is why removed rows are read — without them
  the first reply would be mistaken for the opening post.
- The **first reply** is the earliest standing post after the opening one.
- A topic is a **photo topic** when its opening post has at least one
  attachment. Otherwise it is a plain topic.
- **Topics in a closed room are dropped.** An administrator can read closed
  rooms, and Home must not show them topics no member can follow them into.
  Filter against `useChatRooms()` on `openedAt !== null`, exactly as
  `continue-in-room.tsx` does.

If the posts read returns exactly 1000 rows, `console.warn` once. That is the
sign to move this read into one SQL function (`security invoker`, so RLS
still applies, returning each topic with its opening post and first reply).
Say so in the file header. Do not build the function now.

Everything else comes from hooks that exist: `useEvents`,
`useAttendeesByEvent`, `useOrganizations`, `useViewerEvents`, `setRsvp`,
`useBrowseMembers`, `useChatRooms`, `useChatAuthors`, `useMyThreads`,
`useAccount`.

**Home does not subscribe to realtime.** It reads when you arrive. A list
that reorders while somebody is reading it is a list they lose their place
in, and Home is for finding things, not for watching them. Say so in the
page header so nobody adds a subscription as a fix.

### The pure functions, in `feed.ts`

- **`pickEvents(events, now)`** — upcoming only (`isPastEvent`), one card
  per series (`groupBySeries`, the lead only), soonest first, inside the
  next 30 days.
- **`suggestPeople(members, viewerId, talkedTo, today)`**
  - Start from `othersOnly(members, viewerId)`.
  - Drop the club's own account (`isAdmin`).
  - Drop anybody the viewer already has a direct conversation with
    (`useMyThreads`: `otherMemberId` where `lastAt` is not null).
  - Rank with `rankMembers(candidates, viewer)`. The viewer is their own row
    in the same `browse_members` list.
  - If the viewer is hidden from Peers they have no row there. Then order
    mentors first, newest `createdAt` first.
  - Take the top twelve and return three, starting at an offset derived from
    the day. The three change from day to day and never within one.
- **`buildFeed({ topics, events, people })`** — the mix for Everything.
  Topics and photo topics together, newest activity first. After every
  second one, insert one extra, alternating event, person, event, person,
  until both run out: at most four events and three people. If there are no
  topics, the feed is the extras alone. No item appears twice. Keys are
  `topic:<id>`, `event:<id>`, `person:<id>`.
- **`inSegment(segment, …)`** — what each pill lists:
  - Topics: every plain topic, up to 40.
  - Photos: every photo topic.
  - Events: up to eight from `pickEvents`.
  - People: up to six from `suggestPeople`.

Every one of these is tested without a database. Include: empty inputs, no
duplicates, order stable across two calls, a removed opening post, a former
member as author, a hidden viewer, a closed room's topic, and the day
changing the people.

### The screen

- The shell of `src/routes/chat/page.tsx`: `flex flex-1 flex-col
  overflow-hidden`, a `header`, then one scroller.
- Column width `max-w-[var(--events-measure)]`. `src/routes/events/page.tsx`
  says why: distance is effort for a member using a head pointer.
- The `h1` uses the same classes as the Events one.
- The segment is in the URL, `/home?segment=photos`, written with
  `replace: true`. `everything` is the default and carries no parameter.
- The feed is a `ul`, and each item an `li`, so a screen reader announces a
  list and its length.
- **Wait for all three sources to settle before drawing Everything.** Show
  one `role="status"` "Loading…" until then. Drawing each source as it lands
  would re-mix the list under the reader. A single-kind pill waits for its
  own source only.
- A source that fails leaves the feed and says so once, at the top, as
  `role="alert"`: "Could not load the topics." and the sentence from
  `describeError`. The rest of the feed still draws.

### The cards

**Topic card** (the mock's `qCard`). The whole card is one `Link` to the
topic page, with `state={{ from: 'home' }}`.

- Tag row: the room's glyph in its category colour (`text-room-*`, as
  `continue-in-room.tsx` does), then the room's name. `aria-hidden` on the
  glyph.
- The title, `font-head`, extra bold.
- Meta: author's name · level · `chatTime(createdAt)`. A null author is
  "Former member" with `FormerMemberAvatar`.
- The first reply, behind the mock's left rule: a small `MemberAvatar`
  (`aria-hidden`), "Jan · T4", and the words clamped to four lines.
- Foot: "3 replies" when there are any. When there are none: "No replies
  yet." That is information, not a zero.

**Photo card** (the mock's `postCard`). Not one link, because it holds
buttons.

- Author row: tile, name, and "level · time". The name links to the profile
  when `hasProfile`. `ChatAuthor` has no city on purpose; do not add one.
- The room's name as a small tag, so the reader knows where it lives.
- The photographs: `AttachmentGrid`, unchanged. Do not write a second grid.
- The title, which is the link to the topic page, then the opening post's
  words through `LinkedText`, clamped.
- Foot: "3 replies" as a link to the topic page, and a "Reply" link beside
  it. Like arrives in step 3; leave no gap for it.

**Event card**: `EventCard` as it is. `onOpen` goes to `/events/:id` with
`state={{ from: 'home' }}`. `onRsvp` does what `src/routes/events/page.tsx`
does, including the re-read and the `writeError` paragraph.

**Person card** (the mock's `peerSuggest`). One `Link` to `/peers/:id` with
`state={{ from: 'home' }}`.

- Tag row: "Worth meeting".
- `MemberAvatar`, the name, `summaryLine(member)` from
  `src/routes/peers/member-card.tsx`, the field of work where there is one.
- Up to three of `canonicalTopicsOf(member.topics)` as chips.

### When a pill is empty

| Pill | Sentence | Way out |
| --- | --- | --- |
| Everything | Cannot be empty while the club has events or members. If it is: "Nothing here yet." | — |
| Topics | "No topics yet. Rooms open a few at a time, and anybody can start one." | Link to `/chat?segment=rooms` |
| Photos | "No photographs yet. A topic with a photograph shows up here." | Link to `/chat?segment=rooms` |
| Events | "Nothing on the calendar in the next 30 days." | Link to `/events` |
| People | "Nobody new to suggest today." | Link to `/peers` |

Under a full Events list: "See the whole calendar". Under People: "See
everyone in Peers". Under Topics and Photos: "See the rooms". Links, not
buttons.

### Tests for the screen

`page.test.tsx`, with every hook stubbed:

- Each pill lists only its kind.
- The segment is read from the URL and written to it.
- Everything waits for all three sources.
- A failed source says so and the others still draw.
- A topic in a closed room is not drawn for an administrator.
- An RSVP calls `setRsvp` and re-reads.
- No "0 replies" anywhere.
- Each empty state draws its sentence and its link.
- Exactly one `h1`.

Then a sabotage check: make `buildFeed` return a marker, confirm the screen
test fails, put it back.

### Look at it

At 430 and 1280, every pill, with `--scroll`. Again at `--text=larger`. At
320px wide, confirm nothing scrolls sideways. Walk it by keyboard from the
skip link. Run axe over `/home`. Walk the DOM for controls under 44px with
no `data-target`.

### Done when

- `/home` shows real topics, photographs, events and members from the local
  stack, and nothing invented.
- Back from a topic, an event and a profile opened from Home lands on Home
  and says "Home".
- `pnpm test`, `pnpm check` and `pnpm build` are clean.
- `placeholder-screen.tsx` is gone.

### Suggested commits

1. Let `pnpm shoot` scroll
2. Read recent topics across the open rooms
3. Mix topics, events and people into one feed
4. Draw a topic, a photograph and a person on Home
5. Home lists what the club is doing
6. Back goes to Home when that is where you came from
7. Take the placeholder screen out

---

## Step 2 — Asking and sharing from Home

**No migration.** Everything is written through `chat_create_topic` and the
policies already there.

### First, carried over from step 1: a single photograph fills its card

Found when the owner looked at step 1 on 2026-09-29, and left for this step
at their word. Do it first, as its own commit, before anything else here.

**What is wrong.** On a photo card with one photograph, the picture does not
fill the card. At 1280 it sits in the left half with blank space beside it;
at 430 it stops about 48px short of the right edge. A card with two
photographs fills the width, so the two kinds of card look unrelated.

**Why.** Step 1 was told to reuse Chat's `AttachmentGrid` unchanged, and that
grid sizes a single photograph for a chat bubble: its own shape, no taller
than `20rem`, no wider than it needs.

**The change.**

- `AttachmentGrid` gains one optional prop, `fill`, false by default.
- With `fill` and exactly one photograph, the tile is the full width of the
  card, at the mock's shape (`aspect-[400/260]`), cropped with
  `object-cover`. It still opens the whole picture in the viewer.
- Two to four photographs are unchanged. They already fill the width.
- Only `PhotoCard` passes `fill`.

**What must not change.** Four screens draw this grid: a message in a
conversation, a post in a topic, a report on `/admin`, and Home. The first
three keep the bubble's sizing exactly, which is why the prop defaults to
false. No tile gets a background; the owner took that out on 2026-09-23.

**Say so in two headers.** `attachment-grid.tsx`: that a filled photograph is
cropped in the card and whole in the viewer, and why Home is the one caller.
`photo-card.tsx`: its header says the grid is "Chat's own, unchanged", which
stops being true.

**Tests.** In `attachment-grid.test.tsx`: without `fill`, a single photograph
keeps the classes it has today; with `fill`, it is full width at the fixed
shape; with `fill` and two photographs, nothing differs. In
`photo-card.test.tsx`: the card passes `fill`.

**Look at it.** `/home?segment=photos` at 430 and 1280 and at
`--text=larger`, with a landscape and a portrait photograph. Then a
conversation and a topic that each hold a single photograph, to see that
they have not moved.

### What a member sees

The dashed card at the top of Home: "Ask something, or share something" and
under it the mock's line, "No question is too basic, too personal or too
weird." It goes to `/home/new`.

`/home/new` asks two things, in this order:

1. **Which kind.** Two pills, the mock's words: "Ask a question" and "Share
   something". The heading and the line under it follow the pill:
   - Ask: "Ask the club" — "Goes to every member. Answers come from people
     who have lived it."
   - Share: "Share a photograph" — "A picture and a line about it. Most of
     what gets shared here is something you did, made or worked out."
2. **Which room.** The open rooms, under their six headings in
   `ROOM_CATEGORIES` order, as one radio group. Each shows its name and
   description, and "Joined" where that is true. Nothing is chosen to begin
   with.

Then one button:

> **Superseded by step 2b**, decision 8: there is no join step. The button
> is always "Continue", and nothing below about joining is built any more.

- "Continue", for a room already joined, and always for an administrator.
- "Join Bowel management and continue", for a room not yet joined. Under it:
  "Joining is what lets you write in a room. You can leave at any time."

Under the list, always: "None of these fit? Start a room", to
`/chat/rooms/new`.

**When no room is open**, which is an ordinary day for this club: no list
and no button. "No rooms are open yet. Start one — it begins with your first
topic." and the same link.

Continue goes to the existing screen, `/chat/rooms/:roomId/new`, with
`state={{ from: 'home', kind }}`.

### Files

| File | Change |
| --- | --- |
| `src/routes/home/new.tsx` | New. The screen above |
| `src/routes/home/new.test.tsx` | New |
| `src/routes/home/compose-card.tsx` | New. The dashed link |
| `src/App.tsx` | Route `/home/new`, inside the shell |
| `src/lib/chat/rooms.ts` | Add `joinRoom(roomId, memberId)`, which can be awaited |
| `src/routes/chat/new-topic.tsx` | Reads `location.state`; gains the share mode |
| `src/routes/chat/new-topic.test.tsx` | New. Both modes |
| `src/routes/chat/attachment-grid.tsx` | Gains `fill`. See "First, carried over from step 1" |
| `src/routes/chat/attachment-grid.test.tsx` | The three cases named there |
| `src/routes/home/photo-card.tsx` | Passes `fill`; header corrected |

### The details that matter

- **`joinRoom` is awaited before navigating.** `useRoomMembership().toggle`
  is optimistic and returns nothing, so the New topic screen could be
  reached before the join landed and the topic would be refused. `joinRoom`
  is an insert with `ignoreDuplicates: true` — never an upsert that updates;
  HANDOFF.md, "What will bite the next person", first item. A failure stays
  on `/home/new` and shows the sentence.
- **Share mode on the New topic screen**, when `state.kind === 'share'`:
  - Heading "Share a photograph".
  - The photo picker comes first.
  - The title's label is "Say something about it". It stays required: it is
    the line in the room's list.
  - The longer text is optional **when there is at least one photograph**.
    The database already allows this: `chat_posts_check` wants words *or* a
    photograph.
  - Post is disabled until there is a title and either words or a
    photograph.
- **Ask mode changes nothing** about the screen except the back link.
- **Back** from the New topic screen goes to Home and says "Home" when
  `state.from === 'home'`.
- **After posting**, it goes to the topic as it does now, passing
  `state={{ from: 'home' }}` along.
- **The draft survives a refusal.** This is already true of the New topic
  screen. Do not break it.
- The kind is also readable from the URL, `/home/new?kind=share`, so a link
  can open either.

### Tests

- The room list shows open rooms only, in heading order.
- The button's words follow whether the room is joined.
- An administrator is never asked to join.
- A failed join shows its sentence and does not navigate.
- No open rooms draws the sentence and the link, and no button.
- Share mode accepts a title and a photograph with no other words.
- Share mode refuses a photograph with no title.
- Ask mode still needs both fields.

### Look at it

Both kinds, end to end, as a member who has joined nothing. Post a plain
topic and a photograph from Home, and confirm each appears on Home and in
its room. Then as an administrator.

### Done when

A member who has never opened Chat can ask a question and share a photograph
starting from Home, and both appear in the room and on Home. And a single
photograph fills its card on Home, while Chat, topics and reports draw
photographs exactly as they did.

---

## Step 2b — Rooms open to write; editing; replies to a post

Asked for by the owner on 2026-09-29, after steps 1 and 2 went live, and
before Likes. Decisions 8–12 above. **One migration**, and it goes first:
the client's Join controls cannot come out until the database has stopped
asking for a membership row, or every member who never joined is refused.

This step changes Chat, not only Home. Read HANDOFF.md "What Chat is" —
especially "What will bite the next person" and "Components that must not
be written twice" — before touching it, and treat the probes in
`supabase/tests/` as the definition of what must still hold.

### What a member sees, when it is done

- **Any room is somewhere to write.** Open a room, start a topic, reply —
  no Join first. The room card says how many topics and posts, not how many
  members. `/home/new` asks which room and goes straight to the New topic
  screen.
- **Edit** on your own post in a topic and your own message in a
  conversation. The words change in place; a small "Edited · 9:30am" sits
  under them for everyone. Photographs are not changed by an edit — take
  the post back and post again for that.
- **Reply** on any post in a topic. Your reply sits under that post,
  indented, in the order replies came. One level only: a reply to a reply
  lands under the same post.
- **Reply** on any message in a conversation. Your message carries a short
  quote of the one it answers, which jumps to it when tapped. The list stays
  in time order.
- **An administrator** sees "Edited · earlier versions" on an edited post
  and, on a report, every earlier version of the reported post or message.

### The migration

`supabase/migrations/20260930000000_rooms_open_to_write_editing_and_replies.sql`
— check that stamp is still the newest; use the next if step 3's migration
has taken it. Plain-prose header: what, the owner and the date, then why,
one subsection per part.

**1. Writing needs no membership.** Replace `chat_can_post_in(room text)`:
`is_active_member()` and (`is_admin()`, or the room exists and is open).
Nothing else changes: `chat_file_is_writable` calls it, so photographs
follow. Leave `chat_room_members` and its policies in place — the rows are
history and `chat_create_room` still writes one for the starter; the client
simply stops reading it. `chat_room_stats.member_count` stays in the view
and stops being drawn.

**2. `edited_at`** — `timestamptz` on `chat_posts` and on `chat_messages`.
Not insertable: it is not added to the column-level insert grants.

**3. `reply_to`** — `uuid` on `chat_posts` referencing `chat_posts(id) on
delete set null`, and on `chat_messages` referencing `chat_messages(id)`
likewise. Indexed. **Granted for insert by column**, alongside the columns
already granted. A `before insert` trigger on each table refuses a
`reply_to` that names a row in a different topic (or thread), a removed row,
or — for posts — a row that is itself a reply; one level is the rule. A
refused reply says so in a sentence.

**4. `chat_edits`** — `id`, `post_id` (→ `chat_posts` cascade, nullable),
`message_id` (→ `chat_messages` cascade, nullable), `body text not null`,
`attachments text[] not null`, `edited_by uuid` (→ `members` set null),
`replaced_at timestamptz not null default clock_timestamp()`. Exactly one of
the two ids, as `chat_reports` does it with `kind`. RLS on. **One select
policy: `is_admin()`.** Grant select to `authenticated`; nothing else, to
anybody. Written only by the two functions below.

**5. `chat_edit_post(post uuid, new_body text) returns void`**, definer,
fixed `search_path`, revoke from `public, anon`, grant to `authenticated`:
- The caller is the author, an active member, and the post is standing.
  Anybody else — an administrator included — is refused in a sentence: an
  administrator removes, and does not rewrite somebody's words.
- The room is readable and open.
- `new_body` is trimmed, at most 4,000 characters, and not blank unless the
  post has photographs — the row's own check, said before the write.
- Copies the current `body` and `attachments` into `chat_edits`, then sets
  `body` and `edited_at = clock_timestamp()`. An edit that changes nothing
  is refused, so "Edited" is never a lie.

**6. `chat_edit_message(message uuid, new_body text)`** — the same, with
`is_thread_member` for the thread.

**7. `admin_post_edits(post uuid)` and `admin_message_edits(message uuid)`**
are not needed: an administrator selects `chat_edits` directly, the policy
is the gate. Say so in the header so nobody writes them.

**8. Notifications.** Nothing. An edit is an `update`, and the triggers fire
on `insert`. A reply is an ordinary post or message and notifies as one
already does — the topic's starter and its participants, or the thread's
members. No new kind, no change to `push_owed` or the Edge Function.

**9. Realtime.** Nothing to add: both tables are in the publication and an
edit arrives as the `update` a removal already does.

### The probes

Two new files and two changed ones, all run as signed-in roles with
`current_user` printed and a savepoint per refusal.

- `chat-posts.sql`: step 1 ("post before joining is refused") **inverts**:
  an active member who has joined nothing writes a topic and a reply in an
  open room. Keep the steps that still hold — a closed room refuses, a paused
  member reads and does not write, a member cannot read the roster.
- `chat-edits.sql` (new): the author edits their post and reads "Edited";
  another member cannot; an administrator cannot edit but can read every
  earlier version; a member reads none of `chat_edits`; a removed post cannot
  be edited; an unchanged body is refused; a blank body is refused unless
  photographs; the same for a message, with a member outside the thread
  refused; deleting the topic takes the edits with it.
- `chat-replies.sql` (new): a reply to a post in the same topic lands; to a
  post in another topic is refused; to a reply is refused; to a removed post
  is refused; removing the parent leaves the reply standing with
  `reply_to` null; `reply_count` still counts it; a message's `reply_to`
  across threads is refused.
- `chat-attachments.sql`: the step that uploads as an un-joined member,
  if there is one, inverts too.

Add all four to the table in HANDOFF.md.

### The client

| File | Change |
| --- | --- |
| `src/lib/chat/types.ts` | `editedAt` and `replyTo` on `ChatPost` and `ChatMessage`; `ChatEdit` |
| `src/lib/chat/topics.ts` | `POST_COLUMNS` gains both; `editPost`; `sendPost` takes `replyTo`; `threadPosts(posts)` — pure: top-level posts in order, each with its replies in order |
| `src/lib/chat/threads.ts` | The same for messages: `editMessage`, `sendMessage` takes `replyTo` |
| `src/lib/chat/edits.ts` (new) | `useEdits(postIds, messageIds)` — administrators only; returns an empty map for anybody else without asking |
| `src/lib/chat/rooms.ts` | `joinRoom` and `useRoomMembership` deleted, with their tests. `RoomStats.memberCount` goes |
| `src/routes/chat/post.tsx` | Edit on your own standing post beside Remove; Reply on every standing post; "Edited · time"; for an administrator, "earlier versions" opening the list. Replies drawn under the parent, indented, unnumbered |
| `src/routes/chat/topic-page.tsx` | `canPost` is `!closed`; the composer carries a "Replying to Jan ✕" bar when a Reply was pressed; numbering counts top-level standing posts |
| `src/routes/chat/composer.tsx` | Gains an optional `replyingTo` bar and an edit mode (`initial`, `saveLabel`) so the editor is the composer and not a second textarea |
| `src/routes/chat/message-bubble.tsx` | Edit on your own; Reply on anybody's; the quote above a reply, tapping it scrolls to the message; "Edited" |
| `src/routes/chat/thread-page.tsx` | The reply bar; scroll-to for a tapped quote |
| `src/routes/chat/room-page.tsx` | No Join, no Leave, no member count, no "Join the room to start the first one"; New topic offered to every member while the room is open |
| `src/routes/chat/room-card.tsx` | No "Joined", no member count |
| `src/routes/chat/page.tsx` | Stops reading membership |
| `src/routes/home/new.tsx` | No join step: the button is always "Continue"; no "Joined" marks; the line under the button goes |
| `src/routes/admin/reports-section.tsx` | Under a report: "Earlier versions", from `useEdits`, each with its time |
| `src/routes/admin/page.tsx` | Whatever it drew about who joined a room goes |
| `src/lib/home/topics.ts` | The first reply on a topic card is the earliest standing **top-level** post after the opener |
| Every test of the above | |

### The details that matter

- **Edit is the composer.** Pressing Edit swaps the post's words for the
  composer holding them, with Save and Cancel, and Escape cancels. The draft
  survives a refusal, as everywhere. No second textarea.
- **"Edited" is words, with the time**, `chatTime(editedAt)`, under the
  body in the byline's colour. Not an icon alone.
- **Controls stay visible controls.** Edit, Reply, Remove and Report are
  small text buttons in one row under a post, never a long-press, never a
  swipe. Under 44px means `data-target="small"`. Each one is named for its
  post to a screen reader — "Reply to Jan's post" — so a topic is not a
  column of twenty identical "Reply" links.
- **One level of nesting, decided by the client too.** Reply on a reply
  sets `reply_to` to the parent. The trigger is the guard; the client makes
  the guard unnecessary in ordinary use.
- **Numbering.** "3/11" counts top-level standing posts. A nested reply is
  not numbered. `reply_count` on the row and on Home is unchanged: every
  standing post but the opener.
- **A removed parent.** Its replies stand, with `reply_to` null, and are
  drawn as top-level posts in their own time order. Nothing says "reply to a
  removed post".
- **The quote in a conversation** is the first ~80 characters of the
  answered message, or "Photograph" when it had no words, or "Removed
  message" when it has been taken back. Tapping it scrolls that message into
  view and flashes it once (honouring `prefers-reduced-motion`). A nest in a
  chat would break its time order, which is the one thing a conversation is.
- **Why an administrator cannot edit.** An administrator removes; rewriting
  a member's words in their name is not moderation. The function refuses
  them, and no Edit is drawn for them on somebody else's post.
- **The earlier versions list** is a plain list — the words, the
  photographs it had then (through `AttachmentGrid`, which the administrator
  may read once the post is on a report or in a room), and "replaced
  9:30am" — under a disclosure that opens on tap. Administrators only, and
  never drawn for anybody else.
- **Refusal sentences**, through `describeError`: edit — attempt "Your edit
  was not saved.", refused "You can only edit your own post."; reply —
  `sendPost`'s existing ones, plus `constraints` for the new trigger's
  sentence if it arrives as a check.
- **Home.** The compose card and `/home/new` lose the join talk. Topic and
  photo cards are unchanged apart from the first-reply rule.

### Order of release

1. Migration and probes, run locally until every step reads as expected.
2. `pnpm exec supabase db push --linked --dry-run`; show the owner; **the
   owner pushes.** Nothing in the client changes yet. With the migration on
   the live database and the old client still deployed, nothing breaks: the
   old client still offers Join, which still works, and the database simply
   no longer requires it.
3. Then the client, in this order, each its own commit: Join comes out;
   editing; replies in topics; replies and editing in conversations; Home's
   `/home/new` and the first-reply rule; the administrators' earlier
   versions.
4. Documents: CONTEXT.md's Chat row ("No editing" goes; replies and editing
   are described); HANDOFF.md's "What Chat is" gets a section on this step
   and marks decision 7's "editing" and the joining rule as history; this
   plan's step 2 text about joining is marked superseded.

### Look at it

As a member who has joined nothing, on the local stack: start a topic in a
room, reply to a post, reply to that reply and see it land under the post,
edit your own post and see "Edited", try Edit on somebody else's and find no
control, take the parent back and see the reply stand. In a conversation:
reply to a message, tap the quote, edit a message. As an administrator: open
"earlier versions" on the edited post and on a report of it. Screenshots at
430 and 1280, `--text=larger`, 320px wide; axe over the topic page, the
thread page and `/home/new`; a keyboard walk through Edit → Save and Reply →
Send.

### Done when

A member who has never joined a room writes in it; can edit their own post
and message and see "Edited"; can reply to a post and see it nest, and to a
message and see it quoted; an administrator can read what an edited post
used to say; nobody else can; and every probe in `supabase/tests/` still
reads as expected.

---

## Step 3 — Likes

**One migration.** The owner pushes it, before the code that needs it.

### What a member sees

A Like button on a photo card on Home, and on every post in a topic. A count
beside it once anybody has liked it. Tapping the count lists who.

### The migration

`supabase/migrations/20260930000000_a_member_likes_a_post.sql`. Check that
timestamp is still the newest before using it. Header in the plain-prose
style of `20260927040000`: what, the owner and the date, then why.

**`chat_post_likes`**

| Column | |
| --- | --- |
| `post_id` | `uuid`, references `chat_posts` on delete cascade |
| `member_id` | `uuid`, references `members` on delete cascade |
| `liked_at` | `timestamptz not null default now()` |
| | Primary key `(post_id, member_id)` |

The row existing is the whole fact, the shape of `organization_follows`.
Unliking is a delete.

**Policies**, each `to authenticated`:

- **Select**: the post is in a room the caller can read —
  `chat_room_is_readable` on the post's topic's room. This is decision 4:
  names are visible to every member who can read the room, and to nobody
  else.
- **Insert**: `member_id = auth.uid()`, `is_active_member()`, the room is
  readable, the post is standing (`removed_at is null`), and the post is not
  the caller's own.
- **Delete**: `member_id = auth.uid()`.

**Grants**: revoke everything from `anon`, `authenticated` and `public`
first. Then grant `select`, `insert (post_id, member_id)` and `delete` to
`authenticated`. The insert is granted by column so nobody chooses
`liked_at`. No update grant.

Also:

- **Liking does not need the room joined.** Nothing does, after step 2b.
- **Not in the realtime publication.** A like is not urgent, and the names
  would be on the wire.
- **No notification.** No trigger, no new kind in `push_owed`.
- Any function added has a fixed `search_path` and explicit grants. The
  advisor's open findings are exactly functions that lack them.

### The probe

`supabase/tests/chat-post-likes.sql`. Run as signed-in roles, never as the
superuser. Print `current_user` in step 0. Give every expected refusal its
own savepoint. `supabase/tests/chat-posts.sql` is the pattern.

| Step | Proves |
| --- | --- |
| 1 | A member likes a post in an open room |
| 2 | Liking twice is one row |
| 3 | A member cannot like their own post |
| 4 | A member cannot like as somebody else |
| 5 | A member cannot choose `liked_at` |
| 6 | **A post in a closed room cannot be liked, and its likes cannot be read** |
| 7 | **Another member reads who liked a post in an open room** |
| 8 | A paused member cannot like |
| 9 | A removed post cannot be liked |
| 10 | A member cannot delete somebody else's like |
| 11 | Removing a member takes their likes; deleting a topic takes its posts' likes |
| 12 | `anon` reads nothing |

Steps 6 and 7 are the ones that matter. Add the file to the table in
HANDOFF.md.

### Files

| File | |
| --- | --- |
| `src/lib/chat/likes.ts` | `usePostLikes(postIds)`, `likePost`, `unlikePost` |
| `src/lib/chat/likes.test.ts` | |
| `src/routes/chat/like-button.tsx` | `LikeButton` and `LikesSheet` |
| `src/routes/chat/like-button.test.tsx` | |
| `src/routes/chat/post.tsx` | Draws `LikeButton` |
| `src/routes/chat/topic-page.tsx` | Reads the likes for its posts |
| `src/routes/home/photo-card.tsx` | Draws `LikeButton` on the opening post |
| `src/routes/home/page.tsx` | Reads the likes for the photo topics' opening posts |

### The details that matter

- **One read**: `post_id, member_id` for the post ids on screen. The count
  and the names both come from it. No counts view is needed, because the
  select policy already allows the rows.
- **`likePost` is an insert with `ignoreDuplicates: true`.** Never an upsert
  that updates: there is no update grant.
- **Optimistic, with an undo on failure**, the way `useRoomMembership`
  joins a room.
- **`LikeButton` follows `follow-button.tsx`**:
  - `aria-pressed`.
  - The visible word is the state, "Like" then "Liked".
  - The `aria-label` says what pressing does: "Like" and "Liked. Press to
    take it back."
  - Sized in `em`.
- **Not drawn on the reader's own post.** The count still is.
- **The count is its own button**, "3 likes", drawn only above zero. It
  opens `LikesSheet`.
- **`LikesSheet` is a dialog**, built like `report-sheet.tsx`:
  `role="dialog"`, `aria-modal`, three ways out, and focus returns to the
  count when it closes. It lists names through `useChatAuthors`, each linked
  to the profile when `hasProfile`. Under the title, one line: "Every member
  can see this list."
- **The refusal sentences**: attempt "Your like was not saved.", refused
  "You cannot like this."

### Order of release

1. Write the migration and the probe. Run the probe locally until every
   step reads as expected.
2. Re-run `supabase/tests/chat-posts.sql` and
   `supabase/tests/topic-removal-and-deletion.sql` to show nothing moved.
3. `pnpm exec supabase db push --linked --dry-run`. Show the owner the
   list. It will also name `20260929000000`, which is still waiting. The
   owner runs the push.
4. Only then merge the client code. A button calling a table that is not
   there reads "The club is being updated."

### Done when

A member can like and unlike a photograph on Home and a reply in a topic,
the count agrees in both places, and the list names who.

---

## Step 3b — Clean-up: the probes, one storage policy, and Like on every card

Asked for by the owner on 2026-09-30, after step 3 went live. Three small
things, one session. **One migration**, a small one, in part 2. Nothing
in the client depends on it, but the order of release is kept for the
habit: the owner pushes it before the client commits land.

### Part 1 — The eight probes read as expected again

The probes in `supabase/tests/` are how this project finds a broken rule
before a member does. Step 3 ran all 29 on a stack started fresh from every
migration and eight did not read as expected; none was a rule broken, and
that is the problem: a real fault would hide among eight false alarms.
HANDOFF.md, "Home, step 3", "Owed and noticed" lists them. Each fix, and
what it must not do:

| Probe | The fault | The fix |
| --- | --- | --- |
| `blocked-numbers.sql` step 10 | Prints a uuid; the text says `INSERT 0 1` | Correct the `expect:` line. |
| `chat-groups.sql` step 14 | Evicting somebody else is a `DELETE 0`, the text says permission denied | Correct the text, and add one line that proves the row is still there afterwards — a silent no-op that leaves the row is the right answer, and the probe should say so. |
| `photo-cleanup.sql` step 1 | Three delete policies, the text says two | After part 2: expect three, every one `{authenticated}`. |
| `restore-directory.sql` | Expects 22 seeded members, the seed has 23 | Count the seed in the probe rather than hard-coding it (`select count(*) from directory_seed`), so the next seeded row does not break it again. |
| `topic-removal-and-deletion.sql` step 4 | Two names print in the other order | Order the query. |
| `chat-member-removed.sql` step 4 and its note | The note says "still counted", untrue since `20260927030000`; the fixture writes two rows in one instant | Fix the note; give the fixture rows distinct `created_at` values (`clock_timestamp()` or explicit times). |
| `chat-posts.sql` steps 10 and 10d | Fixture rows in one instant, so "first" flips | Distinct `created_at` values. |
| `claim-preview.sql` step 1 | Cannot fail: its subquery reads `invites` as a non-member, and RLS answers with nothing | Make it assert something that can be false — read the row the step is about as the superuser inside a savepoint, or check the function's answer rather than the table. Then sabotage it once to see it fail. |

Rules: a probe stays one transaction that rolls back, expected refusals
keep their own savepoints, `current_user` stays printed at the top, and
**a probe with several transactions is never wrapped in one** (HANDOFF.md,
step 3, says what that did to the local database). Run all 29 on a fresh
throwaway stack afterwards — `supabase start --workdir` on a copy of
`supabase/` with its own `project_id` and ports — and put the count that
read as expected in the handoff. It should be 29.

### Part 2 — The chat storage policies name their role

The three policies on the `chat` bucket (`20260918200000`, and the delete
one recreated in `20260918210000`) are written for every role. Each calls a
function that only `authenticated` may execute (`is_admin`,
`chat_file_is_readable`, and so on), so a signed-out visitor who tried is
refused with "permission denied for function …" — refused either way, but
an error that names an internal function and says what the policy tests.
`20260918000000`'s header explains why the `photos` bucket's administrator
policy was narrowed for the same reason.

One migration, `2026093002xxxx_chat_storage_policies_name_their_role.sql`
(the next free stamp), recreating the three with `to authenticated` and
nothing else changed. Probe: `photo-cleanup.sql` step 1 shows the roles;
`chat-attachments.sql` still reads as it did. **This is a change to what a
policy applies to, not to what it allows**: a member's reads, uploads and
deletes are unchanged, and `pnpm check-chat-photo-policy` against the local
stack proves it through the API.

### Part 3 — Like from every card on Home

Step 3 put Like on a photograph's card. The owner wants it on **every topic
card on Home** too (2026-09-30): the plain topic card likes the topic's
opening post, exactly as the photo card does, with the same `PostLikes` and
the same words ("Like <title>", "3 likes on <title>. Show who.").

The trap: the topic card is a stretched link — the title's `after:absolute
after:inset-0` covers the whole card — and **a button under a stretched
link cannot be pressed**. `photo-card.tsx` is not stretched for this reason
(its header says so). So either lift `PostLikes` above the overlay
(`relative z-10` on its row, the way a card's other controls would be) or
give the topic card the photo card's shape (title is the link, card is not).
Prefer the first: it keeps the whole card tappable and adds one row of
controls that sits above it. Check by tapping Like on a topic card and
seeing the count change without the topic opening. Then the keyboard: Tab
reaches the title link, then Like, in that order. Test in
`topic-card.test.tsx`; screenshots at 430 and 1280 and `--text=larger`;
axe over Home with a list open.

A person card and an event card get no Like: a person is not a post, and
an event's answer is Interested and Going.

### Done when

29 probes read as expected on a fresh stack; the three chat policies say
`{authenticated}`; a member likes a plain topic from Home and sees the same
count on the topic page; and Home's photo cards are unchanged.

---

## Step 4 — Filter your feed

**No migration.**

### What a member sees

The filter button in Home's header, the same one Events has: 38px,
`data-target="small"`, a gold dot when a filter is on, and an `aria-label`
that counts them. It opens "Filter your feed".

| Group | Chips | Built from |
| --- | --- | --- |
| Rooms | The open rooms that something in the list belongs to | Topics' rooms, and members' topics through `roomsForTopics` |
| Where | Cities, and "Online" | Events' cities, members' cities |

The footer is the shell's: "Clear (2)" and "Show 14". The summary line reads
"14 of 31 match". At the bottom of the sheet, the mock's note: "The pills
across the top filter by kind. This narrows what is inside them."

### What matches what

| | Rooms filter | Where filter |
| --- | --- | --- |
| Topic, photo topic | Its own room | The author's city, if they are in Peers. Otherwise no match |
| Event | Adaptive sport only, when `isSport(event)`. No other room matches an event | Its city, or "Online" by `isOnline` |
| Person | Any room `roomsForTopics(member.topics)` names | Their city |

**A chip is only offered if something in the list would match it**, the way
`src/routes/events/page.tsx` builds its sheet from `inSegment`.

### Files

`src/routes/home/filters.ts` (pure: `matchesFeedFilters`, `roomsIn`,
`placesIn`, `activeFilterCount`), its test, and
`src/routes/home/filter-sheet.tsx` on `FilterSheetShell`, `FilterGroup` and
`FilterChip`. The filters live in component state, as they do on Events.

### When the filtered list is empty

"Nothing matches that yet. Try fewer filters." The sentence names the lever
that is holding the list shut.

### Done when

Choosing a room and a city narrows every pill, the count in the sheet agrees
with the list behind it, and Clear puts everything back.

---

## Step 5 — Home is the first screen, and the documents say so

Do this last, and only once steps 1 and 2 are live and the owner has seen
Home with real content on production.

### The redirects

| File | Line today | Becomes |
| --- | --- | --- |
| `src/App.tsx` | `/` → `/peers` | `/home`. Rewrite the comment above it |
| `src/routes/onboarding/page.tsx` | Three navigations to `/peers` | `/home` |
| `src/routes/dev-login/page.tsx` | `next` defaults to `/peers` | `/home` |
| `src/routes/not-found/page.tsx` | Link to `/peers` | `/home`, and its label |
| `src/routes/admin/page.tsx` | A non-admin goes to `/peers` | `/home` |

`start_url` in `vite.config.ts` is `/` and stays. Notifications fall back to
`/` and stay. Update every test that asserts `/peers` as the landing place.

### The documents

- **`CONTEXT.md`**
  - The surfaces table: Home becomes Real, with a note saying it is a way in
    to rooms, events and members, and what it does not do.
  - "Four surfaces are real" becomes five.
  - "Deliberately deferred": take out "The Home feed". Record the decision
    and its date the way the topic rooms paragraph does, including that the
    "four content types and a moderation story" objection was answered by
    adding no new content type.
- **`HANDOFF.md`**
  - "Still open": Home is built.
  - "Next up": the "Do not build Home without asking" paragraph becomes
    history.
  - Item 5 of "The job": built.
  - A new section, "What Home is": the seven decisions, the departures
    below, the traps below, and the files.
- **`src/components/app-nav.tsx`**: the header comment.

### Done when

A member who signs in lands on Home, a new member finishing onboarding lands
on Home, and both documents describe the app as it is.

---

## Step 6 — The photos bucket

Asked for by the owner on 2026-09-30, after step 3b's storage-policy tidy
raised it. Last, after step 5. Two parts; **the second needs the owner's
decision before it is built**, and the first does not.

The `photos` bucket holds every member photograph (`<member_id>/…`), the
seeded directory's (`seed/…`) and the organizations' logos
(`organizations/…`). It was made in `20260910120100` as **public, with no
size limit and no allowed types**. `src/lib/photos.ts` builds a public URL
from `members.photo_path`; nine screens draw through it, most through
`MemberAvatar` and `OrganizationBadge`.

### Part 1 — Limits, like the chat bucket's. No decision needed

- `file_size_limit` 2MB and `allowed_mime_types` webp, jpeg, png on the
  `photos` bucket — the chat bucket's own numbers, in one migration that
  updates `storage.buckets`.
- **Check the live files first.** On 2026-09-30 the bucket held 50 files,
  the largest 329KB, none over 2MB, so nothing needs shrinking before the
  limit lands. Check again on the day with the storage API's list, since a
  limit under a file already there would not delete it but would stop it
  being replaced. `pnpm reprocess-photos` is the tool if one has appeared.
- The client already shrinks a profile photograph to 800px, webp or (on a
  phone) JPEG, before upload — `preparePhoto`, fixed on 2026-09-29 — so an
  ordinary upload is far under the limit and nothing on a screen changes.
  The refusal sentences for a file that is not, "too large after shrinking"
  and "not a kind of photograph the club can hold", already exist in
  `describeError` and reach the details form and onboarding through
  `savePhoto`'s error path; check that they do, since until now that bucket
  refused nothing.
- Probe: `photo-cleanup.sql` gains a step reading the bucket's row and
  expecting the two limits.
- **Nothing else in this part**: the member policies stay for every role
  (they call nothing a visitor cannot run — step 3b's note), and the bucket
  stays public until part 2 decides otherwise.

### Part 2 — Private, or public. The owner decides first

**What is true today.** Anyone holding a photograph's URL can open it
without signing in. The path is a member's id and a random file name, so
nothing can be browsed or guessed, but a link copied out of the app works
for anyone, forever. CONTEXT.md's public/private table puts photos behind
sign-in, and the bucket does not.

**The choice**, put to the owner before anything is built:

- **Keep it public.** Nothing to build. Change CONTEXT.md's table to say
  photographs are readable by link, and why that was accepted: the paths
  are unguessable, and a private bucket costs every screen a signing round
  trip.
- **Make it private (recommended).** The bucket becomes `public = false`
  and its select policy becomes `to authenticated` with `is_member()`; the
  chat bucket is the model. Every avatar, hero photograph and logo is then
  drawn through a **signed URL**, the way chat photographs already are.

If private, the build:

- One signing cache for both buckets. `useAttachmentUrls` in
  `src/lib/chat/attachments.ts` signs paths for the `chat` bucket and caches
  them for a little under their hour. Give it the bucket as a parameter
  (default `chat`, so the six chat callers do not change) and let
  `src/lib/photos.ts` export `usePhotoUrls(paths)` over it. `photoUrlFor`
  goes; nothing else builds a URL by hand.
- **One request per screen, not per face.** The Peers deck draws up to
  twenty-three photographs and Home a dozen; `createSignedUrls` takes the
  whole list in one call, and the cache means scrolling back re-signs
  nothing. Measure the deck's first paint before and after on the local
  stack and put both numbers in the handoff; if the second is worse by
  more than a blink, the answer is to sign earlier (in `useBrowseMembers`,
  alongside the rows), not to give up.
- `MemberAvatar`, `MemberCard`, the profile hero, Me's hero, the details
  form, onboarding's photo step, `OrganizationBadge` and the organization
  page all read through the hook. Each keeps drawing the initials tile
  until the URL arrives, which is what they do today for a member with no
  photograph, so there is no flash of a broken image.
- **Organization logos are public information**, on the organizations' own
  sites. If signing them grates, they can move to a bucket of their own
  that stays public; the plan's default is to leave them in `photos` and
  sign them like everything else, because two buckets is more to keep
  right and a logo is small.
- The service worker precaches nothing from storage today, so nothing
  there changes; an offline Peers deck already draws initials.
- Probes: `photo-cleanup.sql` reads the bucket as private and its select
  policy as `{authenticated}`; a new step as `anon` reads nothing. `pnpm
  check-photo-policy` gains the read side (it covers insert and delete).
- **Order of release: the client first, then the migration.** The reverse
  of every other step, and deliberately: the signing client works against
  a public bucket (a signed URL to a public file is still a URL), but the
  old public-URL client against a private bucket is every photograph
  broken at once. So: land and deploy the client that signs, confirm on
  production that every face still draws, then the owner pushes the
  migration that closes the bucket.

### Done when

The bucket refuses a file over 2MB or of another type, with the sentence a
member can read; and either CONTEXT.md says photographs are readable by
link and why, or the bucket is private, every face and logo still draws,
and a copied URL stops working within the hour.

---

## Departures from the mock, with reasons — do not "fix" these

- **No comments sheet.** A comment is a reply, and the topic page already
  lists replies with a composer, Report, Remove and Mute. A second list of
  the same replies would be a second place for each of those to go wrong.
- **No floating "Post" button.** The dashed card is the first thing in the
  list and does the same job. Two controls with one name read as a repeated
  control to a screen reader, and a fixed button covers the last card at
  the larger text sizes.
- **No brand row, search or bell in the header.** No other tab has them.
- **No chip row of active filters.** Events and Peers do not draw one. The
  gold dot and the button's label say a filter is on.
- **Room names where the mock has categories.** The room is where the
  question lives.
- **"Replies" where the mock has "answers" and "comments".** The app's word.
- **No city on a topic or a photograph.** `ChatAuthor` leaves it out on
  purpose, so a member hidden from Peers is not placed on a map by
  something they wrote.

## Out of scope — draw no control for any of these

Search across the feed. A notification centre. Anonymous asking. "This
helped" and "Message" chips on an answer. Routing an unanswered question to
matching members. A notification for a like. Video. Like and Reply
on a single comment.

If a task seems to need one, say so to the owner rather than quietly scoping
it in. That is CONTEXT.md's rule.

## Questions for the owner — none of them block step 1

Each has the default this plan takes. Ask when the owner is there; build the
default when they are not.

1. ~~**Should the photograph viewer become a proper dialog before step 1?**~~
   Answered 2026-09-29: yes, and it was done before step 1.
2. **Should Home suggest seeded directory members who have not claimed
   their profile?** They cannot answer a message. Default: yes, the same as
   the Peers deck.
3. ~~**Which rooms are open on the live project?**~~ Answered by the owner,
   2026-09-29: all of them. Their word, not checked against the live
   project by a session.
4. **Is there a general room for photographs that fit no subject?** A trip,
   a first flat. Not needed to release step 2: the picker always offers
   "Start a room". Default: build nothing, and do not seed one in a
   migration. If the owner wants one they start it from `/chat/rooms/new`.
   It is a room, not code.
5. **The wording of every new sentence** in this plan. Default: as written.

---

## Traps in this build

- **An administrator reads closed rooms.** Without the `openedAt` filter
  their Home shows topics no member can see, and a screenshot taken as the
  administrator looks fuller than any member's.
- **The first standing post is not always the opening post.** See step 1,
  "The reads".
- **A photo card is not a link.** It holds buttons.
- ~~**Joining is optimistic everywhere except `/home/new`**, where it must be
  awaited.~~ Gone with step 2b: nothing joins a room any more.
- **Two select policies are ORed.** `chat_post_likes` has one on purpose.
  If a second is ever added, every read that means "mine" must say so.
- **`AttachmentGrid` signs URLs under the reader's token.** In a test, stub
  `useAttachmentUrls` or the render reaches for the network.
- **`AttachmentGrid` is drawn by four screens.** A change made for Home
  that is not behind the `fill` prop changes every conversation, topic and
  report as well.
- **The mixed feed is decided by a pure function.** A test that renders the
  screen and asserts an order is testing `buildFeed`; test `buildFeed`.
- **`pnpm demo-member` after every `supabase db reset`.**
- **`pnpm shoot` signs in as the first test number**, which is an ordinary
  member called Alex on a fresh local stack. Administrator-only states need
  the SQL update from "Before step 1" again after a reset.

---

## At the end of every step

1. `pnpm test`
2. `pnpm check`, on its own, and read its exit status
3. `pnpm build`
4. Screenshots at both widths and at `--text=larger`, read, not only taken
5. The keyboard walk, and axe over `/home`
6. Commit. **Do not push.**
7. Update HANDOFF.md with what landed and what is still owed, and commit
   that on its own.
8. Tell the owner what is ready, what needs them (a push, a database push,
   a room opened), and what you were not able to check.
