# Handoff

Last updated 2026-10-06. What is true now, the rules, the traps; nothing else.
Why: `git log`, migration headers, code comments, and the old long handoff
(`git show 4b1673b:HANDOFF.md`, which comments citing a HANDOFF section mean).
Product decisions in one page: `git show 932a809:HANDOFF.md`. `CONTEXT.md` is
the product definition and wins over this file.

## State

- **The SCI Club**: private, invite-only PWA for people with spinal cord
  injury. Vite 8, React 19, TypeScript strict, Tailwind 4, Supabase, Vitest,
  pnpm, Node 24. Live at https://thesciclub.com (Netlify builds `main`; www
  redirects). thesciclub.netlify.app still answers and the page forwards to
  thesciclub.com (index.html says why not a server redirect).
- **Git**: work on `scaffold-and-peers-deck`. Release: `git push origin
  scaffold-and-peers-deck && git push origin HEAD:main`.
  `git log --oneline origin/main..HEAD` empty means nothing is unreleased.
- **Database**: hosted project `erijdvqnxavwezsbbojv`, 103 migrations live;
  `20261006010000` (link previews) and `20261006020000` (earlier links)
  wait for db push (`pnpm exec supabase migration list`; a blank Remote is
  pending). The linked dry run lists only those two. Edge function `push-notify` v2
  live; `link-preview` not deployed yet (Open 1). `20261005010000` and
  `20261005020000` (events added by hand) went live 2026-10-06 ahead of their
  client, which is uncommitted in the working tree: nothing calls them yet.
- **Checks**: 1,871 tests on the committed feature, 1,901 with the events
  work in the working tree; no unhandled errors. `pnpm check` and `pnpm
  build` clean. The RSVP screen tests keep the real `rsvpSaved` alongside
  their mocked reads and writes. The link-preview SQL probe passed on a
  fresh local stack, including earlier messages and posts, removed rows,
  saved cards, a second run, and member/anon refusals; dropping the removed
  message check made it fail. The other SQL probes and
  `pnpm check-chat-photo-policy` remain available for their own changes.

## Open

