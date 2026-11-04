-- ============================================================================
-- Admin's invites a page at a time (20261103160000)
-- ============================================================================
-- admin_invite_page, admin_invite_counts and admin_join_tally against the
-- admin_invites view they replace in Admin: refused to anybody but an
-- administrator; 'listed' pages every invite not withdrawn exactly once, past
-- 1,000, with the view's rows in its order; 'withdrawn' groups by address as
-- the app's withdrawnInvites did (its cases are here now); the header's count
-- and the tally as the app's joinTally counted; one account lookup per row of
-- a page.
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
  ('aaaaaaaa-1303-0000-0000-000000000002', 'peer',   'active', 'Page peer',  '1980-01-01', 'T1–T6', 'CA', false),
  ('aaaaaaaa-1303-0000-0000-000000000007', 'mentor', 'active', 'Page Sam',   '1980-01-01', 'T1–T6', 'CA', true);

-- 1,300 invites a minute apart, 1-10 sharing one time so the order has ties
-- to break: one in five withdrawn, so more than 1,000 are on the list.
insert into public.invites (email, status, invited_by_member_id, created_at, revoked_at, consumed_at)
select 'invited-' || g || '@page.test',
       case when g % 5 = 0 then 'revoked' when g % 2 = 0 then 'pending' else 'consumed' end,
       'aaaaaaaa-1303-0000-0000-000000000001',
       case when g <= 10 then now() + interval '1 day' else now() - g * interval '1 minute' end,
       case when g % 5 = 0 then now() end,
       case when g % 5 <> 0 and g % 2 = 1 then now() end
  from generate_series(1, 1300) g;
update public.invites set claimed_by = 'aaaaaaaa-1303-0000-0000-000000000003', claimed_at = now()
 where email = 'invited-20@page.test';
insert into public.invites (phone_raw, status, invited_by_member_id, created_at)
values ('(408) 555-1303', 'pending', 'aaaaaaaa-1303-0000-0000-000000000001', now() - interval '30 minutes');

-- Withdrawn by address, the cases withdrawnInvites' tests had:
-- three cycles on one address (the newest, b, three times); an address
-- invited again; one blocked; an old phone invite under its number; an
-- address whose invite was used.
insert into public.invites (id, email, phone_raw, status, invited_by_member_id, created_at, revoked_at) values
  ('bbbbbbbb-1303-0000-0000-00000000000a', 'w-cycles@page.test', null, 'revoked', 'aaaaaaaa-1303-0000-0000-000000000001', now() - interval '9 days', now()),
  ('bbbbbbbb-1303-0000-0000-00000000000b', 'w-cycles@page.test', null, 'revoked', 'aaaaaaaa-1303-0000-0000-000000000001', now() - interval '5 days', now()),
  ('bbbbbbbb-1303-0000-0000-00000000000c', 'w-cycles@page.test', null, 'revoked', 'aaaaaaaa-1303-0000-0000-000000000001', now() - interval '7 days', now()),
  ('bbbbbbbb-1303-0000-0000-00000000000d', 'w-back@page.test',   null, 'revoked', 'aaaaaaaa-1303-0000-0000-000000000001', now() - interval '9 days', now()),
  ('bbbbbbbb-1303-0000-0000-00000000000e', 'w-blocked@page.test', null, 'revoked', 'aaaaaaaa-1303-0000-0000-000000000001', now() - interval '9 days', now()),
  ('bbbbbbbb-1303-0000-0000-00000000000f', null, '(408) 555-1304',     'revoked', 'aaaaaaaa-1303-0000-0000-000000000001', now() - interval '6 days', now()),
  ('bbbbbbbb-1303-0000-0000-000000000010', 'invited-1@page.test', null, 'revoked', 'aaaaaaaa-1303-0000-0000-000000000001', now() - interval '9 days', now());
insert into public.invites (id, email, status, invited_by_member_id)
values ('bbbbbbbb-1303-0000-0000-000000000011', 'w-back@page.test', 'pending', 'aaaaaaaa-1303-0000-0000-000000000001');
insert into public.blocked_emails (email) values ('w-blocked@page.test');

