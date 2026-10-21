-- ============================================================================
-- Reminders to finish Your details, then the profile (20261022040000)
-- ============================================================================
--   1. finished is what Me's rings call 100%: filled or declined, and the two
--      questions that apply only after another answer
--   2. the schedule: two days after joining, a week apart, five a step,
--      details before the profile, never twice a day, not when switched off,
--      not an organization or a suspended member
--   3. the list opens the step: /profile/details or /profile?resume
--   4. admin_member_reach: administrators only; devices and the app
--
-- Run it against a local stack (never the hosted project):
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/profile-reminders.sql
--
-- One transaction, rolled back. Every check raises if it fails and prints
-- PASS if it holds; each expected refusal is in its own block.
-- ============================================================================
\set ON_ERROR_STOP on
begin;

-- Everything finished: the starting point each case below changes one thing of.
create temporary table finished on commit drop as
select * from public.members limit 0;
insert into finished (id, type, status, display_name, birth_date, level_range, state, show_in_browse,
  photo_path, exact_level, injury_date, city,
  gender, languages, bio, how_injured, topics, marital_status, has_children, children_when,
  independence, employment, education, education_when, field_of_work, interests,
  sports_equipment, grants, self_care, detail, wants_to_mentor, declined)
values ('aaaaaaaa-2204-0000-0000-000000000000', 'peer', 'active', 'Done Probe', '1980-01-01', 'T1–T6', 'CA', true,
  'members/x/a.webp', 'T4', '2010-01-01', 'Oakland',
  'Woman', '{English}', 'Hello.', 'A fall.', '{Skin}', 'Married', true, 'Before my injury',
  'Independent', 'Full time', 'College', 'Before my injury', 'Teaching', '{Swimming}',
  'A handcycle.', 'None yet.', '{Dictation software}', 'Dragon.', false, '{}');

do $$
declare m public.members;
begin
  select * into m from finished;
  assert public.member_details_done(m) and public.member_profile_done(m), 'a finished member was not';

  m.photo_path := null;
  assert not public.member_details_done(m), 'no photo was finished';
  m.declined := '{photo}';
  assert public.member_details_done(m), 'a declined photo was not finished';

  select * into m from finished;
  m.exact_level := null;
  m.condition_name := 'Transverse myelitis';
  assert public.member_details_done(m), 'a condition did not count for the injury';
  m.condition_name := '  ';
  assert not public.member_details_done(m), 'a blank condition counted';

  select * into m from finished;
  m.children_when := null;
  assert not public.member_profile_done(m), 'children with no when was finished';
  m.has_children := false;
  assert public.member_profile_done(m), 'when was asked of somebody with no children';

  select * into m from finished;
  m.detail := '';
  assert not public.member_profile_done(m), 'dictation software with no detail was finished';
  m.self_care := '{Bathing}';
  assert public.member_profile_done(m), 'detail was asked when nothing called for it';

  select * into m from finished;
  m.interests := '{}';
  assert not public.member_profile_done(m), 'an empty list was an answer';
  m.declined := '{interests}';
  assert public.member_profile_done(m), 'a declined list was not finished';

  select * into m from finished;
  m.wants_to_mentor := null;
  assert not public.member_profile_done(m), 'an unanswered yes or no was finished';
  raise notice 'PASS 1: finished is filled or declined, and the two that depend on another answer';
end;
$$;

-- The members the schedule is tried on, each named for what it shows.
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, show_in_browse, created_at)
values
('aaaaaaaa-2204-0000-0000-000000000001','peer','active','New Probe','19990220401','1980-01-01','T1–T6','CA',true, now() - interval '1 day'),
('aaaaaaaa-2204-0000-0000-000000000002','peer','active','Due Probe','19990220402','1980-01-01','T1–T6','CA',true, now() - interval '3 days'),
('aaaaaaaa-2204-0000-0000-000000000003','peer','active','Recent Probe','19990220403','1980-01-01','T1–T6','CA',true, now() - interval '30 days'),
('aaaaaaaa-2204-0000-0000-000000000004','peer','active','Weekly Probe','19990220404','1980-01-01','T1–T6','CA',true, now() - interval '30 days'),
('aaaaaaaa-2204-0000-0000-000000000005','peer','active','Fifth Probe','19990220405','1980-01-01','T1–T6','CA',true, now() - interval '90 days'),
('aaaaaaaa-2204-0000-0000-000000000006','peer','active','Muted Probe','19990220406','1980-01-01','T1–T6','CA',true, now() - interval '30 days'),
('aaaaaaaa-2204-0000-0000-000000000007','organization','active','Org Probe','19990220407','1980-01-01','T1–T6','CA',true, now() - interval '30 days'),
('aaaaaaaa-2204-0000-0000-000000000008','peer','suspended','Paused Probe','19990220408','1980-01-01','T1–T6','CA',true, now() - interval '30 days'),
('aaaaaaaa-2204-0000-0000-000000000010','peer','active','Capped Probe','19990220410','1980-01-01','T1–T6','CA',true, now() - interval '90 days'),
('aaaaaaaa-2204-0000-0000-000000000009','peer','active','Admin Probe','19990220409','1980-01-01','T1–T6','CA',true, now() - interval '1 day');
update public.members set is_admin = true where id = 'aaaaaaaa-2204-0000-0000-000000000009';

