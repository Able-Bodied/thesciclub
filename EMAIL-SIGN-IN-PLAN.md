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

- [ ] **Session 1: A, Database**
  - [ ] migration written
  - [ ] seed.sql and local config.toml
  - [ ] SQL probes pass to the probe standard
  - [ ] `pnpm check` exit 0, committed
- [ ] **Session 2: B, Email and Apple secret**
  - [ ] `send-invite` and its tests
  - [ ] Auth email templates
  - [ ] `scripts/apple-secret.mjs`
  - [ ] `scripts/set-member-email.mjs`
  - [ ] committed
- [ ] **Session 3: C + D, Sign-in, joining, onboarding questions**
  - [ ] sign-in and join screens, check-email, `/reset-password`
  - [ ] invite token and `claim_invite`
  - [ ] Google as a way to join; Apple and passkeys behind switches
  - [ ] name prefill, username step, phone-for-events step, Agree without SMS
  - [ ] blocked screen without Ask somebody; dev-login by password
  - [ ] tests updated; `pnpm check`, `pnpm test` and `pnpm build` clean, committed
- [ ] **Session 4: E, Me, profiles, events**
  - [ ] Me sign-in section (email, password, Google/Apple, passkeys, phone, username)
  - [ ] add-an-email banner for phone accounts
  - [ ] @username on profiles and cards
  - [ ] Going wording and phone sheet
  - [ ] tests, checks, committed
- [ ] **Session 5: F + G, Admin, invites, words**
  - [ ] admin invites and blocks by email, resend and revoke, re-invite old phone invites
  - [ ] mentor invites by email
  - [ ] event host contacts
  - [ ] privacy, terms, CONTEXT, HANDOFF; `public/sms-opt-in/` removed
  - [ ] tests, checks, committed
- [ ] **Session 6: Release, with the owner**
  - [ ] owner H steps confirmed one by one
  - [ ] `db push` (dry run first)
  - [ ] `send-invite` deployed with secrets
  - [ ] full checks
  - [ ] pushed to main
  - [ ] smoke test on the live site
  - [ ] switches for Apple and passkeys

## Decisions (the owner's, 2026-10-10)

1. **Ways in**
   - Join: email + password, Google, or Apple.
   - Sign in: passkey, Google, or Apple, each one tap; email + password also
     works, with "Forgot password?" under it.
   - A passkey can only be added to an account that already exists, so it is
     offered after onboarding and on Me.
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

invites
  email          citext null         -- normalized: trimmed, lowercase
  phone_raw      text null           -- was NOT NULL; old phone invites stay for history
  token_hash     text null unique    -- sha256 hex of the link token; the token itself is never stored
  claimed_by     uuid null references auth.users(id) on delete set null
  claimed_at     timestamptz null
  sent_at        timestamptz null    -- last time the email went out
  constraint invites_email_or_phone check (email is not null or phone_raw is not null)
  unique index invites_live_email_idx on (email) where status in ('pending','consumed') and email is not null

blocked_emails  (email citext primary key, blocked_at, blocked_by, note)
                -- same RLS shape as blocked_numbers; admins only