-- Joined while open, the cases joinTally's tests had: Expo from two
-- administrators' codes, "expo" kept apart, a code with no event, two
-- walk-ins; and three that do not count.
insert into public.qr_codes (id, admin_id, event_name, contact_email) values
  ('cccccccc-1303-0000-0000-000000000001', 'aaaaaaaa-1303-0000-0000-000000000001', 'Expo', 'admin@page.test'),
  ('cccccccc-1303-0000-0000-000000000002', 'aaaaaaaa-1303-0000-0000-000000000007', 'Expo', 'sam@page.test'),
  ('cccccccc-1303-0000-0000-000000000003', 'aaaaaaaa-1303-0000-0000-000000000001', 'expo', 'admin@page.test'),
  ('cccccccc-1303-0000-0000-000000000004', 'aaaaaaaa-1303-0000-0000-000000000001', null,   'admin@page.test');
insert into public.invites (email, status, invited_by_member_id, qr_code_id, joined_while_open, consumed_at, revoked_at)
select e, s, m::uuid, q::uuid, j, case when s = 'consumed' then now() end, case when s = 'revoked' then now() end
  from (values
    ('t-1@page.test', 'consumed', 'aaaaaaaa-1303-0000-0000-000000000007', 'cccccccc-1303-0000-0000-000000000002', true),
    ('t-2@page.test', 'consumed', 'aaaaaaaa-1303-0000-0000-000000000001', 'cccccccc-1303-0000-0000-000000000001', true),
    ('t-3@page.test', 'consumed', 'aaaaaaaa-1303-0000-0000-000000000001', 'cccccccc-1303-0000-0000-000000000001', true),
    ('t-4@page.test', 'consumed', 'aaaaaaaa-1303-0000-0000-000000000001', 'cccccccc-1303-0000-0000-000000000003', true),
    ('t-5@page.test', 'consumed', 'aaaaaaaa-1303-0000-0000-000000000001', 'cccccccc-1303-0000-0000-000000000004', true),
    ('t-6@page.test', 'consumed', 'aaaaaaaa-1303-0000-0000-000000000001', null, true),
    ('t-7@page.test', 'consumed', 'aaaaaaaa-1303-0000-0000-000000000001', null, true),
    ('t-8@page.test', 'pending',  'aaaaaaaa-1303-0000-0000-000000000001', 'cccccccc-1303-0000-0000-000000000001', true),
    ('t-9@page.test', 'revoked',  'aaaaaaaa-1303-0000-0000-000000000001', 'cccccccc-1303-0000-0000-000000000001', true),
    ('t-10@page.test', 'consumed', 'aaaaaaaa-1303-0000-0000-000000000001', 'cccccccc-1303-0000-0000-000000000001', false)
  ) v(e, s, m, q, j);

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

-- Read as the administrator and kept: the view, and every page of each part.
select pg_temp.as_member('aaaaaaaa-1303-0000-0000-000000000001');
set local role authenticated;
create temp table view_rows as select * from public.admin_invites;
create temp table page_rows as
  select ''::text as part, 0 as page, 0::bigint as n, p.* from public.admin_invite_page('listed', 0, 0) p limit 0;
do $$
declare
  part text;
  k int;
  got int;
begin
  foreach part in array array['listed', 'withdrawn'] loop
    k := 0;
    loop
      insert into page_rows
        select part, k, k * 50 + row_number() over (), p.* from public.admin_invite_page(part, 50, k * 50) p;
      get diagnostics got = row_count;
      exit when got = 0;
      k := k + 1;
    end loop;
  end loop;
end $$;
create temp table counted as select * from public.admin_invite_counts();
create temp table tally as select row_number() over () as n, t.* from public.admin_join_tally() t;
reset role;

-- withdrawnInvites, written again here as plainly as it reads.
create temp table withdrawn_expected as
with keyed as (
  select v.*, lower(coalesce(v.email::text, v.phone, v.id::text)) as key from view_rows v
)
select (array_agg(k.id order by k.created_at desc, k.id desc))[1] as id, count(*)::integer as times,
       max(k.created_at) as newest
  from keyed k
 where k.status = 'revoked'
   and k.key not in (select key from keyed where status <> 'revoked')
   and k.key not in (select lower(email::text) from public.blocked_emails)
 group by k.key;

\echo ''
\echo '== 1. nobody but an administrator =='
\echo 'expect: PASS refused (42501) x9: three functions, each as a member, an account with no member row, signed out'
do $$
declare
  f text;
  who text;
begin
  foreach f in array array['admin_invite_page()', 'admin_invite_counts()', 'admin_join_tally()'] loop
    foreach who in array array['aaaaaaaa-1303-0000-0000-000000000002', 'aaaaaaaa-1303-0000-0000-000000000099', 'anon'] loop
      if who = 'anon' then
        set local role anon;
      else
        perform pg_temp.as_member(who::uuid);
        set local role authenticated;
      end if;
      perform pg_temp.refused('select * from public.' || f, '42501');
      reset role;
    end loop;
  end loop;
