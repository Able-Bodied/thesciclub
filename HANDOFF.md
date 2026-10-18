# Handoff

Last updated 2026-10-15. What is true now, the rules, the traps; nothing else.
Why: `git log`, migration headers, code comments. Older handoffs:
`git show b04b003:HANDOFF.md` (every release to 2026-10-11 with its checks),
`git show 4b1673b:HANDOFF.md` (what comments citing a HANDOFF section mean),
`git show 932a809:HANDOFF.md` (product decisions in one page). `CONTEXT.md` is
the product definition and wins over this file. `EMAIL-SIGN-IN-PLAN.md` records
the move to email sign-in; `LAUNCH-CHECK.md` the soft-launch check.

## State

- **The SCI Club**: private, invite-only PWA for people with spinal cord
  injury. Vite 8, React 19, TypeScript strict, Tailwind 4, Supabase, Vitest,
  pnpm, Node 24. Live at https://thesciclub.com (Netlify builds `main`; www
  redirects). thesciclub.netlify.app still answers and the page forwards to
  thesciclub.com (index.html says why not a server redirect).
- **Git**: work on `scaffold-and-peers-deck`. A second contributor
  (anatol-AbleBodied) pushes to it and to `main` too: fetch and merge before
  pushing, never force. Release: `git push origin scaffold-and-peers-deck &&
  git push origin HEAD:main`; `git log --oneline origin/main..HEAD` empty means
  nothing is unreleased. The agent's sandbox refuses `git push`: the owner
  runs it.
- **Database**: hosted project `erijdvqnxavwezsbbojv`; every migration through
  `20261016010000` is live (pushed by the owner, 2026-10-16).
  Edge functions live: `push-notify` (v5), `link-preview`, `send-invite`,
  `sign-in-reminder` and `home-screen-handoff` (the last with `verify_jwt` off).
