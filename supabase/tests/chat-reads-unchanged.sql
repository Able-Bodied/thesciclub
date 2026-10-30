-- ============================================================================
-- What each person can read, before and after a rule change
-- (SPEED-PLAN.md, Steps 5 and 6)
-- ============================================================================
-- Records, for each test person, every row they can read in each table the
-- rewritten rules guard, and what the chat functions that run as the reader
-- return; then, after the migration, records again. Any difference, in
-- either direction, fails.
--
-- Three runs, on a THROWAWAY stack only (the fixture is committed between
-- them):
--
--   psql ... -v phase=before  -f - < supabase/tests/chat-reads-unchanged.sql
--   (apply the migration)
--   psql ... -v phase=after   -f - < supabase/tests/chat-reads-unchanged.sql
--   psql ... -v phase=cleanup -f - < supabase/tests/chat-reads-unchanged.sql
--
-- Until cleanup, probes that count every row (chat-reactions.sql) see the
-- fixture's rows and fail: run them after.
--
-- with psql as in the other probes:
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p <port> -U postgres -d postgres
--
-- People: an active member, a suspended one, a removed one, an administrator,
-- an account part-way through sign-up, a signed-out visitor, a member who
-- left a group, two in a direct conversation, a member who blocked another
-- and the one blocked, a member of a 300-person event group, and everybody
-- the seed made.
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

select :'phase' = 'before' as is_before, :'phase' = 'after' as is_after,
       :'phase' = 'cleanup' as is_cleanup \gset

\if :is_before
begin;
create schema probe_reads;
create table probe_reads.people (who uuid, label text);
create table probe_reads.snap (phase text, who text, what text, digest text, primary key (phase, who, what));

