# Handoff: polish pass

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

## What this is

**The SCI Club** — a private, invite-only PWA for people living with spinal
cord injury. Vite 8 / React 19 / TypeScript strict / Tailwind 4 / Supabase /
Vitest, pnpm, Node 24.

Branch `scaffold-and-peers-deck`, ~164 commits ahead of `origin/main`. The
owner has read-only access to `Able-Bodied/thesciclub` and is waiting on write
access, so **`origin` cannot be pushed to** — but there is a second remote,
`personal` (`Alfredx48/TheSciClub`), and the branch is pushed there. Both its
`main` and its `scaffold-and-peers-deck` sit at `a830353`, the branch head.

Say which `main` you mean. `origin/main` is at `851fcb1` and is nearly two
hundred commits behind; `personal/main` is the branch head and is what the
nightly ingest actually runs. Do not commit to either.

**All three planned flows are built.** Peers (deck, profiles, filters),
onboarding + the profile survey, and Events (list, detail, RSVPs,
organizations) with 124 real events ingested from NorCal SCI's and
AdaptiveRecHub's live calendars. Also: admin tools, the invite system, an 18+
gate, and a details editor.

676 tests pass. `pnpm check` and `pnpm build` are clean. **Keep them that way —
do not commit with either failing.**

## The hosted database is ahead of `main`, and thirteen migrations are live on it

This is the thing most likely to catch somebody out, so it is first.

`pnpm exec supabase db push` has been run against the hosted project
(`erijdvqnxavwezsbbojv`). Everything in `supabase/migrations/` is applied there
and locally — `pnpm exec supabase migration list` shows nothing pending. That
includes thirteen migrations written after the branch was last summarised.
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
  the live calendar is grouped: 124 events, 35 series.

**The code for every one of them reaches `personal` only, and the database
changes are real and live.** That asymmetry is the whole point of this
section: the hosted project is running schema that exists nowhere in
`Able-Bodied/thesciclub`. Do not reset or roll the hosted database back to
`origin/main`'s state expecting the app to work. The nightly ingest now runs `personal/main`, which is the branch head, so
it is executing against this schema *with* the code that understands it — that
was not true until 2026-09-14. See "The scraper runs itself, daily".

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

Two rules to preserve if you touch it:

- **Their answers win.** Every field copies only where the incoming row is
  null or an empty array.
- **`type` is not carried.** Several seeded rows are mentors and a mentor can
  put two numbers on the list, so inheriting it would turn a mistyped invite
  into an invite-rights grant. Promotion stays an administrator's decision.

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
- **Watch for tests that pass by not running.** Six times now: a silent RLS
  no-op, a subquery that returned nothing, Testing Library renders leaking
  between tests, an assertion matching the prose that promised the thing rather
  than the thing, a `vi.mock` of a whole module that would have stubbed the
  pure function under test and let the test assert its own wording, and a test
  named for one case whose fixture put it in another — "offers no revoke on an
  invite somebody already used", with no holder set, was exercising the
  orphaned invite instead.
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

## The probes in `supabase/tests/`

SQL run by hand against a local stack, each in one transaction that rolls
back. They exist because policies and triggers are not covered by `pnpm test`
at all, and six of this project's bugs were found by running a path rather
than reading it.

| file | what it exercises |
| --- | --- |
| `invite-lifecycle.sql` | deleting a member: their invite, the ones they issued, the constraint that used to block it |
| `mentor-invites.sql` | the two-invite cap, as a real mentor session |
| `blocked-numbers.sql` | all three places a ban is enforced |
| `claim-preview.sql` | that somebody mid-onboarding can see the profile they may claim |
| `claim-carries-profile.sql` | that claiming carries the whole profile and their own answers win |
| `restore-directory.sql` | restoring the seeded directory without touching anybody real |
| `admin-vouches-directly.sql` | an administrator inviting in their own name |

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
- Local Supabase: `pnpm exec supabase start -x realtime,storage-api,imgproxy,mailpit,studio,edge-runtime,logflare,vector,supavisor`.
  After `pnpm exec supabase db reset`, run **`pnpm demo-member`** — a reset
  drops the auth schema, so the test account loses its member row and every
  sign-in lands back in onboarding.
- **Never run `pnpm exec supabase config push`** — `config.toml` holds
  placeholder local Twilio credentials and would overwrite the hosted project's
  real ones. `db push` is fine and is how the migrations above got there.
- Test numbers (fixed OTPs, no SMS): `11111111111`/`111111`,
  `12222222222`/`222222`, `13333333333`/`333333`. `11111111111` is **Admin**.
- Dev server: `pnpm dev` (5173), or
  `./node_modules/.bin/vite --port 5180 --strictPort` to leave 5173 free for
  whatever the owner has open. Screenshots:
  `SHOOT_BASE=http://localhost:5180 pnpm shoot /peers --both` — `pnpm shoot`
  defaults to 5181, so it nearly always needs SHOOT_BASE.
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
- No host `psql`; use
  `docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine psql …`.

---

# Next up: the owner's call

**Five things the owner reported on 2026-09-16 are fixed** — see "The owner's
five, and what two of them turned out to be" below. Two of them were not what
they looked like, which is the part worth reading before trusting a bug report
from a screen rather than from a measurement.

Nothing else is queued. The mentor invite screen that once stood here is built,
and so is everything that came after it — see the sections below. Two
decisions are genuinely open, and both are waiting on a person rather than on
code:

