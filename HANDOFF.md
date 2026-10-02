# Handoff

Last updated 2026-10-01. Kept short on purpose: what is true now, the rules,
and the traps. **The full history** (every step, how each was checked, every
decision's reasoning) is the old file: `git show 4b1673b:HANDOFF.md`. Read a
section of it, or `git log`, or the migration headers, when you need why.
`CONTEXT.md` is the product definition and wins over this file. Code
comments and migrations that cite a HANDOFF.md section by name ("What Home
is", "Errors read as sentences", "Home, step 6"…) mean that old file.

Work in `/home/alfred/projects/thesciclub`. `../ab-peers-prototype/` is
reference only; never commit to it.

## State, 2026-10-01

- **The SCI Club**: private, invite-only PWA for people with spinal cord
  injury. Vite 8, React 19, TypeScript strict, Tailwind 4, Supabase, Vitest,
  pnpm, Node 24. Live at https://thesciclub.netlify.app/ (Netlify builds
  `main`). The mock `docs/` is GitHub Pages at www.thesciclub.com.
- **Git**: work on `scaffold-and-peers-deck`; release is `git push origin
  scaffold-and-peers-deck && git push origin HEAD:main`. One remote,
  `origin` = `Able-Bodied/thesciclub` (public); both branches at the same
commit after every release.
- **Database**: hosted project `erijdvqnxavwezsbbojv`, 96 migrations, none
  pending (the owner pushed 20261003020000–070000 on 2026-10-01). Check with `pnpm exec supabase
  migration list` (a blank Remote column is pending). Edge function
  `push-notify` version 2 is live.
- **Tests**: 1,606 pass; `pnpm check` and `pnpm build` clean.
- **Surfaces**: Home (opens here), Peers, Events, Onboarding + profile, Chat,
  Me, Admin. All real.

Check all of this rather than trusting it: `git log --oneline
origin/main..HEAD` should be empty.

## Open, in order

1. **Twilio approval** — the owner is working on it. SMS does not reach
   anybody in production; real members sign in with fixed codes on the live
   project's test-number list. The owner chose (2026-10-01) to wait for
   Twilio rather than change the codes now: do not raise it each session.
   **Once texts arrive**: clear the live test-number list (Authentication →
   Sign In / Providers → Phone → Test phone numbers) — real members' numbers
   and the three local ones — after making the owner's real account an
   administrator, because the only live administrator is test number
   `11111111111`. Then `pnpm shoot` runs locally only. Ask first: live
   settings change. Recommended provider: Twilio Verify (no A2P 10DLC).
2. **Phone-only checks**, never done on a real iPhone: VoiceOver for an hour
   (now including "Saved." and the other confirmations, Your answers, and a
   described photo); notifications end to end (Home Screen app, turn on, tap
   one — each kind opens its own screen); signed photos; the number pad
   staying up from the phone number into the code (`keyboardHold` in
   onboarding); the notifications step after signup.
3. **Small, noticed, not asked for**: Staying Driven Wheelchair Fitness (23
   upcoming) has no format, place or city — the feed and its NorCal SCI page
   never say whether it is Zoom or a gym; ask NorCal SCI, never guess; the
   "Rather not say" toggles on Your details are under 44px with no `data-target`;
   onboarding's photo step does not ask for a description (Your details
   does).

## Rules the owner set

- **Push only at the owner's word, gated on `pnpm check`'s exit status run
  alone** (not piped; `| tail` hides failure). Untracked owner folders
  (`sci-club-logo/`, `logos-from-you/`) are excluded from Biome and git.
- **The owner runs `pnpm exec supabase db push --linked`** (the permission
  system refuses a session). A session runs `--dry-run` first and shows the
  list. Migrations go **before** the client that needs them, unless the
  client must go first (it is said in the migration header when so).
  Edge function: `pnpm exec supabase functions deploy push-notify
  --project-ref erijdvqnxavwezsbbojv`, at the owner's word.
- **Never `supabase config push`**: `config.toml` holds placeholder Twilio
  credentials and would overwrite the real ones.
- **Commit small, one change each, each typechecking alone.** Comments say why.
- **Accessibility over brand** when they conflict. Text never shrinks to fit.
- **No control for a thing the app does not do** (no dead or greyed buttons);
  CONTEXT.md's deferred list is not built without the owner asking.
- **Look at what you changed**: `pnpm shoot <route>` (needs `SHOOT_BASE`,
  `--scroll=<px>`, `--text=larger`, `--both`) and read the PNG. Every layout
  bug here was found by eye. It cannot carry router state or open a sheet: a
  scratch Playwright script can (sign in as `shoot.mjs` does, by the inputs'
  `autocomplete`).
