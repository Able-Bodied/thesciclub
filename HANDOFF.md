# Handoff

Last updated 2026-10-09. What is true now, the rules, the traps; nothing else.
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
- **Database**: hosted project `erijdvqnxavwezsbbojv`, migrations through
  `20261011020000` live (linked `db push` 2026-10-10; the dry run before it
  listed nothing else pending),
  including `20261006010000` (link previews) and `20261006020000` (earlier
  links), deployed at the owner's word 2026-10-06. Edge functions
  `push-notify` v2 and `link-preview` v2 live; the preview switch is set and
  the earlier-links backfill ran (Open 1). `20261005010000` and
  `20261005020000` (events added by hand) went live 2026-10-06 ahead of their
  client; the client is included in this release (Open 8).
- **Checks**: 2,015 tests on the combined release, no unhandled errors;
  `pnpm check` and `pnpm build` clean. Local browser checks covered creating,
  editing and deleting an event, the organization-management screen, and
  the event form in dark mode with larger text.
  The RSVP screen tests keep the real `rsvpSaved` alongside
  their mocked reads and writes. The link-preview SQL probe passed on a
  fresh local stack, including earlier messages and posts, removed rows,
  saved cards, a second run, and member/anon refusals; dropping the removed
  message check made it fail. The other SQL probes and
  `pnpm check-chat-photo-policy` remain available for their own changes.

## Open

0. **Audit fixes, released** (2026-10-09): findings 1–5, 7 and 8 in AUDIT.md
   are corrected in this release. Events and organizations stay behind membership
   at the owner's word; the old public-events requirement is withdrawn. The owner
   applied these migrations before authorizing the client release; all four are
   confirmed live by the linked dry run:

   - `20261008010000_only_delivered_chat_is_read.sql`
   - `20261008020000_conversation_read_receipts_are_live.sql`
   - `20261009010000_topic_replies_can_be_nested.sql`
   - `20261009020000_organizations_accounts_and_unlimited_invites.sql`

   Messages now show outgoing "Read" in a direct conversation and "Read by X of Y"
   in groups, using the current roster, excluding the sender. Roster read markers
   are published under existing participant RLS; updates refresh receipts without
   marking the reader again. Hidden tabs do not advance conversation reads and
   catch up when visible. Counts say "5 likes", with no icon beside the count.
   Topic replies answer the specific selected reply at any depth, and each branch
   can be hidden separately; indentation stops after four levels on phones.
   The trigger still refuses missing, removed and cross-topic parents. Removing
   a parent frees direct children and preserves their descendants.
   The client is included in this release. Chat now reads every page, and marks only through the last delivered
   row; a future change to load history on demand is separate. Read-marker probes
   passed on local and fresh stacks, and failed when their timestamp boundary was
   weakened. Browser checks cover long conversations, an accumulated calendar,
   delayed sends, composition Enter, destination-preserving sign-in, and outage retry.
   All 1,994 tests, `pnpm check` (run alone), and the production build passed.
   Receipt and nested-reply SQL probes passed on local and fresh stacks. Removing
   the publication and reinstating the old one-level trigger made the probes fail;
   disabling receipts, visibility checks, reply selection or nesting failed the
   corresponding regression tests. Mobile browser checks covered live direct/group
   receipts, nested branch hiding, sending to a specific reply, and plain counts
   opening the names list. Local fixtures and the fresh stack were cleaned up.

