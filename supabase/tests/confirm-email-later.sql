-- ============================================================================
-- Probe: confirming your email once you are in (20261104110000)
-- ============================================================================
-- Every check prints PASS or raises FAIL; a refusal prints its SQLSTATE.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/confirm-email-later.sql
--
-- One transaction, rolled back.
-- ============================================================================

\set ON_ERROR_STOP on
\set VERBOSITY terse
\pset pager off

begin;

create function pg_temp.id(who text) returns uuid language sql as $$
  select ('aaaaaaaa-1106-0000-0000-00000000000'
          || case who when 'u' then '1' when 'p' then '2' when 'g' then '3' when 'h' then '4' end)::uuid;
$$;

-- u unproven (in by a code), p proven, g unproven then Google, h org admin hosting.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password)
select pg_temp.id(x), '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'later-' || x || '@probe.test', now(), 'hash-' || x
  from unnest(array['u', 'p', 'g', 'h']) x;
insert into public.members (id, type, status, display_name, birth_date, level_range, state, is_admin)
select pg_temp.id(x), 'peer', 'active',
       'Probe ' || x, '1980-01-01', 'T1–T6', 'CA', false
  from unnest(array['u', 'p', 'g', 'h']) x;

insert into public.organizations (id, short_code, name, joins_need_approval)
values ('bbbbbbbb-1106-0000-0000-000000000001', 'LTRX', 'Probe Later Org', false);
insert into public.organization_representatives (organization_id, member_id)
values ('bbbbbbbb-1106-0000-0000-000000000001', 'aaaaaaaa-1106-0000-0000-000000000004');
insert into public.events (id, title, start_time, organization_id, audience)
values ('cccccccc-1106-0000-0000-000000000001', 'Probe later meet-up', now() + interval '3 days',
        'bbbbbbbb-1106-0000-0000-000000000001', 'club');
insert into public.event_rsvps (event_id, member_id, status) values
  ('cccccccc-1106-0000-0000-000000000001', 'aaaaaaaa-1106-0000-0000-000000000001', 'going'),
  ('cccccccc-1106-0000-0000-000000000001', 'aaaaaaaa-1106-0000-0000-000000000002', 'going');
-- Made on the public page with u's address, before u's account.
insert into public.event_registrations (event_id, name, email, phone, status)
values ('cccccccc-1106-0000-0000-000000000001', 'The address''s owner', 'later-u@probe.test', '5550100', 'going');

create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;
create function pg_temp.as_member(member text, statement text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id(member), 'role', 'authenticated')::text, true);
  set local role authenticated;
  execute statement;
  reset role;
exception when others then
  reset role;
  raise;
end $$;
create function pg_temp.refused_as(member text, statement text, expected text) returns void language plpgsql as $$
begin
  perform pg_temp.as_member(member, statement);
  raise exception 'FAIL: accepted as % %', member, statement;
exception when others then
  if sqlstate = expected then raise notice 'PASS: refused (%) as % %', sqlstate, member, left(statement, 80); return; end if;
  raise;
end $$;
create function pg_temp.unproven_as(member text) returns text language plpgsql as $$
declare found text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id(member), 'role', 'authenticated')::text, true);
  set local role authenticated;
  found := public.my_unproven_email();
  reset role;
  return found;
