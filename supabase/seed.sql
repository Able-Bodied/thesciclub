-- ============================================================================
-- Local development seed — NOT pushed to any hosted project
-- ============================================================================
-- Runs on `supabase db reset` against the local stack only. Migrations go to
-- production; this file does not. That distinction is what makes it safe to put
-- test credentials here.
--
-- Every account below signs in with an email and the password
-- `local-dev-password` (the local stack's minimum is 8 characters):
--
--   alfred@local.test       member, administrator  — can do everything
--   maya@local.test         member, mentor         — can invite, within the allowance
--   sam@local.test          member, peer
--   invited@local.test      account, NOT a member  — invited by an organization; should be
--                           able to join (the invite matches the confirmed address)
--   stranger@local.test     account, NOT a member  — not invited; should be refused
--   +1 415 555 0199         member (Phoebe), signed in by PHONE with no email at all — one of the
--                           live club's existing phone members. /dev-login?phone=14155550199
--                           shows Me's add-an-email banner. Her members.phone is set, as theirs
--                           are, so Going does not ask her for a number.
--
-- Going's phone sheet opens only for a member with no number on file: sam@ and alfred@ have
-- none, maya@ has one. One upcoming event is seeded with only Maya going, so Admin → Going has
-- a row and sam@ can press Going and meet the sheet.
--   newcomer@local.test     no account at all      — invited by a mentor; sign up with
--                           this address, confirm it from the local inbox
--                           (http://127.0.0.1:54324), and you are invited
--
-- stranger@ is the important one. An invite gate that lets everybody in looks
-- exactly like a working one until a stranger walks through it, so the
-- negative case is the test that actually proves anything.
--
-- Ids are fixed so a probe or a script can name them.
-- ============================================================================

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, phone_change, phone_change_token
)
select
  '00000000-0000-0000-0000-000000000000', a.id, 'authenticated', 'authenticated', a.email,
  extensions.crypt('local-dev-password', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', a.name, 'email_verified', true),
  now(), now(), '', '', '', '', '', '', '', ''
from (values
  ('a1000000-0000-4000-8000-000000000001'::uuid, 'alfred@local.test',   'Alfred Local'),
  ('a1000000-0000-4000-8000-000000000002'::uuid, 'maya@local.test',     'Maya Local'),
  ('a1000000-0000-4000-8000-000000000003'::uuid, 'sam@local.test',      'Sam Local'),
  ('a1000000-0000-4000-8000-000000000004'::uuid, 'invited@local.test',  'Invited Local'),
  ('a1000000-0000-4000-8000-000000000005'::uuid, 'stranger@local.test', 'Stranger Local')
) as a (id, email, name)
on conflict do nothing;

insert into auth.identities (
  id, user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id, 'email', u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
  now(), now(), now()
from auth.users u
where u.email like '%@local.test'
  and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

-- A phone-only account: no email, a verified phone, a password so a local
-- session can be made (the app has no phone screen any more, and the removed
-- test OTP numbers are gone). Its member row predates usernames, as the live
-- club's phone members do, so `username` stays null.
insert into auth.users (
  instance_id, id, aud, role, phone, phone_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, phone_change, phone_change_token
)
values (
  '00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000006',
  'authenticated', 'authenticated', '14155550199', now(),
  extensions.crypt('local-dev-password', extensions.gen_salt('bf')),
  '{"provider":"phone","providers":["phone"]}'::jsonb, '{"phone_verified":true}'::jsonb,
  now(), now(), '', '', '', '', '', '', '', ''
)
on conflict do nothing;

insert into auth.identities (
  id, user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id, 'phone', u.phone,
  jsonb_build_object('sub', u.id::text, 'phone', u.phone, 'phone_verified', true),
  now(), now(), now()
from auth.users u
where u.id = 'a1000000-0000-4000-8000-000000000006'
  and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'phone');

-- Members. The ids match the accounts above. `phone` is the optional contact
-- number "for events"; only Maya has one, so both cases are on hand.
insert into public.members (
  id, type, status, display_name, username, phone, birth_date, level_range, city, state, is_admin
)
values
  ('a1000000-0000-4000-8000-000000000001', 'mentor', 'active', 'Alfred Local', 'alfred', null,
   '1985-04-12', 'T7–T12', 'Oakland', 'CA', true),
  ('a1000000-0000-4000-8000-000000000002', 'mentor', 'active', 'Maya Local', 'maya.local', '(415) 555-0142',
   '1990-09-03', 'C5–C8', 'San Francisco', 'CA', false),
  ('a1000000-0000-4000-8000-000000000003', 'peer', 'active', 'Sam Local', 'sam_local', null,
   '1995-01-20', 'L1–S5', 'Sacramento', 'CA', false),
  -- The phone-only member: members.phone is what they typed in the old
  -- onboarding, 1 + ten digits, and is also what Auth verified.
  ('a1000000-0000-4000-8000-000000000006', 'peer', 'active', 'Phoebe Local', null, '14155550199',
   '1988-06-30', 'T1–T6', 'San Jose', 'CA', false)
on conflict do nothing;

-- Invited by an organization, to an address that already has an account but no
-- member row: signing in as invited@local.test goes straight to onboarding.
insert into public.invites (email, invited_by_organization_id, note)
select 'invited@local.test', o.id, 'Local test: organization invite'
from public.organizations o
where o.short_code = 'NCS'
on conflict do nothing;

-- Invited by a mentor (Maya), to an address with no account at all: the
-- sign-up, confirm-from-the-inbox, then join path. This also gives the
-- mentor's allowance something to count against.
insert into public.invites (email, invited_by_member_id, note)
values ('newcomer@local.test', 'a1000000-0000-4000-8000-000000000002', 'Local test: mentor invite')
on conflict do nothing;

-- stranger@local.test is deliberately absent from invites. Do not add it.

-- One upcoming event with Maya going, for the Going sheet and Admin → Going.
insert into public.events (
  id, title, description, description_html, start_time, end_time, location, host_name, city
)
values (
  'e0000000-0000-4000-8000-000000000001', 'Local test: wheelchair rugby practice',
  'A seeded event for local testing.', '<p>A seeded event for local testing.</p>',
  date_trunc('hour', now()) + interval '3 days', date_trunc('hour', now()) + interval '3 days 2 hours',
  'Oakland Gym', 'NorCal SCI', 'Oakland'
)
on conflict do nothing;

insert into public.event_rsvps (event_id, member_id, status)
values
  ('e0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'going')
on conflict do nothing;