1. **Link previews are live** (2026-10-06, at the owner's word): both
   migrations applied, function deployed, `link_preview_url` set once, and
   `select public.link_preview_backfill();` queued the three older links.
   The YouTube message and Amazon room post have both pictures and titles;
   the Medicaleshop post stays plain because its page refuses the fetch
   (HTTP 403). Amazon supplies its main product picture rather than an
   Open Graph image, so `extract.ts` reads that named image as a fallback.
   The title-only Amazon card was refreshed through
   `link_preview_request('chat_posts', <id>)`, without changing its words.
   The client is published and its player was checked in the live bundle.
   YouTube plays in place; Instagram shows what its page supplies and opens
   its page on a press. A refusing page stays a plain link.
   To catch up later links still without cards, run the backfill from the
   SQL editor. It returns requests queued, not cards saved: they run after
   the transaction commits. Wait for them to finish before retrying; saved
   cards and taken-back content are skipped. The Privacy Policy does not
   yet say the club reads a linked page, or that pressing play reaches
   YouTube: the owner's call, and the Twilio registration quotes `/privacy`.
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
7. **Installed-app zoom** (2026-10-06): the owner asked to remove the
   custom edge-swipe back handler, and it is gone. `InstalledApp` suppresses
   page zoom only on the Home Screen app, including Safari's gesture events.
   Text boxes have a 16px floor to avoid focus zoom; Me's text sizes still
   apply. The shell accounts for top and side safe areas as well as the tab
   bar's existing bottom inset. Standalone detection is shared with
   notifications in `lib/standalone.ts`. Phone zoom still needs a real
   installed iOS and Android check; headless pinch emulation is inconclusive.
8. **Events added by hand** (2026-10-06): the owner authorized publishing
   this work along with the corrected installed-app behaviour; both are
   included in the published client. Administrators
   add, change and delete hand-added events; members designated on Admin →
   Organizations do so for their organizations alone. Administrators can
   also name a community host. Scraped events are changed on their source
   calendar. The date opens the phone/browser calendar (the owner,
   2026-10-06); times are typed in Pacific, with optional descriptions and links;
   deleting keeps the group conversation. The two migrations are already
   live, confirmed by a linked dry run. All 1,922 tests and check passed.
   The SQL probe matched all 17 sections and 20 expected refusals on both
   the local and a fresh stack; weakening organization permission removed
   the expected refusal in section 5. The fresh stack was stopped afterwards.
9. **Google sign-in** (2026-10-07, released at the owner's word): a member
   links Google on Me; the sign-in door offers Google to everybody (the
   owner's choice) and lets in only a linked account. Nobody joins through
   Google. Both use Google's own widget (`lib/google-identity.ts`: the
   accounts already in the browser, a "Sign in as" prompt on the sign-in
   door), with Google's redirect page as the fallback link under it. The CSP
   allows Google's `/gsi/` files only. The owner set up the OAuth client
   (JavaScript origin `https://thesciclub.com`), the Google provider, manual
   linking, the redirect URL and the Before User Created hook
   (`only_a_phone_makes_an_account`, migration `20261007010000`, live; not
   `before_user_created`, which stays off). Google's branding review (to show
   "The SCI Club" instead of the Supabase address on Google's page) is the
   owner's, pending. `/privacy` covers Google (2026-10-07); the SMS
   statements are unchanged. Still to do: the owner's phone test (link, sign
   in, an unlinked account refused and absent from Users), in Chrome and in
   the installed iPhone app. The probe passed locally in a rolled-back
   transaction, not on a fresh stack.

10. **Organization accounts and management, released** (2026-10-09): Admin →
    Organizations adds, edits and removes directory entries, and links accounts
    that speak for them. Admin → Members can assign the `organization` account
    type. Me shows that role and links to `/organizations/manage`, where an
    organization account edits only its linked entries. Existing representative
    links still grant event management. Only club administrators create/remove
    organizations, change vouching permission, designate roles or manage links.
    Removal hides the directory entry, disables vouching and removes links;
    historical events and invites retain the organization record.
    Administrators, organization accounts and linked representatives have unlimited
    invites through Me and `/invites`; ordinary mentors still have ten. Both the
    screen and RLS ask `my_invite_permissions()`, which refuses inactive accounts.
    Unlinking stops a representative's access immediately; existing invites stay.
    Invite history is paginated, and role reads wait for the current account before
    deciding whether to redirect. The admin roster reports linked mentors without
    a cap too. Migration `20261009020000` is live, confirmed by the linked dry run.
    All 2,015 tests, `pnpm check` run alone, and the build pass. The organization
    probe has 12 true assertions and 16 expected refusals on local and fresh stacks;
    the mentor probe still matches its 17 sections. Weakening organization scope
    removed an expected refusal, and disabling unlimited UI, role assignment,
    scoped lists, saving, complete history or loading guards failed regressions.
    Mobile checks covered directory creation/editing, role assignment, linking,
    the organization badge, scoped directory access and unlimited-invite wording.
    The browser automation host was intermittent during further actions; sending
    past ten and scoped saving are verified by UI tests and signed-in SQL probes.
    Local fixtures were removed and the scratch stack was stopped. The owner applied
    the hosted migrations and authorized this client release on 2026-10-09.

11. **Me and Admin in tabs, released** (2026-10-09): `PageTabs`
    (`components/page-tabs.tsx`) gives both screens real ARIA tabs that stick
    under the header, keep the choice in `?tab=` (replaced, not pushed, so the
    back gesture leaves the screen) and move with the arrow keys. Me: Profile
    (ending with Sign out, at the owner's word), Settings (Display,
    Notifications), Account (Google, Delete).
    Google's return (`/me?google=linked`, unchanged: it is on Supabase's
    allowed list) opens Account. Admin: Members, Reports (count), Invites,
    Organizations, Rooms in one sideways-scrolling row on phones. Member rows
    are closed to a name and a line, with one "Manage" open at a time; "Go to"
    from a report opens that row. Members filter: All, Joined, Directory,
    Paused or struck (joined only). Invites and Organizations go two-column at
    `lg`. Your details groups identity, injury and location with one Save. No
    migration. 2,045 tests, check and build pass; browser checks at 390 and
    1280, dark with larger text, sticky tabs while scrolled, report → member.

