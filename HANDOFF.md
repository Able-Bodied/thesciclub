# Handoff

Last updated 2026-09-18.

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

**All three planned flows are built, and the app is live** at
https://thesciclub.netlify.app/ — see "Hosting on Netlify". Peers (deck,
profiles, filters), onboarding + the profile survey, and Events (list, detail,
RSVPs, organizations, series collapsing) with 125 real events ingested from
NorCal SCI's and AdaptiveRecHub's live calendars. Also: admin tools, the invite
system, an 18+ gate, a details editor, and a three-strike system behind Good
standing.

790 tests pass. `pnpm check` and `pnpm build` are clean. **Keep them that way —
do not commit with either failing.**

## The hosted database is ahead of `origin`, and everything is applied

This is the thing most likely to catch somebody out, so it is first.

**52 migrations, 0 pending.** Everything in `supabase/migrations/` is applied to
the hosted project (`erijdvqnxavwezsbbojv`) and locally. Check rather than
trust:

    pnpm exec supabase migration list          # hosted
    pnpm exec supabase migration up --local    # bring a local stack up

The four from 2026-09-17, newest first, because they are the ones a fresh
session will not have seen:

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
| `claim-preview.sql` | that somebody mid-onboarding can see the profile they may claim |
| `claim-carries-profile.sql` | that claiming carries the whole profile and their own answers win |
| `restore-directory.sql` | restoring the seeded directory without touching anybody real |
| `admin-vouches-directly.sql` | an administrator inviting in their own name |
| `admin-is-protected.sql` | that no administrator can be paused, removed, blocked or made a peer — and that an ordinary member still can be |
| `strikes.sql` | the strike arithmetic (withdrawn and year-old ones leave the count, the rows stay), the cap at three, and the visibility (another member sees none of them) |
| `organization-follows.sql` | that a member can follow, and that nobody sees anybody else's — step 6 is the one that matters |
| `declined.sql` | that "rather not say" is recorded, and that the name and the birthday cannot be |
| `chat-authors.sql` | that a member can put a name to a post by anybody — hidden, suspended or removed — and that a session without a member row can put a name to nobody |
| `chat-rooms.sql` | that a closed discussion room is invisible to a member and visible to an administrator, that only an administrator can open one, and that a member cannot reach the table around the function |

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
- Local Supabase: `pnpm exec supabase start -x realtime,storage-api,imgproxy,mailpit,studio,edge-runtime,logflare,vector,supavisor`
  is the light set and is enough for almost everything.

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

It does **not** extend to things that are merely *absent*. Home and Chat still
say plainly that they are not built, the official account still says messaging
is not switched on, and an event still says its group chat is coming. A member
who goes looking for a feature and finds nothing at all reads the app as broken
rather than as unfinished, and CONTEXT.md defers both on purpose.

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

# Next up: Chat

**The owner has decided to build it, on 2026-09-18.** Everything below is what a
session starting cold needs. Read `CONTEXT.md` first anyway — the constraints
below come from it and it is shorter than this file.

## The decision that has just been reversed, and what survives it

CONTEXT.md lists "Topic rooms / forum" under **Deliberately deferred**, with a
real reason: *"a room of two dozen members is empty by construction. It arrives
when there are enough members for a room to be worth opening."* The club has
five non-seed members. That reason has not stopped being true — the owner has
decided to build anyway, which is their call, and **CONTEXT.md should be
updated when the work starts** rather than left contradicting the app, the way
it was for the house rules.

What does not change: **the placeholder pattern.** Home is still deferred, and
`src/routes/home/page.tsx` must keep saying so. Do not let Chat drag Home in.

The emptiness problem is a design input, not a blocker. A room with four posts
looks abandoned; the mock hides this by being written. Worth deciding early
whether rooms open one at a time, seeded by an administrator, or all twelve at
once looking bare.

## What the mock actually specifies

`docs/index.html` is the reference — open it, do not work from this summary
alone. `chatPage()` is at roughly line 1577, then `roomPage`, `topicRow`,
`topicPage`, `fpost`. The data is in `ROOMS`, `GROUPS`, `DMS` around line 818.

**Three kinds of thread, one screen.** Segments: All · Direct · Groups · Rooms.

| kind | shape | in the mock |
| --- | --- | --- |
| **Direct** | two members, flat message list | 1 (`DMS`), from Kevin welcoming a new member |
| **Group** | named, several members, flat message list | 2 (`GROUPS`) — "Rugby crew", "South Bay meet-ups" |
| **Room** | open to every member, *threaded* | 12 (`ROOMS`), 27 topics between them |

**Rooms are a forum, not a chat.** Room → list of topics → a topic's posts.
Numbered posts, reply counts, view counts, sort by Activity / Replies / Views.
The mock's own comment says the shape borrows from CareCure, "which organise SCI
life by the problem rather than by the person". Direct and group threads are
flat; rooms are the only threaded thing.

