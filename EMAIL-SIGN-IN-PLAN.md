# Email sign-in plan

Written 2026-10-10, for the soft launch on 2026-10-11. No code has been written
for this yet. Each workstream below is sized for one session; read
**Decisions** and **Contract** before starting any of them.

Twilio's registration was never approved, so phone sign-in is being replaced.
Everything the phone number does today moves to the email address.

## Progress

One session at a time, in this order, all on `scaffold-and-peers-deck`, nothing
pushed until session 6. Each session ticks its own lines here **as it finishes
each one**, with the commit hash, and commits this file with the work. That
way, a session that runs out of usage partway leaves the next one an exact
place to resume. Notes for the next session go under the session's line, not in
HANDOFF.md.

- [x] **Session 1: A, Database**
  - [x] migration written (`8c10561`)
  - [x] seed.sql and local config.toml (`4d8313d`)
  - [x] SQL probes pass to the probe standard (`2917bd3`)
    - Fresh stack, run as signed-in roles, rolled back, each log read against its `expect` lines: `email-is-the-account.sql`
      (21 refusals), `email-invites-and-admin.sql` (10), and every older probe re-run and diffed against a pre-change baseline.
    - Broken on purpose, each failing the probe that guards it: confirmed-email check removed, claimed-token guard removed,
      `admin_revoke_invite` back to the phone check, `delete_my_account` trusting the typed phone, `admin_block_number`
      finding members by the typed phone. Real GoTrue also checked: sign-up returns no session, unconfirmed sign-in is
      refused, a confirmed `newcomer@` is invited and joins (201), `stranger@` is refused.
  - [x] `pnpm check` exit 0, committed (work: `8c10561`, `4d8313d`, `2917bd3`; this plan edit is the commit after)
  - Notes for the next session (contract changes are made in place above; "as built"):
    - Ticks trail by one commit: a hash cannot sit in the commit it names, so each tick lands in the commit after the work it cites.
    - **Seeded local accounts** (password `local-dev-password`): `alfred@local.test` (admin), `maya@local.test` (mentor, has a phone),
      `sam@local.test`; `invited@local.test` (account, invited, no member row), `stranger@local.test` (account, not invited),
      `newcomer@local.test` (invited by Maya, no account: sign up, confirm in the local inbox).
    - **Start the local stack with mailpit** now (`-x imgproxy,studio,edge-runtime,logflare,vector,supavisor`, not HANDOFF's
      `-x ...mailpit...`): confirmations are on, so a sign-up can only be finished from http://127.0.0.1:54324.
    - `scripts/shoot.mjs` and `scripts/demo-member.mjs` still sign in with the removed test OTP numbers and are broken until
      they use the seeded passwords (Session 3, with dev-login). HANDOFF's Environment "Test numbers" lines go in Session 5.
    - **`send-invite` must use the service role** after checking the caller: a client cannot write `token_hash`/`sent_at`, and an
      administrator has no select policy on `invites` (read `admin_invites`, or check `is_admin()`, then use the service client).
    - `mentor-invites.ts` must move to `create_my_invite` (a direct insert is now `permission denied for table invites`) and select
      `email`, not only `phone`. Admin reads blocks from `admin_blocked_emails`, members from `admin_members` (now with `email`, `username`).
    - Retired probes: `claim-carries-profile.sql` (the seed-claim branch is gone) and `only-a-phone-makes-an-account.sql`
      (function dropped). `claim-preview.sql` still passes; `my_claimable_profile` is untouched and unused.
    - Found wrong in the plan, fixed above: Release order step 2 (Admin invites and mentor invites break at the push, not only
      the join flow); `my_number_is_invited` could not be dropped (`find_inviters` calls it); the dev port is 5183, not only 5173.