12. **Linked organization profile tags, released** (2026-10-09): visible member
    profiles show `Represents <organization>` tags for administrator-linked
    organizations. Each tag opens that organization's page and uses its logo or
    short code. Self-described “Member of” affiliations stay separate and do not
    earn representative tags. `browse_members` appends linked organization
    identities, retaining its active-viewer/profile gate, security barrier and
    read-only grants. Archived organizations are excluded; unlinking removes the
    badge on the next profile read. The private representatives table stays private.
    Migration `20261009030000_profiles_show_represented_organizations.sql` is
    live. All 2,021 tests, check and build
    pass. The signed-in SQL probe has ten true assertions and two expected refusals
    on local and fresh stacks; removing the archive filter fails an assertion.
    Using self-described affiliations as badges fails both profile regressions.
    Browser checks cover the badge on phones and desktop, larger text and the organization link. Local preview fixtures were removed and the fresh stack stopped.

13. **Organization logos, released** (2026-10-09): the organization editor
    (Admin → Organizations and `/organizations/manage`) chooses, changes and
    removes a logo, applied by Save; Edit scrolls the form into view under the
    sticky tabs. Files go to `photos/organizations/<id>/<random>.<ext>`, fitted
    to 400px on white. Migration
    `20261009040000_whoever_edits_an_organization_sets_its_logo.sql` (live)
    adds `can_edit_organization` (save_organization's rule),
    storage insert/delete policies for that folder, and `set_organization_logo`,
    which refuses another folder or an unuploaded file and returns the old path
    for the client to delete. Seeded logos outside an id folder are never
    deleted. Probe `supabase/tests/organization-logos.sql`: 8 true, 10 expected
    refusals on local and fresh stacks; letting any representative edit removed
    one refusal.

14. **Notifications list, notification taps, easier questions — unreleased**
    (2026-10-09). Two migrations, live (the client is not yet released):
    `20261010000000_notifications_are_kept_and_open_what_they_are_about.sql`
    (a `notifications` row per member, written by `push_notify_send` before it
    pushes, so members without a device are included; references only, words
    read live by `my_notifications()`; folded per tag while unread; read with
    the conversation or topic; 30 days, cron `notifications-forget`; push_owed
    restated with a message opening on `?message=` and a report on Admin's
    Reports tab) and `20261010010000_asking_is_easier.sql` (category and room
    `general`, `chat_topics.is_question`, `chat_create_topic(..., question)`,
    `chat_move_topic` for an administrator or the starter, `chat_topic_room`).
    The service worker now asks a running app to change screen itself
    (`NAVIGATE`, answered, `navigate()` only as a fallback) and keeps the last
    press for a starting app (`PENDING`, 20s): `FollowNotification` in App.
    Probes `notifications-list.sql` (18 true, 3 refusals) and
    `asking-is-easier.sql` (10 true, 4 refusals) match on local and fresh
    stacks; ignoring a left conversation and letting anybody move a topic each
    failed one. 2,091 tests, check and build pass; browser checks at 390 and
    1280, dark with larger text. Not tried: a real iPhone press from the lock
    screen, cold and warm (Open 5). The per-kind switches on Me stay phone-only;
    the list shows those kinds. Then, at the owner's word, the least friction:
    `QuickAsk` (a box at the top of Home, except Photos, and of every room,
    replacing the room's bottom "+ New topic") posts the words as title and
    first post in one tap or Enter, question ticked, room General on Home;
    "Add details or a photo" carries the words and tick into the room's New
    topic form, whose first post is now optional. Unposted words stay in
    sessionStorage per place. Topic and room pages lead with a breadcrumb
    (Home › Rooms › room, `ChatBreadcrumb`); Home's room names link to the
    room. A question whose first post only repeats the title draws that post
    as a row of actions (no second card, no Edit) and answers count from 1.
    A question card on Home has Answer (`answer-box.tsx`): the box opens and
    takes focus within the tap (flushSync, for the iPhone keyboard), posts a
    reply and opens the topic on it.

15. **Seeded directory removed, live** (2026-10-10, the owner's word; pushed
    and the photos script run by the owner, verified: 4 members, 0 seeded,
    no seed/ files, snapshot and function gone):
    `20261010020000_the_seeded_directory_is_removed.sql` deletes the 22 seeded
    members (nothing referenced them; checked live), conversations opened with
    one and never written in (2 live), `directory_seed` and
    `admin_restore_directory()`. After it is pushed, `node
    scripts/remove-seed-photos.mjs --delete` removes photos/seed/* (23 files)
    through the Storage API; it refuses while any row still uses one. Admin
    drops Restore directory, and hides the Directory filter, section, count and
    the invite form's claim question when there are no seeded rows. The claim
    mechanism stays in the schema, unused; its three probes now make their own
    seeded "Ajay". The owner holds an offline copy (rows and photos) outside the
    repo. The seed migration in git history is left alone (owner's choice).

16. **Install nudge, sharing in, similar questions, New message — unreleased**
    (2026-10-10, no migration). `InstallNudge` (a card above the tab bar in a
    phone's browser, after 3s; Not now snoozes 14 days; per-browser steps in
    `lib/install.ts`, Android's own Install where `beforeinstallprompt` fires;
    in-app browsers told to open a real one) and `InstallSettings` on Me →
    Settings. Share target (manifest, POST `/share-target`, kept by `sw.ts` in
    cache `club-share`, read once by `/share`; Netlify 302s a share that misses
    the worker): Android only, as no iPhone browser lets a web app receive a
    share; checked against a real service worker. "Already asked" under the
    ask boxes (`lib/chat/similar.ts`, title word matching under the topics'
    read policy). The ask box is on Chat too, and Chat's header has New message
    (`/chat/new`, one tap on a person opens `chat_open_direct`). Events has
    two pills (Events, Organizations); Going, Interested and Been to are "Your
    RSVP" in Filters, still `?segment=` so Me's counters link to them, with a
    "Showing: … · Show all events" line; old sport/online links open
    everything. 2,145 tests, check and build pass.

17. **Asking somebody you know for an invite, unreleased** (2026-10-10).
    `20261011000000`: `members.findable_for_invites` (on by default, the
    owner's choice; a switch in Me's Club tools for anybody who can invite),
    `invite_lookups` (counts only, no numbers), and `find_inviters(numbers)`:
    only for a verified, uninvited non-member, numbers only back, 100 a look,
    5 looks a day. The closed door (`blocked.tsx` → `ask-somebody.tsx`) checks
    a typed number everywhere and the Contact Picker where the browser has it
    (Chrome on Android; no iPhone browser or Home Screen app can read contacts),
    then an `sms:` text from the person's own phone; and the consultation with
    Wojtek (`CONSULTATION_URL`), also on the welcome screen. The door is
    reached only after a texted code, so strangers meet it once Twilio works.
    Probe `find-inviters.sql`: 7 true, 6 refusals on local and fresh stacks;
    ignoring the switch failed one. Browser check on a fresh stack: join with
    an uninvited test number, match, text link, and the daily limit.

18. **Topic views were never recorded, fixed, unreleased** (2026-10-10).
    `useTopicPosts` sent `chat_mark_topic_read_through` as a bare
    `void supabase.rpc(...)`, which a Supabase request never sends; hosted
    `chat_topic_reads` has had no row inserted since stats began (2026-08-25),
    so views and topic unread never worked. Now `.then`ed;
    `pagination.test.ts` asserts the request is sent, not only built, and
    fails on the old line. Views count from release; none can be recovered.
    Likes save correctly (awaited, reverted on failure; checked end to end).
    The owner's two newest posts (bowel, cooking, 2026-10-10) have no like
    row and none was ever inserted after 2026-10-09 21:04 UTC; 2 topics and
    3 posts have ever been deleted, which takes their likes. Supabase's logs
    endpoint failed every query that day, so the cause is not confirmed.

19. **Install name and icons, release authorized** (2026-10-10). The owner wants
    **The Sci Club** on installed apps: both manifest names, Apple and HTML
    application-name metadata, page-title branding and install instructions
    now use that spelling. Icons already match the supplied `sci-club-logo/`
    mark; large PNG favicon links and conventional Apple touch-icon files
    also serve shortcut browsers, and the worker precaches them. Firefox on
    iPhone has an open browser defect that ignores PWA names/icons
    (https://github.com/mozilla-mobile/firefox-ios/issues/33663); its install
    instructions now use Safari. Check, 33 relevant tests and build pass;
    desktop/mobile preview verified manifest names and every icon response
    and size. Real device installs remain to be checked after publishing;
    existing shortcuts may need removing and adding again.

20. **Like and counts on every post** (2026-10-10). The owner
    wants Like, like count and view count on all standing posts, including
    their own, and explicitly allows self-likes. Home topic/photo cards,
    room topic rows, opening posts and nested replies now offer Like and
    keep zero counts visible. Loading and failed reads are labelled rather
    than guessed as zero. Room rows like the same opening post as Home;
    a removed opener is not replaced by somebody else's reply. Each post's
    views count distinct delivered readers using the existing read-through
    markers, without disclosing reader identities; long topics load counts
    in batches below the API row cap. A saved marker refreshes the counts.
    `20261011010000_self_likes_and_post_view_counts.sql` changes only the
    self-like exclusion and adds the two scoped count/opener RPCs. Suspension,
    identity, room visibility and removal checks stay; self-likes do not notify
    their author. The owner confirmed applying the migration; the linked dry
    run on 2026-10-10 confirms the remote database is up to date. The owner
    authorized publishing this client alongside the Chrome install fix.
    Local and fresh SQL probes pass; weakening the read boundary or restoring
    the self-like exclusion fails them. UI checks cover saved self-likes,
    unlikes, opening/nested post counts and Home/room consistency at 1280 and
    390 pixels. All 2,171 tests, standalone check and build pass. Scratch
    fixtures were confined to the fresh stack, which has been stopped.

21. **Chrome install card visibility** (2026-10-10, no migration). The
    page catches Chrome's native prompt but used to hide its own card on
    desktop and at the medium CSS breakpoint. Show the card on all screen
    sizes, with computer wording on desktop, even before a native event.
    When Chrome provides its event, Install uses it; a rejected or missing
    prompt falls back to the browser's steps in both the card and Settings.
    Dismissing a native prompt does not open another dialog. Installed apps
    and the existing two-week Not now snooze still hide the card. Chrome
    desktop, early events, failed native prompts and iPhone Chrome have
    regressions; restoring the desktop gate fails the new tests. The owner
    explicitly requested commit and push to main.

22. **Profile survey: wording, order, equipment and grants** (2026-10-10).
    "How it happened" is "How were you paralyzed?"; "In your own words" is
    "Brief bio", second. Order: About you, Brief bio, How were you
    paralyzed?, Family, Day to day, Education, Work, Interests, Self-care
    devices, The specifics, adaptive sports equipment, grants, Mentoring,
    Topics. "The specifics" is asked only after Dictation software, Vehicle
    modifications or Wheelchair assist devices (or when it already has an
    answer); a screen with nothing to ask is stepped over (`stepFrom`) and
    the counter counts only shown screens. Two new free-text questions, "Do
    you own any adaptive sports equipment?" and "Did you receive any
    grants?", in `20261011020000` (`sports_equipment`, `grants`, 1000
    characters each) — applied and released 2026-10-10;
    `loadAnswers` leaves them out of its fallback read, so the survey still
    loads without them, but saving those two screens fails until they exist.
    Not in `browse_members`: whether other members see them is the owner's
    call. Mentoring opens with why to mentor, then "As a mentor" (first to
    newly injured members, `MENTOR_ALLOWANCE` invites — the old hint still
    said two — and that an administrator makes it official). A lone yes/no
    question now shows its words. Members at 100% drop below it until they
    answer the new screens. All 2,185 tests, standalone check and build pass.
    A Home ask dialog (one box, two taps) was built alongside and set aside
    unreleased on the local branch `backup/2026-10-10-home-ask-and-survey`,
    since Open 14's asking screen came first.

23. **System notification navigation** (2026-10-10, no migration). The
    live `push_owed` already carries `?message=` and `?post=`. A rejected
    `WindowClient.focus()` previously aborted delivery; now delivery uses
    the original client and continues after that rejection. Clicks are kept
    in a separate Cache Storage entry until the app acknowledges them, with
    the existing 20-second expiry, across worker restart. The app collects
    them on startup, focus, visibility and controller change. Channels are
    closed after acknowledgement or timeout. A repeated click creates a new
    router entry and re-centres the same message/post instead of ignoring
    the already-open URL. The fallback title is “New activity”; normal push
    titles already omit the app name. The operating system may add its own
    app attribution. Worker regressions cover focus failure, restart,
    suspended clients, expiry and both exact destinations; reinstating the
    focus abort fails them. Screen regressions check repeated centring.

24. **Room visibility in Home, release authorized** (2026-10-10). Admin → Rooms
    has a Home feed switch for each room, separate from Open/Close.
    `20261011030000_rooms_in_home_feed.sql` adds `show_in_home`, default true
    for existing and new rooms, and `admin_set_room_home`; only an active
    administrator can write it. Null and missing-room saves fail explicitly.
    Excluded rooms remain readable in Chat. Home's topic query joins rooms
    and filters open, included rooms before the forty-topic limit; its pure
    join repeats the gate for topics and photos, and Home room filters omit
    excluded rooms. Saves show errors without changing the recorded switch,
    disable conflicting writes while pending, reload rooms and announce
    success. Local and fresh authenticated SQL probes pass; deleting the
    administrator check fails the probe. Removing Home's eligibility gate
    fails its regression. Browser checks verify persisted hide/show and Home
    inclusion at desktop/mobile widths with no overflow. All 2,202 tests,
    standalone check and build pass. The linked dry run now confirms the
    owner applied the migration; the remote database is up to date.

25. **Home card navigation, release authorized** (2026-10-10, no migration).
    Post text, card background and photographs open the containing topic.
    Questions retain their stretched topic link; decorative reply avatars
    no longer intercept it. Room labels and their icons open the room.
    Like, Reply, member names and external links keep their own actions,
    and navigation preserves Home's back-link state. Photographs inside
    Chat still open the full-picture viewer. Mobile post/room/Like and
    desktop question/room browser checks pass. All 2,204 tests, standalone
    check and production build pass. Open 24's database migration is
    confirmed live before publishing its client with this change.

26. **Profile order, equipment and grants on Peers** (2026-10-10). The
    owner's order for a member's profile: Bio (was "Function & living
    situation"), How it happened, Happy to talk about, Interests, Uses day
    to day, Adaptive sports equipment, Grants, Details. Equipment and grants
    are now shown to other members (the owner's call that Open 22 left
    open): `20261011040000` appends `sports_equipment` and `grants` to
    `browse_members`, restated from `20261009030000` with nothing else
    changed — applied and released 2026-10-10. The app reads the view with
    `select *`, so either may go first. "The specifics" (`detail`),
    collected all along and never shown, is drawn under the Uses day to
    day chips. All 2,207 tests and standalone check pass.

27. **Who asked, with their picture, on Home** (2026-10-10, no migration).
    A topic card's byline (question or not) now has the starter's picture
    beside the name, the size and shape of the first reply's. Decorative and
    out of the pointer's way, so a tap on it still opens the topic.

28. **Who started a topic, on the topic page** (2026-10-10, no migration).
    The header's "started by" line has the starter's picture and their name
    as a link to their profile (plain text for somebody Peers will not
    show). A question with no details hides its opening post, and with it
    the post's own picture and linked name, so the asker had been shown
    only as plain text there.

29. **Repeating events added by hand** (2026-10-10, released). Add an
    event → Repeats, after Google Calendar: Does not repeat (default), Daily,
    Weekly on <weekday>, Monthly on the <nth weekday>, Custom (every 1–30
    days/weeks/months; ends Never, on a date, or after 2–100 dates). Daily,
    Weekly and Monthly never end. `20261011050000`: a hand-made
    `event_series` (feed_id null) holds the rule and a template; every date
    is an ordinary `events` row (own Going list, reminder, page), made up to
    92 days ahead by `save_event_series` (first date through `save_event`,
    so its checks hold) and then nightly by pg_cron `event-series-extend`
    (11:40 UTC). Steps are Pacific wall-clock times, so DST does not move
    them; a missing fifth weekday is skipped. Delete on a series date offers
    "This date only" or "This and all later dates" (`delete_event_and_later`,
    which also stops the series). Changing is one date at a time; later
    dates copy the template. Verified in PGlite against the real `save_event`
    and `event_series` definitions (28 checks: weekly/biweekly/daily/monthly,
    DST, fifth weekday, counts and end dates, nightly no-duplicates, stopping,
    refusals); not yet on a Supabase stack. Followers' daily "new events from
    <organization>" counts dates, so a new weekly series reads as ~13 new
    events and each nightly date as 1 — as scraped series already do.

30. **Emoji reactions, release authorized** (2026-10-10). Messages (direct/group),
    room questions, posts and nested replies/comments, and Home openers have
    React and eight common emoji choices. One reaction per member per item;
    choosing another replaces it, choosing yours removes it. Counts and names
    come from the same rows. Existing Like and view counts remain.
    `20261011060000_chat_emoji_reactions.sql` adds separate post/message
    tables and `chat_set_reaction`, with caller identity derived in SQL.
    RLS hides private conversations, closed rooms and removed content; the
    write function refuses notices, missing/removed/inaccessible targets,
    unsupported emoji and suspended additions. Suspended members can clear
    their own reaction. Direct writes are revoked. Clearing sets emoji null
    so Realtime delivers a scoped UPDATE; counts ignore null rows.
    One paginated read/subscription per screen, serialized writes per item,
    errors without invented counts, retry, and scope changes discard stale
    results. Picker controls are visible and at least 44px; its portal avoids
    Home card stacking contexts and its dialog traps/restores focus.
    All 2,235 tests after merging main, and standalone check/build pass. Authenticated SQL probes
    pass on local and fresh stacks (24 assertions each); removing the active
    gate makes the probe fail, and restoring it passes. Local browser checks
    cover Home/question/nested reply/private message, saved changes/removal,
    live add/remove by another member, names, mobile/desktop picker and no
    overflow or page errors. T3 preview became unavailable; its explicit
    error authorized the headless fallback. Linux test browser lacks some
    emoji glyphs; supported phone/desktop system emoji fonts draw the symbols.
    **Database before release:** reactions originally used version
    20261011050000, which the other contributor also used for repeating events.
    Reactions were renumbered to 20261011060000 and released separately on
    main as 6a3ab78. The owner applied the migration: linked dry run is now
    up to date and production REST confirms both tables and chat_set_reaction
    exist. The reaction client can now be published.

31. **Formatting in an event's "About it"** (2026-10-10, no migration). A
    toolbar (Bold, Italic, Heading, Bulleted list, Numbered list, Link,
    Preview) writes a small Markdown into the box (`lib/markdown.ts`): no
    fonts or sizes, which the text-size setting owns. Still plain text in
    `description`; `EventDescription` converts it and passes it through the
    same `sanitizeHtml` allowlist as a scraped description, so the sanitizer
    is what makes it safe (tests: typed `<script>`, `javascript:` links, a
    quote in an address). Plain text from before reads as it did. Link asks
    for the address beside the toolbar, not in a browser prompt.

32. **A cover picture on an event added by hand** (2026-10-10, released). One picture,
    shown whole (never cropped, as flyers carry words) at the top of the
    event's page and as a small square on its card; optional words for a
    screen reader. `20261011070000`: `events.photo_path`/`photo_alt`, files
    at `events/<event id>/<random>` in the private photos bucket, written by
    whoever may change the event (`may_change_event`, save_event's rule) and
    read by members as every photograph is; `set_event_photo` sets the
    column only to a file in that folder that was uploaded, as the logo's
    does. On a repeating event it sets this date, every later date and the
    template, so nightly dates copy it (`extend_event_series` restated); the
    previous file comes back to delete only when nothing names it. Deleting
    an event leaves its file. The form uploads after saving the event (the
    folder is its id); a failed upload reopens the edit form saying the
    event is saved. PGlite: 45 checks with the repeat ones. The migration
    went live before the client (`EVENT_COLUMNS` names `photo_path`, so a
    client ahead of it cannot read Events): applied 2026-10-10, columns and
    `set_event_photo` confirmed on production, then the client published.

33. **Compact message actions, release authorized** (2026-10-10, no migration).
    The owner requested less clutter beneath messages and posts. Room posts,
    questions/replies and private/group messages now show one 44px ellipsis
    button. It opens a keyboard-accessible sheet containing React and the
    existing Reply/Edit/Remove/Report actions as appropriate. Reaction count
    chips stay visible; Like and view counts remain. Home retains its React
    button and whole-card topic navigation. Mobile bottom sheet and desktop
    centered dialog use the existing focus trap. Tests cover menu visibility,
    reaction selection, reply activation and keyboard focus restoration.
    Browser checks cover mobile message reaction/reply/report, room question
    reaction and desktop reply menu. All 2,238 tests pass; check/build pass.

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
`lib/date-parts.ts` (every date: typed boxes, never a calendar; the one
exception is the event form, which opens the phone's calendar at the owner's
word, 2026-10-06),
`NotificationsStep` (sign-up and `AskOnOpening`), `useHoldScroll` (keeps a list
where it was put while photographs load; conversation and topic),
`LinkPreviewCard` (a link's card, in a message, a post and on Home).