- **Probes** (`supabase/tests/`): run as a signed-in role, a savepoint per
  expected refusal, never wrap a multi-transaction file, read every log
  against its own `expect:` lines, count on a fresh stack, and sabotage a fix
  once to prove its step can fail.
- The owner's terminal needs `nvm use 24` for pnpm.

## Environment

- `.env.local`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  (`sb_publishable_…`), `SUPABASE_SERVICE_ROLE_KEY` (`sb_secret_…`, sent to
  storage as `apikey`, not `Authorization`), `VITE_VAPID_PUBLIC_KEY` and the
  VAPID pair. **It points at production**: `pnpm dev`, `pnpm shoot` and Vitest
  all read it.
- **Local dev against the local stack** (5183 by convention):
  ```
  VITE_SUPABASE_URL=http://127.0.0.1:54321 \
  VITE_SUPABASE_ANON_KEY=$(pnpm exec supabase status -o json | python3 -c 'import json,sys; print(json.load(sys.stdin)["PUBLISHABLE_KEY"])') \
  ./node_modules/.bin/vite --port 5183 --strictPort
  ```
  Confirm with `curl -s localhost:5183/src/lib/supabase.ts | grep 127.0.0.1`.
  Stop a server by its port (`ss -ltnp | grep :5183`), never `pkill -f` a
  pattern that is in the same command line.