- **Sign-in**: email + password, Google, Apple; passkeys built but off
  (`VITE_PASSKEYS`). No phone sign-in anywhere; the Phone provider is off.
  An uninvited email sign-up is refused before any email by the Before User
  Created hook `signup_needs_an_invite` (the owner's choice, knowing it reveals
  whether an address is invited). Admin → Invites → "Anybody can join" opens
  joining to anybody for events (`20261014000000`, `club_joining`; the hook and
  `i_am_invited` both read it); a blocked address stays out either way. A
  walk-in goes on the invite list as a used invite marked `joined_while_open`
  ("Joined when invite only was off", `20261014010000`). Administrators have
  a QR code each (Me → Your QR code, `/me/qr`, `20261014020000`): an event
  name or none, and the email shown while joining is closed; credit only,
  never entry. A walk-in from one is invited by that administrator, who is
  notified; Admin → Invites tallies by event. Codes can be turned off. A signed-in iPhone browser tab leaves a
  single-use code in a cookie that iOS copies into the Home Screen app, which
  trades it for its own session (`src/lib/home-screen-handoff.ts`,
  `20261012100000`); confirmed in Safari and Chrome on the owner's iPhone.
  Somebody with no way in: `scripts/set-member-email.mjs`, then Forgot password.
  A reset link works once, for an hour (`mailer_otp_exp` 3600, hosted);
  `/reset-password` shows the form only on that visit's PASSWORD_RECOVERY
  (`lib/recovery-link.ts`), never just because somebody is signed in. Saving
  a password signs out the account's other devices (GoTrue's own), and emails
  "Your SCI Club password was changed" (on since 2026-10-14, set through the
  Management API; template in `supabase/templates/`).
  Apple: the provider's Client ID is the Services ID `com.thesciclub.web` (not
  the App ID); the client secret expires **2027-04-09**, and
  `scripts/apple-secret.mjs` makes the next. Google uses its own widget
  (`lib/google-identity.ts`, its redirect page as the fallback; the CSP allows
  Google's `/gsi/` files only); its OAuth client allows only the origin
  `https://thesciclub.com`, so Google cannot sign in locally. In the iPhone
  Home Screen app Google finds no accounts and its page fails, so there the
  button opens Chrome (else Safari) on `/app-sign-in`; the member confirms and
  the app collects the sign-in when back in front (`lib/google-in-browser.ts`,
  `20261015010000`, `home-screen-handoff` `{ pairing }`). Me's Link Google
  there still uses the widget.
  Email goes through Resend: the free plan sends 100 a day. Supabase's own
  cap (`rate_limit_email_sent`) is 100 an hour since 2026-10-14 (was 30). `thesciclub.com`
  has an SPF record (`v=spf1 include:send.forge.rmta.net ~all`), so Apple's
  private relay accepts the club's mail: `thesciclub.com`,
  `send.thesciclub.com`, `invites@` and `hello@` are registered and pass
  (Apple Developer → Services → Sign in with Apple for Email Communication,
  2026-10-13).
- **Checks**: 2,862 tests in 200 files on 2026-10-18; `pnpm check` (alone),
  `pnpm test` and `pnpm build` gate every push.

## Open

- **Security fixes, on branch `security-fixes`, not live** (2026-10-18, from
  the scan of 2026-10-17): push `20261018000000` to `20261018050000` (dry run
  first) before the client, then deploy `link-preview` and check a link still
  gets its card (it now looks names up with `Deno.resolveDns`). Each commit
  names its probe. The Home Screen pairing hand-off (F6 to F9) is left open on
  purpose until the store app signs in to Google natively.
- **Your own view does not count** (2026-10-16, `20261016020000`): not live
  yet. Push it before the client, which stops adding 1 for an author's own
  first visit to their topic. Probe: `supabase/tests/post-view-counts.sql`.
- **Signing in on Stats** (live 2026-10-16, sign-ins count from then; phone
  left off it, `20261016010000`). The `oauth` amr for Google and Apple was
  never seen (no Google locally). Check the first real Google and Apple
  sign-ins say google and apple, not "Google or Apple". Probe: `supabase/tests/admin-sign-in-methods.sql`.
- **The spinal cord question is not live yet** (2026-10-14): push
  `20261015000000` (dry run first), then release the client.
- **Google in the iPhone Home Screen app is not live yet** (2026-10-14): push
  `20261015010000` and deploy `home-screen-handoff` (keep `verify_jwt` off)
  before releasing the client. Round trip passed locally with email standing
  in for Google; never tried on an iPhone: whether `googlechromes://` and
  `x-safari-https://` open from the Home Screen app, and `OPEN_WAIT_MS` (800). The QR-code
  migrations before it are live. Resend's free 100 emails
  a day are each email sign-up's confirmation, so a busy event can reach it;
  Google and Apple send none. The local stack's auth container started before
  the hook was in config.toml: restart the stack to have it refuse locally.

- **Text-message sign-in, back as a way in, once Twilio is ready** (the
  owner, 2026-10-13; not before). "Text me a code" as the main button on Sign
  in and Join; email, Google and Apple stay; joining by phone through the
  invite link (its token in `signInWithOtp`'s data, so `signup_needs_an_invite`
  can let a `phone` sign-up with a live token through). Through **Twilio
  Verify**, which Twilio says is exempt from A2P 10DLC registration with its
  pooled sender, so the rejected campaign is not needed: set Supabase's Phone
  provider to Twilio Verify. The campaign was refused (2026-10-12) because the
  opt-in is behind sign-up; its old public proof is `public/sms-opt-in/` at
  `c550eff^`. **Waiting on Twilio**: on 2026-10-13 the owner replied to Varun
  (Onboarding and Compliance Support) with the October 1 screenshots, the
  timeline, and two questions: Verify with the pooled US sender (then withdraw
  the campaign), or keep the campaign with a public opt-in page and the SMS
  terms back in Privacy and Terms. Build to whichever Twilio confirms.
- **Supabase free plan**: pauses after a quiet week, small limits, **no
  backups**. Move to the paid tier (daily backups) and test a restore.
- **Passkeys**: turn on only after a real-phone check (EMAIL-SIGN-IN-PLAN.md,
  Session 6).
- **Owner's calls, pending**: Google's branding review (to show "The SCI Club"
  on Google's page); whether the Privacy Policy says the club fetches a linked
  page and that pressing play reaches YouTube; deleting the leftover test
  accounts and the `Test` member in Supabase → Users; thesciclub.org (a
  Netlify domain alias, plus `@` and `www` A records to `75.2.60.5` at
  Spaceship).
- **Never tried for real**: an hour of VoiceOver (the "Saved." confirmations,
  Your answers, a described photo); the date boxes with Voice Control and
  birthday autofill; a notification arriving end to end and its tap from the
  lock screen, cold and warm; signed photos on a phone; pinch zoom in the
  installed app (iOS and Android), and in the photograph viewer (Chromium
  touch only, 2026-10-15); joining with Apple's Hide My Email through
  an invite link; the first nightly import after an administrator changed an
  imported event; repeating events on a Supabase stack (checked in PGlite).
- **Small, not asked for**: the "Rather not say" toggles on Your details are
  under 44px with no `data-target`; onboarding's photo step asks for no
  description (Your details does).
- **Unused in the database, for a later cleanup**: the seeded-profile claim
  (`my_claimable_profile`, `photo_is_my_claimable`), and `before_user_created`
  (the phone gate in `20260911120000`).

## Built, and where to look

All live. Migration headers and the files named say how and why.

- **Joining**: invites are emailed links (`send-invite`); the link fills in
  its address (`invite_address_for_token`, `20261012030000`). A refused
  sign-up goes straight to the closed door, which draws the inviting
  organizations' logos for a signed-out visitor (`anon` may read
  `photos/organizations/`, `20261012050000`) and the consultation link
  (`lib/consultation.ts`). "Ask somebody" is gone (`20261012020000`).
- **Onboarding picks up where it was left** (2026-10-15, `20261015015000`):
  answers so far on the device as typed and on the account at each step
  (`save_onboarding_progress`, `src/routes/onboarding/progress.ts`), so a
  return on any device opens at the same step. Never the password, email, ZIP
  or photo. The account's copy goes when the member is made, or after 90 days
  (cron `onboarding-progress-expire`); `onboarding_steps` keeps only which
  steps were reached, for Stats. The privacy policy says both (October 15).
- **Admin → Stats** (2026-10-15, `20261015020000`, `admin_club_stats(period)`):
  counts only, never who, from what the club already keeps; all time by
  default, or the last or previous 24 hours, 7 or 30 days. "Opened the app"
  comes from `auth.sessions` and has no count for a previous period.
  Onboarding starts and new accounts on top; Onboarding details opens the
  funnel, each step (kept only since that release) and each part of a
  profile. Instead of Google Analytics, which the owner turned down (again
  2026-10-16). Signing in (`20261016000000`, `admin_sign_in_methods(period)`)
  is the one part that names members, the owner's choice (2026-10-16; the
  privacy policy says so): each account's first identity, and `sign_ins`, one
  row a session, reported once by `src/lib/sign-in-record.ts` and decided by
  `record_sign_in` from the token's amr. Not Supabase's audit log: the hosted
  project keeps it out of the database, and the owner chose not to turn it on
  (it would keep emails and IPs).
