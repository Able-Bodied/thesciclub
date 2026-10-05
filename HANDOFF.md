# Handoff

Last updated 2026-10-03. What is true now, the rules, the traps; nothing
else. Why anything is the way it is: `git log`, migration headers, code
comments, and the old long handoff (`git show 4b1673b:HANDOFF.md`, which is
what comments citing a HANDOFF section by name mean). A one-page summary of
every product decision (membership, chat, Home, notifications, brand) is in
`git show 932a809:HANDOFF.md`. `CONTEXT.md` is the product definition and
wins over this file.

## State

- **The SCI Club**: private, invite-only PWA for people with spinal cord
  injury. Vite 8, React 19, TypeScript strict, Tailwind 4, Supabase, Vitest,
  pnpm, Node 24. Live at https://thesciclub.com (Netlify builds `main`;
  www redirects to it; certificate from Let's Encrypt). The old
  https://thesciclub.netlify.app/ still answers, and the page itself sends
  people on to thesciclub.com (index.html says why not a server redirect).
  GitHub Pages is off and the design mock (`docs/`) is gone; CONTEXT.md
  "Working model" says where it went.
- **Git**: work on `scaffold-and-peers-deck`. Release: `git push origin
  scaffold-and-peers-deck && git push origin HEAD:main`; both branches sit
  on the same commit after each one. `git log --oneline origin/main..HEAD`
  empty means nothing is unreleased.
- **Database**: hosted project `erijdvqnxavwezsbbojv`, 100 migrations; check
  with `pnpm exec supabase migration list` (a blank Remote is pending).
  `20261005000000` (deleting a conversation with a deleted member) is
  pending: push it before the client with the Delete button is released.
  Edge function `push-notify` v2 live.
- **CSP**: `netlify.toml` allows `index.html`'s two inline scripts by hash and
  names the Supabase host; `src/csp.test.ts` fails with the new hash when a
  script changes. A new outside host (images, fetches) needs adding there.
- **Checks**: 1,776 tests, `pnpm check` and `pnpm build` clean; 37 SQL probes,
  plus `pnpm check-chat-photo-policy` for chat storage deletes.
  Known noise: the events tests' `@/lib/events` mock lacks `rsvpSaved`, which
  prints 5 unhandled errors while every test passes.

## Open

1. **Twilio** — the A2P 10DLC campaign (2FA) was rejected 2026-10-02, error
   30908 (privacy policy); do not raise it each session. The club's
   `/privacy` is fixed and live: Twilio's own passing sentence, message
   frequency and rates, providers by kind not name. The brand's website on
   the registration is ablebodied.org, whose policy conflicts; the owner sent
   its manager three edits (an SMS section pointing at the club's policy, a
   no-sharing line in its section 4, its two Kelly Brush links). Resubmit once
   those are live, with thesciclub.com addresses for the privacy and terms
   URLs, the message flow and the opt-in proof (the registration still
   names thesciclub.netlify.app, which only forwards). The registration quotes `/join`'s two boxes and the
   sign-in door's line (`SMS_CONSENT`, `SIGN_IN_CONSENT` in
   `onboarding/steps.tsx`), `/privacy`, `/terms` and
   `public/sms-opt-in/*.png` (retake them from committed code if `/join`
   changes, and compare: on 2026-10-03 they matched byte for byte): change
   any of them and the registration with it. Its opt-in
   proof field takes 500 characters. The same two boxes also stand between a
   new number that came through the sign-in door and the questions
   (`AgreeStep`). Until texts arrive, members sign in with fixed codes set in
   the dashboard (Authentication → Sign In / Providers → Phone → Test phone
   numbers). Once they do (ask first, it is a live setting), clear that list.
2. **Domain** — thesciclub.com is live on Netlify and GitHub Pages is off
   (2026-10-03). Left, if the owner wants it: point thesciclub.org at the
   club too (a Netlify domain alias, plus `@` and `www` A records to
   `75.2.60.5` on Spaceship). Members who installed the app from the old
   address are moved to thesciclub.com, where they sign in and add it to
   their Home Screen again once.