```

### Functions (all `security definer`, `set search_path = ''`, granted to `authenticated` unless noted)

| Function | Returns | Who / what |
|---|---|---|
| `claim_invite(token text)` | `boolean` | Signed in, not a member. Hashes the token, finds a `pending` invite, sets `claimed_by = auth.uid()`. False for an unknown, used or revoked token. It never says which. |
| `my_invite_status()` | `(invited boolean)` | **Redefined.** True when a pending invite has `claimed_by = auth.uid()`, or when `email` equals the caller's **confirmed** `auth.users.email` (read from `auth.users`, checking `email_confirmed_at is not null`, not just the JWT). Blocked emails → false. The `claimable_member_id` column is dropped (the seeded directory is gone, 20261010020000). |
| `my_number_is_invited()` | replaced by `i_am_invited()` | Same rule as above, used by the members insert policy. |
| `consume_invite_for_new_member()` trigger | — | **Redefined.** Consumes the invite `claimed_by = new.id`, else the one whose email matches the confirmed account email. Sets `new.invite_id`. Drops the seed-claim branch. |
| `username_available(name text)` | `boolean` | Signed in. Case-insensitive; false for reserved names. |
| `suggest_usernames(full_name text)` | `setof text` (≤ 5) | Signed in. Free, valid candidates: `first`, `firstlast`, `first.last`, `first_last`, `firstl`, then `firstlast` + 2 digits. Accents stripped. |
| `set_my_username(name text)` | `void` | A member changes theirs; raises `23505` with "That username is taken." |
| `admin_create_invite(raw_email text, organization_id uuid, note text)` | `invites` row | **Redefined** for email. Refuses a blocked or already-live email. |
| `create_my_invite(raw_email text, note text)` | `invites` row | Mentor/org/representative invites, with the existing limits (`my_invite_permissions`). Replaces the direct insert in `mentor-invites.ts`. |
| `admin_block_email(raw_email text, note text)` / `admin_unblock_email(raw_email text)` | `void` | Admin only. Blocking revokes live invites for that address. |
| `admin_set_member_phone` | — | Not needed; members edit their own `phone` (existing update policy plus `guard_own_member_row`, checked). |
| `event_host_contacts(event_id uuid)` | `(member_id, display_name, email, phone)` | Admin only. For the owner's practice of passing Going members to the host. Email from `auth.users`. |
| `delete_my_account()` | — | **Redefined** to free email invites (`claimed_by` or matching email) as it freed numbers. |

Retire `only_a_phone_makes_an_account`. Drop the function after the hook is off
on hosted, in that order. Otherwise every new account is refused. Leave
`find_inviters` in place, unused: it already refuses anybody without a JWT
phone. Drop it in a later cleanup.

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
  - `site_url = "http://127.0.0.1:5173"`, with redirect URLs for 5173
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
1. **Resend**
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
6. **Authentication → Emails → Templates**: paste Workstream B's templates.
7. **Authentication → Passkeys**
   - Enable.
   - Relying party ID `thesciclub.com`, name `The SCI Club`, origin
     `https://thesciclub.com`.
8. **Authentication → Hooks**: turn **Before User Created off**. **Done
   2026-10-10.** Workstream A's migration may now drop
   `only_a_phone_makes_an_account`.
9. **Edge functions**: deploy `send-invite` and set the `RESEND_API_KEY` and
   `INVITE_FROM` secrets.
10. **Netlify** environment: `VITE_APPLE_SIGN_IN=1` once Apple works,
    `VITE_PASSKEYS=1` once the passkey check passes. Rebuild after.

Apple Developer:
11. Enroll as an Individual, from the iPhone app.
12. Create an App ID with Sign in with Apple, then a Services ID (say
    `com.thesciclub.web`).
    - Domain `erijdvqnxavwezsbbojv.supabase.co`.
    - Return URL `https://erijdvqnxavwezsbbojv.supabase.co/auth/v1/callback`.
13. Create a Key with Sign in with Apple, download the `.p8` (only possible
    once), and keep it outside the repo.
14. Calendar reminder: rotate the Apple secret by 2027-04-01.

Accounts:
15. Set the owner's account email to their Gmail:
    `node scripts/set-member-email.mjs`, or Supabase → Users → alfred → edit.
    Sign in with Google once afterwards to confirm it's the same account.
16. Message each phone admin and member: "Open Me and add your email before
    tomorrow". If one is signed out and stuck, set their email with the script,
    then they use **Forgot password** or Google with that address.
17. Pending phone invites: Admin → invites → "Re-invite by email", for each
    person you have an email for.
18. Once every existing account has a confirmed email, turn **Phone** off in
    Providers. Until then leave it on: fixed codes are the only way back in for
    someone signed out before migrating.

## Release order

1. Owner H1–H8 (H8 last), and the Apple steps whenever approval arrives.
2. `db push` Workstream A's migration (dry run first; it should list only
   this). The old client keeps working for members who are signed in. The
   phone join flow breaks, which is fine because nobody new is joining tonight.
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
- **Someone signed out before adding an email** can still use their fixed
  phone code while Phone stays on. After that, the owner sets their email with
  the script.
