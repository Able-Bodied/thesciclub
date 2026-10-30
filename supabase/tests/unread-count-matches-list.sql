-- ============================================================================
-- The Chat dot counts what the conversation list marks unread (20261029140000)
-- ============================================================================
-- chat_unread_count counts directly now, not through chat_my_threads. For
-- each member below, read as them, it must equal the conversations
-- chat_my_threads marks unread, and the number written beside them.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/unread-count-matches-list.sql
--
-- Every check prints PASS or stops the script with FAIL. Rolls back. Do not
-- point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state) values
  ('aaaaaaaa-2914-0000-0000-00000000000a', 'peer', 'active',    'Ana', '19990029140', '1980-01-01', 'T1–T6', 'CA'),
  ('bbbbbbbb-2914-0000-0000-00000000000b', 'peer', 'active',    'Bo',  '19990029141', '1980-01-01', 'T1–T6', 'CA'),
  ('cccccccc-2914-0000-0000-00000000000c', 'peer', 'active',    'Cy',  '19990029142', '1980-01-01', 'T1–T6', 'CA'),
  ('dddddddd-2914-0000-0000-00000000000d', 'peer', 'active',    'Mo',  '19990029143', '1980-01-01', 'T1–T6', 'CA'),
  ('eeeeeeee-2914-0000-0000-00000000000e', 'peer', 'active',    'Le',  '19990029144', '1980-01-01', 'T1–T6', 'CA'),
  ('ffffffff-2914-0000-0000-00000000000f', 'peer', 'active',    'Ow',  '19990029145', '1980-01-01', 'T1–T6', 'CA'),
  ('11111111-2914-0000-0000-000000000001', 'peer', 'suspended', 'Su',  '19990029146', '1980-01-01', 'T1–T6', 'CA'),
  ('22222222-2914-0000-0000-000000000002', 'peer', 'active',    'Kit', '19990029147', '1980-01-01', 'T1–T6', 'CA');

-- Threads: d = direct, g = group. Read positions are an hour ago unless said.
insert into public.chat_threads (id, kind, name, direct_key) values
  ('29140000-0000-0000-0000-000000000001', 'direct', null,      'probe-2914:ana:bo'),
  ('29140000-0000-0000-0000-000000000002', 'group',  'Read',    null),
  ('29140000-0000-0000-0000-000000000003', 'group',  'Unread',  null),
  ('29140000-0000-0000-0000-000000000004', 'group',  'Muted',   null),
  ('29140000-0000-0000-0000-000000000005', 'group',  'Left',    null),
  ('29140000-0000-0000-0000-000000000006', 'direct', null,      'probe-2914:le:bo'),
  ('29140000-0000-0000-0000-000000000007', 'group',  'Own',     null),
  ('29140000-0000-0000-0000-000000000008', 'direct', null,      'probe-2914:su:bo'),
  ('29140000-0000-0000-0000-000000000009', 'direct', null,      'probe-2914:kit:bo'),
  ('29140000-0000-0000-0000-000000000010', 'group',  'Bo only', null),
  ('29140000-0000-0000-0000-000000000011', 'group',  'Cy too',  null);

insert into public.chat_thread_members (thread_id, member_id, last_read_at)
select t::uuid, m::uuid, now() - interval '1 hour' from (values
  ('29140000-0000-0000-0000-000000000001', 'aaaaaaaa-2914-0000-0000-00000000000a'),
  ('29140000-0000-0000-0000-000000000001', 'bbbbbbbb-2914-0000-0000-00000000000b'),
  ('29140000-0000-0000-0000-000000000002', 'aaaaaaaa-2914-0000-0000-00000000000a'),
  ('29140000-0000-0000-0000-000000000002', 'cccccccc-2914-0000-0000-00000000000c'),
  ('29140000-0000-0000-0000-000000000003', 'aaaaaaaa-2914-0000-0000-00000000000a'),
  ('29140000-0000-0000-0000-000000000003', 'cccccccc-2914-0000-0000-00000000000c'),
  ('29140000-0000-0000-0000-000000000004', 'dddddddd-2914-0000-0000-00000000000d'),
  ('29140000-0000-0000-0000-000000000004', 'cccccccc-2914-0000-0000-00000000000c'),
  ('29140000-0000-0000-0000-000000000005', 'eeeeeeee-2914-0000-0000-00000000000e'),
  ('29140000-0000-0000-0000-000000000005', 'cccccccc-2914-0000-0000-00000000000c'),
  ('29140000-0000-0000-0000-000000000006', 'eeeeeeee-2914-0000-0000-00000000000e'),
  ('29140000-0000-0000-0000-000000000006', 'bbbbbbbb-2914-0000-0000-00000000000b'),
  ('29140000-0000-0000-0000-000000000007', 'ffffffff-2914-0000-0000-00000000000f'),
  ('29140000-0000-0000-0000-000000000007', 'cccccccc-2914-0000-0000-00000000000c'),
  ('29140000-0000-0000-0000-000000000008', '11111111-2914-0000-0000-000000000001'),
  ('29140000-0000-0000-0000-000000000008', 'bbbbbbbb-2914-0000-0000-00000000000b'),
  ('29140000-0000-0000-0000-000000000009', '22222222-2914-0000-0000-000000000002'),
  ('29140000-0000-0000-0000-000000000009', 'bbbbbbbb-2914-0000-0000-00000000000b'),
  ('29140000-0000-0000-0000-000000000010', '22222222-2914-0000-0000-000000000002'),
  ('29140000-0000-0000-0000-000000000010', 'bbbbbbbb-2914-0000-0000-00000000000b'),
  ('29140000-0000-0000-0000-000000000011', '22222222-2914-0000-0000-000000000002'),
  ('29140000-0000-0000-0000-000000000011', 'cccccccc-2914-0000-0000-00000000000c')
) v(t, m);

