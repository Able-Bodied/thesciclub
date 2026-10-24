-- ============================================================================
-- A registration for a public event is never an invite (20261022230000)
-- ============================================================================
-- Under 20261022190000, steps 3, 4 and 5 answered {}, t and INSERT 0 1: an
-- address registered on a public page could sign up and join with no invite.
-- The rest must keep working: an invited address joins and its registration
-- becomes its RSVP, a member's registration becomes theirs, and only the
-- event's organizers and administrators see the guest list.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/a-registration-is-not-an-invite.sql
--
-- One transaction, rolled back; a savepoint for each expected refusal. The
-- hook runs as its owner, as in signup-needs-an-invite.sql.
-- ============================================================================

\set ON_ERROR_STOP off
\set VERBOSITY terse
\pset pager off

begin;

-- ------------------------------------------------------------------ set-up --
update public.club_joining set open = false;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
  ('aaaaaaaa-2220-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@reg.test',     now()),
  ('bbbbbbbb-2220-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'organizer@reg.test', now()),
  ('cccccccc-2220-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outsider@reg.test',  now()),
  ('dddddddd-2220-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member@reg.test',    now()),
  -- Accounts with no member yet, as Google or Apple would make them.
  ('eeeeeeee-2220-0000-0000-00000000000e', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'invited@reg.test',   now()),
  ('ffffffff-2220-0000-0000-00000000000f', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stranger@reg.test',  now());

insert into public.members (id, type, status, display_name, username, phone, birth_date, level_range, state, is_admin) values
  ('aaaaaaaa-2220-0000-0000-00000000000a', 'mentor', 'active', 'Admin',     'reg.admin',     null, '1980-01-01', 'T1–T6', 'CA', true),
  ('bbbbbbbb-2220-0000-0000-00000000000b', 'peer',   'active', 'Organizer', 'reg.organizer', null, '1981-01-01', 'T1–T6', 'CA', false),
  ('cccccccc-2220-0000-0000-00000000000c', 'peer',   'active', 'Outsider',  'reg.outsider',  null, '1982-01-01', 'T1–T6', 'CA', false),
  ('dddddddd-2220-0000-0000-00000000000d', 'peer',   'active', 'Member',    'reg.member',    null, '1983-01-01', 'T1–T6', 'CA', false);

insert into public.organizations (id, short_code, name, city) values
  ('99999999-2220-0000-0000-000000000001', 'RGP', 'Registration Probe', 'San Jose');
insert into public.organization_representatives (organization_id, member_id) values
  ('99999999-2220-0000-0000-000000000001', 'bbbbbbbb-2220-0000-0000-00000000000b');

insert into public.invites (email, status, invited_by_member_id) values
  ('invited@reg.test', 'pending', 'aaaaaaaa-2220-0000-0000-00000000000a');

-- Public, as every event is by default (20261022200000).
insert into public.events (id, title, start_time, organization_id) values
  ('12121212-2220-0000-0000-000000000001', 'Probe picnic', now() + interval '3 days',
   '99999999-2220-0000-0000-000000000001');

create function pg_temp.ev(address text)
returns jsonb language sql as $$
  select jsonb_build_object('user', jsonb_build_object(
    'email', address, 'phone', '',
    'app_metadata', jsonb_build_object('provider', 'email'),
    'user_metadata', '{}'::jsonb));
$$;

create function pg_temp.as_account(account uuid)
returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.as_account(uuid) to authenticated;

-- ============================================== 1. anybody registers, signed out
\echo '== 1. signed out, three addresses register (expect three blank lines, no error) =='
set local role anon;
select public.register_for_event('12121212-2220-0000-0000-000000000001', 'Stranger', 'stranger@reg.test', null, 'going');
select public.register_for_event('12121212-2220-0000-0000-000000000001', 'Invited',  'invited@reg.test',  null, 'going');
select public.register_for_event('12121212-2220-0000-0000-000000000001', 'Member',   'member@reg.test',   null, 'going');
reset role;

-- ============================================================= 2. the hook
\echo '== 2. the sign-up hook (expect stranger 403 | stranger, spaced 403 | invited {}) =='
select 'stranger' as case, coalesce(public.signup_needs_an_invite(pg_temp.ev('stranger@reg.test')) -> 'error' ->> 'http_code', '{}') as answer
union all select 'stranger, spaced', coalesce(public.signup_needs_an_invite(pg_temp.ev('  Stranger@Reg.TEST ')) -> 'error' ->> 'http_code', '{}')
union all select 'invited', coalesce(public.signup_needs_an_invite(pg_temp.ev('invited@reg.test')) -> 'error' ->> 'http_code', '{}');

-- ======================================= as the stranger, registered only
select pg_temp.as_account('ffffffff-2220-0000-0000-00000000000f');
set local role authenticated;

\echo '== 3. the stranger is not invited (expect f) =='
select public.i_am_invited() as invited;

\echo '== 4. nor told so by the join screen (expect f) =='
select public.my_invite_status() as invited;

\echo '== 5. and cannot join (expect ERROR: new row violates row-level security policy) =='
savepoint stranger_joins;
insert into public.members (id, display_name, username, birth_date, level_range, state)
values ('ffffffff-2220-0000-0000-00000000000f', 'Stranger', 'reg.stranger', '1985-01-01', 'T1–T6', 'CA');
rollback to savepoint stranger_joins;

\echo '== 6. nor claim the registration (expect 0) =='
select count(*) as claimed from public.claim_event_registrations();
reset role;

-- ============================================== as the invited address
select pg_temp.as_account('eeeeeeee-2220-0000-0000-00000000000e');
set local role authenticated;

\echo '== 7. the invited address is invited (expect t) =='
select public.i_am_invited() as invited;

\echo '== 8. and joins (expect INSERT 0 1) =='
insert into public.members (id, display_name, username, birth_date, level_range, state)
values ('eeeeeeee-2220-0000-0000-00000000000e', 'Invited', 'reg.invited', '1985-01-01', 'T1–T6', 'CA');
reset role;

\echo '== 9. joining made the registration their RSVP (expect going | t) =='
select r.status, g.member_id = r.member_id as claimed
  from public.event_rsvps r
  join public.event_registrations g on g.event_id = r.event_id and g.email = 'invited@reg.test'
 where r.event_id = '12121212-2220-0000-0000-000000000001'
   and r.member_id = 'eeeeeeee-2220-0000-0000-00000000000e';

-- ============================================== as the existing member
select pg_temp.as_account('dddddddd-2220-0000-0000-00000000000d');
set local role authenticated;

\echo '== 10. signing in claims it (expect 12121212-2220-0000-0000-000000000001) =='
select * from public.claim_event_registrations();
reset role;

\echo '== 11. and it is their RSVP (expect going) =='
select status from public.event_rsvps
 where event_id = '12121212-2220-0000-0000-000000000001'
   and member_id = 'dddddddd-2220-0000-0000-00000000000d';

-- ================================================ who sees the guest list
select pg_temp.as_account('bbbbbbbb-2220-0000-0000-00000000000b');
set local role authenticated;
\echo '== 12. the organizer (expect Invited member | Member member | Stranger joining) =='
select name, state from public.event_guest_list('12121212-2220-0000-0000-000000000001') order by name;
reset role;

select pg_temp.as_account('aaaaaaaa-2220-0000-0000-00000000000a');
set local role authenticated;
\echo '== 13. an administrator (expect 3) =='
select count(*) as guests from public.event_guest_list('12121212-2220-0000-0000-000000000001');
reset role;

select pg_temp.as_account('cccccccc-2220-0000-0000-00000000000c');
set local role authenticated;
\echo '== 14. another member (expect ERROR: Only the event''s organizers see its guest list.) =='
savepoint outsider_list;
select count(*) from public.event_guest_list('12121212-2220-0000-0000-000000000001');
rollback to savepoint outsider_list;

\echo '== 15. nor the table (expect ERROR: permission denied for table event_registrations) =='
savepoint outsider_table;
select count(*) from public.event_registrations;
rollback to savepoint outsider_table;

\echo '== 16. but joins the event''s chat (expect t) =='
select public.chat_join_event_group('12121212-2220-0000-0000-000000000001') is not null as joined;
reset role;

set local role anon;
\echo '== 17. signed out: no guest list (expect ERROR: permission denied for function event_guest_list) =='
savepoint anon_list;
select count(*) from public.event_guest_list('12121212-2220-0000-0000-000000000001');
rollback to savepoint anon_list;

\echo '== 18. the public page still opens (expect Probe picnic) =='
select title from public.public_event('12121212-2220-0000-0000-000000000001');
reset role;

\echo '== 19. registrations still expire (expect 55 11 * * *) =='
select schedule from cron.job where jobname = 'event-registrations-expire';

rollback;
