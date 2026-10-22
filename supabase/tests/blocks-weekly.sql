-- ============================================================================
-- A weekly count of blocks, for administrators (20261022090000)
-- ============================================================================
-- Ada, Bo and Cy are members; Ivy and Max are administrators (Max has New
-- reports switched off); Pat is a paused administrator.
--
--   1. a member cannot run the job, nor can anon
--   2. no block in the last seven days: nothing recorded and nothing sent
--   3. three members blocked this week: one row per active administrator,
--      saying 3 and naming nobody; a second run adds nothing
--   4. the list: an administrator's opens Admin → Reports → Blocks; a
--      member's is never listed
--   5. the lock screen: administrators' devices only, not Max's, no names
--
-- Run it against a local stack (never the hosted project):
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/blocks-weekly.sql
--
-- One transaction, rolled back. Each step raises if it fails and prints PASS
-- if it holds; each expected refusal is its own sub-block. The job runs as
-- the superuser, as pg_cron runs it; everything else as a signed-in role.
-- ============================================================================
\set ON_ERROR_STOP off
\pset pager off
begin;

select decrypted_secret as secret from vault.decrypted_secrets where name = 'push_notify_secret' \gset
-- A fresh stack has no push_notify_url; the discard port, rolled back.
select count(vault.create_secret('http://127.0.0.1:9/discard', 'push_notify_url')) as url_made
  from (select 1) one
 where not exists (select 1 from vault.decrypted_secrets where name = 'push_notify_url');

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, show_in_browse, is_admin)
values
('b10c7000-0000-0000-0000-00000000000a','peer','active','Ada Weekly','19990227001','1980-01-01','T1–T6','CA',true,false),
('b10c7000-0000-0000-0000-00000000000b','peer','active','Bo Weekly','19990227002','1980-01-01','T1–T6','CA',true,false),
('b10c7000-0000-0000-0000-00000000000c','peer','active','Cy Weekly','19990227003','1980-01-01','T1–T6','CA',true,false),
('b10c7000-0000-0000-0000-00000000000d','peer','active','Ivy Weekly','19990227004','1980-01-01','T1–T6','CA',true,true),
('b10c7000-0000-0000-0000-00000000000e','peer','active','Max Weekly','19990227005','1980-01-01','T1–T6','CA',true,true),
('b10c7000-0000-0000-0000-00000000000f','peer','suspended','Pat Weekly','19990227006','1980-01-01','T1–T6','CA',true,true);
insert into public.push_subscriptions (endpoint, member_id, p256dh, auth)
select 'https://web.push.apple.com/b10c7' || right(id::text, 1), id,
       'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
       'tBHItJI5svbpez7KI4CCXg'
  from public.members where phone like '1999022700%';
insert into public.push_muted_kinds (member_id, kind)
values ('b10c7000-0000-0000-0000-00000000000e', 'report');
-- Whatever this stack already holds is older than a week, here.
update public.chat_reports set created_at = now() - interval '30 days' where kind = 'block';
-- Bo blocked Cy eight days ago: last week, not this one.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b10c7000-0000-0000-0000-00000000000b","role":"authenticated"}', true) is not null as bo;
select public.block_member('b10c7000-0000-0000-0000-00000000000c');
reset role;
update public.chat_reports set created_at = now() - interval '8 days'
 where kind = 'block' and reporter_id = 'b10c7000-0000-0000-0000-00000000000b';

\echo ''
\echo '== 0. a signed-in member, not the superuser =='
\echo '   expect: authenticated | b10c7...000a | f'
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b10c7000-0000-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ada;
select current_user, auth.uid(), public.is_admin() as admin;

\echo ''
\echo '== 1. only the job runs the job =='
\echo '   expect: PASS 1 (Ada and anon refused)'
do $$
begin
  begin
    perform public.blocks_weekly_notify();
    raise exception 'a member ran the weekly job';
  exception when insufficient_privilege then null;
  end;
  assert not has_function_privilege('anon', 'public.blocks_weekly_notify()', 'execute'), 'anon may run it';
  assert not has_function_privilege('authenticated', 'public.blocks_weekly_notify()', 'execute'), 'members may run it';
  raise notice 'PASS 1: a member and anon cannot run the weekly job';
end;
$$;

\echo ''
\echo '== 2. no block in the last seven days: skipped =='
\echo '   expect: PASS 2 (no row, no request)'
reset role;
select count(*) as before_queue from net.http_request_queue \gset
select public.blocks_weekly_notify();
do $$
begin
  assert (select count(*) from public.notifications where kind = 'blocks_weekly') = 0,
    'a quiet week recorded a notification';
  assert (select count(*) from net.http_request_queue
           where convert_from(body, 'utf8')::jsonb ->> 'event' = 'blocks_weekly') = 0,
    'a quiet week sent a push';
  raise notice 'PASS 2: a week with no new block records and sends nothing';
end;
$$;