- [ ] **Session 2: B, Email and Apple secret**
  - [x] `send-invite` and its tests (`0ba1c6b`)
  - [x] Auth email templates (`18a1572`)
  - [x] `scripts/apple-secret.mjs` (written early, 2026-10-10; the first secret
    expires **2027-04-09**; key id `C9397R83YF`, `.p8` in the owner's Downloads)
  - [x] `scripts/set-member-email.mjs` (`008c63b`)
  - [x] `pnpm check` exit 0, committed (work: `0ba1c6b`, `18a1572`, `008c63b`; lint fixes and this plan edit are the commit after)
  - Notes for the next session ("as built"):
    - `send-invite` returns `200 {sent:true}`, `400` bad body, `401` not signed in, `404` unknown **or not yours** (alike, so ids
      cannot be probed), `409` not pending, `422` phone-only invite (no address), `429` sent under 60 s ago, `502` Resend refused.
      Mentors may send only their own invites; **organization invites are administrators' only**. It has CORS, so
      `supabase.functions.invoke('send-invite', { body: { invite_id } })` works. The new token is stored before the email goes out.
    - The Auth templates are `confirmation`, `recovery`, `email_change`, `reauthentication` in `supabase/templates/`, wired into
      the local `config.toml` with subjects; the dashboard gets the same files pasted (see the hand-over list in the session reply).
    - `set-member-email.mjs <member id | display name> <email>` needs `SUPABASE_SERVICE_ROLE_KEY` in the environment;
      `SUPABASE_URL` defaults to the live project. It refuses a name shared by two members.
- [x] **Session 3: C + D, Sign-in, joining, onboarding questions**
  - [x] sign-in and join screens, check-email, `/reset-password` (`f9b9ce8`)
  - [x] invite token and `claim_invite` (`c0e877d`)
  - [x] Google as a way to join; Apple and passkeys behind switches (`0adb8ff`)
  - [x] name prefill, username step, phone-for-events step, Agree without SMS (`35668d0`)
  - [x] blocked screen without Ask somebody; dev-login by password (`7ae759f`)
  - [x] tests updated; `pnpm check`, `pnpm test` and `pnpm build` clean, committed (updated tests and
    both scripts: `4875759`, which the owner's commit swept up from the working tree under another
    message; new tests: `e706701`; this plan edit is the commit after)
  - Notes for the next session ("as built"):
    - **Commits are not individually green.** The five source commits above were made before their tests were
      updated; the tests and scripts landed in `4875759` and `e706701`. Only the tip passes `pnpm check`
      (exit 0), `pnpm test` (169 files, 2378 tests) and `pnpm build`.
    - **Verified on the real local stack** (`db reset`, GoTrue and mailpit, app on 5183), not only against mocks:
      `stranger@` signs in and gets the blocked screen; `invited@` gets Agree, then a name prefilled from the
      seeded metadata, then real `suggest_usernames` chips and a real "@alfred is taken"; `newcomer@` signs up,
      the mailpit link lands on `/join?confirmed=1` and goes on to Agree (matched by confirmed address);
      `someone.else@` with `?invite=<token>` is claimed whatever its address; an uninvited sign-up is blocked after
      confirming; Forgot password → mailpit link → `/reset-password` → new password → Home; `pnpm shoot` and
      `pnpm demo-member` sign in with the seeded passwords. Not tried: Apple and passkeys (switches off, no
      credentials), and the Resend side (`send-invite` needs the edge runtime).
    - **Broken on purpose, each failing the tests that guard it:** `claim_invite` skipped (6 page tests); username
      accepted without its availability check (6, in the page and `types` tests); the reset link sent to `/me`
      (2); Skip on the phone step keeping the typed number (1).
    - **Local stack now needs mailpit** (as Session 1 said); this session stopped it and started it with
      `-x imgproxy,studio,edge-runtime,logflare,vector,supavisor`, then `db reset`.
    - Client names: `src/lib/auth-email.ts` (`signUpWithEmail`, `signInWithEmail`, `sendPasswordReset`,
      `resendConfirmation`, `MIN_PASSWORD`; `signInWithEmail` also returns `unconfirmed: true` so the page offers
      the link again), `invite-token.ts` (`captureInviteToken`, `claimHeldInvite`, `forgetInviteToken`),
      `usernames.ts` (`normalizeUsername`, `isValidUsername`, `suggestUsernames`, `usernameAvailable`; no wrapper
      for `set_my_username` yet, which is Session 4's), `apple-sign-in.ts`, `passkeys.ts` (`passkeysAvailable`,
      `signInWithPasskey`, `registerPasskey`, `listPasskeys`, `deletePasskey`; a cancelled browser sheet returns
      `{ok:false, error:''}`, so show a sentence only when `error` is non-empty). `GOOGLE_NOT_SIGNED_IN` replaces
      `GOOGLE_NOT_LINKED`; `isPhoneless` is gone. Linking Google from Me (`linkGoogle`, `unlinkGoogle`) is unchanged.
    - **The one invite check** is `afterSignIn()` in `src/routes/onboarding/page.tsx`: it runs when the account is
      signed in with no member row while a door is showing, claims the held token, asks `my_invite_status`, then
      shows Blocked or goes to Agree. The steps are `welcome, signin, forgot, join, check-email, checking, agree,
      name, username, birthday, injury, city, phone, photo` (seven counted).
    - `OnboardingData` lost `code`, `smsConsent` and `startFresh`; the claim step, `ClaimStep` and
      `start_fresh` on the insert are gone (the migration drops the seed-claim branch). `usernameChecked` holds the
      name last found free, and the step goes on only when it equals `username`.
    - `members.phone` is written as 1 + ten digits (`toE164`), or null when skipped, the same shape as before.
    - **Kept on purpose:** `ask-somebody.tsx` (unreferenced) and `src/lib/invite-request.ts`, because Me's
      `findable-switch.tsx` uses `useFindableForInvites` and the welcome screen uses `CONSULTATION_URL`.
    - The static `/join` page (`src/routes/legal/static.tsx`) is now just the welcome screen; its `<noscript>`
      text-message form went, since `PhoneStep` and the consent constants are gone. Privacy and Terms still carry the
      SMS sentences until Session 5, and `static.test.tsx` still asserts them.
    - **CSP checked:** no change. The Apple and Google round trips are navigations, not form posts, and Apple's
      POST goes from Apple's page to supabase.co; every form here is submitted in the page.
    - **Not done, not mine to do here:** `src/routes/me/` and `src/routes/admin/` untouched, so Me's
      `google-sign-in.tsx` still says "the phone number stays", and Admin and the mentor invites page still use the
      old phone forms. `scripts/realtime-check.mjs` still signs in with the removed test phones (the task named only
      `shoot.mjs` and `demo-member.mjs`). HANDOFF's "Test numbers" lines are Session 5's.
    - `/reset-password` handles both links; it signs nobody in itself, it waits for the session the link creates and
      says "This link has expired" without one. It goes to `/home`, and the guard there sends a non-member to `/join`.
- [x] **Session 4: E, Me, profiles, events**
  - [x] Me sign-in section (email, password, Google/Apple, passkeys, phone, username) (`6dcd316`)
  - [x] add-an-email banner for phone accounts, with Use my Google address (`4a7eafa`)
  - [x] @username on profiles and cards (`a16980f`)
  - [x] Going wording and phone sheet (`9bee253`)
  - [x] `scripts/realtime-check.mjs` signs in with the seeded passwords (`f91d384`)
  - [x] tests, checks, committed (work: `a16980f`, `6dcd316`, `4a7eafa`, `9bee253`, `f91d384`; tests went in with
    each commit, so each is green on its own; this plan edit is the commit after). `pnpm check` exit 0, `pnpm test`
    (175 files, 2451 tests) and `pnpm build` clean at the tip.
  - Notes for the next session ("as built"):
    - **Broken on purpose, each failing the tests that guard it:** Google's Unlink offered with no other way in (1 test);
      Going sheet opening even with a number on file (2, in the sheet and the event page); a taken username saveable (1);
      "Use my Google address" calling the password form's function (1); the phone stored as typed, not 1 + ten digits (2).
    - **Verified on the real local stack:** `pnpm realtime-check` passes with the seeded accounts (both PASS lines); in a
      browser as `sam@local.test`, Me → Account shows the Email, Password, Google, Phone and Username cards, and a
      username change went through `username_available` and `set_my_username` and showed on the hero. (That left Sam as
      `@sam.rolls` locally; `db reset` restores it.) **Not tried in a browser:** the banner against a phone-only account
      (none is seeded), the Going sheet, Apple, passkeys, and the confirmation email's return to `/me?email=changed`.
    - **Client names:** `src/lib/account-email.ts` (`useSignInDetails`, `readSignInDetails`, `waysIn`, `changeEmail`,
      `addEmailAndPassword`, `resendEmailChange`, `EMAIL_RETURN_PARAM`), `event-phone.ts` (`useOwnPhone`, `loadOwnPhone`,
      `saveOwnPhone`, `displayPhone`), `setMyUsername` in `usernames.ts`, and `linkApple` / `unlinkApple` /
      `loadAppleIdentity` in `apple-sign-in.ts`. `src/components/going-phone-sheet.tsx` has `useGoingPhoneSheet`.
    - **The account's email is read from the auth user** (`getUser()`), not the member row. `email` is the confirmed address
      only; `pendingEmail` is `new_email`, or an address that has not been confirmed. The banner shows while `email` is
      null, whatever the cause, and then offers the link again.
    - **"Another way in" is `waysIn`**: Google, Apple, and a confirmed email. A phone identity is not counted (there is no
      phone screen), so a phone account with Google linked cannot unlink Google until it has a confirmed email.
    - **Me's Account tab also opens** for `?apple=linked` and `?email=changed`, as it did for `?google=linked`.
      `?email=changed` is consumed and says nothing by itself; the card reads what is actually there.
    - **Going:** `GOING_SHARES_NUMBER` is now `GOING_SHARES_CONTACT`. The sheet opens beside the RSVP (which is saved either
      way) on Events, Home and the event page, only when `members.phone` was read and is empty. **Skip holds for the browser
      session** (`sessionStorage`, `sciclub.goingPhoneSkipped`), not for ever: Me's phone card is the standing way to add
      one. A number that could not be read does not open it.
    - **The mentor line on Me** now says "you can invite N people by email". `/invites` itself is still the phone form
      until Session 5.
    - **Left for Session 5, not mine here:** `privacy.tsx` and `terms.tsx` still say the host receives the phone number
      (only the comment naming the constant changed); `event_host_contacts` has no screen yet; HANDOFF's "Test numbers"
      lines; the home page's `person-card.tsx` and chat lists do not show `@username` (the task named profiles and
      peer cards).