- **Local stack**: `pnpm exec supabase start` (CLI is a devDependency; always
  `pnpm exec`). Light set: `-x imgproxy,mailpit,studio,edge-runtime,logflare,vector,supavisor`.
  Never exclude `storage-api` (storage calls fail as "name resolution
  failed") or `realtime` (subscriptions say SUBSCRIBED and deliver nothing).
  The CLI remembers exclusions: `stop` before restarting differently. New
  migration: `pnpm exec supabase migration up --local`, then `notify pgrst,
  'reload schema';`. After `db reset`, `pnpm demo-member` (makes
  `11111111111` an ordinary member, Alex). The local photos bucket holds
  generated stand-ins; a reset empties it.
- **Fresh throwaway stack** (the fair place for probes and a new member's
  signup): copy `supabase/` to the scratch folder, set `project_id` and ports
  (`5432x` → `5532x`, inspector 8183), `pnpm exec supabase start --workdir
  <dir>`, dev server on 5184 pointed at 55321, `stop --workdir <dir>
  --no-backup` after.
- **Test numbers** (fixed codes, no SMS): `11111111111`/`111111` (admin on
  live; its local invite claims seeded Bob), `12222222222`/`222222` (the
  owner's own account on live), `13333333333`/`333333`. In the phone box type
  the ten digits without the leading 1.
- **No host psql**: `docker run --rm -i --network host -e PGPASSWORD=postgres
  postgres:17-alpine psql -h 127.0.0.1 -p 54322 -U postgres -d postgres`.
  Storage rows cannot be deleted in SQL (`storage.protect_delete`); use the
  API.
- **Playwright**: chromium only via `LD_LIBRARY_PATH="$HOME/.cache/thesciclub-browser-libs/root/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH"`
  (Firefox installed too; no WebKit). Headless denies notification permission:
  `launch({ channel: 'chromium' })` for the default state; incognito contexts
  have no Push API (`launchPersistentContext`). Headless hides scrollbars:
  `ignoreDefaultArgs: ['--hide-scrollbars']` to measure one. Text size is
  `normal`/`large`/`larger` in localStorage `thesciclub.accessibility`
  (`largest` is silently ignored). No axe in the project.
- **Netlify CLI**: `pnpm exec netlify …`, add `--filter thesciclub` to
  project-scoped commands. `VITE_` variables are not secrets (inlined). Never
  put the service key there. Verify a deploy by grepping the live bundle for a
  string only the new code has.
- **Ingest**: `.github/workflows/event-ingest.yml`, daily 04:10 UTC, from
  `main`, writes with the service key. Only one repository may run it. Push
  `main` after changing `jobs/`. Dry run: `gh workflow run "Event ingest"
  --repo Able-Bodied/thesciclub -f dry_run=true`.
- VS Code red but CLI clean means it is not attached to WSL (`code .` from WSL,
  workspace TypeScript 6.0.3).

## Traps that cost real time

- **No test may reach the network** (`src/test/setup.ts` throws on fetch and
  WebSocket). When a screen gains a hook, its test stubs it — including
  `@/lib/photos` (unstubbed, the test passes drawing initials) and
  `@/lib/push/notifications`.
- **Tests that pass by not running**: a fixture without a `code` gets
  phrase-sorted by `describeError`; a whole-module `vi.mock` stubbing the
  function under test; a limit raised under a test that still inserts "one
  past"; a probe run as the superuser (BYPASSRLS, every policy inert).
- **`pnpm fix`** (eslint then biome, in that order) reformats files: re-read
  before a second string-match edit, and assert every scripted replace applied.
- **A new view is writable by default.** Supabase grants `authenticated`
  everything on a new relation; a view runs as its owner, so a single-table
  view is a way round every policy. `revoke all … from public, anon,
  authenticated` by name, then `grant select`. `create or replace view` keeps
  grants but drops `security_barrier`: restate `with (security_barrier =
  true)`. `api-grants.sql` steps 13–14 catch both. A view's function calls are
  checked against the reader, so a function it calls must stay executable.
- **Postgres**: a definer function has RLS off, so it checks visibility itself
  (`chat_room_is_readable`, `chat_can_post_in`, `is_thread_member`,
  `is_active_member`). Insert is granted column by column; a new `events`
  column needs its select grant or the whole query fails. `upsert` needs an
  update grant: use `ignoreDuplicates`. `now()` ties within a transaction:
  `clock_timestamp()` where rows are ordered by time. A parameter named like a
  column is ambiguous in plpgsql. Two select policies are ORed: a screen that
  means "mine" filters by id. Check constraints run after BEFORE triggers.
- **Pre-membership callers** (onboarding, the invite gate, the blocked screen)
  cannot read members-only views: use the definer functions
  `my_invite_status()`, `my_claimable_profile()`, `photo_is_my_claimable()`.
- **Photos**: both buckets are private, 2MB, webp/JPEG/PNG. Every face and
  logo is a signed URL (`usePhotoUrl`, `MemberAvatar`; never a hand-built
  URL). Storage refuses an upsert without a select policy on the row, which is
  why an account reads its own folder. `preparePhoto` shrinks anything the
  browser can decode; Safari writes JPEG, not webp. A refused photo says why in
  one sentence (`describeError`'s STORAGE list, without the caller's lead).
- **Sizing**: a box holding text is sized in `em` off that text (the text-size
  setting scales rem). Controls under 44px get `data-target="small"`.
- **Focus**: every sheet and dialog uses `useDialogFocus`
  (`src/lib/dialog-focus.ts`); the route change retitles and focuses `main`
  by `main h1`. iOS opens a keyboard only for a focus inside a tap.
- **Where the app lands** is written in five places: `App.tsx`, onboarding,
  dev-login, not-found, admin.
- **Realtime**: a table not in the publication delivers nothing;
  `chat_thread_members` is out on purpose (a roster on the wire).
- **Notifications** cannot be tested from the dev server (no service worker):
  build and `vite preview`, or a phone.

## What the product decided (summary; reasons in the old file and headers)

**Membership.** Invite only: an organization or a mentor (ten invites,
`mentor_invite_limit()`) puts a number on the list; an administrator can vouch
alone and attach a directory claim. 18+ by trigger. Strikes: three is a limit
that asks an administrator (Pause, Remove, Not now), withdrawn never deleted,
count for twelve months, the member sees the reason, private from other
members. Pause keeps the row (`status = suspended`, screen says paused);
Remove deletes and revokes the invite, with "Block this number too". No
administrator can be paused, removed, blocked or made a peer from the app; an
administrator is always a mentor. "Rather not say" (`members.declined`) is an
answer; skip is a gap.

**Claiming a seeded profile.** The trigger `consume_invite_for_new_member`
copies the seed server-side where the new row is empty, never `type`, and
retires the seed either way; "Start fresh" sends `start_fresh` and copies
nothing (never stored true). `/admin` → Restore directory puts the 23 seeds
back from `directory_seed` (remove a test member first).

**Onboarding.** Number, code (verifies on the sixth digit), then the invite
answer: blocked screen, claim, or the questions. Name and birthday required,
then "Finish later" anywhere. The phone step never sends the code by itself:
the owner (2026-10-01) wants Continue pressed, so a mistyped number is seen
before a code goes to it. "Rather not say" moves on (injury, location).
After the insert, one notifications screen before Home if the device can be
asked (`NotificationsStep`). A refused photo stays on the photo step.

**Peers.** `browse_members` is the only projection of one member to another
(no phone, no birth date); the reader is not in their own deck. Member pages
`noindex`.

**Events.** Public, ingested from NorCal SCI and AdaptiveRecHub. A series
collapses to its next date; counts are of the filtered list; nothing collapses
in Going/Interested/Been to (upcoming-only, Been to is its own pill). Format is
null when the feed does not say, and null never matches a format chip.
Following an organization is private (no counts).

**Chat.** Direct (two, private even from administrators), group (≤50, or an
event's attendees; anybody in it renames it or sets its picture, which posts a
notice line), rooms (topics then posts; any member writes in any open room,
no joining; any member starts a room with its first topic; nobody renames or
deletes a room; administrators open and close rooms and may delete a topic).
Editing your own words, earlier versions for administrators only
(`chat_edits`); replies one level deep in topics, quotes in conversations.
Soft delete: a removed reply in a topic disappears; a message says "Removed
by…". Reporting one post or message discloses that one item only, snapshot at
report time; a reported photo cannot be deleted. A removed member's words stay
as "Former member". No search, no blocking, no anonymous posting, no video.

**Home.** A second way in to rooms, events and members, plus Likes (names
shown to everybody who can read the room). Pills Everything · Topics · Photos
· Events · People; filters by room and place narrow the list a pill drew.
Asking or sharing creates a topic in a room. Cards: link on the title
stretched over the card, buttons `relative` over it (no `z-10`). Back keeps
the pill (`{ from: 'home', segment }`). Administrators' Home must filter closed
rooms (`openedAt`). Out of scope: feed search, notification centre, anonymous
asking, routing questions, video, a comments sheet.

**Notifications** (Web Push to the Home Screen app; `push_owed` decides who and
what, `compose.ts` the words, `src/sw.ts` shows and opens). Direct and group
messages and replies carry their words cut at 120; a like quotes the start of
the liked post (80); nothing names a room, topic or group. Also: added to a
group, reports (administrators, says nothing), an invitee joining (mentors),
tomorrow's events, new events from followed organizations (daily 16:00 UTC).
Mutes per conversation, topic, room; switches per kind on Me. Each kind's
`url` opens its screen. Changing the VAPID pair strands every subscription.

**Brand.** Atkinson Hyperlegible Next for all reading text (`font-sans`,
`font-head`), Outfit only for `font-display` (22px and up). Colours from
`tokens.json`; `text-on-gold` on gold fills. The owner's SVGs drawn by
`ClubMark` / `ClubWordmark`, never redrawn; badge minimum 96px. The old look
is the tag `brand-before-outfit`. Organizations are drawn only by
`organization-badge.tsx` with `organizationByName()`.

**Components not to write twice**: `member-avatar.tsx` (four avatars),
`SegmentPills`, `composer.tsx` (send, edit, reply), `ReportControl`,
`report-sheet.tsx`, `FilterSheetShell`, `useDialogFocus`, `SmallButton` /
`ReasonField` (`admin/controls.tsx`), `lib/chat/time.ts`, `describeError` /
`describeThrown` (`src/lib/describe-error.ts`, every refusal becomes a
sentence), `useAnnounce` (`src/lib/announce.tsx`, every success is said).

## The probes

SQL in `supabase/tests/`, each rolled back, run by hand:
`docker run … psql … -f - < supabase/tests/<file>.sql`. 33 files, one per
area — `api-grants` for what views and functions let a member or nobody
reach, and: invites and claims (`invite-lifecycle`, `mentor-invites`,
`blocked-numbers`, `claim-preview`, `claim-carries-profile`,
`restore-directory`, `admin-vouches-directly`, `admin-is-protected`,
`admin-invites-no-auth-users`), members (`strikes`, `organization-follows`,
`declined`), chat (`chat-authors`, `chat-rooms`, `chat-posts`, `chat-edits`,
`chat-replies`, `chat-post-likes`, `chat-direct`, `chat-groups`,
`chat-group-rename`, `chat-member-removed`, `chat-reports`, `chat-attachments`,
`chat-member-rooms`, `topic-removal-and-deletion`), notifications
(`push-subscriptions`, `push-notify`, `push-notify-more`, `push-notify-likes`),
photos (`photo-cleanup`, `photos-bucket-reads`). Each file's header says which
steps matter and whether it runs as the superuser (only for constraints and
triggers). Uploads and deletes are proved through the API by
`pnpm check-photo-policy` and `pnpm check-chat-photo-policy`; live delivery by
`pnpm realtime-check`.
