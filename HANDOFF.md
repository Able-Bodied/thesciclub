# Handoff

Last updated 2026-10-22. What is true now, the rules, the traps; nothing else.
Why: `git log`, migration headers, code comments. `CONTEXT.md` is the product
definition and wins over this file. Older handoffs, by `git show
<sha>:HANDOFF.md`: `b04b003` (releases to 2026-10-11), `4b1673b` (what comments
citing a HANDOFF section mean), `932a809` (product decisions). Comments citing
`EMAIL-SIGN-IN-PLAN.md` or `LAUNCH-CHECK.md`: `git show 0c84cf3:<file>`.

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
  agent's sandbox refuses `git push`: the owner runs it. Since 2026-10-22
  `origin` pushes to Able-Bodied/thesciclub and the owner's private
  Alfredx48/TheSciClub (remote `mine`) at once, fetching from Able-Bodied
  only: pull before pushing, or the two diverge.
- **Database**: hosted project `erijdvqnxavwezsbbojv`; every migration through
  `20261022090000` is live (2026-10-21), blocking included. Edge functions:
  `push-notify` (sends `blocks_weekly`, `grant_open` and `profile_reminder`
  too), `link-preview`, `send-invite`, `sign-in-reminder`,
  `home-screen-handoff` (`verify_jwt` off). Written, not deployed:
  `apple-token`, `apple-revoke` and `apple-notifications` (Open).
- **Sign-in**: email + password, Google, Apple; passkeys built but off
  (`VITE_PASSKEYS`). No phone sign-in; the Phone provider is off.
  - **Invites**: the hook `signup_needs_an_invite` refuses an uninvited
    sign-up before any email (the owner's choice, knowing it reveals whether
    an address is invited). Admin → Invites → "Anybody can join" opens joining
    for events (`club_joining`); a blocked address stays out. Each
    administrator's QR code (Me → Your QR code) is credit only, never entry.
  - **Email**: links in mail open `thesciclub.com/auth/confirm.html`
    (`lib/email-link.ts`, `supabase/templates/`), not supabase.co, which put
    mail in spam. Hosted templates go through the Management API, only after
    the client that has the page. Resend's free plan sends 100 a day;
    Supabase caps 100 an hour. SPF and Apple's registration of the domain and
    senders let Hide My Email deliver.
  - **Joined on a computer, link opened on a phone**: the computer retries the
    typed password every 15 s for 15 minutes (`onboarding/confirm-elsewhere.ts`).
  - **Passwords**: a reset link works once, for an hour; saving one signs out
    other devices and emails the member. No way in at all:
    `scripts/set-member-email.mjs`, then Forgot password.
  - **Apple**: Services ID `com.thesciclub.web`; the secret expires
    **2027-04-09** (`scripts/apple-secret.mjs` makes the next). The store
    app signs in natively as `com.thesciclub.app`. Each Apple sign-in hands
    a refresh token to `apple-token` (native: the authorization code; web:
    the `provider_refresh_token` after the redirect), kept in
    `private.apple_tokens`; deleting the identity, with the account or by
    Unlink, queues it for `apple-revoke` (5.1.1(v); `20261022160000`), which
    only the database may call (vault `apple_revoke_secret`, as
    `push_notify_secret`). Revocations given up after seven tries show on
    Admin → Sign-in; once the cause is fixed, `update
    private.apple_revocations set attempts = 0 where attempts >= 7;`.
    Apple's notices go to `apple-notifications`, shown on Admin → Sign-in
    (`20261022170000`). Before this, web Apple sign-ins kept no token: those
    members are revoked only if they sign in with Apple again first.
  - **Google**: its own widget (`lib/google-identity.ts`); the OAuth client
    allows only `https://thesciclub.com`, so not locally. The iPhone Home
    Screen app signs in through Chrome or Safari on `/app-sign-in`
    (`lib/google-in-browser.ts`, `home-screen-handoff`). The store app uses
    Google Sign-In with its iOS client (`VITE_GOOGLE_IOS_CLIENT_ID`), with a
    nonce, so Supabase's "Skip nonce checks" stays off.
  - **Home Screen app**: a signed-in iPhone tab hands the app a single-use
    code by cookie (`lib/home-screen-handoff.ts`).