end $$;
\echo 'expect: PASS refused (22023) for a part that does not exist'
select pg_temp.as_member('aaaaaaaa-1303-0000-0000-000000000001');
set local role authenticated;
select pg_temp.refused('select * from public.admin_invite_page(''everything'')', '22023');
reset role;

\echo ''
\echo '== 2. The list: every invite not withdrawn, exactly once, past 1,000 =='
\echo 'expect: on_list = paged = distinct = total, over 1,000; 50 a page, the last shorter'
select (select count(*) from view_rows where status <> 'revoked') as on_list,
       (select count(*) from page_rows where part = 'listed') as paged,
       (select count(distinct id) from page_rows where part = 'listed') as distinct_ids,
       (select min(total) || '-' || max(total) from page_rows where part = 'listed') as total,
       (select max(page) + 1 from page_rows where part = 'listed') as pages,
       (select count(*) from page_rows where part = 'listed' and page = (select max(page) from page_rows where part = 'listed')) as last_page;
select pg_temp.check_true(
  (select count(*) from page_rows where part = 'listed') = (select count(*) from view_rows where status <> 'revoked')
  and (select count(distinct id) from page_rows where part = 'listed') = (select count(*) from view_rows where status <> 'revoked')
  and (select bool_and(total = (select count(*) from view_rows where status <> 'revoked')) from page_rows where part = 'listed')
  and (select count(*) from view_rows where status <> 'revoked') > 1000
  and not exists (select 1 from page_rows where part = 'listed' and status = 'revoked'),
  'every listed invite once, more than 1,000, nothing withdrawn');

\echo ''
\echo '== 3. every row is the view''s row, in its order =='
\echo 'expect: differ 0 | out_of_order 0 (listed), differ 0 (withdrawn)'
create temp table compared as
select (select count(*) from page_rows p join view_rows v using (id)
         where (p.phone, p.phone_raw, p.status, p.note, p.created_at, p.consumed_at, p.invited_by_organization,
                p.invited_by_member, p.invited_by_member_is_admin, p.claimable_name, p.seed_member_id, p.held_by,
                p.held_by_status, p.has_account, p.account_created_at, p.email, p.claimed_by, p.claimed_at,
                p.sent_at, p.joined_while_open, p.from_qr_code, p.qr_event_name)
           is distinct from
               (v.phone, v.phone_raw, v.status, v.note, v.created_at, v.consumed_at, v.invited_by_organization,
                v.invited_by_member, v.invited_by_member_is_admin, v.claimable_name, v.seed_member_id, v.held_by,
                v.held_by_status, v.has_account, v.account_created_at, v.email, v.claimed_by, v.claimed_at,
                v.sent_at, v.joined_while_open, v.from_qr_code, v.qr_event_name)) as differ,
       (select count(*) from page_rows p
          join (select id, row_number() over (order by created_at desc, id desc) as n
                  from view_rows where status <> 'revoked') v using (id)
         where p.part = 'listed' and p.n <> v.n) as out_of_order,
       (select count(*) from page_rows p where p.id not in (select id from view_rows)) as unknown;
select * from compared;
select pg_temp.check_true((select differ = 0 and out_of_order = 0 and unknown = 0 from compared),
  'the view''s rows, in its order');

\echo ''
\echo '== 4. Withdrawn: by address, as withdrawnInvites grouped them =='
\echo 'expect: only_expected 0 | only_paged 0 | wrong_times 0 | out_of_order 0; total = groups'
create temp table withdrawn_compared as
select (select count(*) from withdrawn_expected e where e.id not in (select id from page_rows where part = 'withdrawn')) as only_expected,
       (select count(*) from page_rows p where p.part = 'withdrawn' and p.id not in (select id from withdrawn_expected)) as only_paged,
       (select count(*) from page_rows p join withdrawn_expected e using (id) where p.part = 'withdrawn' and p.times <> e.times) as wrong_times,
       (select count(*) from page_rows p
          join (select id, row_number() over (order by newest desc, id desc) as n from withdrawn_expected) e using (id)
         where p.part = 'withdrawn' and p.n <> e.n) as out_of_order,
       (select count(*) from withdrawn_expected) as groups,
       (select max(total) from page_rows where part = 'withdrawn') as total;
select * from withdrawn_compared;
select pg_temp.check_true(
  (select only_expected = 0 and only_paged = 0 and wrong_times = 0 and out_of_order = 0 and groups = total
     from withdrawn_compared),
  'withdrawn grouped as before');
