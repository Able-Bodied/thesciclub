# Handoff

Last updated 2026-10-20. What is true now, the rules, the traps; nothing else.
Why: `git log`, migration headers, code comments. Older handoffs:
`git show b04b003:HANDOFF.md` (releases to 2026-10-11), `git show
4b1673b:HANDOFF.md` (what comments citing a HANDOFF section mean), `git show
932a809:HANDOFF.md` (product decisions). `CONTEXT.md` is the product definition
and wins over this file. Comments citing `EMAIL-SIGN-IN-PLAN.md` (done, removed
2026-10-20): `git show 0c84cf3:EMAIL-SIGN-IN-PLAN.md`; likewise `LAUNCH-CHECK.md`.

## State

- **The SCI Club**: private, invite-only PWA for people with spinal cord
  injury. Vite 8, React 19, TypeScript strict, Tailwind 4, Supabase, Vitest,
  pnpm, Node 24. Live at https://thesciclub.com (Netlify builds `main`; www
  redirects; thesciclub.netlify.app forwards from the page, index.html says
  why).
- **Git**: work on `scaffold-and-peers-deck`. anatol-AbleBodied pushes to it
  and to `main` too: fetch and merge before pushing, never force. Release:
  `git push origin scaffold-and-peers-deck && git push origin HEAD:main`;
  empty `git log --oneline origin/main..HEAD` means nothing is unreleased. The
  agent's sandbox refuses `git push`: the owner runs it.
- **Database**: hosted project `erijdvqnxavwezsbbojv`; every migration through
  `20261020030000` is live (2026-10-20). Edge functions: `push-notify`,
  `link-preview`, `send-invite`, `sign-in-reminder`, `home-screen-handoff`
  (`verify_jwt` off).