end $$;
create function pg_temp.guest_email(who text) returns text language plpgsql as $$
declare found text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id('h'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  select g.email into found from public.event_guest_list('cccccccc-1106-0000-0000-000000000001') g
   where g.name = 'Probe ' || who;
  reset role;
  return found;
end $$;

\echo '== only invite-signup notes one, and only the functions read the codes =='
select pg_temp.refused_as('u', $q$select public.note_unproven_email('aaaaaaaa-1106-0000-0000-000000000001')$q$, '42501');
select pg_temp.refused_as('u', $q$select public.start_email_proof('aaaaaaaa-1106-0000-0000-000000000001', 'x')$q$, '42501');
select pg_temp.refused_as('u', $q$select public.finish_email_proof('aaaaaaaa-1106-0000-0000-000000000001', 'x')$q$, '42501');
select pg_temp.refused_as('u', $q$select * from private.unproven_emails$q$, '42501');
select pg_temp.check_true(public.note_unproven_email(pg_temp.id('u')), 'noted, for invite-signup');
select pg_temp.check_true(public.note_unproven_email(pg_temp.id('g')), 'and another');

\echo '== Me =='
select pg_temp.check_true(pg_temp.unproven_as('u') = 'later-u@probe.test', 'Me asks them to confirm their address');
select pg_temp.check_true(pg_temp.unproven_as('p') is null, 'and nobody whose address is proved');

\echo '== waiting for the proof =='
select pg_temp.check_true(pg_temp.guest_email('u') is null, 'the host does not see the unproved address');
select pg_temp.check_true(pg_temp.guest_email('p') = 'later-p@probe.test', 'and sees a proved one');
select pg_temp.check_true(
  (select count(*) from private.claim_event_registrations_for(pg_temp.id('u'))) = 0
  and (select member_id from public.event_registrations where email = 'later-u@probe.test') is null,
  'a registration made with the address is not claimed');

\echo '== the code =='
select pg_temp.check_true(public.start_email_proof(pg_temp.id('p'), 'h1') is null, 'no code for a proved address');
select pg_temp.check_true(public.start_email_proof(pg_temp.id('u'), 'h1') = 'later-u@probe.test', 'a code goes to their own address');
select pg_temp.check_true(public.start_email_proof(pg_temp.id('u'), 'h2') is null, 'not another within a minute');
select pg_temp.check_true(not public.finish_email_proof(pg_temp.id('u'), 'wrong'), 'a wrong code is refused');
select pg_temp.check_true(not public.finish_email_proof(pg_temp.id('p'), 'h1'), 'and one for somebody else');
select pg_temp.check_true(pg_temp.unproven_as('u') is not null, 'still to confirm');
select pg_temp.check_true(public.finish_email_proof(pg_temp.id('u'), 'h1'), 'the right one proves it');
select pg_temp.check_true(pg_temp.unproven_as('u') is null, 'and Me stops asking');
select pg_temp.check_true(pg_temp.guest_email('u') = 'later-u@probe.test', 'the host sees it now');
select pg_temp.check_true(
  (select member_id from public.event_registrations where email = 'later-u@probe.test') = pg_temp.id('u'),
  'and the registration is theirs');
select pg_temp.check_true(not public.finish_email_proof(pg_temp.id('u'), 'h1'), 'a code works once');

\echo '== five tries =='
update private.email_proofs set sent_at = now() - interval '2 minutes';
select pg_temp.check_true(public.start_email_proof(pg_temp.id('g'), 'g1') is not null, 'a code for g');
select public.finish_email_proof(pg_temp.id('g'), 'bad') from generate_series(1, 5);
select pg_temp.check_true(not public.finish_email_proof(pg_temp.id('g'), 'g1'), 'five wrong and the right one is refused');

\echo '== Google or Apple proves it =='
insert into auth.sessions (id, user_id) values (gen_random_uuid(), pg_temp.id('g'));
insert into auth.identities (provider_id, user_id, identity_data, provider)
values ('google-elsewhere', pg_temp.id('g'), '{"email": "someone-else@probe.test"}', 'google');
select pg_temp.check_true(pg_temp.unproven_as('g') is not null, 'not at another address');
insert into auth.identities (provider_id, user_id, identity_data, provider)
values ('google-g', pg_temp.id('g'), '{"email": "Later-G@probe.test"}', 'google');
select pg_temp.check_true(pg_temp.unproven_as('g') is null, 'at its own address it is proved');
select pg_temp.check_true(
  (select encrypted_password from auth.users where id = pg_temp.id('g')) is null,
  'and the password made without it is gone');
select pg_temp.check_true(
  not exists (select 1 from auth.sessions where user_id = pg_temp.id('g')),
  'and every session before it ended');
select pg_temp.check_true(
  (select encrypted_password from auth.users where id = pg_temp.id('p')) = 'hash-p',
  'nobody else''s password changed');

\echo '== done: every line above PASS =='
rollback;
