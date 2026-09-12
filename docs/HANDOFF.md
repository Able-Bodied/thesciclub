# Handoff: polish pass

It is the whole context needed; you should not need to re-read the previous
conversation.

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

Branch `scaffold-and-peers-deck`, ~109 commits ahead of `main`, **unpushed** —
the owner has read-only access to `Able-Bodied/thesciclub` and is waiting on
write access. Do not try to push. Do not commit to `main`.

**All three planned flows are built.** Peers (deck, profiles, filters),
onboarding + the profile survey, and Events (list, detail, RSVPs,
organizations) with 124 real events ingested from NorCal SCI's and
AdaptiveRecHub's live calendars. Also: admin tools, the invite system, an 18+
gate, and a details editor.

553 tests pass. `pnpm check` and `pnpm build` are clean. **Keep them that way —
do not commit with either failing.**

## The hosted database is ahead of `main`, and three migrations are live on it

This is the thing most likely to catch somebody out, so it is first.

`pnpm exec supabase db push` has been run against the hosted project
(`erijdvqnxavwezsbbojv`). Everything in `supabase/migrations/` is applied there
and locally — `pnpm exec supabase migration list` shows nothing pending. That
includes three migrations written after the branch was last summarised, all of
which change how invites behave:

- `20260912000000` — deleting a member revokes their invite.
- `20260912010000` — `admin_invites` reports who holds each number.
- `20260912020000` — an invite nobody is on can be revoked.

**The code for all three is unpushed, but the database changes are real and
live.** So the hosted project is running schema that only exists on this
branch. Do not reset or roll the hosted database back to `main`'s state
expecting the app to work.

`supabase db push` is safe and was used deliberately; `supabase config push` is
still the one to never run — see Environment below.

## Read these first

- `docs/CONTEXT.md` — the product definition. SCI-only and invite-only are
  constraints, not features, and it lists what is deliberately deferred.
- `docs/index.html` — the design mock, published at www.thesciclub.com. The
  visual reference.
- Migration headers in `supabase/migrations/` — every schema decision's
  reasoning lives there.

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
- **Watch for tests that pass by not running.** This has happened four times:
  a silent RLS no-op, a subquery that returned nothing, Testing Library
  renders leaking between tests, and an assertion matching the prose that
  promised the thing rather than the thing.
- **Look at what you changed.** `pnpm shoot <route>` writes a PNG; read it.
  Every layout problem in this project was found by eye, never by a test — and
  two were introduced by "fixes" that looked right in isolation. Check a
  component in its row, not cropped to itself.

## Environment

- `.env.local` holds `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  (`sb_publishable_…`) and `SUPABASE_SERVICE_ROLE_KEY` (`sb_secret_…`).
  Project ref `erijdvqnxavwezsbbojv`.
- **Storage rejects the new-format secret key in `Authorization`** — it wants
  it as `apikey`.
- Local Supabase: `pnpm exec supabase start -x realtime,storage-api,imgproxy,mailpit,studio,edge-runtime,logflare,vector,supavisor`.
  After `supabase db reset`, run **`pnpm demo-member`** — a reset drops the auth
  schema, so the test account loses its member row and every sign-in lands back
  in onboarding.
- **Never run `supabase config push`** — `config.toml` holds placeholder local
  Twilio credentials and would overwrite the hosted project's real ones.
- Test numbers (fixed OTPs, no SMS): `11111111111`/`111111`,
  `12222222222`/`222222`, `13333333333`/`333333`. `11111111111` is **Admin**.
- Dev server: `./node_modules/.bin/vite --port 5180 --strictPort`. Screenshots:
  `SHOOT_BASE=http://localhost:5180 pnpm shoot /peers --both`.
- No host `psql`; use
  `docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine psql …`.

---

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

## 2. There is no way for a mentor to use their two invites

`docs/CONTEXT.md` says a mentor can put two numbers on the club's list, and the
database enforces exactly that: the RLS policy, the two-invite allowance, and
`live_invite_count()` all exist and are tested. **There is no UI for it.** The
only invite surface is `/admin`, which ordinary mentors cannot reach.

This is the largest gap between what the product claims and what a member can
do.

Every piece it needs is already in the database, which is worth knowing before
anybody plans a schema change for it. Three policies on `invites` are written
and tested — `mentors can invite up to two people`, `mentors can see invites
they sent`, and `mentors can revoke their own pending invites` — so a mentor
can read, issue and withdraw their own without any new grant. `Me` already
tells a mentor they have two, in the Invites card; it just has nowhere to send
them.

The allowance behaves properly now, too: `live_invite_count` counts pending and
consumed, and deleting a member revokes their invite, so a mentor gets their
slot back when somebody they brought in leaves. That was not true when this
entry was written.

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

Deliberate — see `docs/CONTEXT.md`. They say plainly that they are not built
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

# The event format classifier, and one pending re-ingest

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

**Pending: the hosted rows still hold the old nulls.** The classifier runs at
ingest, so `.github/workflows/event-ingest.yml` has to run before any of this
reaches the app. That writes to the live database and was left for the owner.

Still true as of the latest check: 124 events on the hosted project, 39 of them
with a null format. Unlike the invite migrations, this one has *not* been run —
`supabase db push` moves schema, not feed data.

# Hosting on Netlify

`netlify.toml` is committed and ready. The mock stays on GitHub Pages at
www.thesciclub.com; Pages serves `docs/`, Netlify serves the built app from
`dist/`, and nothing in this config touches `docs/`.

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