- **Store app** (Capacitor 8, `com.thesciclub.app`, iPhone only; Android
  second): the web build bundled, never loaded from the site.
  `pnpm native:sync` builds `dist-native` (`vite build --mode native`: no
  service worker, its own CSP `<meta>` from `native-csp.ts`) and copies it
  into `ios/` and `android/`; `pnpm native:assets` remakes icons and splash
  from `assets/`. iOS uses Swift Package Manager; no Mac here, so
  `.github/workflows/ios-build-check.yml` builds it unsigned for the
  Simulator, in Alfredx48/TheSciClub only (`ios-release.yml` signs and uploads:
  see Release to TestFlight). `isNative()`
  (`lib/standalone.ts`) keeps out of the app everything browser-only:
  worker and reload, web push, install nudge and steps, the Home Screen
  hand-off, passkeys. Apple and Google sign in natively
  (`lib/native-sign-in.ts`, `@capgo/capacitor-social-login` with Facebook's
  SDK left out: `scripts/check-native-build.mjs`), iPhone only. Links made
  for others use `siteOrigin()`; the rest of the shell (splash, status bar,
  back, outside links, links that open the app, iPhone Text Size) is
  `lib/native-shell.ts`. Universal Links: `public/.well-known/
  apple-app-site-association` (`src/universal-links.test.ts` says which
  paths and why). Fake it in a browser with
  `window.CapacitorCustomPlatform = { name: 'ios' }`.
  YouTube cards play in place in the app (native CSP frames
  youtube-nocookie) with an "Open in YouTube" link under the player; never
  tried on a device (`ios-v1.0.1`): look for it playing, or an error in the
  frame and the link working. If it fails, next is a small player page on
  thesciclub.com.
- **Checks**: 3,355 tests in 240 files on 2026-10-22; `pnpm check` (alone),
  `pnpm test` and `pnpm build` gate every push.

## Open

- **Public events and audiences, not live** (2026-10-22, the owner):
  `20261022180000` (who can see an event: public, club, followers, groups;
  `can_see_event` behind the events, series, tags and RSVP policies and both
  RSVP views; `public_event` for `/e/<id>`; anon reads a public event's
  cover) and `20261022190000` (registrations from the public page, the
  organizers' `event_guest_list`, `claim_event_registrations` and a trigger
  as a member is made, a registration admits its address while invite-only,
  cron `event-registrations-expire` at 90 days). Both go live before the
  client. A `db push` also applies `20261022160000` and `20261022170000`,
  which wait on the Apple steps below: settle those first, or push all four
  together once they are done. Not filtered yet: the daily "N new events"
  count for followers includes a groups-only event (a number, never a
  title); a member with an event cover's path can read it. Probe: the PGlite
  script in the session that built it covered 31 cases; worth a
  `supabase/tests/event-audiences.sql`.

