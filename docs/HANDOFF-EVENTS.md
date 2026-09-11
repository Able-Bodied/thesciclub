# Handoff: build the Events flow

Paste this into a fresh session. It is the whole context needed; you should not
need to re-read the previous conversation.

---

## What you are working on

`/home/alfred/projects/thesciclub` — **The SCI Club**, a private, invite-only
PWA for people living with spinal cord injury. Vite 8 / React 19 / TypeScript
strict / Tailwind 4 / Supabase / Vitest, pnpm, Node 24.

Branch: `scaffold-and-peers-deck`, ~35 commits ahead of `main`, **unpushed** —
the owner (Alfred, GitHub `Alfredx48`) has read-only access to
`Able-Bodied/thesciclub` and is waiting on write access. Do not try to push.
Do not commit to `main`.

Two of the three planned flows are done: **Peers** (the members deck) and
**onboarding + the profile survey**. **Events is the last one.**

## This is a port, not a design exercise

Events is **already built and working** in the sibling repo
`/home/alfred/projects/ab-peers-prototype` — schema, list, filters, RSVPs,
detail, and a scraper job that ingests real events from NorCal SCI's and
AdaptiveRecHub's live calendars. It runs against a real Supabase database
today.

Your job is to port and adapt it, not to invent it. Read that implementation
before designing anything. Where this brief says "decide deliberately", it
means a decision ab-peers made for a different product that may not hold here —
not an invitation to start from a blank page.

The same is true of the two flows already finished here: Peers and onboarding
were both ported from ab-peers, keeping its logic and taking the mock's design.
Follow that pattern.

**`ab-peers-prototype` is reference only.** Read from it freely; never commit
to it. Its own docs (`README.md`, `AGENTS.md`, `docs/CONTEXT.md`) describe a
different, broader product — a general disability app with a coordinator
dashboard — and are stale even for that. Trust its *code*, not its prose.

## Read these first

- `docs/CONTEXT.md` — the product definition. SCI-only and invite-only are
  constraints, not features. It also lists what is deliberately deferred.
- `docs/index.html` — the design mock, published at www.thesciclub.com. This is
  the visual reference; its `evPage()`, `evCard()` and `evDetail()` functions
  are the Events design to match.
- The migration headers in `supabase/migrations/` — the reasoning for every
  schema decision lives there, not in a separate doc.

## Conventions that are load-bearing

- **Commit as work lands, small, one change each, and each commit must
  typecheck on its own.** The owner asked for this explicitly. Verify with a
  throwaway git worktree if you restructure history.
- `pnpm check` (biome ci + eslint + tsc) and `pnpm exec vitest run` must both
  pass before any commit. `pnpm fix` runs eslint then biome — **in that order,
  deliberately**; they fight otherwise and the formatter has to run last.
- `pnpm fix` reformats aggressively and will silently break a string-match edit
  you made moments earlier. Re-read a file before patching it twice.
- Comments explain *why*, not *what*. Several decisions in this codebase look
  wrong without their reason attached; keep that habit.
- Tests assert behaviour, not markup. Watch for tests that "pass" by not
  running — this has happened three times in this project (a silent RLS no-op,
  an un-exercised subquery, and Testing Library renders leaking between tests).
- Never put real phone numbers in the repo; they are added to the hosted
  database directly. The NorCal SCI member data *is* committed, with permission
  — it is already public on their own site.

## Environment