-- ------------------------------------------------------------------ people --
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin) values
  ('a0000000-2917-0000-0000-000000000001', 'peer',   'active',    'Act', '19990291701', '1980-01-01', 'T1–T6', 'CA', false),
  ('a0000000-2917-0000-0000-000000000002', 'peer',   'suspended', 'Sus', '19990291702', '1980-01-01', 'T1–T6', 'CA', false),
  ('a0000000-2917-0000-0000-000000000003', 'peer',   'removed',   'Rem', '19990291703', '1980-01-01', 'T1–T6', 'CA', false),
  ('a0000000-2917-0000-0000-000000000004', 'mentor', 'active',    'Adm', '19990291704', '1980-01-01', 'T1–T6', 'CA', true),
  ('a0000000-2917-0000-0000-000000000005', 'peer',   'active',    'Lft', '19990291705', '1980-01-01', 'T1–T6', 'CA', false),
  ('a0000000-2917-0000-0000-000000000006', 'peer',   'active',    'Dr1', '19990291706', '1980-01-01', 'T1–T6', 'CA', false),
  ('a0000000-2917-0000-0000-000000000007', 'peer',   'active',    'Dr2', '19990291707', '1980-01-01', 'T1–T6', 'CA', false),
  ('a0000000-2917-0000-0000-000000000008', 'peer',   'active',    'Blk', '19990291708', '1980-01-01', 'T1–T6', 'CA', false),
  ('a0000000-2917-0000-0000-000000000009', 'peer',   'active',    'Bkd', '19990291709', '1980-01-01', 'T1–T6', 'CA', false),
  ('a0000000-2917-0000-0000-000000000010', 'peer',   'active',    'Big', '19990291710', '1980-01-01', 'T1–T6', 'CA', false);
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state)
select ('f0000000-2917-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'peer', 'active', 'Filler ' || i,
       '1999029' || lpad(i::text, 4, '0'), '1980-01-01', 'T1–T6', 'CA'
  from generate_series(1, 299) i;
-- Part-way through sign-up: an account and no member.
insert into auth.users (id, instance_id, aud, role, phone)
values ('c0000000-2917-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', '19990291799');

-- ------------------------------------------------------------------- rooms --
insert into public.chat_rooms (id, name, description, category, sort_order, opened_at) values
  ('probe-2917-open',   'Probe 2917 open',   'For the probe.', 'Life', 9917, now()),
  ('probe-2917-closed', 'Probe 2917 closed', 'For the probe.', 'Life', 9918, null);
insert into public.chat_topics (id, room_id, title, author_id) values
  ('29170000-0000-0000-0000-000000000001', 'probe-2917-open',   'Act asks', 'a0000000-2917-0000-0000-000000000001'),
  ('29170000-0000-0000-0000-000000000002', 'probe-2917-open',   'Bkd asks', 'a0000000-2917-0000-0000-000000000009'),
  ('29170000-0000-0000-0000-000000000003', 'probe-2917-closed', 'Adm asks', 'a0000000-2917-0000-0000-000000000004');
insert into public.chat_posts (id, topic_id, author_id, body, removed_at) values
  ('29170000-0000-0000-0000-000000000011', '29170000-0000-0000-0000-000000000001', 'a0000000-2917-0000-0000-000000000001', 'Act opens', null),
  ('29170000-0000-0000-0000-000000000012', '29170000-0000-0000-0000-000000000001', 'a0000000-2917-0000-0000-000000000009', 'Bkd replies', null),
  ('29170000-0000-0000-0000-000000000013', '29170000-0000-0000-0000-000000000001', 'a0000000-2917-0000-0000-000000000006', 'Removed', now()),
  ('29170000-0000-0000-0000-000000000014', '29170000-0000-0000-0000-000000000002', 'a0000000-2917-0000-0000-000000000009', 'Bkd opens', null),
  ('29170000-0000-0000-0000-000000000015', '29170000-0000-0000-0000-000000000002', 'a0000000-2917-0000-0000-000000000001', 'Act replies', null),
  ('29170000-0000-0000-0000-000000000016', '29170000-0000-0000-0000-000000000003', 'a0000000-2917-0000-0000-000000000004', 'Adm opens', null);
insert into public.chat_post_likes (post_id, member_id) values
  ('29170000-0000-0000-0000-000000000012', 'a0000000-2917-0000-0000-000000000001'),
  ('29170000-0000-0000-0000-000000000011', 'a0000000-2917-0000-0000-000000000009'),
  ('29170000-0000-0000-0000-000000000016', 'a0000000-2917-0000-0000-000000000004');
insert into public.chat_post_reactions (target_id, member_id, emoji) values
  ('29170000-0000-0000-0000-000000000011', 'a0000000-2917-0000-0000-000000000008', '👍'),
  ('29170000-0000-0000-0000-000000000011', 'a0000000-2917-0000-0000-000000000009', '❤️'),
  ('29170000-0000-0000-0000-000000000016', 'a0000000-2917-0000-0000-000000000004', '👍');
insert into public.chat_topic_reads (topic_id, member_id, last_read_at)
values ('29170000-0000-0000-0000-000000000001', 'a0000000-2917-0000-0000-000000000001', now());

-- ----------------------------------------------------------- conversations --
insert into public.chat_threads (id, kind, name, direct_key, event_id) values
  ('29170000-0000-0000-0000-000000000021', 'group',  'Group',   null, null),
  ('29170000-0000-0000-0000-000000000022', 'direct', null,      'probe-2917:dr1:dr2', null),
  ('29170000-0000-0000-0000-000000000023', 'direct', null,      'probe-2917:blk:bkd', null),
  ('29170000-0000-0000-0000-000000000024', 'group',  'Event',   null, (select id from public.events order by id limit 1));
insert into public.chat_thread_members (thread_id, member_id)
select '29170000-0000-0000-0000-000000000021'::uuid, m::uuid from unnest(array[
  'a0000000-2917-0000-0000-000000000001', 'a0000000-2917-0000-0000-000000000002',
  'a0000000-2917-0000-0000-000000000003', 'a0000000-2917-0000-0000-000000000005',
  'a0000000-2917-0000-0000-000000000008', 'a0000000-2917-0000-0000-000000000009']) m
union all select '29170000-0000-0000-0000-000000000022', 'a0000000-2917-0000-0000-000000000006'
union all select '29170000-0000-0000-0000-000000000022', 'a0000000-2917-0000-0000-000000000007'
union all select '29170000-0000-0000-0000-000000000023', 'a0000000-2917-0000-0000-000000000008'
union all select '29170000-0000-0000-0000-000000000023', 'a0000000-2917-0000-0000-000000000009'
union all select '29170000-0000-0000-0000-000000000024', 'a0000000-2917-0000-0000-000000000010'
union all select '29170000-0000-0000-0000-000000000024', id from public.members where display_name like 'Filler %';
insert into public.chat_messages (id, thread_id, author_id, body, removed_at) values
  ('29170000-0000-0000-0000-000000000031', '29170000-0000-0000-0000-000000000021', 'a0000000-2917-0000-0000-000000000001', 'Act in the group', null),
  ('29170000-0000-0000-0000-000000000032', '29170000-0000-0000-0000-000000000021', 'a0000000-2917-0000-0000-000000000009', 'Bkd in the group', null),
  ('29170000-0000-0000-0000-000000000033', '29170000-0000-0000-0000-000000000021', 'a0000000-2917-0000-0000-000000000005', 'Lft before leaving', null),
  ('29170000-0000-0000-0000-000000000034', '29170000-0000-0000-0000-000000000021', 'a0000000-2917-0000-0000-000000000001', 'Removed', now()),
  ('29170000-0000-0000-0000-000000000035', '29170000-0000-0000-0000-000000000022', 'a0000000-2917-0000-0000-000000000006', 'Dr1 to Dr2', null),
  ('29170000-0000-0000-0000-000000000036', '29170000-0000-0000-0000-000000000022', 'a0000000-2917-0000-0000-000000000007', 'Dr2 to Dr1', null),
  ('29170000-0000-0000-0000-000000000037', '29170000-0000-0000-0000-000000000023', 'a0000000-2917-0000-0000-000000000009', 'Bkd to Blk', null),
  ('29170000-0000-0000-0000-000000000038', '29170000-0000-0000-0000-000000000024', 'a0000000-2917-0000-0000-000000000010', 'Big in the event', null),
  ('29170000-0000-0000-0000-000000000039', '29170000-0000-0000-0000-000000000024', 'f0000000-2917-0000-0000-000000000001', 'A filler', null);
insert into public.chat_message_reactions (target_id, member_id, emoji) values
  ('29170000-0000-0000-0000-000000000035', 'a0000000-2917-0000-0000-000000000007', '👍'),
  ('29170000-0000-0000-0000-000000000031', 'a0000000-2917-0000-0000-000000000008', '👍'),
  ('29170000-0000-0000-0000-000000000031', 'a0000000-2917-0000-0000-000000000009', '❤️');
insert into public.chat_thread_mutes (thread_id, member_id)
values ('29170000-0000-0000-0000-000000000021', 'a0000000-2917-0000-0000-000000000001');

-- Lft leaves; Blk blocks Bkd, after both had written.
delete from public.chat_thread_members
 where thread_id = '29170000-0000-0000-0000-000000000021' and member_id = 'a0000000-2917-0000-0000-000000000005';
insert into public.member_blocks (blocker_id, blocked_id)
values ('a0000000-2917-0000-0000-000000000008', 'a0000000-2917-0000-0000-000000000009');

-- Storage rows the photo and chat rules read.
insert into storage.objects (bucket_id, name, owner_id) values
  ('photos', 'a0000000-2917-0000-0000-000000000001/face.jpg', 'a0000000-2917-0000-0000-000000000001'),
  ('photos', 'a0000000-2917-0000-0000-000000000009/face.jpg', 'a0000000-2917-0000-0000-000000000009'),
  ('photos', 'organizations/probe-2917.png', null),
  ('chat', 'threads/29170000-0000-0000-0000-000000000021/a.jpg', 'a0000000-2917-0000-0000-000000000001'),
  ('chat', 'threads/29170000-0000-0000-0000-000000000022/b.jpg', 'a0000000-2917-0000-0000-000000000006');

-- Who is read as: the people above, three of the 300, and the seed's members.
insert into probe_reads.people (who, label)
select id, display_name from public.members
 where id::text like 'a0000000-2917-%'
    or id in ('f0000000-2917-0000-0000-000000000001', 'f0000000-2917-0000-0000-000000000150',
              'f0000000-2917-0000-0000-000000000299')
    or coalesce(phone, '') not like '1999029%'
union all select 'c0000000-2917-0000-0000-000000000001', 'part-way'
union all select null, 'signed out';
commit;
\endif

\if :is_cleanup
begin;
-- Only the fixture's rows, which have no files behind them.
set local storage.allow_delete_query = 'true';
delete from storage.objects where name like '%2917%';
delete from public.chat_threads where id::text like '29170000-%';
delete from public.chat_rooms where id like 'probe-2917-%';
delete from public.members where id::text like 'a0000000-2917-%' or id::text like 'f0000000-2917-%';
delete from auth.users where id = 'c0000000-2917-0000-0000-000000000001';
drop schema probe_reads cascade;
commit;
\echo 'cleaned up'
\endif

\if :is_cleanup
\else
-- ------------------------------------------------------------------ record --
create function pg_temp.record(phase text) returns void language plpgsql as $$
declare
  p record;
  q record;
  d text;
begin
  for p in select who, label from probe_reads.people loop
    for q in select * from (values
      ('chat_messages',          'select t from public.chat_messages t'),
      ('chat_threads',           'select t from public.chat_threads t'),
      ('chat_thread_members',    'select t from public.chat_thread_members t'),
      ('chat_message_reactions', 'select t from public.chat_message_reactions t'),
      ('chat_topics',            'select t from public.chat_topics t'),
      ('chat_posts',             'select t from public.chat_posts t'),
      ('chat_post_likes',        'select t from public.chat_post_likes t'),
      ('chat_post_reactions',    'select t from public.chat_post_reactions t'),
      ('chat_rooms',             'select t from public.chat_rooms t'),
      ('chat_room_stats',        'select t from public.chat_room_stats t'),
      ('chat_my_threads()',      'select t from public.chat_my_threads() t'),
      ('chat_unread_count()',    'select public.chat_unread_count() t'),
      ('chat_topic_opening_posts()',
         'select t from public.chat_topic_opening_posts(array(select id from public.chat_topics where id::text like ''29170000-%'')) t'),
      ('members',                'select t from public.members t'),
      ('invites',                'select t from public.invites t'),
      ('member_strikes',         'select t from public.member_strikes t'),
      ('organization_follows',   'select t from public.organization_follows t'),
      ('event_rsvps',            'select t from public.event_rsvps t'),
      ('chat_room_members',      'select t from public.chat_room_members t'),
      ('chat_room_mutes',        'select t from public.chat_room_mutes t'),
      ('chat_thread_mutes',      'select t from public.chat_thread_mutes t'),
      ('chat_topic_mutes',       'select t from public.chat_topic_mutes t'),
      ('chat_topic_reads',       'select t from public.chat_topic_reads t'),
      ('chat_reports',           'select t from public.chat_reports t'),
      ('push_subscriptions',     'select t from public.push_subscriptions t'),
      ('push_muted_kinds',       'select t from public.push_muted_kinds t'),
      ('notifications',          'select t from public.notifications t'),
      ('qr_codes',               'select t from public.qr_codes t'),
      ('member_blocks',          'select t from public.member_blocks t'),
      ('chat_saves',             'select t from public.chat_saves t'),
      ('storage.objects',        'select t.bucket_id, t.name, t.owner_id from storage.objects t')
    ) v(what, sql) loop
      begin
        perform set_config('request.jwt.claims',
          case when p.who is null then json_build_object('role', 'anon')
               else json_build_object('sub', p.who, 'role', 'authenticated') end::text, true);
        if p.who is null then set local role anon; else set local role authenticated; end if;
        execute format('select count(*) || '' rows '' || md5(coalesce(string_agg(r::text, E''\n'' order by r::text), '''')) from (%s) r', q.sql)
          into d;
        reset role;
      exception when others then
        d := 'refused ' || sqlstate;
      end;
      insert into probe_reads.snap values (phase, coalesce(p.who::text, 'signed out'), q.what, d);
    end loop;
  end loop;
end $$;

-- A failed after run leaves its readings: start afresh.
delete from probe_reads.snap where phase = 'after';
select pg_temp.record(:'phase');
\endif

\if :is_before
select count(*) || ' readings recorded for ' || count(distinct who) || ' people' as recorded,
       count(*) filter (where digest like 'refused%') as refusals,
       count(*) filter (where digest like '0 rows%') as empty
  from probe_reads.snap where phase = 'before';
\endif

\if :is_after
\echo 'Differences (none expected):'
select coalesce(pp.label, coalesce(b.who, a.who)) as who, coalesce(b.what, a.what) as what,
       b.digest as before, a.digest as after
  from (select * from probe_reads.snap where phase = 'before') b
  full join (select * from probe_reads.snap where phase = 'after') a using (who, what)
  left join probe_reads.people pp on coalesce(pp.who::text, 'signed out') = coalesce(b.who, a.who)
 where b.digest is distinct from a.digest
 order by 1, 2;

do $$
declare n integer;
begin
  select count(*) into n
    from (select * from probe_reads.snap where phase = 'before') b
    full join (select * from probe_reads.snap where phase = 'after') a using (who, what)
   where b.digest is distinct from a.digest;
  if n > 0 then raise exception 'FAIL: % readings changed', n; end if;
  raise notice 'PASS: every reading is the same, for every person';
end $$;
\endif
