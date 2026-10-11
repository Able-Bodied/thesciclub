# Soft-launch check — 2026-10-11

No real emails were sent during this check. Signup and password-reset mail
was captured by local Mailpit; automated tests block network access.

## Readiness

The tested member flows work. Two database privacy fixes are prepared and
tested; **production application is pending the owner's approval**:

- `20261012080000_events_require_membership.sql`: event pages already require
  membership, but the live REST API still returns event records anonymously.
  This gates events, series, tag links and RSVP counts on membership. Members
  retain the calendar and counts for all attendees; service-role ingestion
  still reads and writes events.
- `20261012090000_chat_authors_keep_security_barrier.sql`: restores the query
  barrier lost when the chat-author view was recreated with usernames. The
  existing membership filter stays in place.

The linked dry run lists exactly these two migrations, with no seeds or roles.
Neither migration sends emails or deletes data. No frontend release is needed
for these fixes. `HANDOFF.md` reserves the production database push for the
owner; the command, after approval, is `pnpm exec supabase db push --linked`.

## Checks completed

- **2,551 automated tests passed in 181 files**, plus lint/type checks and the
  production build. Existing tests cover invite sending with a mocked mailer.
- Live deployment is ready and matches commit `75882ca`; existing hosted
  migrations were current before the two fixes above were added.
- Live welcome/sign-in, legal pages, password-reset route, manifest and service
  worker load. The browser initially had the old phone-sign-in bundle cached;
  updating/reloading loaded current email, Google and Apple sign-in. Passkeys
  remain hidden as planned.
- Real local browser signup → confirmation link → agreement → name → username
  → birthday → injury/location → optional phone/photo → Home passed. A number
  typed and then skipped remained null in the database.
- Forgot password → locally captured link → save new password → successful
  password sign-in passed. An existing account without an invite sees the
  closed door. Signup-hook SQL permits invited cases and refuses uninvited,
  blocked, revoked and invalid-token cases.
- Home, Peers, member profile, Events/detail, Chat, Me, profile details,
  notifications, admin and invite screens checked with local accounts.
  Phone/desktop layout sweeps showed no horizontal page overflow or uncaught
  page errors. Admin was checked in a separate signed-in browser session.
- Direct message delivery updates the other open browser; a message arriving
  while the recipient is on Peers produces the Chat unread indicator.
- Going saves the RSVP; skipping its phone prompt leaves the number empty.
  Calendar/detail and attendee counts work after the new membership policy at
  375px and 1440px widths.
- Storage API checks passed for member photographs and chat attachments:
  upload limits, signed URLs, private conversation access, permitted deletion
  and preservation of reported photographs. Organization logos remain public
  for the closed door. Two older photo-probe expectations were corrected to
  match that already-released decision.
- SQL probes exercised email invites, one-time claims, usernames, member/admin
  privileges, direct/group chat, posts, reactions, read markers, event editing
  and photographs in rolled-back local transactions.
- The new calendar probe fails against the old public policy and passes on
  both the existing local stack and a fresh stack. Deliberately restoring
  public event reads makes it fail again. Event editing and group-chat probe
  outputs match before/after; the permissions probe confirms views are read
  only and retain their query barriers after both fixes.
- Live anonymous requests cannot read members or chat messages. Unauthorized
  invite/reminder function calls return 401. All four scheduled database jobs
  last succeeded, with no failures recorded in the preceding 24 hours.

## Launch email budget and invitations

The owner reports **10 of 100 daily emails used**, leaving **90**. Fifteen new
email/password members normally need 15 invitation emails plus 15 confirmation
emails: about **30**, leaving about **60** for retries, resets and other sends.
Google/Apple signups need no password confirmation email. These are estimates,
not a reservation of quota. Resend's free plan allows 100/day and 3,000/month:
https://resend.com/pricing

Live Supabase settings use Resend SMTP, confirmation is required, the signup
invite hook is enabled, and auth email limits are 30/hour with a 60-second
per-address interval. Invitation emails use the separate edge function.
Confirmation, recovery and email-change templates are populated. No production
configuration was changed during the check.

At the read-only check there were **no pending production invitations**.
The launch guests must be invited before they can join. Existing active members
all have confirmed email addresses.

## Limits

This verifies local end-to-end behavior and read-only production health, not
fresh inbox delivery through Resend. Google/Apple account authorization,
physical iPhone/Android installation, native push delivery and passkeys were
not retested here. The earlier owner-confirmed OAuth smoke checks are recorded
in `EMAIL-SIGN-IN-PLAN.md`. No claim is made that every browser, device or
administrator action was exercised.

Browser evidence: `screenshots/launch-2026-10-11/` (gitignored).