\echo ''
\echo '== 3. three members blocked this week, to administrators, naming nobody =='
\echo '   expect: PASS 3 (one row each for the active administrators, detail 3,'
\echo '   no actor or place; a second run changes nothing; one request a run)'
-- Ada blocks Cy, Bo blocks Cy again (one member, counted once), Cy blocks
-- Ada and takes it back (still counted), Ivy blocks Bo: Cy, Ada and Bo.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b10c7000-0000-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ada;
select public.block_member('b10c7000-0000-0000-0000-00000000000c');
select set_config('request.jwt.claims','{"sub":"b10c7000-0000-0000-0000-00000000000b","role":"authenticated"}', true) is not null as bo;
select public.unblock_member('b10c7000-0000-0000-0000-00000000000c');
select public.block_member('b10c7000-0000-0000-0000-00000000000c');
select set_config('request.jwt.claims','{"sub":"b10c7000-0000-0000-0000-00000000000c","role":"authenticated"}', true) is not null as cy;
select public.block_member('b10c7000-0000-0000-0000-00000000000a');
select public.unblock_member('b10c7000-0000-0000-0000-00000000000a');
select set_config('request.jwt.claims','{"sub":"b10c7000-0000-0000-0000-00000000000d","role":"authenticated"}', true) is not null as ivy;
select public.block_member('b10c7000-0000-0000-0000-00000000000b');
reset role;
select public.blocks_weekly_notify();
select public.blocks_weekly_notify();
do $$
declare
  got text;
  want text;
begin
  select string_agg(n.member_id::text, ',' order by n.member_id) into got
    from public.notifications n where n.kind = 'blocks_weekly';
  select string_agg(m.id::text, ',' order by m.id) into want
    from public.members m where m.is_admin and m.status = 'active';
  assert got = want, format('notified %s, not the active administrators %s', got, want);
  assert got like '%b10c7000-0000-0000-0000-00000000000d%', 'Ivy was not notified';
  assert got not like '%b10c7000-0000-0000-0000-00000000000f%', 'paused Pat was notified';
  assert got not similar to '%b10c7000-0000-0000-0000-00000000000(a|b|c)%', 'a member was notified';
  assert (select count(*) from public.notifications n
           where n.kind = 'blocks_weekly'
             and (n.detail <> '3' or n.count <> 1 or n.actor_id is not null or n.joined_id is not null
                  or n.report_id is not null or n.thread_id is not null or n.topic_id is not null
                  or n.tag <> 'blocks:' || (now() at time zone 'America/Los_Angeles')::date::text)) = 0,
    'a row said something other than the count, or the second run counted again';
  assert (select count(*) from net.http_request_queue q
           where convert_from(q.body, 'utf8')::jsonb ->> 'event' = 'blocks_weekly'
             and convert_from(q.body, 'utf8')::jsonb -> 'key'
                 = jsonb_build_object('day', (now() at time zone 'America/Los_Angeles')::date)) = 2,
    'not one request a run, carrying only the day';
  raise notice 'PASS 3: three members, once each, to every active administrator, naming nobody';
end;
$$;

\echo ''
\echo '== 4. the list: an administrator''s opens the Blocks list; a member''s never shows =='
\echo '   expect: authenticated, then PASS 4'
-- A row for Ada, as if a past administrator: the list still must not show it.
insert into public.notifications (member_id, kind, tag, detail)
values ('b10c7000-0000-0000-0000-00000000000a', 'blocks_weekly', 'blocks:probe', '3');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b10c7000-0000-0000-0000-00000000000d","role":"authenticated"}', true) is not null as ivy;
select current_user;
do $$
declare
  r record;
begin
  select * into strict r from public.my_notifications(null, 100) where kind = 'blocks_weekly';
  assert r.url = '/admin?tab=reports#blocks', format('opened %s', r.url);
  assert r.detail = '3' and r.actor_id is null and r.actor_name is null and r.actor_photo is null
     and r.place is null and r.excerpt is null, 'the list named somebody';
  perform set_config('request.jwt.claims','{"sub":"b10c7000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  assert not exists (select 1 from public.my_notifications(null, 100) where kind = 'blocks_weekly'),
    'a member was shown the weekly count';
  assert not exists (select 1 from public.notifications where member_id <> auth.uid()),
    'a member read an administrator''s notification';
  raise notice 'PASS 4: an administrator''s opens the Blocks list, names nobody; a member''s is hidden';
end;
$$;

\echo ''
\echo '== 5. the lock screen: administrators'' devices, not a switched-off one, no names =='
\echo '   expect: service_role, then PASS 5'
reset role;
set local role service_role;
select current_user;
create temporary table owed on commit drop as
select * from public.push_owed(:'secret', 'blocks_weekly',
  jsonb_build_object('day', (now() at time zone 'America/Los_Angeles')::date));
do $$
begin
  assert exists (select 1 from owed where endpoint = 'https://web.push.apple.com/b10c7d'), 'Ivy''s phone was not owed';
  assert not exists (select 1 from owed where endpoint = 'https://web.push.apple.com/b10c7e'),
    'Max switched New reports off and was owed';
  assert not exists (select 1 from owed where endpoint similar to 'https://web.push.apple.com/b10c7(a|b|c|f)'),
    'a member or paused Pat was owed';
  assert not exists (
    select 1 from owed o
      join public.push_subscriptions s on s.endpoint = o.endpoint
      join public.members m on m.id = s.member_id
     where not m.is_admin or m.status <> 'active'), 'somebody not an active administrator was owed';
  assert (select count(*) from owed
           where kind <> 'blocks_weekly' or actor_name is not null or body is not null
              or subject is not null or detail <> '3' or url <> '/admin?tab=reports#blocks'
              or tag not like 'blocks:%') = 0, 'the lock screen was given a name or words';
  begin
    perform 1 from public.push_owed('wrong', 'blocks_weekly', '{"day":"2026-10-26"}');
    raise exception 'push_owed answered without the secret';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS 5: administrators'' devices only, not one switched off, and no names';
end;
$$;

rollback;
