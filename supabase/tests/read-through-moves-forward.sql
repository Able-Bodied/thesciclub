-- ============================================================================
-- A conversation's read position only moves forward (20261029150000)
-- ============================================================================
-- Reading up to an older or the same message writes nothing (the row keeps
-- its version); a newer one moves the position and clears that conversation's
-- notifications; somebody outside it is still refused.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/read-through-moves-forward.sql
--
-- Every check prints PASS or stops the script with FAIL. Rolls back. Do not
-- point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state) values
  ('aaaaaaaa-2916-0000-0000-00000000000a', 'peer', 'active', 'Ana', '19990029160', '1980-01-01', 'T1–T6', 'CA'),
  ('bbbbbbbb-2916-0000-0000-00000000000b', 'peer', 'active', 'Bo',  '19990029161', '1980-01-01', 'T1–T6', 'CA'),
  ('cccccccc-2916-0000-0000-00000000000c', 'peer', 'active', 'Cy',  '19990029162', '1980-01-01', 'T1–T6', 'CA');

insert into public.chat_threads (id, kind, name)
values ('29160000-0000-0000-0000-000000000001', 'group', 'Probe 2916');
insert into public.chat_thread_members (thread_id, member_id) values
  ('29160000-0000-0000-0000-000000000001', 'aaaaaaaa-2916-0000-0000-00000000000a'),
  ('29160000-0000-0000-0000-000000000001', 'bbbbbbbb-2916-0000-0000-00000000000b');
insert into public.chat_messages (id, thread_id, author_id, body, created_at) values
  ('29160000-0000-0000-0000-000000000011', '29160000-0000-0000-0000-000000000001', 'bbbbbbbb-2916-0000-0000-00000000000b', 'Older', now() - interval '20 minutes'),
  ('29160000-0000-0000-0000-000000000012', '29160000-0000-0000-0000-000000000001', 'bbbbbbbb-2916-0000-0000-00000000000b', 'Middle', now() - interval '10 minutes'),
  ('29160000-0000-0000-0000-000000000013', '29160000-0000-0000-0000-000000000001', 'bbbbbbbb-2916-0000-0000-00000000000b', 'Newest', now() - interval '1 minute');

-- Ana has read up to the middle one. A notification waits for her.
update public.chat_thread_members set last_read_at = now() - interval '10 minutes'
 where thread_id = '29160000-0000-0000-0000-000000000001' and member_id = 'aaaaaaaa-2916-0000-0000-00000000000a';
delete from public.notifications where member_id = 'aaaaaaaa-2916-0000-0000-00000000000a';
insert into public.notifications (member_id, kind, tag, thread_id, actor_id)
values ('aaaaaaaa-2916-0000-0000-00000000000a', 'group', 'probe-2916', '29160000-0000-0000-0000-000000000001',
        'bbbbbbbb-2916-0000-0000-00000000000b');

create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;

-- Ana's row: where it is stored (a new version moves it) and its position.
create function pg_temp.ana_row(out at tid, out read_at timestamptz) language sql as $$
  select ctid, last_read_at from public.chat_thread_members
   where thread_id = '29160000-0000-0000-0000-000000000001' and member_id = 'aaaaaaaa-2916-0000-0000-00000000000a';
$$;

create function pg_temp.read_through(member uuid, message uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', member, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.chat_mark_thread_read_through('29160000-0000-0000-0000-000000000001', message);
  reset role;
end $$;

create function pg_temp.ana_unread_notifications() returns integer language sql as $$
  select count(*)::integer from public.notifications
   where member_id = 'aaaaaaaa-2916-0000-0000-00000000000a' and read_at is null;
$$;

do $$
declare before record; after record;
begin
  before := pg_temp.ana_row();

  perform pg_temp.read_through('aaaaaaaa-2916-0000-0000-00000000000a', '29160000-0000-0000-0000-000000000011');
  after := pg_temp.ana_row();
  perform pg_temp.check_true(after.at = before.at and after.read_at = before.read_at,
    'an older message writes nothing');

  perform pg_temp.read_through('aaaaaaaa-2916-0000-0000-00000000000a', '29160000-0000-0000-0000-000000000012');
  after := pg_temp.ana_row();
  perform pg_temp.check_true(after.at = before.at and after.read_at = before.read_at,
    'the same message writes nothing');
  perform pg_temp.check_true(pg_temp.ana_unread_notifications() = 1,
    'and its notification is still waiting');

  perform pg_temp.read_through('aaaaaaaa-2916-0000-0000-00000000000a', '29160000-0000-0000-0000-000000000013');
  after := pg_temp.ana_row();
  perform pg_temp.check_true(after.read_at = now() - interval '1 minute' and after.at <> before.at,
    'a newer message moves the position');
  perform pg_temp.check_true(pg_temp.ana_unread_notifications() = 0,
    'and clears that conversation''s notifications');

  begin
    perform pg_temp.read_through('cccccccc-2916-0000-0000-00000000000c', '29160000-0000-0000-0000-000000000013');
    raise exception 'FAIL: somebody outside the conversation was let in';
  exception when sqlstate 'P0002' then
    raise notice 'PASS: somebody outside the conversation is refused';
  end;
end $$;

rollback;