insert into public.chat_messages (thread_id, author_id, body, created_at)
select t::uuid, a::uuid, 'Probe', now() - w::interval from (values
  ('29140000-0000-0000-0000-000000000001', 'bbbbbbbb-2914-0000-0000-00000000000b', '10 minutes'),
  ('29140000-0000-0000-0000-000000000002', 'cccccccc-2914-0000-0000-00000000000c', '10 minutes'),
  ('29140000-0000-0000-0000-000000000003', 'cccccccc-2914-0000-0000-00000000000c', '10 minutes'),
  ('29140000-0000-0000-0000-000000000004', 'cccccccc-2914-0000-0000-00000000000c', '10 minutes'),
  ('29140000-0000-0000-0000-000000000005', 'cccccccc-2914-0000-0000-00000000000c', '10 minutes'),
  ('29140000-0000-0000-0000-000000000006', 'bbbbbbbb-2914-0000-0000-00000000000b', '10 minutes'),
  ('29140000-0000-0000-0000-000000000007', 'cccccccc-2914-0000-0000-00000000000c', '2 hours'),
  ('29140000-0000-0000-0000-000000000007', 'ffffffff-2914-0000-0000-00000000000f', '10 minutes'),
  ('29140000-0000-0000-0000-000000000008', 'bbbbbbbb-2914-0000-0000-00000000000b', '10 minutes'),
  ('29140000-0000-0000-0000-000000000009', 'bbbbbbbb-2914-0000-0000-00000000000b', '10 minutes'),
  -- No author, so not hidden by the block: only leaving the conversation out does.
  ('29140000-0000-0000-0000-000000000009', null, '9 minutes'),
  ('29140000-0000-0000-0000-000000000010', 'bbbbbbbb-2914-0000-0000-00000000000b', '10 minutes'),
  ('29140000-0000-0000-0000-000000000011', 'cccccccc-2914-0000-0000-00000000000c', '10 minutes')
) v(t, a, w);

-- Ana has read "Read" since Cy wrote; Mo muted "Muted"; Le left "Left"; Kit
-- blocked Bo after both conversations had his words in them.
update public.chat_thread_members set last_read_at = now() - interval '5 minutes'
 where thread_id = '29140000-0000-0000-0000-000000000002' and member_id = 'aaaaaaaa-2914-0000-0000-00000000000a';
insert into public.chat_thread_mutes (thread_id, member_id)
values ('29140000-0000-0000-0000-000000000004', 'dddddddd-2914-0000-0000-00000000000d');
delete from public.chat_thread_members
 where thread_id = '29140000-0000-0000-0000-000000000005' and member_id = 'eeeeeeee-2914-0000-0000-00000000000e';
insert into public.member_blocks (blocker_id, blocked_id)
values ('22222222-2914-0000-0000-000000000002', 'bbbbbbbb-2914-0000-0000-00000000000b');

create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;

-- The dot and the list, read as the member.
create function pg_temp.dot_and_list(member uuid, out dot integer, out listed integer) language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', member, 'role', 'authenticated')::text, true);
  set local role authenticated;
  dot := public.chat_unread_count();
  select count(*)::integer into listed from public.chat_my_threads() where unread;
  reset role;
end $$;

create function pg_temp.check_member(member uuid, expected integer, label text) returns void language plpgsql as $$
declare r record;
begin
  select * into r from pg_temp.dot_and_list(member);
  perform pg_temp.check_true(r.dot = r.listed and r.dot = expected,
    format('%s: dot %s, list %s, expected %s', label, r.dot, r.listed, expected));
end $$;

select pg_temp.check_member('aaaaaaaa-2914-0000-0000-00000000000a', 2, 'an ordinary member: a direct and a group unread, one read');
select pg_temp.check_member('dddddddd-2914-0000-0000-00000000000d', 1, 'a muted conversation still counts, as in the list');
select pg_temp.check_member('eeeeeeee-2914-0000-0000-00000000000e', 1, 'a group they left is gone');
select pg_temp.check_member('ffffffff-2914-0000-0000-00000000000f', 0, 'only their own words are newer');
select pg_temp.check_member('11111111-2914-0000-0000-000000000001', 1, 'a suspended member still reads');
select pg_temp.check_member('22222222-2914-0000-0000-000000000002', 1, 'a blocked member''s direct conversation and words are left out');
select pg_temp.check_member('bbbbbbbb-2914-0000-0000-00000000000b', 1, 'Bo: only the authorless line is not his');

-- Signed out: refused, as before.
do $$
begin
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin
    perform public.chat_unread_count();
    raise exception 'FAIL: a signed-out visitor was answered';
  exception when insufficient_privilege then
    raise notice 'PASS: a signed-out visitor is refused';
  end;
  reset role;
end $$;

rollback;
