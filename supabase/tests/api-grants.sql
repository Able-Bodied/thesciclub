-- ============================================================================
-- What can a signed-in member, or nobody at all, reach that they should not?
-- ============================================================================
-- The grants half of the Supabase advisor's findings, fixed 2026-10-01 in
-- 20261003020000 to 20261003070000. The one that did real harm first: views
-- were writable, so a member could rewrite or delete another member's row
-- through browse_members. Then the oracles — whether a number is invited, how
-- many strikes stand against somebody — and the functions that should not be
-- on the API at all.
--
-- Run as real signed-in roles and as anon, not as the superuser: postgres is
-- BYPASSRLS and owns everything, so every refusal here would be inert. Every
-- expected refusal sits in its own savepoint. The superuser only writes the
-- rows, before the first role switch, and reads the catalog in 13 and 14.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/api-grants.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin, show_in_browse)
values
  ('aaaaaaaa-4444-0000-0000-00000000000a', 'peer', 'active', 'The Admin', '19990000040', '1980-01-01', 'T1–T6', 'CA', true,  true),
  ('cccccccc-4444-0000-0000-00000000000c', 'peer', 'active', 'Target',    '19990000041', '1982-01-01', 'C5–C8', 'CA', false, true),
  ('dddddddd-4444-0000-0000-00000000000d', 'peer', 'active', 'Nosy',      '19990000042', '1983-01-01', 'C5–C8', 'CA', false, true);

insert into public.member_strikes (member_id, reason, issued_by)
values ('cccccccc-4444-0000-0000-00000000000c', 'Sold supplements in a room', 'aaaaaaaa-4444-0000-0000-00000000000a');

-- A number on the list that has not joined, for 9 and 12.
insert into public.invites (phone_raw, invited_by_organization_id)
select '4085550440', id from public.organizations where short_code = 'NCS';

select set_config('request.jwt.claims',
  '{"sub":"dddddddd-4444-0000-0000-00000000000d","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 0. we are a signed-in member, not an administrator (expect authenticated | f) =='
select current_user, public.is_admin() as admin;

\echo ''
\echo '== 1. rewriting another member through browse_members (expect ERROR: permission denied for view) =='
\echo '   Before 20261003020000 this was UPDATE 1.'
savepoint browse_update;
update public.browse_members set bio = 'written by Nosy' where id = 'cccccccc-4444-0000-0000-00000000000c';
rollback to savepoint browse_update;

\echo ''
\echo '== 2. deleting another member through chat_authors (expect ERROR: permission denied for view) =='
\echo '   Before 20261003020000 this was DELETE 1.'
savepoint authors_delete;
delete from public.chat_authors where id = 'cccccccc-4444-0000-0000-00000000000c';
rollback to savepoint authors_delete;

\echo ''
\echo '== 3. the table itself still refuses, by policy (expect UPDATE 0) =='
update public.members set bio = 'written by Nosy' where id = 'cccccccc-4444-0000-0000-00000000000c';

\echo ''
\echo '== 4. the views still read (expect t) =='
select count(*) > 0 as reads from public.browse_members where id = 'cccccccc-4444-0000-0000-00000000000c';

\echo ''
\echo '== 5. a stranger asks how many strikes, and invites (expect null | null) =='
\echo '   Before 20261003050000 this was 1: strikes are private from other members.'
select public.active_strike_count('cccccccc-4444-0000-0000-00000000000c') as strikes,
       public.live_invite_count('cccccccc-4444-0000-0000-00000000000c') as invites;

\echo ''
\echo '== 6. nor whether a number is invited (expect ERROR: permission denied for function) =='
savepoint oracle;
select public.has_active_invite('4085550440');
rollback to savepoint oracle;

\echo ''
\echo '== 7. the member asks about themself (expect 1 | 0) =='
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-4444-0000-0000-00000000000c","role":"authenticated"}', true) is not null as ok;
select public.active_strike_count(auth.uid()) as strikes, public.live_invite_count(auth.uid()) as invites;

\echo ''
\echo '== 8. an administrator reads the roster (expect 1 | 0) =='
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-4444-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
select strikes, invites_used from public.admin_members where id = 'cccccccc-4444-0000-0000-00000000000c';

\echo ''
\echo '== 9. and cannot write through it either (expect ERROR: permission denied for view) =='
savepoint admin_update;
update public.admin_members set display_name = 'renamed' where id = 'cccccccc-4444-0000-0000-00000000000c';
rollback to savepoint admin_update;

\echo ''
\echo '== 10. a number signing in asks about itself only (expect t, then f) =='
select set_config('request.jwt.claims',
  '{"sub":"44044044-0000-0000-0000-000000000440","role":"authenticated","phone":"14085550440"}', true) is not null as ok;
select public.my_number_is_invited() as invited;
select set_config('request.jwt.claims',
  '{"sub":"44144144-0000-0000-0000-000000000441","role":"authenticated","phone":"14085550441"}', true) is not null as ok;
select public.my_number_is_invited() as invited;

\echo ''
\echo '== 11. the invited number joins, and the trigger still consumes the invite =='
\echo '   expect: INSERT 0 1, then consumed (read by the administrator, through'
\echo '   admin_invites: nobody else can read the invites table)'
select set_config('request.jwt.claims',
  '{"sub":"44044044-0000-0000-0000-000000000440","role":"authenticated","phone":"14085550440"}', true) is not null as ok;
insert into public.members (id, type, display_name, phone, birth_date, level_range, state)
values ('44044044-0000-0000-0000-000000000440', 'peer', 'Joiner', '14085550440', '1990-01-01', 'C5–C8', 'CA');
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-4444-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
select status from public.admin_invites where phone = '14085550440';

\echo ''
\echo '== 12. signed out (expect ERROR, ERROR, ERROR, ERROR, then t) =='
\echo '   the signup hook, a strike count, nearby_events, browse_members; then'
\echo '   the one view anon may read, because events are public'
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true) is not null as ok;
savepoint anon_hook;
select public.before_user_created('{"user":{"phone":"14085550440"}}');
rollback to savepoint anon_hook;
savepoint anon_strikes;
select public.active_strike_count('cccccccc-4444-0000-0000-00000000000c');
rollback to savepoint anon_strikes;
savepoint anon_nearby;
select * from public.nearby_events(37.3, -121.9, 50);
rollback to savepoint anon_nearby;
savepoint anon_browse;
select count(*) from public.browse_members;
rollback to savepoint anon_browse;
select count(*) >= 0 as reads from public.event_rsvp_counts;

reset role;

\echo ''
\echo '== 13. no view grants anon or authenticated anything but select (expect 0 rows) =='
select c.relname, r.rolname, p.privilege
  from pg_class c
 cross join (values ('anon'), ('authenticated')) as r(rolname)
 cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(privilege)
 where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
   and has_table_privilege(r.rolname, c.oid, p.privilege);

\echo ''
\echo '== 14. every gated view is a security barrier (expect one row: event_rsvp_counts) =='
\echo '   event_rsvp_counts is ungated on purpose; any other name here lost the'
\echo '   option, most likely to a create or replace view.'
select relname from pg_class
 where relnamespace = 'public'::regnamespace and relkind = 'v'
   and not coalesce('security_barrier=true' = any(reloptions), false);

rollback;