- **Me**: tabs (`PageTabs`, `?tab=` replaced, not pushed): Profile, Settings,
  Account. The account's email is read only; an administrator changes it with
  the script. An account with no email gets the add-an-email banner. Phone is
  optional, for event hosts; Going shares email, and phone if given, with the
  host; Admin → Going lists them (`event_host_contacts`).
- **Install**: a nudge on phones' browsers only, above the tab bar and under
  the sign-in doors, after 3 s; Not now hides it 3 days. Steps per browser in
  `lib/install.ts` (iOS 26 Safari: ••• → Share → View More, "Open as Web App"
  on; Firefox on iPhone is sent to Safari, firefox-ios#33663); Android uses
  Chrome's own prompt. The same steps on Me → Settings. On iPhones
  `lib/standalone.ts` trusts only `navigator.standalone`. The installed app is
  named **The Sci Club**. `InstalledApp` stops page zoom only in the installed
  app; text boxes have a 16px floor. Share target (`/share-target`, kept by
  `sw.ts` in cache `club-share`, read by `/share`): Android only.
- **Privacy at the API**: events, series, tag links and RSVP counts are
  members-only (`20261012080000`); `chat_authors` keeps its security barrier
  (`20261012090000`). Organizations stay readable for the closed door.
- **Chat**: read receipts ("Read", "Read by X of Y" from the current roster;
  hidden tabs do not advance reads). Topic replies nest to any depth
  (indentation stops at four on phones). Reactions: eight emoji, one per member
  per item (`20261011060000`, `chat_set_reaction`; clearing sets null so
  Realtime sends an UPDATE); pills attached to the bubble, time inside it;
  React and Reply visible, Edit/Remove/Report in the ••• menu; the picker
  quotes 80 characters (`excerpt`); holding a reaction (or right-click, or the
  menu key) shows who reacted, to anybody who can read the item. Like and view
  counts on every post, self-likes allowed (`20261011010000`); views count only
  from 2026-10-10, when `chat_mark_topic_read_through` started being sent.
  QuickAsk on Home and rooms, questions with Answer, breadcrumbs, "Already
  asked", New message (`/chat/new`). Posts take the small Markdown of
  `DescriptionEditor`, drawn through `EventDescription` and `sanitizeHtml`;
  previews and push text use `markdownToPlain` (`plainPost` restated in
  `push-notify`); conversation messages are not formatted.
- **Link previews**: `link-preview` fetches a card for a linked page; a
  refusing page stays a plain link; Amazon's main picture is a fallback
  (`extract.ts`). Catch up older links with `select public.link_preview_backfill();`
  (it queues; wait before retrying), refresh one with
  `link_preview_request('chat_posts', <id>)`.
- **Notifications**: a `notifications` row per member before any push
  (`20261010000000`, `my_notifications()`, kept 30 days by cron
  `notifications-forget`). The worker asks a running app to navigate
  (`NAVIGATE`), keeps a press for a starting app until acknowledged (20 s,
  across a restart), and re-centres a repeated press; `FollowNotification`
  in App.
- **Home**: Admin → Rooms has a Home-feed switch per room (`show_in_home`,
  `20261011030000`). A card's words, background and photo open its topic; a
  room label opens the room; the starter's picture is on cards and topic pages.
- **Events**: administrators, and members designated for an organization, add,
  change and delete events by hand (date opens the phone's calendar; times in
  Pacific). Repeating events (`20261011050000`: a hand-made `event_series`
  holds the rule; dates are ordinary rows made 92 days ahead, then nightly by
  `event-series-extend` at 11:40 UTC; delete this date or this and later). A
  cover picture, shown whole (`20261011070000`, `set_event_photo`, uploaded
  after the event saves). "About it" takes the same small Markdown.
  Administrators change imported events (`20261012060000`: `admin_override`
  and `feed_values`; the ingest's `withAdminOverride` keeps the change; Revert
  restores; no Delete, the import would bring it back; covers too,
  `20261012070000`). Events and Organizations pills; Your RSVP filters keep
  `?segment=` for Me's counters.
- **Organizations**: Admin → Organizations adds, edits, removes and links
  accounts; organization accounts edit their own at `/organizations/manage`.
  Administrators, organization accounts and linked representatives invite
  without limit (`my_invite_permissions()`); mentors have ten. "Represents"
  tags on profiles come from administrator links only. Logos at
  `photos/organizations/<id>/`, 400px on white (`set_organization_logo`). An
  affiliation badge means the organization vouches: never self-picked.
- **Members**: onboarding's injury step asks the kind first, on the same
  screen (`spinal-cord-fields.tsx`, also on Your details; `injury_type`,
  `condition_name`, `20261015000000`); labels everywhere come from
  `injuryLabel` in `types/domain.ts`. Signing up no longer asks about
  notifications; the installed app does, once (AskOnOpening). The profile
  survey's order and wording (`stepFrom` skips empty
  screens; "The specifics" only after certain devices); adaptive sports
  equipment and grants are shown on Peers (`20261011040000`); `@username` on
  profiles, cards and chat lists. The seeded directory is gone (2026-10-10); the owner
  holds an offline copy.