- `.env.local` has `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  (new-format `sb_publishable_…`) and `SUPABASE_SERVICE_ROLE_KEY`
  (`sb_secret_…`). Project ref `erijdvqnxavwezsbbojv`.
- **The Storage API rejects the new-format secret key in `Authorization`** —
  it wants it as `apikey`. This will bite you.
- Local Supabase runs with
  `supabase start -x realtime,storage-api,imgproxy,mailpit,studio,edge-runtime,logflare,vector,supavisor`
  (fast, and enough for schema + RLS work). `supabase db reset` replays
  everything. No Docker `psql` on the host — use
  `docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine psql …`.
- **Never run `supabase config push`** — `config.toml` holds placeholder local
  Twilio credentials and would overwrite the hosted project's real ones.
- Test phone numbers (test OTPs, no SMS sent): `11111111111`/`111111`,
  `12222222222`/`222222`, `13333333333`/`333333`. All are on the invite list.
- `11111111111` is the **admin** account. Sign in at `/join`.
- Dev server: `./node_modules/.bin/vite --port 5180 --strictPort`.

## What already exists that Events must fit into

- `public.organizations` — 6 rows seeded, `can_invite` flag, **public read**.
  Events attach to these. NorCal SCI is `short_code = 'NCS'`.
- `public.members` — own-row-only RLS. `browse_members` is the only projection
  through which one member sees another, and it requires the **viewer** to be
  an active member.
- `src/routes/events/page.tsx` is currently a placeholder screen.
- The tab bar has five tabs; Events is one of them and already routed.
- `src/lib/geocode.ts` — Nominatim reverse + ZIP forward geocoding, client-side.
  The ingest job has its own server-side copy to port.
- Design tokens in `src/index.css` mirror the mock hex-for-hex
  (`--navy #102A4C`, `--gold #C9A227`, Archivo + Public Sans).

## The job

Port the Events flow from `/home/alfred/projects/ab-peers-prototype`, which is
a working implementation against a real database.

**1. Schema.** Port and consolidate these migrations — do not copy them
one-for-one, they accreted over weeks and several supersede each other:

```
supabase/migrations/20260818060000_create_events_schema.sql
                    20260819110000_event_rsvps.sql
                    20260819160000_events_geocoding.sql      (nearby_events RPC)
                    20260819190000_events_organization_id.sql
                    20260819210000_event_dismissals.sql
                    20260819220000_event_source_tracking.sql
```

Note ab-peers has its own `organizations` table; **this project already has
one** — adapt rather than re-create.

**Decide deliberately, and write the reasoning in the migration header:**
events are *public* (`docs/CONTEXT.md`, "What is public") — they are the club's
only honest public surface. RSVPs and dismissals are per-member and are not.

**2. UI.** `src/routes/events/` — list, filter sheet, detail, RSVP.
ab-peers' version is at `src/routes/events/` there: `page.tsx`,
`event-list-card.tsx`, `filters.ts`, `filter-sheet.tsx`, `going-dialog.tsx`.

Two things the **mock** does better than ab-peers, and the owner has agreed to
take them:
- Interested / Going as a **two-button row on the card**, not behind a dialog.
- The "3 going · 5 interested" line with overlapping avatars of members you
  recognise.

**3. Ingest.** `jobs/event-ingest/` in ab-peers — ~2,700 lines, cheerio +
Nominatim, **no AI calls and no paid API keys** despite what the file names
suggest (`prompts/ai-verify-events.md` is a manual step that is not wired in).
Two working scrapers: NorCal SCI (Squarespace JSON) and AdaptiveRecHub.
`pnpm-workspace.yaml` here already declares `jobs/*`.

- The owner confirmed the scrapers still work; they are run manually today.
- Add a scheduled GitHub Action so events stay fresh — that is the point of
  the feature.
- Change the User-Agent: it currently says
  `ab-peers-prototype-event-ingest/1.0 (hackathon prototype; no production traffic)`,
  which stops being true immediately. Nominatim's policy wants a real one.
- It needs the service_role key, server-side only, in repo secrets.
- Feed and organization rows must exist before the first run.

## Suggested order

1. Schema + RLS, tested locally against the real Postgres before pushing.
2. The list and the card, against seeded events.
3. RSVP.
4. Detail.
5. Ingest + its cron.

## Known unfinished business elsewhere (not your job unless asked)

- Messaging is not built. Several surfaces say so plainly rather than showing
  dead buttons — keep that.
- Home and Chat are honest placeholders.
- The Before User Created auth hook exists but is **deliberately disabled** —
  read `supabase/migrations/20260911120000_before_user_created_hook.sql` before
  touching it. Enabling it turns a public endpoint into a per-number test for
  whether somebody has a spinal cord injury.
- The blocked screen hardcodes three organizations that could come from
  `organizations.can_invite`.