\echo 'expect: w-cycles once, its newest (b), 3 times; the phone invite once; none of w-back, w-blocked, invited-1'
select coalesce(email::text, phone) as address, right(id::text, 2) as id_end, times
  from page_rows
 where part = 'withdrawn'
   and (email::text like 'w-%' or phone = '14085551304' or email = 'invited-1@page.test')
 order by address;
select pg_temp.check_true(
  (select string_agg(coalesce(email::text, phone) || ':' || right(id::text, 2) || 'x' || times, ' '
                     order by coalesce(email::text, phone))
     from page_rows
    where part = 'withdrawn'
      and (email::text like 'w-%' or phone = '14085551304' or email = 'invited-1@page.test'))
  = '14085551304:0fx1 w-cycles@page.test:0bx3',
  'newest of three, the phone under its number; re-invited, blocked and used addresses left out');

\echo ''
\echo '== 5. the header''s count =='
\echo 'expect: pending = the view''s pending invites'
select (select pending from counted) as pending, (select count(*) from view_rows where status = 'pending') as view_pending;
select pg_temp.check_true(
  (select pending from counted) = (select count(*) from view_rows where status = 'pending'),
  'pending as the view counts');

\echo ''
\echo '== 6. the tally, as joinTally counted =='
\echo 'expect: Expo 3 [Page admin 2, Page Sam 1] | expo 1 [Page admin 1] | (no event) 1 [Page admin 1] | walk-ins 2 []'
select n, walk_ins, event_name, joined, by_admin from tally order by n;
select pg_temp.check_true(
  (select string_agg(
            case when walk_ins then 'walk-ins' else coalesce(event_name, '(no event)') end || ' ' || joined || ' ['
            || coalesce((select string_agg((a->>'name') || ' ' || (a->>'joined'), ', ' order by o)
                           from jsonb_array_elements(by_admin) with ordinality x(a, o)), '') || ']',
            ' | ' order by n)
     from tally)
  = 'Expo 3 [Page admin 2, Page Sam 1] | expo 1 [Page admin 1] | (no event) 1 [Page admin 1] | walk-ins 2 []',
  'by event then administrator, most first, walk-ins last; pending, withdrawn and real invites left out');

\echo ''
\echo '== 7. the account cases came out as the view says =='
\echo 'expect: invited-20 t (claimed, withdrawn), invited-7 t (confirmed address), invited-8 f (unconfirmed), phone invite t, invited-9 f'
select pg_temp.check_true(
  (select string_agg(coalesce(email::text, phone) || '=' || has_account, ' ' order by coalesce(email::text, phone))
     from page_rows
    where email in ('invited-20@page.test', 'invited-7@page.test', 'invited-8@page.test', 'invited-9@page.test')
       or phone = '14085551303')
  = '14085551303=true invited-20@page.test=true invited-7@page.test=true invited-8@page.test=false invited-9@page.test=false',
  'claimed, confirmed and phone accounts found; unconfirmed and none not');

\echo ''
\echo '== 8. 50 by default, at most 200, and accounts looked up once per row of the page =='
\echo 'expect: default 50; asked 500 gets 200; listed page lookups 50; withdrawn page lookups 50'
do $$
declare
  before_n bigint;
  listed_lookups bigint;
  withdrawn_lookups bigint;
  default_n int;
  big_n int;
begin
  perform pg_temp.as_member('aaaaaaaa-1303-0000-0000-000000000001');
  set local role authenticated;
  select count(*) into default_n from public.admin_invite_page();
  select count(*) into big_n from public.admin_invite_page('listed', 500, 0);
  reset role;

  before_n := pg_temp.lookups();
  set local role authenticated;
  perform * from public.admin_invite_page('listed', 50, 0);
  reset role;
  listed_lookups := pg_temp.lookups() - before_n;

  before_n := pg_temp.lookups();
  set local role authenticated;
  perform * from public.admin_invite_page('withdrawn', 50, 0);
  reset role;
  withdrawn_lookups := pg_temp.lookups() - before_n;

  raise notice 'got: default %, asked 500 got %, listed lookups %, withdrawn lookups %',
    default_n, big_n, listed_lookups, withdrawn_lookups;
  perform pg_temp.check_true(default_n = 50, 'default page is 50');
  perform pg_temp.check_true(big_n = 200, 'capped at 200');
  perform pg_temp.check_true(listed_lookups = 50 and withdrawn_lookups = 50,
    'one account lookup per row of the page');
end $$;

\echo ''
\echo 'PASS: admin invites a page at a time'
rollback;