- **Legal pages, not pushed**: Terms, Privacy and the new `/delete-account`
  name Alfred Shaheen as operator and `hello@thesciclub.com` as contact
  (2026-10-21). Their database side is live (`20261022100000` to
  `20261022150000`: sign-in records erased on deletion, profile reports,
  inviters only withdraw, a deleted member's reports unnamed). The client
  only once the owner has read the pages **and** that address receives mail (MX at Spaceship, held by
  someone else). Then paste `https://thesciclub.com/delete-account` into
  Play's Data safety form. A lawyer should read them: injury details are
  health information.

- **Native sign-in and Universal Links, not live** (2026-10-22), in order:
  1. Google: an iOS OAuth client (bundle `com.thesciclub.app`, Team
     `3RZ3A2CJ9N`) in the web client's project; `gh variable set
     VITE_GOOGLE_IOS_CLIENT_ID -R Alfredx48/TheSciClub --body '<its ID>'`.
  2. Supabase → Authentication → Providers → Google → Client IDs: the web
     client's ID, then a comma and the iOS one.
  3. Precondition: Supabase's Apple provider Client IDs must include
     `com.thesciclub.app` (it lists `com.thesciclub.web,com.thesciclub.app`,
     seen 2026-10-22). Without it every native Apple tap fails.
  4. Apple Developer: `com.thesciclub.app` grouped with the Services ID's
     primary App ID (Sign In with Apple on both).
  5. Supabase secrets, from the Sign in with Apple .p8: `pnpm exec supabase
     secrets set APPLE_TEAM_ID=3RZ3A2CJ9N APPLE_SIWA_KEY_ID=<key ID>
     APPLE_SIWA_KEY_P8="$(cat AuthKey_<key ID>.p8)"`.
  6. Vault, in the SQL editor (`20261022160000` makes the secret too if
     this has not; `apple-revoke` never holds it, the database checks it):
     ```sql
     do $$
     begin
       if not exists (select 1 from vault.secrets where name = 'apple_revoke_secret') then
         perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'),
           'apple_revoke_secret', 'Sent by apple_revoke_send, checked by apple_revocations_due.');
       end if;
       if not exists (select 1 from vault.secrets where name = 'apple_revoke_url') then
         perform vault.create_secret(
           'https://erijdvqnxavwezsbbojv.supabase.co/functions/v1/apple-revoke', 'apple_revoke_url');
       end if;
     end $$;
     select name from vault.secrets where name like 'apple_revoke_%' order by name;
     ```
     Expect `apple_revoke_secret`, `apple_revoke_url`.
  7. `pnpm exec supabase db push --linked --dry-run` lists exactly
     `20261022160000` and `20261022170000` (the four before them are live);
     then the push.
  8. `pnpm exec supabase functions deploy apple-token`, then
     `apple-revoke --no-verify-jwt` and `apple-notifications
     --no-verify-jwt`. A bare `curl -X POST …/functions/v1/apple-revoke`
     must answer 401 `not the database`.
  9. Apple Developer → the primary App ID → Sign In with Apple →
     Server-to-Server Notification Endpoint:
     `https://erijdvqnxavwezsbbojv.supabase.co/functions/v1/apple-notifications`.
  10. `git push origin scaffold-and-peers-deck`; `git tag -a ios-v1.0.1 -m
      "What to test"` and `git push origin ios-v1.0.1`. `main` only once
      `hello@thesciclub.com` receives mail (Legal pages, above); then
      `curl -sI https://thesciclub.com/.well-known/apple-app-site-association`
      is 200 JSON with no redirect, and links open the app.

  Probes: `apple-revocation.sql`, `apple-notices-and-joining.sql`. On the
  first device and live runs, look for: **Google in the app**: an
  "Invalid access_token" or `at_hash` error means stop passing
  `accessToken` in `signInWithGoogleNatively` and `linkGoogleNatively`.
  **Web Apple**: after `?apple=signin` the URL fragment has
  `provider_refresh_token` and `apple-token` answers 200; if not, web Apple
  sign-ins keep no token. **apple-token's log**: `WARNING the
  no-ID-token fallback` means Apple's refresh answer had no ID token (the
  line names its fields); a web keep without it means Apple sends one, so
  delete the fallback (`onlySub` in `apple-token/handler.ts`) and its test.
- **Store app, still to build**: native push; Android (Google needs a client
  made with the Play signing SHA-1, Apple there is a web flow, and App
  Links need `public/.well-known/assetlinks.json` with the Play signing
  SHA-256); the demo reviewers run live (`scripts/demo-reviewers.mjs
  --live`). Never run on a device: Text Size, the CSP under WebKit,
  Nominatim with the app's User-Agent, native sign-in, Universal Links.
- **Home Screen pairing, to retire** once members have the store app (owner's
  call, not before): `/app-sign-in`, `lib/google-in-browser.ts`,
  `lib/home-screen-handoff.ts`, the `home-screen-handoff` function and
  `pair_home_screen_app`; that closes F6 to F9.

- **Removed before `20261020010000`** (Remove now deletes the sign-in
  account too; probe `removed-member-can-rejoin.sql`): those accounts are
  still there with no member. Whoever is invited again can sign in with their
  old password, or Forgot password, and finish joining; or delete the account
  in Supabase → Users first.

- **Security scan of 2026-10-17**: fixes live; each commit names its probe.
  Left open on purpose: the Home Screen pairing hand-off (F6 to F9), until
  members have the store app (Open, Home Screen pairing).
- **Signing in on Stats**: the `oauth` amr was never seen (no Google
  locally). Check the first real Google and Apple sign-ins say google and
  apple. Probe: `supabase/tests/admin-sign-in-methods.sql`.
- **Text-message sign-in, once Twilio is ready** (the owner, 2026-10-13; not
  before): "Text me a code" first on Sign in and Join, the rest staying;
  joining by phone carries the invite token in `signInWithOtp`'s data.
  **Waiting on Twilio** (Varun, Onboarding and Compliance Support) to confirm
  Verify's pooled sender (then withdraw the refused A2P campaign; its opt-in
  proof is `c550eff^:public/sms-opt-in/`) or the campaign with a public
  opt-in page and SMS terms back in Privacy and Terms (the old section:
  `d4f26ef:src/routes/legal/privacy.tsx`). Build to their answer.
- **Speed work of 2026-10-22, not pushed** (client only; no migration). Once
  it is live, make the small copies for photographs already stored, with
  `pnpm dev` running (it uses the app's own code), dry run first:
  `SUPABASE_URL=https://erijdvqnxavwezsbbojv.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=<sb_secret_…> pnpm reprocess-photos --thumbs
  --dry-run`, then without `--dry-run`. Adds files only; safe to run again.
  Until then faces fall back to the whole photograph, as before.
- **Supabase free plan**: pauses after a quiet week, **no backups**. Move to
  the paid tier and test a restore.
- **Passkeys**: built, off. To turn on: a Netlify preview with
  `VITE_PASSKEYS=1`, add one on Me and sign in with it on an iPhone (Safari
  and installed) and Android Chrome; Supabase → Passkeys relying party
  `thesciclub.com`, name `The SCI Club`; then set it on Netlify and rebuild.
- **Owner's calls, pending**: Google's branding review ("The SCI Club" on
  Google's page); deleting leftover test accounts and the `Test` member; thesciclub.org (Netlify alias, `@` and `www` A records to
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

- **Blocking**: Block in the ••• of a profile, message, post or reply
  (`BlockMemberSheet`, `peers/block-sheet.tsx`), Me → Settings → Blocked
  members, Admin → Reports → Blocks (`#blocks`), where Monday's count leads;
  the New reports switch covers it. `member_blocks` is readable by
  the blocker only; content hides one way through `my_blocked_member_ids()`,
  Peers both ways in the views; `members_blocked()` is never granted.
  Probes: `member-blocks.sql`, `blocks-weekly.sql`.