1. **Link previews, switched on in four steps** (built 2026-10-06): the
   owner runs `pnpm exec supabase db push --linked --dry-run`, then
   `pnpm exec supabase db push --linked` for `20261006010000` and
   `20261006020000`; deploy the function (`pnpm exec supabase functions
   deploy link-preview --project-ref erijdvqnxavwezsbbojv`); then, in the
   dashboard's SQL editor, `select vault.create_secret('https://erijdvqnxavwezsbbojv.supabase.co/functions/v1/link-preview',
   'link_preview_url');` (once only); finally run
   `select public.link_preview_backfill();` there. Until the third, nothing
   is sent and links stay plain. The fourth asks about older links in both
   conversations and room posts, which also supplies their cards on Home.
   It returns requests queued, not cards saved: they run after the SQL
   transaction commits. Wait for them to finish before retrying; saved cards
   and taken-back content are skipped. A page that refuses the fetch or has
   no usable title or picture stays a plain link. YouTube plays in place;
   Instagram shows what its page supplies and opens the page on a press.
   Publish the committed client to make the cards visible (the Git release
   commands above). The Privacy Policy does not yet say the club reads a
   linked page, or that pressing play reaches YouTube: the owner's call,
   and the Twilio registration quotes `/privacy`.
2. **Twilio**: the A2P 10DLC campaign was rejected 2026-10-02 (30908,
   privacy policy); do not raise it each session. `/privacy` is fixed and
   live. Resubmit once ablebodied.org (the brand's site on the registration)
   has the owner's three edits live, with thesciclub.com URLs (the
   registration still names thesciclub.netlify.app). The registration quotes
   `SMS_CONSENT` and `SIGN_IN_CONSENT` (`onboarding/steps.tsx`), `/privacy`,
   `/terms` and `public/sms-opt-in/*.png`: change any of them and the
   registration with it (retake the screenshots from committed code). Opt-in
   proof field: 500 characters. Until texts work, members sign in with fixed
   codes (dashboard: Authentication → Sign In / Providers → Phone → Test phone
   numbers; each number 11 digits starting with 1, or it falls through to
   Twilio as "could not be sent"). When texts work, ask, then: clear that
   list, set Twilio's geo permissions to US only, and set a spend cap.
3. **Supabase free plan**: pauses after a quiet week, small limits, **no
   backups**. Move to the paid tier (daily backups) and test a restore before
   real members arrive.
4. **thesciclub.org**, if the owner wants it: a Netlify domain alias, plus `@`
   and `www` A records to `75.2.60.5` on Spaceship.
5. **Never tried on a real iPhone**: an hour of VoiceOver (the "Saved."
   confirmations, Your answers, a described photo); the date boxes with Voice
   Control and birthday autofill; a notification arriving end to end; signed
   photos; the number pad staying up from phone into code (`keyboardHold`).
6. **Small, not asked for**: the "Rather not say" toggles on Your details are
   under 44px with no `data-target`; onboarding's photo step asks for no
   description (Your details does).

## Rules the owner set

- **Push only at the owner's word**, gated on `pnpm check`'s exit status run
  alone (never piped). `sci-club-logo/` and `logos-from-you/` are the owner's
  untracked folders.
- **The owner runs `pnpm exec supabase db push --linked`**; show `--dry-run`
  first. Migrations go live before the client that needs them. Edge function
  deploys (`pnpm exec supabase functions deploy push-notify --project-ref
  erijdvqnxavwezsbbojv`) at the owner's word. **Never `supabase config
  push`** (placeholder Twilio credentials in config.toml).
- **Commit small, one change each, each passing check alone.** Comments say why.
- **The repo is public: no real phone number, and nothing saying who is an
  administrator**, in any file or commit. That lives only in the live
  database, changed there directly.
- **Accessibility over brand.** Text never shrinks to fit.
- **"Member", never "user"**, in anything a member reads (CONTEXT.md
  "Vocabulary").
- **No control for a thing the app does not do**; CONTEXT.md's deferred list
  is not built unasked.
- **Look at what you changed**: `SHOOT_BASE=http://localhost:5183 pnpm shoot
  <route>` (`--text=larger`, `--both`, `--scroll=<px>`) and read the PNG; for
  anything else, a scratch Playwright script signing in as `scripts/shoot.mjs`
  does.
- **Probes** (`supabase/tests/`, each rolled back, header says how to run):
  as a signed-in role, a savepoint per expected refusal, read every log
  against its `expect` lines, count on a fresh stack, sabotage a fix once.
- **Decided, do not reopen**: the join door's phone step never sends the code
  by itself (consent is the two boxes and Continue, as registered with
  Twilio). The sign-in door sends it on the tenth digit, typed or autofilled
  (the owner, 2026-10-06): its "By continuing" line is on screen before the
  number is typed. Staying Driven Wheelchair Fitness is online
  (`STATED_FORMATS` in `jobs/event-ingest/classify.js`) until NorCal SCI says
  otherwise; any other event with no format, ask. Deleting an account keeps
  the person's words as "Deleted member" (CONTEXT.md "Leaving"); the member
  left in a direct conversation with them can delete it. No colour-blind
  mode: nothing relies on colour alone. Netlify's "hosted on Netlify" HTML
  comment stays.

## Environment

- `.env.local` **points at production** (`pnpm dev`, `pnpm shoot` and Vitest
  read it). The service key is `sb_secret_…`, sent to storage as `apikey`.
  Owner's terminal needs `nvm use 24`.
- **Local dev on the local stack**:
  ```
  VITE_SUPABASE_URL=http://127.0.0.1:54321 \
  VITE_SUPABASE_ANON_KEY=$(pnpm exec supabase status -o json | python3 -c 'import json,sys; print(json.load(sys.stdin)["PUBLISHABLE_KEY"])') \
  ./node_modules/.bin/vite --port 5183 --strictPort
  ```
  Stop by port (`ss -ltnp | grep :5183`), never `pkill -f`.
- **Local stack**: `pnpm exec supabase start -x
  imgproxy,mailpit,studio,edge-runtime,logflare,vector,supavisor` (never
  exclude storage-api or realtime). New migration: `migration up --local`,
  then `notify pgrst, 'reload schema';`. After `db reset`: `pnpm
  demo-member`.
- **Fresh stack** for probes: copy `supabase/` to scratch, new `project_id`
  and ports, inspector 8183, `start --workdir <dir>`; `stop --workdir <dir>
  --no-backup` after.
- **Test numbers**, local stack only: `11111111111`/`111111`,
  `12222222222`/`222222`, `13333333333`/`333333`. Never on the live list.
- **psql**: `docker run --rm -i --network host -e PGPASSWORD=postgres
  postgres:17-alpine psql -h 127.0.0.1 -p 54322 -U postgres -d postgres`.
- **Playwright**: chromium with `LD_LIBRARY_PATH` as in `pnpm shoot`; no
  WebKit. Headless reports notification permission `denied` and no Push API:
  to test asking, override `Notification.permission` (and
  `navigator.standalone` for the Home Screen app) in an init script.
- **CSP** (`netlify.toml`): allows `index.html`'s two inline scripts by hash
  and names the Supabase host. `src/csp.test.ts` gives the new hash when a
  script changes; a new outside host (images, fetches) is added there.
- **Netlify**: `pnpm exec netlify … --filter thesciclub`. Verify a deploy by
  grepping the live bundle for a string only the new code has.
- **Ingest**: `.github/workflows/event-ingest.yml`, daily 04:10 UTC from
  `main`, rewrites every event's format each run (a fix goes in `jobs/`, not
  the database). Dry run: `gh workflow run "Event ingest" --repo
  Able-Bodied/thesciclub -f dry_run=true`.
- **Supabase logs** through the Management API: `…/analytics/endpoints/logs`,
  `from logs where source_name = 'auth_logs'` (the old `logs.all` and per-source
  tables are gone).

## Traps

- **No test may reach the network.** A screen gaining a hook means its test
  stubs it (`@/lib/photos`, `@/lib/push/notifications` especially).
- **Tests that pass by not testing**: a query for text the screen never draws;
  a check made before data loads; a whole-module `vi.mock` of the thing under
  test; a probe run as the superuser. Make each new test fail once.
- **A new view is writable by default** and runs as its owner, bypassing
  every policy. Revoke all from `public, anon, authenticated` by name, grant
  select. `create or replace view` drops `security_barrier`: restate it.
  `api-grants.sql` steps 13–14 catch both.
- **Postgres**: definer functions have RLS off and check visibility
  themselves; `events` columns are granted by name (a new column needs its
  grant); `upsert` needs update: use `ignoreDuplicates`; `clock_timestamp()`
  where rows are ordered by time; policies of one kind are ORed; names over
  63 characters are cut silently.
- **Length limits** on a member's row are in the database and as
  `maxLength` (`lib/member-limits.ts`); a test holds the two together.
- **Pre-membership screens** read through `my_invite_status()`,
  `my_claimable_profile()`, `photo_is_my_claimable()`, `my_number_is_invited()`.
- **Photos**: private buckets; every face is a signed URL (`usePhotoUrl`,
  `MemberAvatar`). `photo_alt` belongs to one picture; a new one clears it.
  Files are deleted through the Storage API only, and it deletes only what
  the caller can also read: remove files before the rows that make them
  readable.
- **Colours by role, for light and dark**: `text-emphasis`/`border-emphasis`
  for links, outlines, eyebrows, dots and progress; `bg-action` for filled
  buttons and selected options; `bg-plate` (and `-chip`, `-edge`, `-hover`)
  for header bands; `navy` only for navy words on a white chip over a photo.
  Dark is charcoal with gold, not navy. `/join` and the notifications
  question are always light (`useForceLight`), matching the registered
  screenshots.
- **Sizing**: text boxes in `em`; controls under 44px get
  `data-target="small"`.
- **Focus and speech**: sheets use `useDialogFocus`; success is said with
  `useAnnounce` (one live region above the routes); a route change focuses
  `main`. iOS opens a keyboard, or the notification prompt, only inside a tap.
- **Home's `{ from: 'home', segment }` state** drives the back link and the
  lit tab (`litTab` in `app-nav.tsx`).
- **Where the app lands** is written in five places: `App.tsx`, onboarding,
  dev-login, not-found, admin. `AskOnOpening` sits in front of all of them
  once per phone.
- **Realtime**: a table not in the publication delivers nothing.
- **`pnpm fix`** reformats: re-read a file before a second scripted edit.

## Shared pieces, not to write twice

`member-avatar.tsx`, `SegmentPills`, `composer.tsx`, `ReportControl` /
`report-sheet.tsx`, `FilterSheetShell`, `useDialogFocus`, `useAnnounce`,
`SmallButton` / `ReasonField` (`admin/controls.tsx`), `lib/chat/time.ts`,
`describeError` / `describeThrown`, `organization-badge.tsx`, `ClubMark` /
`ClubWordmark` (the owner's SVGs, never redrawn), `DateFields` /
`lib/date-parts.ts` (every date: typed boxes, never a calendar),
`NotificationsStep` (sign-up and `AskOnOpening`), `useHoldScroll` (keeps a list
where it was put while photographs load; conversation and topic),
`LinkPreviewCard` (a link's card, in a message, a post and on Home).
