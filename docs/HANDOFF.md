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

Branch `scaffold-and-peers-deck`, ~45 commits ahead of `main`, **unpushed** —
the owner has read-only access to `Able-Bodied/thesciclub` and is waiting on
write access. Do not try to push. Do not commit to `main`.

**All three planned flows are built.** Peers (deck, profiles, filters),
onboarding + the profile survey, and Events (list, detail, RSVPs,
organizations) with 124 real events ingested from NorCal SCI's and
AdaptiveRecHub's live calendars. Also: admin tools, the invite system, an 18+
gate, and a details editor.

497 tests pass. `pnpm check` and `pnpm build` are clean. **Keep them that way —
do not commit with either failing.**

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

## 1. Event cards show raw scraper output

`src/routes/events/event-card.tsx` prints `event.location` verbatim. One real
example: *"Archer Bicycle 431 13th Street Oakland, California, 94607 United
States"* — which truncates mid-word at the fold on a phone.

Measured across the 124 ingested events: **89 have no location at all**, 26 are
over 45 characters, and only 22 have a geocoded `city`. So the fix is not just
trimming — it has to read well when the field is empty, which is the common
case.

## 2. There is no way for a mentor to use their two invites

`docs/CONTEXT.md` says a mentor can put two numbers on the club's list, and the
database enforces exactly that: the RLS policy, the two-invite allowance, and
`live_invite_count()` all exist and are tested. **There is no UI for it.** The
only invite surface is `/admin`, which ordinary mentors cannot reach.

This is the largest gap between what the product claims and what a member can
do.

## 3. The blocked screen hardcodes three organizations

`src/routes/onboarding/blocked.tsx` lists NorCal SCI, SCVMC and Wheel with Me
as literals. The database has `organizations.can_invite` and it is already
correct. Add a fourth inviting organization and the screen that tells somebody
how to get in will not mention it.

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

- Peers filter sheet caps topics at 24 by frequency; there is no search box, so
  a rarer topic cannot be reached.
- The deck crops photos at a fixed `object-[50%_28%]`. It suits all 23 seeded
  photographs — verified, every face is in frame — but an uploaded photo with
  an unusual composition could crop badly. No fix needed yet; know it exists.
- Events is one column at every width. This was considered and left alone
  deliberately: events are chronological, and a grid breaks the reading order
  that the dates depend on. Do not "fix" it without thinking about that.
- `/dev-login` now redirects to `/join` for anybody without a member row, which
  is correct, and makes the route nearly dead weight.

---

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