- **Sign-in**: email + password, Google, Apple; passkeys built but off
  (`VITE_PASSKEYS`). No phone sign-in; the Phone provider is off.
  - **Invites**: the Before User Created hook `signup_needs_an_invite` refuses
    an uninvited sign-up before any email (the owner's choice, knowing it
    reveals whether an address is invited). Admin → Invites → "Anybody can
    join" opens joining for events (`club_joining`, `20261014000000`); a
    blocked address stays out; a walk-in becomes a used invite marked
    `joined_while_open`. Each administrator has a QR code (Me → Your QR code,
    `20261014020000`): credit only, never entry (a walk-in from it counts as
    that administrator's invite); codes can be turned off; Invites tallies by
    event.
  - **Email**: links in mail (confirm, reset, change address) open
    `thesciclub.com/auth/confirm.html` (`lib/email-link.ts`, templates in
    `supabase/templates/`), not supabase.co, which put mail in spam; the dot
    keeps an old service worker off it. Hosted templates are set through the
    Management API (`mailer_templates_*_content`), only after the client that
    has the page. Resend sends (free plan: 100 a day, each email sign-up's
    confirmation, so a busy event can reach it); Supabase's cap
    (`rate_limit_email_sent`) is 100 an hour. SPF (`v=spf1 include:send.forge.rmta.net ~all`)
    and Apple's registration of `thesciclub.com`, `send.`, `invites@` and
    `hello@` let Hide My Email deliver (confirmed 2026-10-20).
  - **Joined on a computer, link opened on a phone**: "Check your email"
    retries the typed password every 15 s for 15 minutes, so the computer
    goes on by itself (`onboarding/confirm-elsewhere.ts`; sign-ins are 30 per
    5 minutes per IP). The password stays in memory: after a refresh,
    sign-in opens with the address (sessionStorage, that tab only).
  - **Passwords**: a reset link works once, for an hour (`mailer_otp_exp`);
    `/reset-password` shows the form only on that visit's PASSWORD_RECOVERY
    (`lib/recovery-link.ts`). Saving one signs out other devices and emails
    "Your SCI Club password was changed". No way in at all:
    `scripts/set-member-email.mjs`, then Forgot password.
  - **Apple**: Client ID is the Services ID `com.thesciclub.web`; the secret
    expires **2027-04-09** (`scripts/apple-secret.mjs` makes the next).
  - **Google**: its own widget (`lib/google-identity.ts`, the redirect page
    as fallback; CSP allows `/gsi/` only); the OAuth client allows only
    `https://thesciclub.com`, so not locally. In the iPhone Home Screen app the
    button opens Chrome (else Safari) on `/app-sign-in` and the app collects
    the sign-in on return (`lib/google-in-browser.ts`, `home-screen-handoff`
    `{ pairing }`); Me's Link Google still uses the widget.
  - **Home Screen app**: a signed-in iPhone browser tab leaves a single-use
    code in a cookie that iOS copies into the app, which trades it for its own
    session (`lib/home-screen-handoff.ts`); confirmed in Safari and Chrome.
- **Checks**: 2,928 tests in 210 files on 2026-10-20; `pnpm check` (alone),
  `pnpm test` and `pnpm build` gate every push.

## Open

- **Removed before `20261020010000`** (Remove now deletes the sign-in
  account too; probe `removed-member-can-rejoin.sql`): those accounts are
  still there with no member. Whoever is invited again can sign in with their
  old password, or Forgot password, and finish joining; or delete the account
  in Supabase → Users first.

- **Security scan of 2026-10-17**: fixes live; each commit names its probe.
  Left open on purpose: the Home Screen pairing hand-off (F6 to F9), until the
  store app signs in to Google natively.
- **Signing in on Stats**: the `oauth` amr was never seen (no Google
  locally). Check the first real Google and Apple sign-ins say google and
  apple. Probe: `supabase/tests/admin-sign-in-methods.sql`.
- **Text-message sign-in, once Twilio is ready** (the owner, 2026-10-13; not
  before): "Text me a code" as the main button on Sign in and Join, email,
  Google and Apple staying; joining by phone through the invite link (its
  token in `signInWithOtp`'s data, for `signup_needs_an_invite`). Through
  **Twilio Verify** with its pooled US sender, said to be exempt from A2P
  10DLC (the campaign was refused 2026-10-12; its opt-in proof is
  `public/sms-opt-in/` at `c550eff^`). **Waiting on Twilio** (Varun,
  Onboarding and Compliance Support): Verify, then withdraw the campaign, or
  the campaign with a public opt-in page and SMS terms back in Privacy and
  Terms. Build to whichever Twilio confirms.
- **Supabase free plan**: pauses after a quiet week, **no backups**. Move to
  the paid tier and test a restore.
- **Passkeys**: built, off (`VITE_PASSKEYS`). Before turning on: a Netlify
  preview with the switch on, then add one on Me, sign out, "Sign in with a
  passkey" on an iPhone (Safari and the installed app) and Android Chrome.
  Supabase → Authentication → Passkeys: relying party `thesciclub.com`, name
  `The SCI Club`. Then `VITE_PASSKEYS=1` on Netlify and rebuild.
- **Owner's calls, pending**: Google's branding review ("The SCI Club" on
  Google's page); whether Privacy says the club fetches linked pages and that
  play reaches YouTube; deleting leftover test accounts and the `Test`
  member; thesciclub.org (Netlify alias, `@` and `www` A records to
  `75.2.60.5` at Spaceship).
- **Never tried for real**: an hour of VoiceOver; the date boxes with Voice
  Control and autofill; a notification end to end and its tap from the lock
  screen, cold and warm; signed photos on a phone; pinch zoom in the
  installed app and the photo viewer; Hide My Email through an invite link;
  joining on a computer and confirming on a phone; Google from the Home
  Screen app on an iPhone (`googlechromes://`, `x-safari-https://`,
  `OPEN_WAIT_MS` 800); the first nightly import after an administrator
  changed an imported event; repeating events on a Supabase stack.
- **Small, not asked for**: "Rather not say" toggles on Your details are under
  44px with no `data-target`; onboarding's photo step asks for no description.
- **Unused in the database**: `my_claimable_profile`, `photo_is_my_claimable`,
  and `before_user_created` (`20260911120000`).

## Built, and where to look

All live. Migration headers and the files named say how and why.

- **Joining**: invites are emailed links (`send-invite`) that fill in their
  address (`invite_address_for_token`). A refused sign-up goes straight to the
  closed door, with the inviting organizations' logos and the consultation
  link (`lib/consultation.ts`).
- **Onboarding** picks up where it was left (`progress.ts`,
  `save_onboarding_progress`): answers on the device as typed and on the
  account at each step, never the password, email, ZIP or photo; the account's
  copy goes when the member is made, or after 90 days. `onboarding_steps`
  keeps which steps were reached, for Stats. A bar per step; each question
  slides in from the side it was reached from (`chrome.tsx`). The injury step
  asks the kind first (`spinal-cord-fields.tsx`; labels from `injuryLabel`).
  It does not ask about notifications; the installed app does, once
  (`AskOnOpening`).
- **Admin → Stats** (`admin_club_stats(period)`): counts, never who, from what
  the club already keeps; "Opened the app" is from `auth.sessions` and has no
  previous-period count. In place of Google Analytics, which the owner turned
  down. Signing in (`admin_sign_in_methods`) is the one part that names
  members (the owner's choice; Privacy says so): `sign_ins`, one row a session,
  from `lib/sign-in-record.ts` and `record_sign_in`. Not Supabase's audit log
  (it would keep emails and IPs).
- **Me**: tabs Profile, Settings, Account (`?tab=` replaced, not pushed). The
  email is read only (an administrator uses the script). Phone is optional,
  for event hosts; Going shares email, and phone if given, with the host
  (Admin → Going, `event_host_contacts`).
- **Install**: a nudge on phone browsers after 3 s, under the sign-in doors
  and above the tab bar; Not now hides it 3 days. Steps per browser in
  `lib/install.ts`; Android uses Chrome's prompt. `lib/standalone.ts` trusts
  only `navigator.standalone` on iPhones. The app is named **The Sci Club**.
  Page zoom is stopped only in the installed app; text boxes have a 16px
  floor. Share target: Android only (`/share-target`, `sw.ts`, `/share`).
- **Privacy at the API**: events, series, tag links and RSVP counts are
  members-only; `chat_authors` keeps its security barrier; organizations stay
  readable for the closed door.
- **Chat**: read receipts from the current roster (hidden tabs do not
  advance reads). Topic replies nest (indent stops at four on phones). Eight
  reaction emoji, one per member per item (`chat_set_reaction`; clearing sets
  null so Realtime sends an UPDATE); holding a reaction shows who. Likes and
  views on every post, self-likes allowed; a view is one per member, from
  opening, seeing on Home (`lib/chat/home-views.ts`), liking or reacting;
  views count only from 2026-10-10. Save (`chat_saves`, private; probe
  `chat-saves.sql`): a topic's header saves the topic (`post_id` null), a
  post's actions save that post; Me → Saved (`/me/saved`) lists them.
  Posts take `DescriptionEditor`'s small Markdown, drawn through
  `EventDescription` and `sanitizeHtml`; previews and push use
  `markdownToPlain` (restated in `push-notify`); messages are not formatted.
- **Link previews**: `link-preview` fetches a card; a refusing page stays a
  plain link. Backfill: `select public.link_preview_backfill();` (it queues);
  one: `link_preview_request('chat_posts', <id>)`.
- **Notifications**: a `notifications` row per member before any push (kept
  30 days, cron `notifications-forget`). The worker asks a running app to
  navigate (`NAVIGATE`), and keeps a press for a starting app until
  acknowledged (20 s); `FollowNotification` in App.
- **Home**: Admin → Rooms has a Home-feed switch per room (`show_in_home`). A
  card opens its topic; a room label opens the room.
- **Events**: administrators, and members designated for an organization,
  add, change and delete events (times in Pacific). Repeating events: an
  `event_series` holds the rule, dates are rows made 92 days ahead, then
  nightly (`event-series-extend`, 11:40 UTC). Cover pictures shown whole.
  Administrators change imported events (`admin_override`, `feed_values`; the
  ingest keeps the change; Revert restores; no Delete). Your RSVP filters keep
  `?segment=` for Me's counters.
- **Organizations**: Admin → Organizations adds, edits, removes and links
  accounts; organization accounts edit their own at `/organizations/manage`.
  Administrators, organization accounts and linked representatives invite
  without limit (`my_invite_permissions()`); mentors have ten. "Represents"
  tags come from administrator links only. Logos at
  `photos/organizations/<id>/`. An affiliation badge means the organization
  vouches: never self-picked.
- **Members**: the profile survey skips empty screens (`stepFrom`); adaptive
  sports equipment and grants show on Peers; `@username` on profiles, cards
  and chat lists. The seeded directory is gone; the owner holds a copy.

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
- **Commit small, one change each, each passing check alone.** Comments say
  why, briefly. No `Co-Authored-By: Claude` line.
- **The repo is public: no real phone number, and nothing saying who is an
  administrator**, in any file or commit; that lives only in the live
  database.
- **Accessibility over brand.** Text never shrinks to fit.
- **"Member", never "user"**, in anything a member reads.
- **No control for a thing the app does not do**; CONTEXT.md's deferred list
  is not built unasked.
- **Look at what you changed**: `SHOOT_BASE=http://localhost:5183 pnpm shoot
  <route>` (`--text=larger`, `--both`, `--scroll=<px>`) and read the PNG, or a
  scratch Playwright script signing in as `scripts/shoot.mjs` does.
- **Probes** (`supabase/tests/`, each rolled back, header says how to run):
  as a signed-in role, a savepoint per expected refusal, read every log
  against its `expect` lines, count on a fresh stack, sabotage a fix once.
- **Decided, do not reopen**: no phone sign-in or SMS (2026-10-10, until the
  Twilio item above). Staying Driven Wheelchair Fitness is online
  (`STATED_FORMATS` in `jobs/event-ingest/classify.js`) until NorCal SCI says
  otherwise; any other event with no format, ask. A deleted account's words
  stay as "Deleted member"; the member left in a direct conversation with
  them can delete it. No colour-blind mode: nothing relies on colour alone.
  Netlify's "hosted on Netlify" HTML comment stays.

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
  `edge-runtime` to run functions). New migration: `migration up --local`,
  then `notify pgrst, 'reload schema';`. After `db reset`: `pnpm
  demo-member`. Auth reads config.toml and the templates at start: restart
  the stack after either changes (one started before 2026-10-19 links to
  `/auth/confirm`, not `confirm.html`). Mail links name `site_url`, port
  5173: change it to 5183 by hand.
- **Fresh stack** for probes: copy `supabase/` to scratch, new `project_id`,
  ports and inspector port, `start --workdir <dir>`; `stop --workdir <dir>
  --no-backup` after.
- **Seeded local accounts**, password `local-dev-password` (`supabase/seed.sql`
  lists them): `alfred@` (admin), `maya@` (mentor), `sam@`, `invited@`,
  `stranger@`, `newcomer@` (all `@local.test`), and the phone-only Phoebe,
  `/dev-login?phone=14155550199`. Mail is at http://127.0.0.1:54324.
- **psql**: `docker run --rm -i --network host -e PGPASSWORD=postgres
  postgres:17-alpine psql -h 127.0.0.1 -p 54322 -U postgres -d postgres`.
- **Playwright**: chromium with `LD_LIBRARY_PATH` as in `pnpm shoot`; no
  WebKit. Headless reports notification permission `denied` and no Push API:
  override `Notification.permission` (and `navigator.standalone`) in an init
  script.
- **CSP** (`netlify.toml`): `index.html`'s two inline scripts by hash and the
  Supabase host. `src/csp.test.ts` gives the new hash; a new outside host goes
  there too.
- **Netlify**: `pnpm exec netlify … --filter thesciclub`. Verify a deploy by
  grepping the live bundle for a string only the new code has.
- **Ingest**: `.github/workflows/event-ingest.yml`, daily 04:10 UTC from
  `main`, rewrites every event's format (a fix goes in `jobs/`, not the
  database). Dry run: `gh workflow run "Event ingest" --repo
  Able-Bodied/thesciclub -f dry_run=true`.
- **Supabase logs** through the Management API: `…/analytics/endpoints/logs`,
  `from logs where source_name = 'auth_logs'`.

## Traps

- **No test may reach the network.** A screen gaining a hook means its test
  stubs it (`@/lib/photos`, `@/lib/push/notifications` especially).
- **Tests that pass by not testing**: text the screen never draws; a check
  before data loads; mocking the thing under test; a probe run as the
  superuser. Make each new test fail once.
- **Other sessions share the folder**: commit named paths only, never `-a`.
- **Migration numbers**: fetch before numbering one. `db push` silently skips
  a version the live database already has, even from another file.
- **Nothing is granted by itself** (Supabase, from 2026-10-30; locally now,
  `auto_expose_new_tables = false`): a migration that makes a table, view or
  function grants what anon, authenticated and service_role need, by name,
  or the API answers 42501. `20261020000000` wrote down every older grant.
  Never Supabase's suggested blanket grant. If a newer CLI rejects the
  config key, delete it: the behaviour is then the default.
- **A new view is writable by default** and runs as its owner, bypassing
  every policy. Revoke all from `public, anon, authenticated` by name, grant
  select. `create or replace view` drops `security_barrier`: restate it.
  `api-grants.sql` steps 13–14 catch both.
- **Postgres**: definer functions have RLS off and check visibility
  themselves; `events` columns are granted by name; `upsert` needs update:
  use `ignoreDuplicates`; `clock_timestamp()` where rows are ordered by time;
  policies of one kind are ORed; names over 63 characters are cut silently.
- **Testing the sign-up gate**: an address with an account never reaches the
  hook (Supabase answers "check your email" and may send nothing): use a
  never-used address.
- **Length limits** are in the database and as `maxLength`
  (`lib/member-limits.ts`); a test holds the two together.
- **Pre-membership screens** read through `my_invite_status()`,
  `claim_invite()` and `invite_address_for_token()`.
- **Photos**: private buckets; every face is a signed URL (`usePhotoUrl`,
  `MemberAvatar`). `photo_alt` belongs to one picture; a new one clears it.
  Delete files through the Storage API, before the rows that make them
  readable.
- **Colours by role, light and dark**: `text-emphasis`/`border-emphasis` for
  links, outlines, eyebrows, dots and progress; `bg-action` for filled buttons
  and selected options; `bg-plate` (`-chip`, `-edge`, `-hover`) for header
  bands; `navy` only for navy words on a white chip over a photo. Dark is
  charcoal with gold. `/join` and the notifications question are always light
  (`useForceLight`), matching the screenshots registered with Twilio.
- **Sizing**: text boxes in `em`; controls under 44px get
  `data-target="small"`.
- **Focus and speech**: sheets use `useDialogFocus`; success is said with
  `useAnnounce`; a route change focuses `main`. iOS opens a keyboard, or the
  notification prompt, only inside a tap.
- **Motion** is one-shot CSS in `index.css` (`bell-ring`, `like-pulse`,
  `arrive`, `step-in`; after React Bits, no animation libraries). Fill
  `backwards`, never `both` or `forwards`: a transform left on a card traps
  the fixed sheets it opens. Motion driven by script (`CountUp`) checks
  reduced motion itself; the CSS kill switch cannot stop it.
- **Home's `{ from: 'home', segment }` state** drives the back link and the
  lit tab (`litTab` in `app-nav.tsx`).
- **Where the app lands** is written in five places: `App.tsx`, onboarding,
  dev-login, not-found, admin. `AskOnOpening` sits in front of all of them.
- **Realtime**: a table not in the publication delivers nothing.
- **`pnpm fix`** reformats: re-read a file before a second scripted edit.

## Shared pieces, not to write twice

`member-avatar.tsx`, `SegmentPills`, `composer.tsx`, `ReportControl` /
`report-sheet.tsx`, `FilterSheetShell`, `useDialogFocus`, `useAnnounce`,
`SmallButton` / `ReasonField` (`admin/controls.tsx`), `lib/chat/time.ts`,
`describeError` / `describeThrown`, `organization-badge.tsx`, `ClubMark` /
`ClubWordmark` (the owner's SVGs, never redrawn), `DateFields` /
`lib/date-parts.ts` (every date as typed boxes; only the event form opens the
phone's calendar), `NotificationsStep`, `useHoldScroll`, `LinkPreviewCard`,
`DescriptionEditor` / `EventDescription`, `useSession`, `CountUp`.