-- Fifth Probe finished Your details after five reminders and has had none for
-- the profile; a copy of the finished member's details, profile left blank.
-- Capped Probe has had five and has not.
update public.members m set photo_path = f.photo_path, exact_level = f.exact_level,
  injury_date = f.injury_date, injury_date_precision = 'year', city = f.city
  from finished f where m.id = 'aaaaaaaa-2204-0000-0000-000000000005';

insert into public.profile_reminders (member_id, step, sent_on)
select 'aaaaaaaa-2204-0000-0000-000000000003'::uuid, 'details', (now() at time zone 'America/Los_Angeles')::date - 6
union all
select 'aaaaaaaa-2204-0000-0000-000000000004', 'details', (now() at time zone 'America/Los_Angeles')::date - 7
union all
select 'aaaaaaaa-2204-0000-0000-000000000005', 'details', (now() at time zone 'America/Los_Angeles')::date - 7 * g
  from generate_series(2, 6) g
union all
select 'aaaaaaaa-2204-0000-0000-000000000010', 'details', (now() at time zone 'America/Los_Angeles')::date - 7 * g
  from generate_series(2, 6) g;
insert into public.push_muted_kinds (member_id, kind) values ('aaaaaaaa-2204-0000-0000-000000000006', 'profile_reminder');

select public.profile_reminders_notify();
select public.profile_reminders_notify();

do $$
declare
  today date := (now() at time zone 'America/Los_Angeles')::date;
  picked text;
begin
  select string_agg(m.display_name || ':' || r.step, ', ' order by m.display_name) into picked
    from public.profile_reminders r join public.members m on m.id = r.member_id
   where r.sent_on = today and m.display_name like '% Probe';
  assert picked = 'Due Probe:details, Fifth Probe:profile, Weekly Probe:details', format('picked %s', picked);
  -- Capped Probe has had five and still has not finished: no sixth.
  assert (select count(*) from public.profile_reminders r
           where r.member_id = 'aaaaaaaa-2204-0000-0000-000000000010') = 5,
    'a sixth Your details reminder was sent';
  raise notice 'PASS 2: two days in, a week apart, details then profile, once a day, not muted, an organization or paused';
end;
$$;

-- 3. The list, as Due Probe and Fifth Probe see it.
set local role authenticated;
set local request.jwt.claims='{"sub":"aaaaaaaa-2204-0000-0000-000000000002","role":"authenticated"}';
do $$
begin
  assert (select url from public.my_notifications() where kind = 'profile_reminder') = '/profile/details',
    'Your details did not open Your details';
  begin
    perform 1 from public.profile_reminders;
    raise exception 'a member read the reminders';
  exception when insufficient_privilege then null;
  end;
end;
$$;
set local request.jwt.claims='{"sub":"aaaaaaaa-2204-0000-0000-000000000005","role":"authenticated"}';
do $$
begin
  assert (select url from public.my_notifications() where kind = 'profile_reminder') = '/profile?resume',
    'the profile did not open where it was left';
  raise notice 'PASS 3: each reminder opens its step; members cannot read the schedule';
end;
$$;

-- 4. Who can be reached, as a member and as an administrator.
reset role;
insert into auth.users (id, instance_id, aud, role, email, created_at)
values ('aaaaaaaa-2204-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'recent@probe.test', now());
insert into public.sign_ins (session_id, user_id, method, home_screen, at) values
('bbbbbbbb-2204-0000-0000-000000000001', 'aaaaaaaa-2204-0000-0000-000000000003', 'email', false, now() - interval '3 days'),
('bbbbbbbb-2204-0000-0000-000000000002', 'aaaaaaaa-2204-0000-0000-000000000003', 'email', true,  now() - interval '2 days');
insert into public.push_subscriptions (endpoint, member_id, p256dh, auth) values
('https://web.push.apple.com/probe-1', 'aaaaaaaa-2204-0000-0000-000000000003', repeat('A', 87), repeat('B', 22)),
('https://fcm.googleapis.com/fcm/send/probe-2', 'aaaaaaaa-2204-0000-0000-000000000003', repeat('A', 87), repeat('B', 22));

set local role authenticated;
set local request.jwt.claims='{"sub":"aaaaaaaa-2204-0000-0000-000000000002","role":"authenticated"}';
do $$
begin
  begin
    perform * from public.admin_member_reach();
    raise exception 'a member read who can be reached';
  exception when insufficient_privilege then null;
  end;
  assert not has_function_privilege('anon', 'public.admin_member_reach()', 'execute'), 'anon may read reach';
end;
$$;
set local request.jwt.claims='{"sub":"aaaaaaaa-2204-0000-0000-000000000009","role":"authenticated"}';
do $$
declare r record;
begin
  select * into r from public.admin_member_reach() where member_id = 'aaaaaaaa-2204-0000-0000-000000000003';
  assert r.push_devices = 2, format('devices were %s', r.push_devices);
  assert r.home_screen_at > now() - interval '3 days' and r.home_screen_at < now() - interval '1 day',
    'the app was not the Home Screen session';
  select * into r from public.admin_member_reach() where member_id = 'aaaaaaaa-2204-0000-0000-000000000002';
  assert r.push_devices = 0 and r.home_screen_at is null, 'somebody with neither had one';
  raise notice 'PASS 4: administrators only; notification devices and the app';
end;
$$;
rollback;