- **What Events does with series.** Repeating events are grouped and nothing
  uses the grouping yet, deliberately: collapsing the list, a "weekly" badge,
  a filter, and series-level dismissal are four different answers and the
  grouping had to exist before any of them could be judged. It exists now.
- **The 29 events with no format.** They are one series — a quarter of the
  calendar — and NorCal SCI's own page never says whether it is Zoom or a
  gym. That is a question for NorCal SCI, not a rule to write.

After those, the list below still ranks: the survey being linear only
(item 4), and hosting on Netlify, which is configured and waiting on somebody
to connect the repo.

---

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
  surfaces are elsewhere.
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
- **The house-rules sentence under Good standing.** CONTEXT.md asks that losing
  membership stay visible in the product rather than behind a terms link.
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
non-mentor to Me, the way `/admin` redirects a non-admin to Peers. Neither is
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
  taken" — `describeFailure` in `src/routes/invites/mentor-invites.ts` keys on
  the SQLSTATE, and the wrong sentence would appear exactly when a mentor was
  already confused.
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
- **A mentor**, through their own RLS policy, capped at two.
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

## 5. Home and Chat are placeholders

Deliberate — see `CONTEXT.md`. They say plainly that they are not built
rather than showing invented content. **Keep that.** Do not build the Home feed
or topic rooms without asking; both are explicitly deferred and the reasoning
is in CONTEXT.

## 6. Messaging does not exist

Several surfaces say so in words rather than offering dead buttons — the
official account profile in particular. **Keep that pattern.** A button that
silently does nothing is worse than a sentence explaining where things stand.

## Smaller things noticed but not fixed

- Peers filter sheet still caps topics at 24 by frequency and has no search
  box. It matters much less than it did: `src/routes/peers/topics.ts` groups
  the free text first, so the list is 29 entries rather than 61 and the ones
  that narrow a deck are at the top. A rare one-person topic is still
  unreachable.
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

**The scheduled run executes `personal/main`, and since 2026-09-14 that is the
branch head.** It is no longer running behind the code.

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

The lesson generalises past this job. `personal/main` is a moving target that
nothing automatically advances, and the gap is invisible from inside the repo —
`git status` is clean and says nothing about it. **After landing work the
ingest depends on (`jobs/`, `scripts/backfill-series.mjs`), push `main` too**,
not only the branch:

    git push personal scaffold-and-peers-deck && git push personal HEAD:main

`git log --oneline personal/main..HEAD -- jobs/` is the one-line check for
whether that is owed.

**Right now it runs from `Alfredx48/TheSciClub`, and that is correct.** The
owner does not have write access to `Able-Bodied/thesciclub` yet — see "What
this is" — so their own private repo is where the branch lives and where the
job has to run, with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set as
repository secrets on it. Both are set, and a real run has been through
successfully — see the classifier section for what it changed.

That means exactly one repository is writing to the live tables, which is the
condition to preserve. GitHub schedules workflows from the default branch of
**every** repo that has one, so the day the branch is pushed to
`Able-Bodied/thesciclub` there will be two crons upserting the same
`(feed_id, external_id)` rows on the same schedule. `concurrency` does not help:
it serialises runs within one repository and knows nothing about the other.

**So at handover, and not before:** disable the workflow on whichever repo
stops being the home of record.

    gh workflow disable "Event ingest" --repo <the one that is now a mirror>

An earlier draft of this section said to disable it on the personal repo
immediately and never to add the secrets there. That was written on the
assumption that the club's repo was already running the job. It is not running
anywhere else, and a calendar nobody is refreshing is the failure this workflow
exists to prevent.

# Repeating events are grouped into series — and nothing uses it yet

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

# Hosting on Netlify

`netlify.toml` is committed and ready. The mock stays on GitHub Pages at
www.thesciclub.com; Pages serves `docs/`, Netlify serves the built app from
`dist/`, and nothing in this config touches `docs/`.

**Pages is served by `Able-Bodied/thesciclub`, from `main` at `/docs`** — the
org repo, the one with no write access. `Alfredx48/TheSciClub` has no Pages
site at all. So pushing `personal/main` cannot change what is at
www.thesciclub.com, and the mock can only be updated by somebody with write
access to the club's repo. Worth knowing before editing `docs/index.html` and
expecting the live page to follow.

To deploy: connect the repo in Netlify, and set two environment variables in
its UI — `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, the same values as
`.env.local`. **Never set `SUPABASE_SERVICE_ROLE_KEY` there.** It bypasses RLS,
and anything prefixed `VITE_` is inlined into the browser bundle.

The SPA redirect in the config is not optional: without it `/peers` works when
you navigate to it and 404s when you reload or open a shared link, which is the
confusing half of that bug.

## Before sharing the URL

**The app being public is fine.** A stranger sees the welcome screen and cannot
get further: `browse_members` requires an active member row, and creating one
requires an invite. That is tested, including against the live project.

**Two things to check first, because they involve real people and real money:**

1. Whoever you share with needs a row in `invites` for their real number —
   add it from `/admin`.
2. They will receive a **real SMS through Twilio**. The three test numbers only
   work because they are configured as test OTPs in Supabase. Confirm Twilio is
   actually sending — US A2P 10DLC registration can take days to weeks, and if
   it is incomplete the message silently never arrives and they cannot sign in.

Signing somebody up also puts their phone number and injury details in a real
database. Worth their explicit yes rather than a surprise.