**The twelve rooms**, grouped by a category that colours them — Body, Life, Kit:

    Body   Bowel management · Bladder & catheters · Skin & pressure sores
           Pain management · Aging with SCI
    Life   Newly injured · Sex, dating & fertility · Work & school
           Adaptive sport · Funding & benefits
    Kit    Equipment & assistive tech · Driving & vehicles

**Joining.** `S.joined` holds room ids. A room you have not joined shows a gold
"Join" button in the composer slot and the topic composer says "Join to reply" —
you can read everything and post nothing. Joined rooms carry a gold chip and
offer "+ New topic".

**Full history from the day you join** is stated twice on screen and is a real
decision: "Open to every member, with the whole history from before you joined.
Nothing here is public." Whatever schema gets written should make that the easy
case rather than the exception.

**ROOM_MAP** (near line 1041) maps topic regexes to rooms — "Continue in Bowel
management" appears under a matching profile topic or Home question. It is the
same shape as `src/routes/peers/topics.ts`, which already groups the free-text
topics and would be the place to reuse rather than re-derive.

## What the app already has that this should not reinvent

- **`browse_members`** is the member list, and it excludes anybody with
  `show_in_browse = false`. A chat surface naming members has to decide whether
  a hidden member is messageable. They are still a member; they chose not to be
  *found*. Probably: not listed as a person to start a conversation with, but
  visible inside a thread they posted in.
- **`RequireMember`** and `suspended-screen.tsx` already gate the shell. A
  paused member should almost certainly read and not post — the pattern
  `event_rsvps` uses, where active membership is required to write and not to
  withdraw.
- **`src/components/filter-sheet-shell.tsx`** is the shared sheet. The segment
  pill row on Peers and Events is the same control twice; a third copy is the
  thing to avoid.
- **`member_strikes`** exists and "repeating outside a room what was said in it"
  is one of the four things that ends a membership — it is already in the house
  rules, and rooms are what it is about. Reporting a post is not in the mock and
  is worth asking about before building.

## The decisions worth settling before writing schema

1. **Realtime or polling.** The local stack currently excludes `realtime`, and
   nothing in the app uses it. A forum does not need it; direct messages feel
   broken without it. That choice shapes the table design and the local start
   command both.
2. **What a room's "full history" means for RLS.** Every member reads every
   post in every room is the simplest policy and matches the mock. Direct
   messages are the opposite and need a participants table.
3. **Deletion.** `event_rsvps` and `event_dismissals` cascade on member delete,
   and `/admin`'s Remove panel names what goes. A removed member's *posts* are a
   harder question than their RSVPs — a thread with holes in it is worse than
   one with a removed name — and whatever is decided has to be said on that
   panel, which currently promises everything goes.
4. **Moderation.** There is none anywhere in the app. Strikes are issued by hand
   from `/admin` and that may be enough to start.

## How to work on it

Read **"Conventions that are load-bearing"** above before the first commit. The
ones that will bite on a feature this size:

- **A view's own security check can break a caller who is not its audience.**
- **A SQL probe run as the superuser proves nothing about RLS.** Every new
  policy needs a probe in `supabase/tests/` run as a signed-in role, and every
  expected refusal needs its own savepoint.
- **Watch for tests that pass by not running.** Eight instances are recorded in
  this file. Two of the most recent were a whole-module `vi.mock` hiding a
  missing export, and a storage probe that could not reach storage.
- **Look at what you changed.** `pnpm shoot <route>` — every layout problem in
  this project was found by eye.

---

# Next up after Chat: the owner's call

Chat is queued and has its own section above. The app is live, the database is
fully migrated, and the ingest is running current code.

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

**Chat has been asked for — see "Next up: Chat" above.** Home has not.
**Do not build Home without asking.** It is deliberately deferred in CONTEXT.md
and says so on screen; the mock renders it convincingly, which is the trap
rather than the mandate. Building Chat is not permission to drag Home in with
it.

## What this session changed, in one place

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

## Four traps this session walked into

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
mentor now, a mentor's row prints "N of 2 invites used", and an administrator
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

## 5. Home is a placeholder — and Chat was one until 2026-09-18

Home stays deferred, says plainly that it is not built rather than showing
invented content, and **that is to be kept**. The reasoning is in CONTEXT.md.

Chat was in the same position and the owner has since asked for it. See
"Next up: Chat".

## 6. Messaging does not exist

Several surfaces say so in words rather than offering dead buttons — the
official account profile in particular. **Keep that pattern.** A button that
silently does nothing is worse than a sentence explaining where things stand.

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

**Three, on 2026-09-18**: Ran, Ajay and Wojtek, on real phone numbers, through
the real Twilio path. So the cautions below are no longer hypothetical — Twilio
is demonstrably delivering, and there are now real phone numbers and injury
details in the hosted database belonging to people who are not the owner.

Five non-seed members in total: those three, Admin, and the owner's own account
— which is on the test number `12222222222`, because the original on their real
number was removed while testing the Remove button. That is worth knowing
before reading anything into the roster.

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
