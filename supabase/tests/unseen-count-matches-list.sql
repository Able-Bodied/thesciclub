-- ============================================================================
-- The bell counts what the list shows unseen (20261029140000)
-- ============================================================================
-- my_unseen_notification_count no longer builds my_notifications' rows. For
-- each member below, read as them, it must equal the unseen rows of
-- my_notifications(null, 100), and the number written beside them.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/unseen-count-matches-list.sql
--
-- Every check prints PASS or stops the script with FAIL. Rolls back. Do not
-- point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin) values
  ('aaaaaaaa-2915-0000-0000-00000000000a', 'peer',   'active', 'Ana', '19990029150', '1980-01-01', 'T1–T6', 'CA', false),
  ('bbbbbbbb-2915-0000-0000-00000000000b', 'peer',   'active', 'Bo',  '19990029151', '1980-01-01', 'T1–T6', 'CA', false),
  ('cccccccc-2915-0000-0000-00000000000c', 'peer',   'active', 'Cy',  '19990029152', '1980-01-01', 'T1–T6', 'CA', false),
  ('dddddddd-2915-0000-0000-00000000000d', 'mentor', 'active', 'Al',  '19990029153', '1980-01-01', 'T1–T6', 'CA', true),
  ('eeeeeeee-2915-0000-0000-00000000000e', 'peer',   'active', 'Max', '19990029154', '1980-01-01', 'T1–T6', 'CA', false);

insert into public.chat_rooms (id, name, description, category, sort_order, opened_at) values
  ('probe-2915-open',   'Probe 2915 open',   'For the probe.', 'Life', 9291, now()),
  ('probe-2915-closed', 'Probe 2915 closed', 'For the probe.', 'Life', 9292, null);
insert into public.chat_topics (id, room_id, title, author_id) values
  ('29150000-0000-0000-0000-000000000001', 'probe-2915-open',   'Ana asks', 'aaaaaaaa-2915-0000-0000-00000000000a'),
  ('29150000-0000-0000-0000-000000000002', 'probe-2915-closed', 'Bo asks',  'bbbbbbbb-2915-0000-0000-00000000000b');
insert into public.chat_posts (id, topic_id, author_id, body, removed_at) values
  ('29150000-0000-0000-0000-000000000011', '29150000-0000-0000-0000-000000000001', 'bbbbbbbb-2915-0000-0000-00000000000b', 'Standing', null),
  ('29150000-0000-0000-0000-000000000012', '29150000-0000-0000-0000-000000000001', 'aaaaaaaa-2915-0000-0000-00000000000a', 'Removed', now()),
  ('29150000-0000-0000-0000-000000000013', '29150000-0000-0000-0000-000000000002', 'bbbbbbbb-2915-0000-0000-00000000000b', 'Closed', null);

insert into public.member_blocks (blocker_id, blocked_id)
values ('aaaaaaaa-2915-0000-0000-00000000000a', 'cccccccc-2915-0000-0000-00000000000c');

-- Only what is written below.
delete from public.notifications where member_id in (
  'aaaaaaaa-2915-0000-0000-00000000000a', 'dddddddd-2915-0000-0000-00000000000d',
  'eeeeeeee-2915-0000-0000-00000000000e');

insert into public.notifications (member_id, kind, tag, actor_id, topic_id, post_id, created_at, seen_at)
select 'aaaaaaaa-2915-0000-0000-00000000000a', k, 'probe-2915-' || k || '-' || n, a::uuid, t::uuid, p::uuid,
       now() - w::interval, case when s then now() end
  from (values
    -- shown, unseen
    (1, 'reply',             'bbbbbbbb-2915-0000-0000-00000000000b', '29150000-0000-0000-0000-000000000001', '29150000-0000-0000-0000-000000000011', '1 minute',  false),
    (2, 'mention',           'bbbbbbbb-2915-0000-0000-00000000000b', '29150000-0000-0000-0000-000000000001', '29150000-0000-0000-0000-000000000011', '2 minutes', false),
    -- shown, seen
    (3, 'reply',             'bbbbbbbb-2915-0000-0000-00000000000b', '29150000-0000-0000-0000-000000000001', '29150000-0000-0000-0000-000000000011', '3 minutes', true),
    -- not shown: a like on a removed post
    (4, 'like',              'bbbbbbbb-2915-0000-0000-00000000000b', '29150000-0000-0000-0000-000000000001', '29150000-0000-0000-0000-000000000012', '4 minutes', false),
    -- not shown: a report to somebody who is not an administrator
    (5, 'report',            null, null, null, '5 minutes', false),
    -- not shown: a closed room
    (6, 'reply_participant', 'bbbbbbbb-2915-0000-0000-00000000000b', '29150000-0000-0000-0000-000000000002', '29150000-0000-0000-0000-000000000013', '6 minutes', false),
    -- not shown: older than 30 days
    (7, 'reply',             'bbbbbbbb-2915-0000-0000-00000000000b', '29150000-0000-0000-0000-000000000001', '29150000-0000-0000-0000-000000000011', '31 days',   false),
    -- not shown: from a blocked member
    (8, 'like',              'cccccccc-2915-0000-0000-00000000000c', '29150000-0000-0000-0000-000000000001', '29150000-0000-0000-0000-000000000011', '8 minutes', false)
  ) v(n, k, a, t, p, w, s);

-- An administrator's report is shown.
insert into public.notifications (member_id, kind, tag) values
  ('dddddddd-2915-0000-0000-00000000000d', 'report', 'probe-2915-report');

-- Max has 120: the newest 100 hold 60 unseen (1 to 60) and 40 seen; the 20
-- older are unseen but past the 100 the bell counts.
insert into public.notifications (member_id, kind, tag, created_at, seen_at)
select 'eeeeeeee-2915-0000-0000-00000000000e', 'profile_reminder', 'probe-2915-max-' || i,
       now() - make_interval(mins => i), case when i between 61 and 100 then now() end
  from generate_series(1, 120) i;

create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;

create function pg_temp.bell_and_list(member uuid, out bell integer, out listed integer) language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', member, 'role', 'authenticated')::text, true);
  set local role authenticated;
  bell := public.my_unseen_notification_count();
  select count(*)::integer into listed from public.my_notifications(null, 100) n where not n.seen;
  reset role;
end $$;

create function pg_temp.check_member(member uuid, expected integer, label text) returns void language plpgsql as $$
declare r record;
begin
  select * into r from pg_temp.bell_and_list(member);
  perform pg_temp.check_true(r.bell = r.listed and r.bell = expected,
    format('%s: bell %s, list %s, expected %s', label, r.bell, r.listed, expected));
end $$;

select pg_temp.check_member('aaaaaaaa-2915-0000-0000-00000000000a', 2,
  'a reply and a mention; not a removed post, a report, a closed room, 31 days, or a blocked member');
select pg_temp.check_member('dddddddd-2915-0000-0000-00000000000d', 1, 'an administrator''s report');
select pg_temp.check_member('eeeeeeee-2915-0000-0000-00000000000e', 60, 'only the newest 100 count');

-- Signed out: refused, as before.
do $$
begin
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin
    perform public.my_unseen_notification_count();
    raise exception 'FAIL: a signed-out visitor was answered';
  exception when insufficient_privilege then
    raise notice 'PASS: a signed-out visitor is refused';
  end;
  reset role;
end $$;

rollback;