- **Profile reports**: Report beside Block in a profile's ••• (`report_member`,
  `ReportSheet kind="profile"`), a copy in `chat_reports.profile_snapshot`,
  listed under Admin → Reports as a profile report. The photograph path is
  kept like a chat photograph: no delete or overwrite while named, so each
  upload is a new file name (`savePhoto`). Deleting the account unnames it
  (trigger on `members`) and the folder clearing takes it; `deleteMyAccount`
  clears the folder again after the delete. Probe: `profile-reports.sql`;
  storage steps in `pnpm check-photo-policy`.

- **Joining**: invites are emailed links (`send-invite`) that fill in their
  address (`invite_address_for_token`). A refused sign-up goes straight to the
  closed door, with the inviting organizations' logos and the consultation
  link (`lib/consultation.ts`).
- **Onboarding** picks up where it was left (`progress.ts`,
  `save_onboarding_progress`), never keeping the password, email, ZIP or
  photo; the account's copy goes when the member is made, or after 90 days.
  `onboarding_steps` feeds Stats. Notifications are asked once, by the
  installed app (`AskOnOpening`).
- **Admin → Stats** (`admin_club_stats(period)`): counts, never who, from what
  the club already keeps, in place of Google Analytics (turned down). Two
  things name members, by the owner's choice and said in Privacy: signing in
  (`admin_sign_in_methods`, `sign_ins` from `record_sign_in`, not Supabase's
  audit log, which keeps emails and IPs) and who viewed a post (Chat).