3. **Supabase is on the free plan**, which pauses a project after a quiet
   week and has small limits. Plan the paid tier before real members arrive.
4. **Never tried on a real iPhone**: an hour of VoiceOver (including the
   "Saved." confirmations, Your answers, a described photo); the date boxes
   with Voice Control and birthday autofill; notifications end to end from the Home Screen app; signed photos; the number pad staying
   up from phone number into code (`keyboardHold`); the notifications step.
5. **Small, not asked for**: the "Rather not say" toggles on Your details are
   under 44px with no `data-target`; onboarding's photo step asks for no
   description (Your details does).

## Rules the owner set

- **Push only at the owner's word**, gated on `pnpm check`'s exit status run
  alone (never piped). `sci-club-logo/` and `logos-from-you/` are the owner's
  untracked folders.
- **The owner runs `pnpm exec supabase db push --linked`**; a session shows
  `--dry-run` first. Migrations go before the client that needs them. Edge
  function deploys (`pnpm exec supabase functions deploy push-notify
  --project-ref erijdvqnxavwezsbbojv`) at the owner's word. **Never
  `supabase config push`** (placeholder Twilio credentials in config.toml).
- **Commit small, one change each, each passing check alone.** Comments say why.
- **The repo is public: no real phone number, and nothing saying who is an
  administrator**, in any file or commit. Who is one lives only in the live
  database, changed there directly, never by a migration or the seed.
- **Accessibility over brand.** Text never shrinks to fit.
- **No control for a thing the app does not do**; CONTEXT.md's deferred list
  is not built unasked.
- **Look at what you changed**: `SHOOT_BASE=http://localhost:5183 pnpm shoot
  <route>` (`--text=larger`, `--both`, `--scroll=<px>`) and read the PNG. For
  router state or an open sheet, a scratch Playwright script signing in as
  `scripts/shoot.mjs` does.
- **Probes** (`supabase/tests/`, each rolled back, header says how to run):
  as a signed-in role, a savepoint per expected refusal, read every log
  against its `expect:` lines, count on a fresh stack, sabotage a fix once.
- **Decided, do not reopen**: the phone step never sends the code by itself
  (a mistyped number must be seen first). Staying Driven Wheelchair Fitness
  is online by the owner's word (`STATED_FORMATS` in
  `jobs/event-ingest/classify.js`) until NorCal SCI says otherwise; for any
  other event with no format, ask, never guess. Delete my account (Me)
  erases the person and keeps their words as "Deleted member" — CONTEXT.md
  "Leaving"; `delete_my_account()` and `src/routes/me/delete-account*`.
  No colour-blind mode: nothing in the app relies on colour alone. Netlify's
  hidden "hosted on Netlify" HTML comment stays; there is no setting for it.

## Environment

- `.env.local` **points at production** (`pnpm dev`, `pnpm shoot` and
  Vitest read it). The service key is `sb_secret_…`, sent to storage as
  `apikey`. Owner's terminal needs `nvm use 24`.
- **Local dev on the local stack**:
  ```
  VITE_SUPABASE_URL=http://127.0.0.1:54321 \
  VITE_SUPABASE_ANON_KEY=$(pnpm exec supabase status -o json | python3 -c 'import json,sys; print(json.load(sys.stdin)["PUBLISHABLE_KEY"])') \
  ./node_modules/.bin/vite --port 5183 --strictPort
  ```
  Confirm with `curl -s localhost:5183/src/lib/supabase.ts | grep 127.0.0.1`;
  stop by port (`ss -ltnp | grep :5183`), never `pkill -f`.
- **Local stack**: `pnpm exec supabase start -x
  imgproxy,mailpit,studio,edge-runtime,logflare,vector,supavisor` (never
  exclude storage-api or realtime; `stop` before changing exclusions). New
  migration: `migration up --local`, then `notify pgrst, 'reload schema';`.
  After `db reset`: `pnpm demo-member`.
- **Fresh stack** for probes: copy `supabase/` to scratch, new `project_id`,
  ports `5432x` → `5532x`, inspector 8183, `start --workdir <dir>`, `stop
  --workdir <dir> --no-backup` after.
