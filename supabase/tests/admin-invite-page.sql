-- ============================================================================
-- Admin's invites a page at a time (20261103130000)
-- ============================================================================
-- admin_invite_page against the admin_invites view it pages: refused to
-- anybody but an administrator, every invite exactly once across the pages,
-- the same rows in the same order as the view, and one account lookup per row
-- of a page.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/admin-invite-page.sql
--
-- Every check prints PASS or stops the script with FAIL. Rolls back. Do not
-- point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

begin;
-- Counts function calls in this transaction (pg_stat_get_xact_function_calls).
set local track_functions = 'all';

-- created_at has no default there, and it is what the lookup returns.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, phone, created_at) values
  ('aaaaaaaa-1303-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@page.test',     now(), null, now() - interval '1 day'),
  ('aaaaaaaa-1303-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'peer@page.test',      now(), null, now() - interval '1 day'),
  -- Claimed a link sent to another address.
  ('aaaaaaaa-1303-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'claimer@relay.test',  now(), null, now() - interval '1 day'),
  -- Confirmed at an invited address; and one that never confirmed.
  ('aaaaaaaa-1303-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'invited-7@page.test', now(), null, now() - interval '1 day'),
  ('aaaaaaaa-1303-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'invited-8@page.test', null,  null, now() - interval '1 day'),
  -- Signed in with the phone of an old phone invite.
  ('aaaaaaaa-1303-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null,                  null,  '14085551303', now() - interval '1 day');

insert into public.members (id, type, status, display_name, birth_date, level_range, state, is_admin) values
  ('aaaaaaaa-1303-0000-0000-000000000001', 'mentor', 'active', 'Page admin', '1980-01-01', 'T1–T6', 'CA', true),
  ('aaaaaaaa-1303-0000-0000-000000000002', 'peer',   'active', 'Page peer',  '1980-01-01', 'T1–T6', 'CA', false);

-- 200 invites a minute apart, newest first by number, with 1-10 sharing one
-- time so the order has ties to break; every status; the account cases.
insert into public.invites (email, status, invited_by_member_id, created_at, revoked_at, consumed_at)
select 'invited-' || g || '@page.test',
       case g % 3 when 0 then 'pending' when 1 then 'consumed' else 'revoked' end,
       'aaaaaaaa-1303-0000-0000-000000000001',
       case when g <= 10 then now() + interval '1 day' else now() - g * interval '1 minute' end,
       case when g % 3 = 2 then now() end,
       case when g % 3 = 1 then now() end
  from generate_series(1, 200) g;
update public.invites set claimed_by = 'aaaaaaaa-1303-0000-0000-000000000003', claimed_at = now()
 where email = 'invited-20@page.test';
insert into public.invites (phone_raw, status, invited_by_member_id, created_at)
values ('(408) 555-1303', 'pending', 'aaaaaaaa-1303-0000-0000-000000000001', now() - interval '30 minutes');

create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;
create function pg_temp.refused(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlstate = expected then raise notice 'PASS: refused (%) %', sqlstate, statement; return; end if;
    raise;
  end;
  raise exception 'FAIL: accepted %', statement;
end $$;
create function pg_temp.as_member(member uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', member, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.lookups() returns bigint language sql as $$
  select coalesce(pg_stat_get_xact_function_calls(
    'private.account_created_at_for_invite(uuid, text)'::regprocedure), 0);
$$;

-- What each sees, read as the administrator and kept for the comparison.
select pg_temp.as_member('aaaaaaaa-1303-0000-0000-000000000001');
set local role authenticated;
create temp table view_rows as
  select row_number() over (order by created_at desc, id desc) as n, v.*
    from public.admin_invites v;
create temp table page_rows as select 0 as page, 0::bigint as n, p.* from public.admin_invite_page(0, 0) p limit 0;
do $$
declare
  k int := 0;
  got int;
begin
  loop
    insert into page_rows
      select k, k * 50 + row_number() over (), p.* from public.admin_invite_page(50, k * 50) p;
    get diagnostics got = row_count;
    exit when got = 0;
    k := k + 1;
  end loop;
end $$;
reset role;

\echo ''
\echo '== 1. nobody but an administrator =='
\echo 'expect: PASS refused (42501) x3: a member, an account with no member row, signed out'
select pg_temp.as_member('aaaaaaaa-1303-0000-0000-000000000002');
set local role authenticated;
select pg_temp.refused('select * from public.admin_invite_page()', '42501');
select pg_temp.as_member('aaaaaaaa-1303-0000-0000-000000000099');
select pg_temp.refused('select * from public.admin_invite_page()', '42501');
reset role;
set local role anon;
select pg_temp.refused('select * from public.admin_invite_page()', '42501');
reset role;

\echo ''
\echo '== 2. paging shows every invite exactly once =='
\echo 'expect: invites = view rows = paged rows = distinct = total; pages 50, 50, 50, 50, 3 (fresh stack: 2 seeded + 201 here)'
select (select count(*) from public.invites) as invites,
       (select count(*) from view_rows) as view_rows,
       (select count(*) from page_rows) as paged_rows,
       (select count(distinct id) from page_rows) as distinct_ids,
       (select min(total) || '-' || max(total) from page_rows) as total,
       (select string_agg(c::text, ', ' order by page) from (select page, count(*) c from page_rows group by page) x) as pages;
select pg_temp.check_true(
  (select count(*) from page_rows) = (select count(*) from public.invites)
  and (select count(distinct id) from page_rows) = (select count(*) from public.invites)
  and (select bool_and(total = (select count(*) from public.invites)) from page_rows),
  'every invite once, and total is the whole list');

\echo ''
\echo '== 3. the same rows as the view, in its order =='
\echo 'expect: only_in_view 0 | only_in_pages 0 | out_of_order 0'
create temp table compared as
select (select count(*) from (select id, phone, phone_raw, status, note, created_at, consumed_at, invited_by_organization,
         invited_by_member, invited_by_member_is_admin, claimable_name, seed_member_id, held_by,
         held_by_status, has_account, account_created_at, email, claimed_by, claimed_at, sent_at,
         joined_while_open, from_qr_code, qr_event_name from view_rows
          except select id, phone, phone_raw, status, note, created_at, consumed_at, invited_by_organization,
         invited_by_member, invited_by_member_is_admin, claimable_name, seed_member_id, held_by,
         held_by_status, has_account, account_created_at, email, claimed_by, claimed_at, sent_at,
         joined_while_open, from_qr_code, qr_event_name from page_rows) a) as only_in_view,
       (select count(*) from (select id, phone, phone_raw, status, note, created_at, consumed_at, invited_by_organization,
         invited_by_member, invited_by_member_is_admin, claimable_name, seed_member_id, held_by,
         held_by_status, has_account, account_created_at, email, claimed_by, claimed_at, sent_at,
         joined_while_open, from_qr_code, qr_event_name from page_rows
          except select id, phone, phone_raw, status, note, created_at, consumed_at, invited_by_organization,
         invited_by_member, invited_by_member_is_admin, claimable_name, seed_member_id, held_by,
         held_by_status, has_account, account_created_at, email, claimed_by, claimed_at, sent_at,
         joined_while_open, from_qr_code, qr_event_name from view_rows) b) as only_in_pages,
       (select count(*) from view_rows v join page_rows p using (id) where v.n <> p.n) as out_of_order;
select * from compared;
select pg_temp.check_true(
  (select only_in_view = 0 and only_in_pages = 0 and out_of_order = 0 from compared),
  'same rows and order as admin_invites');

\echo ''
\echo '== 4. the account cases came out as the view says =='
\echo 'expect: invited-20 t (claimed), invited-7 t (confirmed address), invited-8 f (unconfirmed), phone invite t, invited-9 f'
select coalesce(email::text, phone) as invite, has_account
  from page_rows
 where email in ('invited-20@page.test', 'invited-7@page.test', 'invited-8@page.test', 'invited-9@page.test')
    or phone = '14085551303'
 order by invite;
select pg_temp.check_true(
  (select string_agg(coalesce(email::text, phone) || '=' || has_account, ' ' order by coalesce(email::text, phone))
     from page_rows
    where email in ('invited-20@page.test', 'invited-7@page.test', 'invited-8@page.test', 'invited-9@page.test')
       or phone = '14085551303')
  = '14085551303=true invited-20@page.test=true invited-7@page.test=true invited-8@page.test=false invited-9@page.test=false',
  'claimed, confirmed and phone accounts found; unconfirmed and none not');

\echo ''
\echo '== 5. 50 by default, at most 200, and accounts looked up once per row of the page =='
\echo 'expect: default 50; asked 500 gets 200; page lookups 50; view lookups 2 x 203 = 406'
do $$
declare
  before_n bigint;
  page_lookups bigint;
  view_lookups bigint;
  default_n int;
  big_n int;
begin
  perform pg_temp.as_member('aaaaaaaa-1303-0000-0000-000000000001');
  set local role authenticated;
  select count(*) into default_n from public.admin_invite_page();
  select count(*) into big_n from public.admin_invite_page(500, 0);
  reset role;

  before_n := pg_temp.lookups();
  set local role authenticated;
  perform * from public.admin_invite_page(50, 0);
  reset role;
  page_lookups := pg_temp.lookups() - before_n;

  before_n := pg_temp.lookups();
  set local role authenticated;
  perform * from public.admin_invites;
  reset role;
  view_lookups := pg_temp.lookups() - before_n;

  raise notice 'got: default %, asked 500 got %, page lookups %, view lookups %',
    default_n, big_n, page_lookups, view_lookups;
  perform pg_temp.check_true(default_n = 50, 'default page is 50');
  perform pg_temp.check_true(big_n = least(200, (select count(*) from public.invites)), 'capped at 200');
  perform pg_temp.check_true(page_lookups = 50, 'one account lookup per row of the page');
end $$;

\echo ''
\echo 'PASS: admin_invite_page'
rollback;