- **Me**: tabs Profile, Settings, Account (`?tab=` replaced, not pushed). The
  email is read only (an administrator uses the script). Phone is optional,
  for event hosts; Going shares email, and phone if given, with the host
  (Admin → Going, `event_host_contacts`).
- **Install**: a nudge on phone browsers (`lib/install.ts`; Not now hides it 3
  days). `lib/standalone.ts` trusts only `navigator.standalone` on iPhones.
  The installed app is **The Sci Club**; page zoom is stopped only there.
  Share target: Android only (`/share-target`, `sw.ts`, `/share`).
- **Display** (Me → Settings, and the "Aa" button on the five main screens):
  appearance, higher contrast, text size, easier-to-read text, underline
  links, bigger tap targets, reduce motion; per device (`lib/accessibility.tsx`).
  Built in place of an overlay widget like accessiBe, on purpose.
- **Privacy at the API**: events, series, tag links and RSVP counts are
  members-only; `chat_authors` keeps its security barrier; organizations stay
  readable for the closed door.
- **Chat**: read receipts from the current roster. Eight reaction emoji, one
  per member per item (`chat_set_reaction`). A view is one per member, from
  opening, seeing on Home (`lib/chat/home-views.ts`), liking or reacting,
  counted from 2026-10-10. For an administrator the count opens who viewed
  (`admin_post_viewers`; Mobile or Desktop from 2026-10-21). Save
  (`chat_saves`, private) lists on Me → Saved. Posts take
  `DescriptionEditor`'s small Markdown; messages are not formatted. A
  member's photo opens their profile (`AvatarLink`, for a pointer only).
- **Link previews**: `link-preview` fetches a card; a refusing page stays a
  plain link. Backfill: `select public.link_preview_backfill();` (it queues);
  one: `link_preview_request('chat_posts', <id>)`.
- **Notifications**: a `notifications` row per member before any push (kept
  30 days). A tap reaches a running or starting app through the worker
  (`NAVIGATE`, `FollowNotification`).
- **Speed** (2026-10-22; live once pushed, see Open): Home, Peers, Chat,
  Events and Me stay mounted once opened (`KeptTabs` in `App.tsx`, React's
  `<Activity>`): hidden, a tab keeps its state and scroll and its effects
  stop; shown again, its reads run
  again behind what is drawn, so hooks keep their data while they re-read
  the same query (`shown` refs). A new member, or none, remounts the shell
  and clears signed URLs and shared reads (`RequireMember`). Photographs
  have a small copy beside them (`<name>.thumb.<ext>`: 400px for members,
  800px for chat), made at upload (`uploadPhoto`, `uploadAttachments`);
  `usePhotoUrl(path, 'thumb')` and `useSmallCopies` draw it, or the
  photograph where there is none. Measured with a scratch Playwright script
  against a throwaway stack behind a 0.3s HTTP/2 proxy (in the commits).