- **Test numbers**, local stack only (`supabase/config.toml`, `seed.sql`):
  `11111111111`/`111111`, `12222222222`/`222222`, `13333333333`/`333333`.
  They do not belong on the live project's test-number list.
- **psql**: `docker run --rm -i --network host -e PGPASSWORD=postgres
  postgres:17-alpine psql -h 127.0.0.1 -p 54322 -U postgres -d postgres`.
  Storage rows are deleted through the API, not SQL.
- **Playwright**: chromium with `LD_LIBRARY_PATH` as in `pnpm shoot`; no
  WebKit; headless has no notification permission or Push API in incognito.
- **Netlify**: `pnpm exec netlify … --filter thesciclub`. Verify a deploy by
  grepping the live bundle for a string only the new code has.
- **Ingest**: `.github/workflows/event-ingest.yml`, daily 04:10 UTC from
  `main`, rewrites every event's format each run (so a fix goes in
  `jobs/`, not the database). Dry run: `gh workflow run "Event ingest"
  --repo Able-Bodied/thesciclub -f dry_run=true`.

## Traps

- **No test may reach the network.** A screen gaining a hook means its test
  stubs it (`@/lib/photos`, `@/lib/push/notifications` especially).
- **Tests that pass by not testing**: a query for text the screen never draws;
  a check made before data loads; a whole-module `vi.mock` of the thing under
  test; a probe run as the superuser. Make each new test fail once.
- **A new view is writable by default** and runs as its owner, so it bypasses
  every policy. Revoke all from `public, anon, authenticated` by name, grant
  select. `create or replace view` drops `security_barrier`: restate it.
  `api-grants.sql` steps 13–14 catch both. A view's function calls are
  checked against the reader.
- **Postgres**: definer functions have RLS off and check visibility
  themselves; `events` columns are granted by name (a new column needs its
  grant); `upsert` needs update: use `ignoreDuplicates`; `clock_timestamp()`
  where rows are ordered by time; two select policies are ORed.
- **Pre-membership screens** read through `my_invite_status()`,
  `my_claimable_profile()`, `photo_is_my_claimable()`, `my_number_is_invited()`.
- **Photos**: private buckets; every face is a signed URL (`usePhotoUrl`,
  `MemberAvatar`). `photo_alt` belongs to one picture; a new one clears it.
- **Colours by role, for light and dark**: `text-emphasis`/`border-emphasis`
  for links, outlines, eyebrows, dots and progress; `bg-action` for filled
  buttons and selected options; `bg-plate` (and `-chip`, `-edge`, `-hover`)
  for header bands; `navy` only for navy words on a white chip over a photo.
  Dark is charcoal with gold, not navy (the owner found navy too blue).
  `/join` is always light (`useForceLight`), so nobody sees dark before they
  have agreed to the terms, and the opt-in matches the registered screenshots.
- **Sizing**: text boxes in `em`; controls under 44px get
  `data-target="small"`.
- **Focus and speech**: sheets use `useDialogFocus`; success is said with
  `useAnnounce` (one live region above the routes); a route change focuses
  `main`. iOS opens a keyboard only for a focus inside a tap.
- **Home's `{ from: 'home', segment }` state** drives the back link and the
  lit tab (`litTab` in `app-nav.tsx`).
- **Where the app lands** is written in five places: `App.tsx`, onboarding,
  dev-login, not-found, admin.
- **Realtime**: a table not in the publication delivers nothing.
- **Notifications** need a built app (`vite preview`) or a phone.
- **`pnpm fix`** reformats: re-read a file before a second scripted edit.

## Shared pieces, not to write twice

`member-avatar.tsx`, `SegmentPills`, `composer.tsx`, `ReportControl` /
`report-sheet.tsx`, `FilterSheetShell`, `useDialogFocus`, `useAnnounce`,
`SmallButton` / `ReasonField` (`admin/controls.tsx`), `lib/chat/time.ts`,
`describeError` / `describeThrown`, `organization-badge.tsx`, `ClubMark` /
`ClubWordmark` (the owner's SVGs, never redrawn), `DateFields` /
`lib/date-parts.ts` (every date asked for: typed boxes, never a calendar).
