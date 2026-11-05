-- ============================================================================
-- Probe: a password reset link proves the address (20261104120000)
-- ============================================================================
-- Every check prints PASS or raises FAIL; a refusal prints its SQLSTATE.
-- Auth empties recovery_token when a link is used; this does the same.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/reset-link-proves-email.sql
--
-- One transaction, rolled back.
-- ============================================================================

\set ON_ERROR_STOP on
\set VERBOSITY terse
\pset pager off

begin;

create function pg_temp.id(who text) returns uuid language sql as $$
  select ('aaaaaaaa-1107-0000-0000-00000000000'
          || case who when 'u' then '1' when 'p' then '2' when 'h' then '3' when 'k' then '4' when 'o' then '5' end)::uuid;
$$;

-- u unproven, p proven, h unproven with a hand-off, k unproven with a pairing,
-- o unproven with a hand-off two days ago.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password, recovery_token)
select pg_temp.id(x), '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'reset-' || x || '@probe.test', now(), 'hash-' || x, 'token-' || x
  from unnest(array['u', 'p', 'h', 'k', 'o']) x;
insert into public.members (id, type, status, display_name, birth_date, level_range, state, is_admin)
select pg_temp.id(x), 'peer', 'active', 'Probe ' || x, '1980-01-01', 'T1–T6', 'CA', false
  from unnest(array['u', 'p', 'h', 'k', 'o']) x;
insert into private.unproven_emails (account)
select pg_temp.id(x) from unnest(array['u', 'h', 'k', 'o']) x;
insert into auth.sessions (id, user_id)
select gen_random_uuid(), pg_temp.id(x) from unnest(array['u', 'p', 'h', 'k', 'o']) x;

insert into public.organizations (id, short_code, name, joins_need_approval)
values ('bbbbbbbb-1107-0000-0000-000000000001', 'RSTX', 'Probe Reset Org', false);
insert into public.events (id, title, start_time, organization_id, audience)
values ('cccccccc-1107-0000-0000-000000000001', 'Probe reset meet-up', now() + interval '3 days',
        'bbbbbbbb-1107-0000-0000-000000000001', 'club');
insert into public.event_registrations (event_id, name, email, phone, status)
values ('cccccccc-1107-0000-0000-000000000001', 'The address''s owner', 'reset-u@probe.test', '5550100', 'going');

insert into public.home_screen_handoffs (code_hash, user_id, expires_at)
values (encode(extensions.digest('probe-code', 'sha256'), 'hex'), pg_temp.id('h'), now() + interval '5 minutes');
insert into public.home_screen_pairings (pairing_hash, user_id, expires_at)
values (encode(extensions.digest('probe-pairing', 'sha256'), 'hex'), pg_temp.id('k'), now() + interval '5 minutes');
insert into private.home_screen_sign_ins (account, at) values (pg_temp.id('o'), now() - interval '2 days');

create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;
create function pg_temp.refused_as_member(statement text, expected text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id('u'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  execute statement;
  reset role;
  raise exception 'FAIL: accepted %', statement;
exception when others then
  reset role;
  if sqlstate = expected then raise notice 'PASS: refused (%) %', sqlstate, left(statement, 80); return; end if;
  raise;
end $$;
create function pg_temp.unproven(who text) returns boolean language sql as $$
  select exists (select 1 from private.unproven_emails where account = pg_temp.id(who));
$$;
create function pg_temp.sessions(who text) returns bigint language sql as $$
  select count(*) from auth.sessions where user_id = pg_temp.id(who);
$$;
create function pg_temp.use_link(who text) returns void language sql as $$
  update auth.users set recovery_token = '' where id = pg_temp.id(who);
$$;

\echo '== nobody notes a hand-off themselves =='
select pg_temp.refused_as_member($q$select private.note_home_screen_sign_in('aaaaaaaa-1107-0000-0000-000000000001')$q$, '42501');
select pg_temp.refused_as_member($q$select * from private.home_screen_sign_ins$q$, '42501');

\echo '== a new link proves nothing =='
update auth.users set recovery_token = 'token-u2' where id = pg_temp.id('u');
select pg_temp.check_true(pg_temp.unproven('u') and pg_temp.sessions('u') = 1, 'a token replaced is not a link used');

\echo '== the reset link =='
select pg_temp.use_link('u');
select pg_temp.check_true(not pg_temp.unproven('u'), 'using it proves the address');
select pg_temp.check_true(pg_temp.sessions('u') = 0, 'and ends every session from before it');
select pg_temp.check_true(
  (select member_id from public.event_registrations where email = 'reset-u@probe.test') = pg_temp.id('u'),
  'and the registration made with it is theirs');
select pg_temp.use_link('p');
select pg_temp.check_true(pg_temp.sessions('p') = 1, 'a proved account keeps its sessions');

\echo '== the Home Screen hand-off is not a reset link =='
select pg_temp.check_true(public.redeem_home_screen_handoff('probe-code') = 'reset-h@probe.test', 'a hand-off redeemed');
select pg_temp.use_link('h');
select pg_temp.check_true(pg_temp.unproven('h') and pg_temp.sessions('h') = 1, 'and its token proves nothing');
select pg_temp.check_true(public.redeem_home_screen_pairing('probe-pairing') = 'reset-k@probe.test', 'a pairing redeemed');
select pg_temp.use_link('k');
select pg_temp.check_true(pg_temp.unproven('k') and pg_temp.sessions('k') = 1, 'nor does a pairing''s');
select pg_temp.use_link('o');
select pg_temp.check_true(not pg_temp.unproven('o') and pg_temp.sessions('o') = 0,
  'a hand-off over a day before does not stand in the way');

\echo '== done: every line above PASS =='
rollback;