- **Home**: Admin → Rooms has a Home-feed switch per room (`show_in_home`).
  Events on Home are within Events' default 20 miles of home, online ones
  anywhere (`events_within_miles`).
- **Events**: administrators and an organization's designated members add,
  change and delete them (Pacific time). A series' dates are rows made 92
  days ahead, extended nightly (`event-series-extend`). Administrators change
  imported events (`admin_override`; the ingest keeps it; Revert restores).
- **Organizations**: Admin → Organizations; organization accounts edit their
  own at `/organizations/manage`. They, administrators and linked
  representatives invite without limit (`my_invite_permissions()`); mentors
  have ten. "Represents" tags and affiliation badges are never self-picked.
- **Members**: `@username` on profiles, cards and chat lists. The seeded
  directory is gone; the owner holds a copy.

## Rules the owner set

- **Push only at the owner's word**, gated on `pnpm check`'s exit status run
  alone (never piped). `sci-club-logo/` and `logos-from-you/` are the owner's
  untracked folders.
- **Live database and functions only at the owner's word**: `pnpm exec
  supabase db push` lists what it will apply and asks first. Migrations go
  live before the client that needs them, or the client falls back (as the
  view functions do). Deploy with `pnpm exec supabase functions
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
  imgproxy,studio,edge-runtime,logflare,vector,supavisor` (keep storage-api,
  realtime and mailpit; include `edge-runtime` to run functions). New
  migration: `migration up --local`, then `notify pgrst, 'reload schema';`.
  After `db reset`: `pnpm demo-member`. Restart the stack after config.toml
  or a template changes. Mail links say port 5173: change it to 5183.
- **Fresh stack** for probes: copy `supabase/` to scratch, new `project_id`,
  ports and inspector port, `start --workdir <dir>`; `stop --workdir <dir>
  --no-backup` after.
- **Seeded local accounts**, password `local-dev-password` (`supabase/seed.sql`
  lists them): `alfred@` (admin), `maya@` (mentor), `sam@`, `invited@`,
  `stranger@`, `newcomer@` (all `@local.test`), and the phone-only Phoebe,
  `/dev-login?phone=14155550199`. Mail is at http://127.0.0.1:54324.
- **Store-review demo accounts**: `scripts/demo-reviewers.mjs` (usage in its
  header; local by default, `--live` asks for the project ref). Names start
  "Demo ", usernames `demo.`; `--reset` after a review, `--remove` to delete.
  Invites come from the member whose address is given in
  `DEMO_INVITER_EMAIL` at run time, never written in a file.
- **psql**: `docker run --rm -i --network host -e PGPASSWORD=postgres
  postgres:17-alpine psql -h 127.0.0.1 -p 54322 -U postgres -d postgres`.
- **Playwright**: chromium with `LD_LIBRARY_PATH` as in `pnpm shoot`; no
  WebKit. Headless has no Push API and denies notifications: override
  `Notification.permission` in an init script.
- **CSP** (`netlify.toml`): `index.html`'s two inline scripts by hash and the
  Supabase host. `src/csp.test.ts` gives the new hash; a new outside host goes
  there too, and reaches the store app's policy by itself (`native-csp.ts`).
- **Release to TestFlight** (`.github/workflows/ios-release.yml`, fastlane in
  `ios/App/fastlane`; Alfredx48/TheSciClub only, secrets in its `app-store`
  environment): a tag may sit on the working branch (TestFlight is private;
  owner, 2026-10-22); a manual run is from main only. Once, `gh variable set
  VITE_SUPABASE_URL -R Alfredx48/TheSciClub` and the same for
  `VITE_SUPABASE_ANON_KEY` and `VITE_GOOGLE_IOS_CLIENT_ID` (public values).
  `release_build` makes a new App Store profile if the old one lacks Sign in
  with Apple or Associated Domains (`App.entitlements`); before
  `release_upload`, a step fails the run if the .app holds Facebook's SDK. Then `git tag -a
  ios-v1.0.0 -m "What to test"` and `git push origin ios-v1.0.0` (or Actions →
  iOS release → Run workflow on main), approve it in Actions, and the build
  shows in TestFlight 10–20 minutes after the upload. The tag gives the
  version; the build number is TestFlight's latest + 1; the tag message (else
  the commit subject) is What to Test. A failed run: read the step that
  failed. No Apple Distribution identity: re-export the .p12 with 3DES/SHA1.
  Profile error: the App ID `com.thesciclub.app` or the key's role.
  Xcode missing: `XCODE_VERSION` in both iOS workflows.
- **Netlify**: `pnpm exec netlify … --filter thesciclub`. Verify a deploy by
  grepping the live bundle for a string only the new code has.
- **Ingest**: `.github/workflows/event-ingest.yml`, daily 04:10 UTC from
  `main`, rewrites every event's format (a fix goes in `jobs/`, not the
  database). It runs in Alfredx48/TheSciClub only, with its own Supabase
  secret key; it's off in Able-Bodied, which holds no secrets (2026-10-22).
  Dry run: `gh workflow run "Event ingest" --repo Alfredx48/TheSciClub -f
  dry_run=true`.
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
  `MemberAvatar`). Anything new that uploads or deletes one handles its small
  copy too (Speed, above). `photo_alt` belongs to one picture; a new one clears it.
  Delete files through the Storage API, before the rows that make them
  readable.
- **Colours by role, light and dark**: `emphasis` for links, outlines and
  progress; `bg-action` for filled buttons; `bg-plate` for header bands;
  `navy` only on a white chip over a photo. High contrast overrides tokens
  (`theme-contrast.test.ts` measures every pair). `/join` is always light
  (`useForceLight`), matching the screenshots registered with Twilio.
- **Sizing**: text boxes in `em`; controls under 44px get
  `data-target="small"`.
- **Focus and speech**: sheets use `useDialogFocus`; success is said with
  `useAnnounce`; a route change focuses `main`. iOS opens a keyboard, or the
  notification prompt, only inside a tap.
- **Motion** is one-shot CSS in `index.css` (`bell-ring`, `like-pulse`,
  `arrive`, `step-in`; after React Bits, no animation libraries). Fill
  `backwards`, never `both` or `forwards`: a transform left on a card traps
  the fixed sheets it opens. Motion driven by script (`CountUp`, smooth
  scrolling) asks `motionReduced()`, which follows Display → Reduce motion;
  the CSS kill switch cannot stop it.
- **Home's `{ from: 'home', segment }` state** drives the back link and the
  lit tab (`litTab` in `app-nav.tsx`).
- **Where the app lands** is written in five places: `App.tsx`, onboarding,
  dev-login, not-found, admin. `AskOnOpening` sits in front of all of them.
- **Realtime**: a table not in the publication delivers nothing.
- **`pnpm fix`** reformats: re-read a file before a second scripted edit.

## Shared pieces, not to write twice

`member-avatar.tsx`, `SegmentPills`, `composer.tsx`, `ReportControl` /
`report-sheet.tsx`, `BlockMemberSheet`, `FilterSheetShell`, `useDialogFocus`,
`useAnnounce`, `SmallButton` / `ReasonField` (`admin/controls.tsx`), `lib/chat/time.ts`,
`describeError` / `describeThrown`, `organization-badge.tsx`, `ClubMark` /
`ClubWordmark` (the owner's SVGs, never redrawn), `DateFields` /
`lib/date-parts.ts` (every date as typed boxes; only the event form opens the
phone's calendar), `NotificationsStep`, `useHoldScroll`, `LinkPreviewCard`,
`DescriptionEditor` / `EventDescription`, `useSession`, `CountUp`.