## Rules the owner set

- **Push only at the owner's word**, gated on `pnpm check`'s exit status run
  alone (never piped). `sci-club-logo/` and `logos-from-you/` are the owner's
  untracked folders.
- **Live database and functions only at the owner's word**: show
  `pnpm exec supabase db push --linked --dry-run` first; migrations go live
  before the client that needs them. Deploy with `pnpm exec supabase functions
  deploy <name>` (no `--linked`; add `--no-verify-jwt` where config.toml has
  it). **Never `supabase config push`** (placeholder Twilio credentials in
  config.toml).
- **Commit small, one change each, each passing check alone.** Comments say why.
- **The repo is public: no real phone number, and nothing saying who is an
  administrator**, in any file or commit. That lives only in
  the live database, changed there directly.
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
- **Decided, do not reopen**: there is no phone sign-in or SMS anywhere in
  the app (2026-10-10). Staying Driven Wheelchair Fitness is online
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
  imgproxy,studio,edge-runtime,logflare,vector,supavisor` (never exclude
  storage-api or realtime; **keep mailpit**, email sign-up needs it; drop
  `edge-runtime` from the list to run functions). New migration:
  `migration up --local`, then `notify pgrst, 'reload schema';`. After
  `db reset`: `pnpm demo-member`.
- **Fresh stack** for probes: copy `supabase/` to scratch, new `project_id`,
  ports and inspector port, `start --workdir <dir>`; `stop --workdir <dir>
  --no-backup` after.
- **Seeded local accounts**, password `local-dev-password` (`supabase/seed.sql`
  header lists them): `alfred@` (admin), `maya@` (mentor), `sam@`,
  `invited@`, `stranger@`, `newcomer@` (all `@local.test`), and the phone-only
  Phoebe, `/dev-login?phone=14155550199`. Confirmation mail is at
  http://127.0.0.1:54324.
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
- **Other sessions share the folder**: commit named paths only, never `-a`, or
  their unfinished work goes into your commit.
- **Migration numbers**: fetch before numbering one. Two contributors write
  migrations, and `db push` silently skips a version the live database already
  has, even from another file (it happened twice, 2026-10-10 and 2026-10-11).
- **A new view is writable by default** and runs as its owner, bypassing
  every policy. Revoke all from `public, anon, authenticated` by name, grant
  select. `create or replace view` drops `security_barrier`: restate it.
  `api-grants.sql` steps 13–14 catch both.
- **Postgres**: definer functions have RLS off and check visibility
  themselves; `events` columns are granted by name (a new column needs its
  grant); `upsert` needs update: use `ignoreDuplicates`; `clock_timestamp()`
  where rows are ordered by time; policies of one kind are ORed; names over
  63 characters are cut silently.
- **Testing the sign-up gate**: an address that already has an account never
  reaches the hook (Supabase answers "check your email" and may send nothing):
  use a never-used address.
- **Length limits** on a member's row are in the database and as
  `maxLength` (`lib/member-limits.ts`); a test holds the two together.
- **Pre-membership screens** read through `my_invite_status()`,
  `claim_invite()` and `invite_address_for_token()`.
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
`lib/date-parts.ts` (every date: typed boxes, never a calendar; the one
exception is the event form, which opens the phone's calendar at the owner's
word, 2026-10-06), `NotificationsStep` (sign-up and `AskOnOpening`),
`useHoldScroll` (keeps a list where it was put while photographs load;
conversation and topic), `LinkPreviewCard` (a link's card, in a message, a
post and on Home), `DescriptionEditor` / `EventDescription` (the small Markdown
and its safe drawing), `useSession` (is anybody signed in).