- [x] **Session 5: F + G, Admin, invites, words**
  - [x] admin invites and blocks by email, resend and revoke, re-invite old phone invites (`9df36d1`, with `send-invite` client `0460270`)
  - [x] mentor invites by email (`c03be86`)
  - [x] event host contacts (reader and section `0460270`, the Going tab `9df36d1`)
  - [x] privacy, terms, CONTEXT, HANDOFF; `public/sms-opt-in/` removed (`c550eff`, `e9295c5`)
  - [x] @username on Home's person cards and in chat lists, which Session 4 left out (`97dc60e`; new migration `20261012010000`)
  - [x] phone-only member and an upcoming event in seed.sql; dev-login by phone (`7710453`)
  - [x] **"Ask somebody" removed completely** (`a41a357`): `ask-somebody.tsx`, Me's switch (`findable-switch.tsx`), `invite-request.ts`
    and `find-inviters.sql` deleted; `CONSULTATION_URL` now in `src/lib/consultation.ts`; migration
    `20261012020000_remove_ask_somebody.sql`; probe `ask-somebody-is-gone.sql`. Nothing in privacy, terms or CONTEXT.md said anything
    about finding members by number (searched); HANDOFF's item 17 was rewritten.
  - [x] profile page: the "never shows a phone number…" notice removed, and the box with it (it held only that sentence for a
    member who joined; a seeded row keeps the box for its directory provenance sentence) (`2809118`)
  - [x] "Type it again" on the email sign-up and on Me's add-an-email-and-password form, matching `/reset-password` (`0c76bbb`)
  - [x] auth error sentences rewritten for email and password in `describe-error.ts` (`69b2f5d`; its `reset-password` test file
    had a misplaced brace, fixed in `cd61293`, so only the tip is green). `invalid_credentials` is "That email or password is not
    right."; the rate limits (`over_email_send_rate_limit`, `over_request_rate_limit`, the "only request this after" wording) say
    "Too many attempts or emails."; "Error sending … email" says the email could not be sent; `otp_expired` and "Email link is
    invalid or has expired" say the link has expired or was used. `sms_send_failed`, `over_sms_send_rate_limit` and "Error sending
    sms" are gone. Tests: the table in `describe-error.test.ts` with real GoTrue codes, and sign-up, resend, Forgot password and
    `/reset-password` showing the sentences; the rate-limit sentence put back to "codes" failed 4 tests, then restored. Stale comments
    in `src/lib/account.tsx` (the path given as `me/account.tsx`) and `blocked.tsx` fixed. The sign-in screen keeps its own fixed
    "That email and password did not match." (it never reaches `describeError`).
  - [x] tests, checks, committed (work: `0460270`, `9df36d1`, `c03be86`, `97dc60e`, `c550eff`, `7710453`, `e9295c5`; tests went in with each commit;
    this plan edit is the commit after). `pnpm check` exit 0, `pnpm test` (181 files, 2511 tests) and `pnpm build` clean at the tip.
  - Notes for the next session ("as built"):
    - **Broken on purpose, each failing the tests that guard it:** `removeAndBlock` deleting the member before blocking (2 tests);
      `createInvite` not emailing the link (3); the mentor `createMyInvite` back to a direct insert (5); Resend offered on a used
      mentor invite (1) and on a used admin invite (1). New SQL probe `chat-authors-username.sql` fails with the view's column
      removed. Each was restored and the files re-run green.
    - **Verified on the real local stack and a real browser** (`db reset`, app on 5183, headless Chromium), the two things Session 4
      could not try: as phone-only Phoebe (`/dev-login?phone=14155550199`) Me shows the add-an-email banner, "Add email" sends the
      confirmation to mailpit, and its link lands on `/me?email=changed` with the banner gone and the address shown. As `sam@`
      (no number on file) Going saves the RSVP and opens the phone sheet; Save stored `14155550123` (1 + ten digits); Skip holds for
      the browser session. As `alfred@`: Admin → Invites adds an address (the email step fails locally because the edge runtime is
      not running, and the form says "on the list, but the email did not go out"), re-issues an old phone invite by email, blocks
      an address; Admin → Going lists Maya and Phoebe with email and phone.
    - **Not tried:** `send-invite` end to end (needs the edge runtime and Resend), Apple, passkeys.
    - **Client names:** `src/lib/send-invite.ts` (`sendInvite`, `addedButNotSent`); in `members-admin.ts` `createInvite({email,
      organizationId, note})` (returns `{ok, sendError?}`: on the list but the email failed is **ok**, so nobody adds it twice),
      `resendInvite`, `reinviteByEmail`, `blockEmail`/`unblockEmail`/`fetchBlockedEmails`, `removeAndBlock`, `withdrawnInvites`,
      `deliveryNote`, `isOldPhoneInvite`; `mentor-invites.ts` `createMyInvite({email, note})` and `resendMyInvite`;
      `src/routes/admin/event-contacts*.ts(x)`. `AdminMember` gained `email`, `username` (phone is nullable); `AdminInvite` gained
      `email`, `sentAt`, `claimedAt` and lost `claimableName`; `fetchClaimableProfiles` and the claim question are gone.
    - **Removing a member and blocking** is two calls, **block first** (`admin_block_email`, then `admin_delete_member`): a failure
      leaves the address barred and the member visibly still there. A member with no email is blocked by number
      (`admin_block_number`), and then removed too if that did not already (a typed `members.phone` need not match the verified one).
    - **Old phone invites** show "phone invite (old)" with no Resend and no Block (no address); "Re-invite by email" creates the
      email invite (same organization by name, same note), emails it, then revokes the phone one only if it was still pending.
    - **`chat_authors.username`** needed a migration, `20261012010000_chat_authors_username.sql`: **Session 6's `db push` dry run
      should list two migrations, not one** (`20261012000000` and this). `ChatAuthor.username` is required, so test fixtures carry it.
    - **seed.sql** now has Phoebe (phone-only; her `members.phone` is set, as the live phone members' are, so Going does not ask her)
      and one upcoming event with Maya going. The Going sheet opens only for a member with no number: use `sam@`.
    - **The Going tab** lists upcoming events somebody is going to (from yesterday on) and copies one line a person: name, email,
      phone if given. The app still does not hand the details to the host itself.
    - **"Ask somebody" removal, probed to the standard** on a fresh stack (scratch copy of `supabase/`, project id
      `thesciclub-fresh`, ports 553xx, stopped after): every `expect` line of `ask-somebody-is-gone.sql` met (the four objects
      gone, nothing in functions or views mentions them, `find_inviters` and the column "do not exist", an invited account still
      inserts its member row, an uninvited one is still refused); `blocked-numbers.sql` re-run (it now asks `has_active_invite`
      as the superuser) and the email probes re-run clean. **Sabotaged:** the `drop column` line removed from the migration,
      steps 4 (`columns_left` 1) and 6b (`UPDATE 0`) failed; restored, they pass. A scan of every probe for "does not exist" found
      only expected refusals.
    - **Password twice, broken on purpose:** the join gate no longer waiting for a match failed 3 onboarding tests; the Me form
      ignoring the second field failed 1 banner test. Restored. `OnboardingData.passwordAgain` is cleared with `password`.
    - **Remaining phone or SMS wording in `src/`** (searched 2026-10-10; none of it is a sign-in screen). **Updated after the
      removal: the `findable-switch.tsx`, `ask-somebody.tsx` and `invite-request.ts` items below are gone.**
      - ~~`describe-error.ts` `AUTH` list~~ rewritten for email (see the line above).
      - `src/routes/me/findable-switch.tsx:35` still says people "can ... text you"; that is the hidden "Ask somebody" feature, whose
        switch is still on Me for inviters although its door is hidden. Hide the switch or reword it: the owner's call.
      - `src/routes/onboarding/ask-somebody.tsx` and `src/lib/invite-request.ts` (`smsHref`, "text them to ask"): unreferenced
        on purpose (Decision 8).
      - Comments only: `src/lib/account.tsx:14` ("verified a number"), `src/routes/onboarding/blocked.tsx:32` ("add the number"),
        and the history in `src/sw.ts`, `legal/static.tsx`, `privacy.tsx`, `terms.tsx` that says why the SMS text went.
      - Intended: `src/routes/me/add-email-banner.tsx:84` ("no longer sends codes by text message") explains the change to a phone member.
- [ ] **Session 6: Release, with the owner**
  - [x] owner H steps confirmed one by one (2026-10-11). The Apple secret (H4/H13) and H16b were already marked done and were not
    re-asked. **H9** `RESEND_API_KEY` and `INVITE_FROM`, and **H9a** `REMINDER_TO` and the vault URL `sign_in_reminder_url`, set by the
    owner (`secrets list` shows all three; the vault URL is on the owner's word, the CLI cannot see it). **H14** calendar reminder set
    by the owner. **H17** (re-invite the two pending phone invites): the owner said not to. Read-only check before the push: 4 members,
    4 accounts, 4 confirmed emails, nobody missing. The reminder email is `sign-in-reminder`: 30, 14, 7, 3, 1 days before, the day, then
    daily until Admin → Sign-in has the new date; the first is 2027-03-10.
  - [x] `db push` (dry run first) 2026-10-11: **four** migrations, the three below and `20261011080000` (the owner approved all four;
    step 2 now says so). Checks were run before the push at the owner's word (`pnpm check` exit 0, `pnpm test` 181 files and 2528
    tests, `pnpm build` exit 0), so the old client was broken on live for as short a time as possible.
  - [x] `send-invite` deployed with secrets (2026-10-11, v1, `verify_jwt` true: 401 with no JWT; `RESEND_API_KEY` and `INVITE_FROM` set)
  - [x] `sign-in-reminder` deployed, secrets set, vault URL added (H9a) (2026-10-11, v1, `verify_jwt` false: 401 "not the reminder"
    without the secret; `REMINDER_TO` set; the vault URL is on the owner's word)
  - [x] full checks (`pnpm check` exit 0, `pnpm test` 181 files and 2528 tests, `pnpm build` exit 0, 2026-10-11)
  - [x] pushed to main (2026-10-11, `395015b`). Main had one commit this branch lacked (`80bbf6a`, the React picker, by another
    author); merged it in (clean), re-ran `pnpm check` exit 0, `pnpm test` (181 files, 2533 tests) and `pnpm build` exit 0 on the
    merged tip, then pushed the branch and `HEAD:main`. Netlify's `/sw.js` matched the local build within 30 s.
  - [x] smoke test on the live site (2026-10-11, the owner: "passed except passkeys"). What each step rests on, since the
    database and the owner's word do not cover the same ground:
    - **Email join:** database-verified. Account, confirmation 75 s later, member with a username, invite consumed. It joined by
      the **address match**, not the link (the confirmation link was opened outside the incognito window that held the token).
    - **Claim by link:** database-verified through Google: an invite's `claimed_by` was set after Google's round trip, so the
      token survives the redirect. That account's invite was then revoked by the owner and it never became a member.
    - **Google join, to the end:** owner-confirmed only; the database showed the claim, not a finished member.
    - **Not invited:** an uninvited address confirmed and signed in, with no member row and no invite; owner-confirmed screen.
      This is the **old** behaviour (the check comes after confirmation); `signup-invite-gate` changes it.
    - **Forgot password:** owner-confirmed; no recovery timestamp is recorded for any account that day.
    - **Change email:** not run. The owner removed it from Me on `signup-invite-gate` (`2b9ba71`, not yet released), so the live
      site still has it until that branch goes out.
    - **Existing account:** the owner's real admin account signed in with Google: fresh `last_sign_in_at`, still an
      administrator, phone, Google and email identities all kept, no duplicate account, 5 members and 4 admins. The Google
      identity's own timestamp did not move (Supabase may not refresh it on a repeat sign-in), so the method is the owner's word.
      A throwaway email account signing in with Google was auto-linked to its existing account, not duplicated.
    - **Phone member:** not applicable, no live member is phone-only.
    - **Apple:** see the next line. **Passkeys:** see the line after it.
    - **Open, not resolved:** the `Test` member has a phone number on file although the smoke step said to skip it (stored as
      1 + ten digits, so typed in the app, not from sign-in). The owner has not said whether Skip was pressed; if it was, that is a bug.
    - **Left to do:** remove the `Test` member and the unconfirmed strays from the live list; turn **Phone off** in Supabase
      Providers (H18).
  - [x] Apple (2026-10-11, the owner: "Apple works"). Found wrong at the smoke test and fixed: the **Client ID in Supabase's Apple
    provider was the App ID `com.thesciclub.app`**; it must be the **Services ID `com.thesciclub.web`**, and is now. The plan
    already said Services ID (H4, H12); the dashboard did not match. `scripts/apple-secret.mjs` signs the secret for the Services
    ID, so the Client ID has to be the same value. What the database shows: an Apple identity linked to the owner's **existing
    admin account** at 16:01 UTC and a sign-in with it at 16:03, not Hide My Email. **Not exercised:** step 9's "join with Apple
    using Hide My Email through the invite link". I did not check whether `VITE_APPLE_SIGN_IN` is on in Netlify production; that
    is the owner's switch (H10).
  - [ ] Passkeys: **later** (the owner, 2026-10-11). `VITE_PASSKEYS` stays off and the smoke step was not run. It still needs the
    steps in Release order 6 on a real iPhone (Safari and the installed app) and Android Chrome, and a Netlify preview with the
    switch on, since the button is hidden while it is off. The client is built and tested behind the switch; Decision 10 allows
    launching without it.
  - [ ] **Follow-up, the owner's word 2026-10-11 (during the smoke test): the invite link fills in its address.** Built and
    committed on the branch (`528443b` database and probe, `7a4dbe1` client), **not yet applied or pushed**: it needs a `db push`
    of one migration (`20261012030000_invite_address_for_link`) and a push to main. `invite_address_for_token(token)` answers the
    address of a pending, unclaimed invite and null for everything else, the same null each time, and is callable by anon
    (the token guards it; 32 random bytes). The address is **not** put in the link: that would sit in history, logs and previews
    beside a secret token, and links already sent would not have it. A held invite now opens at Join, not Welcome, with the Email
    field filled in unless something was typed; the field stays theirs (Decision 3). Probe `invite-address-for-link.sql` on the
    local and a **fresh** stack (ports 553xx, stopped after): spaces trimmed as `claim_invite` does, every other case null, anon
    may call it and sees no invites. **Broken on purpose, each failing the section that guards it:** status check removed (used
    and revoked leak), claimed-by removed, blocked check removed, raw token compared instead of its hash. Client broken three
    ways (overwrites what was typed; opens at Welcome; asks when signed in), each failing 1, 7 and 3 tests. `pnpm check`
    exit 0, `pnpm test` 181 files and 2545 tests, `pnpm build` exit 0. Not tried on a phone or the live site. A newline is not
    trimmed in the database (nor in `claim_invite`); the client's `trim()` is what keeps one out.
    **Not to be released from this session** (the owner, 2026-10-11): `signup-invite-gate` (worktree
    `thesciclub-signup-gate`) is built on top of these commits, so it carries them, and the session that owns it releases both
    together. Its `db push` dry run should list `20261012030000` and `20261012040000`.
  - [ ] **Follow-up, the owner's word 2026-10-11: an uninvited address is refused at sign-up, before any email.** Built on
    branch `signup-invite-gate` (a separate worktree while Session 6 ran), **not yet merged, applied or pushed**. Migration
    `20261012040000_signup_needs_an_invite`: a Before User Created hook, `public.signup_needs_an_invite`. An email sign-up
    passes only when its address has a pending invite, or it carries a pending, unclaimed invite's token in
    `user_metadata.invite_token` (the join form now sends the held one), and the address is not blocked. Google and Apple
    pass (no email; the closed door still answers them after sign-in). Phone, anonymous and provider-less sign-ups are
    refused. A refusal is `403` "This email is not on the invite list."; the join form goes straight to the closed door
    (`BlockedScreen signedIn={false}`: "Try another email", no sign-out). **It tells anybody whether an address is on the
    list; the owner chose that knowingly over an invite-link-only gate** (see the migration header and the earlier phone
    gate, 20260911120000).
    - Probe `signup-needs-an-invite.sql` on a **fresh** stack (`thesciclub-gate`, ports 556xx): 7 passes, 16 refusals, anon
      and authenticated denied, `supabase_auth_admin` granted. It caught my first version letting a phone or
      provider-less sign-up through with an invited address; now fails closed. **Broken on purpose:** the blocked check
      removed let both blocked cases through; restored, refused. Client: refusal detection removed failed 3 tests.
    - **Real GoTrue, same fresh stack:** uninvited → 403, no user, no email; invited `newcomer@` → 200 and a confirmation
      email; another address with a good token → 200 and an email; with a bad token → 403, nothing. supabase-js reports
      the refusal as `status 403`, `message` exactly the hook's sentence.
    - `pnpm check` exit 0, `pnpm test` 181 files and 2552 tests, `pnpm build` exit 0. Not tried in a browser or on a phone.
    - **Release, in this order:** merge `signup-invite-gate`; `db push` (dry run lists `20261012030000` and `20261012040000`, nothing
      else); push to main;
      then the owner turns on Authentication > Hooks > **Before User Created** > Postgres > `public.signup_needs_an_invite`.
      Hook before client would leave the live join form showing a bare sentence and dropping the invite token.
    - Accounts made before the hook is on are not affected; an unconfirmed one re-signing up gets its confirmation resent by
      Supabase without reaching the hook.
  - [ ] **Follow-up, the owner's word 2026-10-11: Me no longer changes the account's email.** Same branch,
    `signup-invite-gate`, no migration. Me → Signing in → Email is read only: the address, and "it can't be changed here. If
    you lose access to it, ask an administrator" (the owner runs `scripts/set-member-email.mjs`). The add-an-email banner for
    an account with no email is unchanged, and still uses `changeEmail` and `/me?email=changed`. Supabase's API would still
    let a signed-in member call `updateUser({ email })` on their own account; nothing in the app offers it, and it moves only
    their own account. Test: the card offers no change and names who can; with the old card put back it fails.

## Decisions (the owner's, 2026-10-10)

1. **Ways in**
   - Join: email + password, Google, or Apple.
   - Sign in: passkey, Google, or Apple, each one tap; email + password also
     works, with "Forgot password?" under it.
   - A passkey can only be added to an account that already exists, so it is
     offered after onboarding and on Me.
   - **New members join only by email + password, Google or Apple** (the
     owner, 2026-10-10). No phone option anywhere in the app, for joining
     **or signing in**. Once Session 3 ships there is no phone screen, so
     fixed codes stop being a way in.
   - **Existing members without Google or an email** (Ajay and Ran at
     2026-10-10) get in by staying signed in and linking Google, or adding an
     email + password on Me (Session 4). If one is signed out first, the owner
     runs `scripts/set-member-email.mjs` for them and they use **Forgot
     password?**. Session 6 runs the script for both if the owner has their
     emails, so neither depends on staying signed in.
2. **Email confirmation is required** for email + password sign-ups before
   anything else happens. Without it, whoever types an invited address first
   would get that person's invite. Google and Apple addresses are already
   confirmed by them.
3. **Invites are emailed links, and an address match also counts.**
   - An invite names an email address and is sent to it through Resend, with a
     one-time link.
   - Whoever opens that link while signed in claims the invite, whatever
     address they signed up with. This covers Apple's "Hide My Email" and
     people who have several Google accounts.
   - Without the link, signing up at the exact invited address (confirmed)
     also matches.
4. **Existing accounts are kept, not recreated.** Admins and members
   currently signed in by phone add an email + password, or link Google or
   Apple, to their *current* account. Admin rights, posts, chats and sent
   invites all stay. The owner's account ("alfred") already has Google linked;
   Google becomes its way in, and its email is set to that Gmail address
   (Workstream H).
5. **Same onboarding questions, plus two more.**
   - The name is filled in from Google or Apple when they give one.
   - New: a **username** step, with suggestions based on the name.
   - New: an optional **phone number "for events"** step.
6. **Usernames** look like `@name`.
   - Shown on profiles and member cards.
   - Unique, and changeable on Me if the new one is free.
   - 3–20 characters: lowercase letters, digits, `.` and `_`.
7. **Event hosts** receive the email address of each member who chooses
   **Going**, plus their phone number if they gave one. It's the same practice
   as today (CONTEXT.md, "Phone numbers stay inside the club"), and the app
   still doesn't hand the details over itself.
   - Onboarding asks for a phone number "for events".
   - Pressing **Going** without one on file asks for it then. The member can
     skip that.
8. **"Ask somebody you know for an invite" is hidden for launch.** The
   not-invited screen keeps the consultation link only.
9. **Change email, change password and forgot password** all work by emailed
   link, sent through Resend.
10. **Everything goes in at launch**, but **Apple and passkeys sit behind
    switches** (`VITE_APPLE_SIGN_IN`, `VITE_PASSKEYS`). If Apple's developer
    approval or the passkey beta isn't ready by morning, the launch goes ahead
    without them and the switch is turned on later.

### Do you need a Mac for Apple?

No.
- **Enrolling:** do it in the **Apple Developer app on an iPhone**, which is
  the fastest way and verifies ID with the phone, or at
  developer.apple.com/programs/enroll. Enroll as an **Individual** tonight. An
  Organization enrollment needs a D-U-N-S number, which takes days or weeks.
- **Approval:** it is often within hours, but can take up to 48. That is why
  Apple sits behind a switch.
- **Setup on the web:** the Services ID, the key (`.p8`) and the return URL
  are all created in the developer website.
- **The secret:** Supabase needs a secret made from the `.p8` file. It
  **expires every 6 months**, and expired Apple sign-in fails with
  `invalid_client` with no warning. `scripts/apple-secret.mjs` (Workstream B)
  makes it with Node. Put a calendar reminder for five months out.

## What depends on the phone today

The phone number is what everything is keyed on. All of the following changes
(paths from the repo root):

| Where | What it does with the phone |
|---|---|
| `members.phone` (`not null unique`, 20260910120100) | Every member row must carry the verified phone |
| Members insert policy (20261003040000) | Row's phone must equal `auth.jwt()->>'phone'` and `my_number_is_invited()` |
| `invites.phone_raw/phone`, `invites_live_phone_idx` (20260910120200) | An invite is one phone number |
| `consume_invite_for_new_member()` (20261002000000) | Matches the pending invite `where phone = new.phone` |
| `my_invite_status`, `my_number_is_invited`, `has_active_invite`, `my_claimable_profile` | All keyed on the JWT phone |
| `only_a_phone_makes_an_account` hook (20261007010000, live on hosted) | Refuses every account without a phone, which would refuse every email/Google/Apple sign-up |
| `blocked_numbers`, `is_blocked`, `invites_refuse_blocked`, `admin_block_number`, `admin_unblock_number` (20260913010000) | Blocking is by number |
| `admin_create_invite`, `admin_revoke_invite`, admin invites view and `private.account_created_at(phone)` (20260929000000) | Admin invite list by number |
| `find_inviters`, `invite_lookups` (20261011000000) | "Ask somebody", by contacts' numbers |
| `delete_my_account` (20261003080000) | Frees the number's invites |
| Notification `invite_joined` (20261010000000) | Joins through `members.invite_id`. Still fine if the trigger sets `invite_id` |
| `src/routes/onboarding/page.tsx`, `steps.tsx`, `types.ts`, `blocked.tsx`, `ask-somebody.tsx` | Phone → code → invite check flow, SMS consent |
| `src/lib/phone.ts`, `src/lib/invite-request.ts` | Formatting, sms: links |
| `src/lib/google-sign-in.ts`, `src/routes/me/google-sign-in.tsx` | "Phone is the account; Google is a second door"; `isPhoneless` signs strays out |
| `src/routes/admin/invite-form.tsx`, `members-admin.ts`, `page.tsx` | Invites, blocks and the member list by number |
| `src/routes/invites/page.tsx`, `mentor-invites.ts` | Mentor invites by number |
| `src/routes/events/event-card.tsx` (`'Going shares your phone number…'`) | RSVP wording |
| `src/routes/dev-login/page.tsx`, `supabase/config.toml` `[auth.sms.test_otp]`, `seed.sql` | Local test phones |
| `src/routes/legal/privacy.tsx`, `terms.tsx`, `public/sms-opt-in/`, `SMS_CONSENT`, `SIGN_IN_CONSENT` | Text-message consent and the Twilio registration |
| `CONTEXT.md`, `HANDOFF.md` | Product definition says "puts your phone number on the list" |

## Contract (build against this; Workstream A makes it real)

Every workstream codes against these names and shapes. Change them only in
this file, and say so in the session's commit.

### Tables and columns

```
members
  phone          text null           -- was NOT NULL. Now an optional contact number "for events",
                                     -- typed by the member, never verified. Unique index dropped
                                     -- (two people may share a household phone).
  username       citext null unique  -- NULL only for rows that predate this; onboarding requires it.
                 check (username ~ '^[a-z0-9._]{3,20}$' and username !~ '^[._]|[._]$|\.\.')
                 -- reserved list enforced in claim/set functions, not the check.
                 -- (as built: a trigger lowercases it, the check is case-sensitive on text,
                 -- and an insert by `authenticated` must carry one and not a reserved one)

invites
  email          citext null         -- normalized: trimmed, lowercase
  phone_raw      text null           -- was NOT NULL; old phone invites stay for history
  token_hash     text null unique    -- sha256 hex of the link token; the token itself is never stored
  claimed_by     uuid null references auth.users(id) on delete set null
  claimed_at     timestamptz null
  sent_at        timestamptz null    -- last time the email went out
  constraint invites_email_or_phone check (email is not null or phone_raw is not null)
  unique index invites_live_email_idx on (email) where status in ('pending','consumed') and email is not null
  -- as built: `phone` (generated) is now NULL when there is no phone_raw; it was '' and would have
  -- collided in invites_live_phone_idx. A client can no longer INSERT into invites at all, and can
  -- UPDATE only status and revoked_at (a mentor withdrawing their own pending invite). Everything
  -- else goes through the functions below, or the service role (send-invite writes token_hash, sent_at).

blocked_emails  (email citext primary key, blocked_at, blocked_by, note)
                -- same RLS shape as blocked_numbers; admins only
```

### Functions (all `security definer`, `set search_path = ''`, granted to `authenticated` unless noted)

| Function | Returns | Who / what |
|---|---|---|
| `claim_invite(token text)` | `boolean` | Signed in, not a member. Hashes the token, finds a `pending` invite, sets `claimed_by = auth.uid()`. False for an unknown, used or revoked token. It never says which. |
| `my_invite_status()` | `(invited boolean)` | **Redefined.** True when a live invite has `claimed_by = auth.uid()`, or when `email` equals the caller's **confirmed** `auth.users.email` (read from `auth.users`, checking `email_confirmed_at is not null`, not just the JWT). Blocked emails → false. The `claimable_member_id` column is dropped (the seeded directory is gone, 20261010020000). It is `select i_am_invited()`. |
| `i_am_invited()` | `boolean` | The rule above, used by the members insert policy. "Live" means `pending` **or `consumed`**: the policy is judged after the consume trigger has run, so a pending-only rule would refuse every join. A member who joined without an invite (the owner, the seeded accounts) answers false; the client checks for the member row first. |
| `my_number_is_invited()`, `find_inviters(text[])` | **dropped** | By `20261012020000_remove_ask_somebody.sql` (2026-10-10, the owner): with "Ask somebody" removed nothing calls either. The same migration drops the `invite_lookups` table and `members.findable_for_invites`. `has_active_invite(text)` stays (the phone-invite trigger uses it). |
| `consume_invite_for_new_member()` trigger | — | **Redefined.** Consumes the invite `claimed_by = new.id`, else the one whose email matches the confirmed account email. Sets `new.invite_id`. Drops the seed-claim branch. |
| `username_available(name text)` | `boolean` | Signed in. Case-insensitive; false for reserved names. |
| `suggest_usernames(full_name text)` | `setof text` (≤ 5) | Signed in. Free, valid candidates: `first`, `firstlast`, `first.last`, `first_last`, `firstl`, then `firstlast` + 2 digits. Accents stripped. |
| `set_my_username(name text)` | `void` | A member changes theirs; raises `23505` with "That username is taken." |
| `admin_create_invite(raw_email text, organization_id uuid default null, note text default null)` | `invites` row | **Redefined** for email; the phone signature and `claim_member` are gone. Stores the address trimmed and lowercase. Refuses a blocked or already-live email (23505), a malformed one (22023), an organization that cannot invite. |
| `create_my_invite(raw_email text, note text)` | `invites` row | Mentor/org/representative invites, with the existing limits (`my_invite_permissions`). Replaces the direct insert in `mentor-invites.ts`, which is now **refused by privilege**. Errors: `42501` "You cannot add another invite." (not allowed, or allowance spent), `23505` already on the list, `22023` not an address, `P0001` blocked. |
| `admin_block_email(raw_email text, note text)` / `admin_unblock_email(raw_email text)` | `void` | Admin only. Blocking revokes live (pending **and** consumed) invites for that address. It does **not** remove an existing member (use Remove member), and refuses the caller's own address and an administrator's. |
| `admin_revoke_invite(target uuid)` | `void` | **Redefined**: "already used" is judged by `members.invite_id`, not by the invite's number (an email invite has none, so the old check let an administrator revoke a used invite). |
| `admin_block_number(...)` | `void` | **Redefined**: finds the member to remove by `auth.users.phone` (what Auth verified), not `members.phone`, which a member can now type to anything. |
| `claim_invite` also | | Returns false (never an error) for an anonymous, empty, unknown, used, revoked or someone-else's token, for an existing member, and for a caller whose confirmed address is blocked. Claiming your own claimed token again is true. It does not require a confirmed email (Supabase will not sign an unconfirmed password account in). |
| `username_available(name)` | | also true for the caller's **own** current name, so Me does not say "taken" for what they already have. |
| `invite_address_for_token(token text)` | `text` | **Added 2026-10-11 (`20261012030000`).** Callable by `anon` and `authenticated`: the join page has no session. The lowercase address of the `pending`, unclaimed, unblocked email invite whose `token_hash` matches; null for every other reason, alike. For prefilling the Email field only. |
| `admin_set_member_phone` | — | Not needed; members edit their own `phone` (existing update policy plus `guard_own_member_row`, checked). |
| `event_host_contacts(event_id uuid)` | `(member_id, display_name, email, phone)` | Admin only. For the owner's practice of passing Going members to the host. Email from `auth.users`. |
| `delete_my_account()` | — | **Redefined** to free email invites (`claimed_by` or the *confirmed* account email) as it freed numbers. The old-number branch now uses only the JWT's verified phone, never `members.phone`. |

Retire `only_a_phone_makes_an_account`. Drop the function after the hook is off
on hosted, in that order. Otherwise every new account is refused. (The hook is
off on hosted since 2026-10-10, so the migration drops it.) `find_inviters`
and `my_number_is_invited` went in `20261012020000` (see the table above).

### Views (as built)

- `admin_invites`: adds `email`, `claimed_by`, `claimed_at`, `sent_at`; `has_account` / `account_created_at` also
  answer from the claiming account or a confirmed account at the address. `held_by` finds the member by `invite_id`.
- `admin_members`: adds `email` (through `private.account_email`, which answers only an administrator, so no view
  names `auth.users`: `admin-invites-no-auth-users.sql` step 6 fails otherwise) and `username`.
- `admin_blocked_emails` (new): email, note, blocked_at, blocked_by. Replaces `admin_blocked_numbers` for the UI.
- `browse_members`: adds `username`.

### Edge function `send-invite` (Resend)

- `POST { invite_id }` with the caller's JWT.
- Verifies the caller may resend that invite (the inviter or an admin) and
  that it is `pending`.
- Makes a 32-byte random token, stores its sha256 in `token_hash`, sets
  `sent_at`, and emails `https://thesciclub.com/join?invite=<token>` through
  the Resend API.
- Re-sending makes a new token, which invalidates the old link.
- Secrets: `RESEND_API_KEY`, `INVITE_FROM` (`The SCI Club <invites@thesciclub.com>`).
- The email says who invited them (organization name or member's display name)
  and nothing about injury beyond the club's name.

### Client contract

- `src/lib/supabase.ts` creates the client with
  `auth: { experimental: { passkey: true } }` when `VITE_PASSKEYS` is set
  (supabase-js 2.116 is installed; passkeys need ≥ 2.105).
- **The invite token** from `?invite=` is kept in `localStorage`
  (`sciclub.inviteToken`) the moment `/join` loads. It has to survive email
  confirmation and Google/Apple round trips. It's cleared once `claim_invite`
  answers true, or the member row exists.
- **Redirect targets**, which must all be in Supabase's redirect allow-list:
  - `/join?confirmed=1` (email confirmation)
  - `/join?google=signin` (existing)
  - `/join?apple=signin`
  - `/reset-password` (forgot or change password)
  - `/me?email=changed`

## The new join and sign-in flow

```
/join
 ├─ Welcome: Join · Sign in
 ├─ Sign in:  [Sign in with a passkey]  [Google]  [Apple]
 │            email + password  ·  Forgot password? → email → "Check your email"
 │            (the email field has autocomplete="username webauthn" so the
 │             browser can offer a passkey right in it)
 └─ Join:     [Google]  [Apple]  ·  email + password (8+ characters)
              → "Check your email" (resend link, change address)
              → link → /join?confirmed=1, now signed in
After any way in:
  member row exists?            → home (or ?next)
  invite token held?            → claim_invite(token)
  my_invite_status().invited?   → no: Blocked screen (consultation link; no "Ask somebody")
  Agree (terms + privacy; no SMS consent any more)
  Name        (prefilled from user_metadata.full_name / name; Apple may give none)
  Username    (suggestions as chips, live "available" check)
  Birthday · Injury · City
  Phone for events (optional, skippable; "Event hosts get this when you choose Going")
  Photo → submit → Notifications → "Sign in faster next time?" passkey offer → home
```

- **One door, wherever they start.** As today, which door somebody came
  through changes the wording only. A Sign in that turns out to have no member
  row goes on to the invite check.
- **Leftover accounts are allowed now.** Email, Google or Apple accounts with
  no invite may exist in `auth.users`. That's the cost of not saying, at sign-up,
  whether an address is invited (the same reasoning as the 20260911120000
  header). `isPhoneless` and its sign-out go.
- **Duplicate accounts.** Supabase links a Google or Apple identity to an
  existing user automatically when the verified email matches. Someone who
  joined by email and later uses Google with the same address lands in the same
  account. A *different* address makes a second account, which then hits the
  invite check, finds the invite already consumed, and sees the blocked screen.
  Its wording should say "You may have joined with another email."

## Workstreams

A goes first: it's the contract. B through G can start at once against the
contract, using a local stack with A's migration applied as soon as it exists.
H is the owner's, and has to be done before release.

### A. Database (one migration, `20261012000000_email_is_the_account.sql`)
- Everything under **Contract → Tables** and **Functions**. Rewrite the
  members insert policy to `auth.uid() = id and public.i_am_invited()`. The
  phone check goes.
- `guard_own_member_row` lets a member edit their own `phone` and nothing new
  of note. `username` goes only through `set_my_username`, or the insert.
- The admin invites view shows `email`, `claimed_by`, `sent_at`, and
  `has_account` (from `claimed_by`, or a confirmed account with that email).
  Keep the phone columns for old rows.
- Update `seed.sql`: local members with emails and passwords
  (`alfred@local.test` etc.) and one invited, unjoined address.
- `supabase/config.toml`, local only:
  - `[auth.email] enable_confirmations = true`, `secure_password_change = true`
  - `minimum_password_length = 8`
  - `site_url = "http://127.0.0.1:5173"`, with redirect URLs for 5173 (and 5183, the
    port HANDOFF runs the local-stack app on)
  - the `[auth.hook.before_user_created]` block removed
  - `[auth.passkey] enabled = true` and `[auth.webauthn]` for `localhost`
  - SMS test numbers removed
- SQL probes, to the probe standard: rolled back, one deliberately broken fix,
  fresh stack. They prove:
  - a stranger can't learn invite status for an address
  - an unconfirmed email doesn't match
  - a claimed token can't be claimed twice
  - a blocked email can't be invited or matched
  - the members insert refuses an uninvited account
  - usernames collide case-insensitively

### B. Email (Resend) and Apple secret
- `supabase/functions/send-invite/` as in the contract, with tests for "not
  yours" and "not pending".
- `supabase/templates/*.html`: branded Supabase Auth templates for **Confirm
  signup**, **Reset password**, **Change email address** (sent to both old and
  new addresses) and **Reauthentication**.
  - Plain, high-contrast and large text (the accessibility rule).
  - One button plus the link written out.
  - Workstream H pastes them into the dashboard.
- `scripts/apple-secret.mjs`: signs the Apple client secret from the `.p8`
  (team ID, key ID, Services ID) with 180-day validity. It prints the JWT and
  never writes it to the repo.
- `scripts/set-member-email.mjs` (service key from env, never committed): sets
  a confirmed email on an existing auth user by member id or display name. Used
  for the owner's account and any admin who can't get to Me (Workstream H).

### C. Signing in and joining (client)
- Rewrite `src/routes/onboarding/page.tsx` to the flow above:
  - `PhoneStep` and `CodeStep` go, along with `keyboardHold`, `requestCode` and
    `verifyCode`.
  - New steps: `SignInStep`, `JoinStep`, `CheckEmailStep`.
  - The after-any-way-in logic becomes `afterSignIn()`, run on each auth state
    change while on `/join`.
- New `src/lib/auth-email.ts` with `signUpWithEmail`, `signInWithEmail`,
  `sendPasswordReset`, `resendConfirmation`. Each returns `{ok} | {ok:false,
  error}` like `google-sign-in.ts`.
- `src/lib/apple-sign-in.ts`: `signInWithOAuth({provider:'apple'})`, which
  redirects back to `/join?apple=signin`. The Apple button is hidden unless
  `VITE_APPLE_SIGN_IN`.
- `src/lib/passkeys.ts`: `signInWithPasskey`, `registerPasskey`, list and
  delete, all behind `VITE_PASSKEYS`.
  - Feature-detect `PublicKeyCredential`.
  - Never show the button in a browser without it.
- `src/lib/google-sign-in.ts`:
  - Google becomes a full way to join.
  - `isPhoneless`, `GOOGLE_NOT_LINKED` and the stray sign-out go.
  - Linking from Me stays, as an extra way in.
- New route `/reset-password`: new password twice, then `updateUser({ password })`,
  then home. It handles both forgot-password and change-password links.
- Invite token capture (contract) and `claim_invite`.
- `src/routes/onboarding/blocked.tsx` takes an email, not a phone, and drops
  `AskSomebody`. Delete `ask-somebody.tsx` and `src/lib/invite-request.ts`, or
  keep them unreferenced for later (the owner said "hide").
- `src/routes/dev-login/page.tsx`: password sign-in for the seeded local
  accounts.
- CSP in `netlify.toml`: nothing new for the Apple redirect or passkeys (both
  stay on thesciclub.com and supabase.co). Confirm `form-action 'self'`
  doesn't block anything. Apple's return is a POST to supabase.co, not to the
  app.

### D. Onboarding questions
- `src/routes/onboarding/types.ts`: drop `phone` and `code` from the sign-in
  part.
  - Add `username`, `usernameChecked`, and `phone` for the events phone.
  - Steps become `name, username, birthday, injury, city, phone, photo`.
  - Update `COUNTED_STEPS` and `canAdvance`: username must be valid and
    available; phone is optional.
- `NameStep` prefill: `user.user_metadata.full_name ?? name`, only if the field
  is empty.
- `UsernameStep`:
  - Up to 5 suggestions from `suggest_usernames(displayName)` as chips.
  - A text field that lowercases as they type.
  - A debounced `username_available`, read out by a live region ("@alfred is
    available").
- `PhoneForEventsStep`: one field (`src/lib/phone.ts` formatting stays), skip
  allowed, and the sentence about hosts.
- `AgreeStep`: terms and privacy only. `SMS_CONSENT` and `SIGN_IN_CONSENT` go.
- `submit-onboarding.ts`: writes `username` and `phone` and no longer derives
  the phone from the session.
- After the notifications step, a **passkey offer** when `VITE_PASSKEYS` is on
  and the browser supports it: "Use Face ID or your fingerprint next time" ·
  Not now.

### E. Me, profiles and events
- Me → **Sign-in** section, which replaces `google-sign-in.tsx`'s phone-centred
  card:
  - **Email**: shows the current address. "Change" calls `updateUser({ email },
    { emailRedirectTo: '/me?email=changed' })`, and the screen says "Check both
    inboxes".
  - **Password**: "Change password" sends a reset link to the current email.
    This also lets a Google-only member add a password.
  - **Google / Apple**: link and unlink, keeping one way in at all times.
  - **Passkeys**: list (name, created), add, remove.
  - **Phone for events**: edit or clear.
  - **Username**: edit, through `set_my_username`.
- **Existing phone members**:
  - They have no email, so Me shows a banner at the top: "Add an email so you
    can keep signing in", with an email + password form.
  - `updateUser({ email, password })` sets the password at once and sends the
    confirmation link.
  - The banner stays until `user.email` is confirmed.
  - **If Google is already linked** (the owner's advice to the four admins,
    2026-10-10, was to link Google on Me while still signed in by phone):
    linking may not fill in `user.email`. When `user.email` is empty and a
    Google identity exists, the banner offers **"Use my Google address
    (name@gmail.com)"** as one tap. It sets that address with
    `updateUser({ email })`, which sends the confirmation link. The
    email + password form stays below it as the alternative.
- `@username` on `me/hero.tsx`, `peers/member-detail.tsx` and the peers cards.
  The `browse_members` view needs the `username` column, which Workstream A
  adds.
- Events: `event-card.tsx` Going wording becomes "Going shares your email, and
  your phone number if you've added one, with the host, for this event only."
  - Pressing Going with no phone on file opens a small sheet: phone field ·
    Save · Skip. The RSVP goes through either way.

### F. Admin and invites pages
- `admin/invite-form.tsx`, `members-admin.ts`, `admin/page.tsx`:
  - Email field (`type="email"`), `admin_create_invite`, then call
    `send-invite`.
  - The list shows email, sent, claimed and joined, with **Resend link** and
    **Revoke**.
  - Old phone invites still show, marked "phone invite (old)", with a
    "Re-invite by email" action.
  - Blocks become emails.
  - The member list shows email, from a definer view for admins only, plus the
    optional phone.
- `invites/page.tsx`, `mentor-invites.ts`: email field, `create_my_invite` plus
  `send-invite`, and a list with resend and revoke.
- Admin: the "Going" list per event via `event_host_contacts`, with a copy
  button, for passing to the host.

### G. Words
- `src/routes/legal/privacy.tsx` and `terms.tsx`:
  - Sign-in by email, Google or Apple, and passkeys. Resend sends the club's
    emails.
  - Phone is optional and only for event hosts.
  - The SMS and Twilio sections go.
- Delete `public/sms-opt-in/`. The carrier review is moot.
- `organization-detail.tsx`: "can put a phone number on the club's list"
  becomes "can invite people by email".
- `CONTEXT.md`: Invite-only paragraph, glossary "Invite", the "Phone numbers
  stay inside the club" section (email + optional phone), and the Status table
  row.
- `HANDOFF.md`: Open 2 (Twilio) is closed by this. Note the hook change and the
  Apple secret's expiry date.

### H. The owner's dashboard and accounts (before release)

Supabase dashboard, project `erijdvqnxavwezsbbojv`:

> **Owner, 2026-10-10:** dashboard settings done: SMTP through Resend
> (minimum interval per user 60 s), rate limit, Email provider (confirm email,
> secure email and password change on, current password **not** required,
> minimum length 8, no character rules), URL configuration, Passkeys, hook
> off. The templates (H6) and the `send-invite` secrets (H9) are done since. The
> Apple secret is in the Apple provider (owner, 2026-10-10).
1. **Resend** (**verified 2026-10-10**: SPF/DKIM via CNAME + TXT and DMARC
   `p=none`, added at Spaceship by the domain holder)
   - Finish domain verification for `thesciclub.com`: SPF, DKIM, and add a
     DMARC record.
   - Create an API key for SMTP and one for the edge function. One key is
     fine.
2. **Supabase → Authentication → Emails → SMTP**
   - Host `smtp.resend.com`, port `465`, user `resend`, password = the API key.
   - Sender `The SCI Club <hello@thesciclub.com>`.
   - Without custom SMTP, Supabase sends **2 emails an hour**, which would stop
     the launch at the third sign-up.
3. **Authentication → Rate limits**: emails per hour to at least 100.
4. **Authentication → Sign In / Providers**
   - **Email** on, with **Confirm email** on and **Secure email change** on.
   - Minimum password length 8.
   - **Google** already on.
   - **Apple** on once approved: Services ID as Client ID, and the secret from
     `scripts/apple-secret.mjs`.
5. **Authentication → URL configuration**
   - Site URL `https://thesciclub.com`.
   - Redirect URLs `https://thesciclub.com/**`, plus
     `http://127.0.0.1:5173/**` for local.
6. **Authentication → Emails → Templates**: paste Workstream B's templates. **Done 2026-10-10** (all four, with the subjects from Session 2's notes).
7. **Authentication → Passkeys**
   - Enable.
   - Relying party ID `thesciclub.com`, name `The SCI Club`, origin
     `https://thesciclub.com`.
8. **Authentication → Hooks**: turn **Before User Created off**. **Done
   2026-10-10.** Workstream A's migration may now drop
   `only_a_phone_makes_an_account`.
9. **Edge functions**: deploy `send-invite` and set the `RESEND_API_KEY` and
   `INVITE_FROM` secrets.
9a. **Apple renewal reminder** (built 2026-10-10, migration
    `20261011080000`, goes up with the same `db push`):
    - Deploy `sign-in-reminder` (`verify_jwt = false`, as in config.toml).
    - Set its secrets: `RESEND_API_KEY`, and `REMINDER_TO` = the owner's
      Gmail (the one the Google sign-in uses).
    - Add the vault secret `sign_in_reminder_url` =
      `https://erijdvqnxavwezsbbojv.supabase.co/functions/v1/sign-in-reminder`.
      Until it's set, the 16:10 UTC cron does nothing.
    - Admin → **Sign-in** shows the status either way.
10. **Netlify** environment: `VITE_APPLE_SIGN_IN=1` once Apple works,
    `VITE_PASSKEYS=1` once the passkey check passes. Rebuild after.

Apple Developer:
11. Enroll as an Individual, from the iPhone app. **Approved 2026-10-10.**
12. Create an App ID with Sign in with Apple, then a Services ID (say
    `com.thesciclub.web`).
    - Domain `erijdvqnxavwezsbbojv.supabase.co`.
    - Return URL `https://erijdvqnxavwezsbbojv.supabase.co/auth/v1/callback`.
   - **Done 2026-10-10.** App ID `com.thesciclub.app`, Services ID
     `com.thesciclub.web`, Team ID `3RZ3A2CJ9N`.
13. Create a Key with Sign in with Apple, download the `.p8` (only possible
    once), and keep it outside the repo. **Done 2026-10-10**; the owner holds
    the `.p8` and the Key ID. The secret was made with B's script and is
    pasted into Supabase's Apple provider (H4), the owner confirmed 2026-10-10.
    **Corrected 2026-10-11, at the smoke test:** the provider's Client ID had been set to the App ID `com.thesciclub.app`.
    It is the Services ID `com.thesciclub.web` (the same value the secret is signed for), and Apple sign-in works with it.
14. Calendar reminder: rotate the Apple secret by 2027-04-01.

Accounts:
> **Done 2026-10-10, for all four admins** (Alfred Shaheen, Wojtek, Ajay,
> Ran) with `set-member-email.mjs` on the live project. Each has a confirmed
> email on their existing account; admin rights, history and phone were left
> as they were. Alfred and Wojtek got the Gmail they had already linked
> (linking Google had **not** filled in `user.email`, which confirms the
> Session 4 note). Ajay and Ran got the addresses they chose. The addresses
> are deliberately not recorded here. H15 and the admin half of H16 need
> nothing more.

15. Set the owner's account email to their Gmail:
    `node scripts/set-member-email.mjs`, or Supabase → Users → alfred → edit.
    Sign in with Google once afterwards to confirm it's the same account.
16. Tell the four admins tonight: **Me → link Google**. It's live already, and
    their account, admin rights and history stay. Anyone not using Google adds
    an email + password on Me once session 4 ships.
16b. Message each phone admin and member: "Open Me and add your email before
    tomorrow". If one is signed out and stuck, set their email with the script,
    then they use **Forgot password** or Google with that address.
    **Done 2026-10-10** (owner): every member now has an email on their
    account, set with the script in another session. Addresses are
    deliberately not recorded here.
17. Pending phone invites: Admin → invites → "Re-invite by email", for each
    person you have an email for.
18. Turn **Phone** off in Providers after the release. It does nothing once
    the app has no phone screen. Someone signed out before migrating gets back
    in through `set-member-email.mjs` and Forgot password, not fixed codes.

## Release order

1. Owner H1–H8 (H8 last), and the Apple steps whenever approval arrives.
2. `db push` the migrations (dry run first; it should list exactly four: the Apple
   renewal date `20261011080000_apple_sign_in_has_a_renewal_date` (H9a; Admin's
   Sign-in tab reads its table), `20261012000000_email_is_the_account`,
   `20261012010000_chat_authors_username` and `20261012020000_remove_ask_somebody`,
   and nothing else). The last one
   drops `find_inviters`, `my_number_is_invited`, `invite_lookups` and
   `members.findable_for_invites`; the client that used them is gone in the
   same release, but an old tab open on the live site would fail on them,
   which is fine. The old client keeps working for members who are signed in, except
   the phone join flow (fine: nobody new is joining tonight) **and Admin's
   invite/block forms and the mentor invites page, which call `admin_create_invite`
   with a phone and insert into `invites` directly**. Those break from the push
   until step 5, so do steps 2 to 5 together, not hours apart.
3. Deploy `send-invite`.
4. Merge B–G. Run `pnpm check`, which must exit 0, then `pnpm test` and
   `pnpm build`.
5. Release: `git push origin scaffold-and-peers-deck && git push origin HEAD:main`.
6. Run the smoke test on the live site:
   - **Email join:** invite a fresh address of yours → open the link → join by
     email → confirm → onboarding (username suggested, phone skipped) → home.
   - **Google join:** same, with Google on a second invited address.
   - **Not invited:** sign up with an uninvited address → blocked screen.
   - **Forgot password:** link → set → sign in.
   - **Change email:** both inboxes get the link.
   - **Existing account:** the owner signs in with Google → Me shows Gmail and
     admin is intact.
   - **Phone member:** a phone member adds an email on Me → confirms → signs
     out → signs in by email.
   - **Passkeys** (if on): add one on Me → sign out → "Sign in with a passkey"
     on an iPhone (Safari and the installed app) and on Android Chrome.
   - **Apple** (if on): join with Apple using Hide My Email, through the
     invite link.
7. Turn on `VITE_PASSKEYS` / `VITE_APPLE_SIGN_IN` only after their smoke step
   passes on a real phone.

## Risks to watch

- **Apple approval** may not land by morning. It's behind a switch, so the
  launch isn't blocked.
- **Apple's name.** Apple sends the name only on the first authorization, and
  Supabase's web flow may not keep it. The name step simply starts empty then.
- **The installed iPhone app and OAuth.** The Google and Apple redirects from
  the Home Screen app have never been tried (HANDOFF Open 9). If the return
  lands in Safari instead of the app, members on the installed app use email
  and password or a passkey.
- **Passkeys are a Supabase beta** and the API may change. It's behind a
  switch, with `supabase-js` pinned at the current version.
- **Email deliverability.** Gmail may file the first sends as spam until the
  domain has a reputation. The "Check your email" screen says to look in spam,
  and has a resend button with a 60-second wait.
- **Someone signed out before adding an email** has no phone screen to go
  back to. The owner sets their email with `set-member-email.mjs`, and they
  use Forgot password.
