-- ============================================================================
-- Org admins tell their members about an event (20261103000000)
-- ============================================================================
-- Every check prints PASS or raises FAIL; a refusal prints its SQLSTATE.
--
--   1. who may: only the organization's org admins (or an administrator), and
--      not for an event that is over
--   2. who hears: its org admins, mentors and members, not the sender, not
--      somebody who answered already, left, was paused, blocked the sender or
--      is outside it
--   3. again: never twice in 12 hours; "not opened" and "no answer" pick the
--      right people; opening from the bell or the push counts
--   4. Stats: the people, the numbers per event and who did what, for org
--      admins only
--   5. the bell lists it, opening the event
--   6. every new event: five minutes on, made in the club, a repeating event
--      once, and the switch itself
--
-- Run it against a local stack (never the hosted project):
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/event-notices.sql
--
-- One transaction, rolled back.
-- ============================================================================

\set ON_ERROR_STOP on
\set VERBOSITY terse
\pset pager off

begin;

-- ------------------------------------------------------------------ set-up --
-- a admin, b second admin, m mentor, n member, c member already going,
-- l left, k blocked the admin, s paused, x outside.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
select ('aaaaaaaa-1103-0000-0000-00000000000' || x)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'notice-' || x || '@probe.test', now()
  from unnest(array['a', 'b', 'c', 'd', 'e', 'f', '1', '2', '3']) x;

insert into public.members (id, type, status, display_name, birth_date, level_range, state, is_admin)
select ('aaaaaaaa-1103-0000-0000-00000000000' || x)::uuid, 'peer',
       case when x = '2' then 'suspended' else 'active' end,
       'Probe ' || x, '1980-01-01', 'T1–T6', 'CA', false
  from unnest(array['a', 'b', 'c', 'd', 'e', 'f', '1', '2', '3']) x;

insert into public.organizations (id, short_code, name, joins_need_approval)
values ('bbbbbbbb-1103-0000-0000-000000000001', 'NTCX', 'Probe Org', false);

insert into public.organization_representatives (organization_id, member_id) values
  ('bbbbbbbb-1103-0000-0000-000000000001', 'aaaaaaaa-1103-0000-0000-00000000000a'),
  ('bbbbbbbb-1103-0000-0000-000000000001', 'aaaaaaaa-1103-0000-0000-00000000000b');
insert into public.organization_mentors (organization_id, member_id) values
  ('bbbbbbbb-1103-0000-0000-000000000001', 'aaaaaaaa-1103-0000-0000-00000000000c');
insert into public.organization_members (organization_id, member_id, joined_via, left_at) values
  ('bbbbbbbb-1103-0000-0000-000000000001', 'aaaaaaaa-1103-0000-0000-00000000000d', 'join', null),
  ('bbbbbbbb-1103-0000-0000-000000000001', 'aaaaaaaa-1103-0000-0000-00000000000e', 'join', null),
  ('bbbbbbbb-1103-0000-0000-000000000001', 'aaaaaaaa-1103-0000-0000-00000000000f', 'join', now()),
  ('bbbbbbbb-1103-0000-0000-000000000001', 'aaaaaaaa-1103-0000-0000-000000000001', 'join', null),
  ('bbbbbbbb-1103-0000-0000-000000000001', 'aaaaaaaa-1103-0000-0000-000000000002', 'join', null);
insert into public.member_blocks (blocker_id, blocked_id)
values ('aaaaaaaa-1103-0000-0000-000000000001', 'aaaaaaaa-1103-0000-0000-00000000000a');

-- e1 upcoming, e2 over, e3 for groups only.
insert into public.events (id, title, start_time, organization_id, audience) values
  ('cccccccc-1103-0000-0000-000000000001', 'Probe meet-up', now() + interval '3 days', 'bbbbbbbb-1103-0000-0000-000000000001', 'club'),
  ('cccccccc-1103-0000-0000-000000000002', 'Probe past', now() - interval '3 days', 'bbbbbbbb-1103-0000-0000-000000000001', 'club'),
  ('cccccccc-1103-0000-0000-000000000003', 'Probe groups', now() + interval '3 days', 'bbbbbbbb-1103-0000-0000-000000000001', 'groups');
insert into public.event_rsvps (event_id, member_id, status)
values ('cccccccc-1103-0000-0000-000000000001', 'aaaaaaaa-1103-0000-0000-00000000000e', 'going');

create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;
create function pg_temp.refused(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlstate = expected then raise notice 'PASS: refused (%) %', sqlstate, left(statement, 90); return; end if;
    raise;
  end;
  raise exception 'FAIL: accepted %', statement;
end $$;
-- A statement as one member, back to the owner after.
create function pg_temp.as_member(member text, statement text) returns setof jsonb language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', ('aaaaaaaa-1103-0000-0000-00000000000' || member), 'role', 'authenticated')::text, true);
  set local role authenticated;
  return query execute 'select to_jsonb(q) from (' || statement || ') q';
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
  if sqlstate = expected then raise notice 'PASS: refused (%) as % %', sqlstate, member, left(statement, 70); return; end if;
  raise;
end $$;
create function pg_temp.sent_now(who text) returns integer language sql as $$
  select (pg_temp.as_member('a',
    'select public.notify_members_of_event(''cccccccc-1103-0000-0000-000000000001'', ''' || who || ''') as n') ->> 'n')::integer;
$$;
-- As if the last notice went out 13 hours ago.
create function pg_temp.later() returns void language sql as $$
  update public.event_member_notices set last_sent_at = last_sent_at - interval '13 hours'
   where event_id = 'cccccccc-1103-0000-0000-000000000001';
$$;

-- ============================================================ 1. who may --
\echo '== 1. who may =='
select pg_temp.refused_as('d', 'select public.notify_members_of_event(''cccccccc-1103-0000-0000-000000000001'')', '42501');
select pg_temp.refused_as('3', 'select public.notify_members_of_event(''cccccccc-1103-0000-0000-000000000001'')', '42501');
select pg_temp.refused_as('a', 'select public.notify_members_of_event(''cccccccc-1103-0000-0000-000000000002'')', '22023');
select pg_temp.refused_as('a', 'select public.notify_members_of_event(''cccccccc-1103-0000-0000-000000000001'', ''all'')', '22023');
select pg_temp.refused_as('d', 'select * from public.organization_people(''bbbbbbbb-1103-0000-0000-000000000001'')', '42501');
select pg_temp.refused_as('d', 'select * from public.organization_event_notices(''bbbbbbbb-1103-0000-0000-000000000001'')', '42501');
select pg_temp.refused_as('d', 'select * from public.event_notice_recipients(''cccccccc-1103-0000-0000-000000000001'')', '42501');
select pg_temp.refused_as('d', 'select public.set_organization_notifies_members(''bbbbbbbb-1103-0000-0000-000000000001'', true)', '42501');
select pg_temp.check_true(
  not has_function_privilege('authenticated', 'private.send_event_notice(uuid,text,uuid)', 'execute'),
  'a member cannot call the sending itself');
select pg_temp.check_true(
  not has_table_privilege('authenticated', 'public.event_member_notices', 'select'),
  'a member cannot read who was told');

-- ============================================================ 2. who hears --
\echo '== 2. who hears: expect the second admin, the mentor and one member =='
select pg_temp.check_true(pg_temp.sent_now('everyone') = 3, 'the first notice goes to three');
select pg_temp.check_true(
  (select array_agg(right(member_id::text, 1) order by member_id::text) from public.event_member_notices
    where event_id = 'cccccccc-1103-0000-0000-000000000001') = array['b', 'c', 'd'],
  'to the second admin, the mentor and the member: not the sender, not who is going, left, blocked them, paused or is outside');
select pg_temp.check_true(
  (select count(*) from public.notifications where kind = 'event_notice'
    and event_id = 'cccccccc-1103-0000-0000-000000000001') = 3,
  'each has it in the bell');
select pg_temp.check_true(
  (select count(*) from public.event_notice_sends where event_id = 'cccccccc-1103-0000-0000-000000000001') = 1,
  'the send is recorded once');

-- ================================================================ 3. again --
\echo '== 3. again =='
select pg_temp.check_true(pg_temp.sent_now('everyone') = 0, 'nobody is told twice in 12 hours');
select pg_temp.check_true(pg_temp.sent_now('no_answer') = 0, 'not even who has not answered');

-- The member opens it from its push; the mentor says Interested.
select pg_temp.as_member('d', 'select public.notifications_mark_read_by_tag(''notice:cccccccc-1103-0000-0000-000000000001'') as done');
insert into public.event_rsvps (event_id, member_id, status)
values ('cccccccc-1103-0000-0000-000000000001', 'aaaaaaaa-1103-0000-0000-00000000000c', 'interested');
select pg_temp.check_true(
  (select opened_at is not null from public.event_member_notices
    where event_id = 'cccccccc-1103-0000-0000-000000000001' and member_id = 'aaaaaaaa-1103-0000-0000-00000000000d'),
  'opening it is recorded');

select pg_temp.later();
select pg_temp.check_true(pg_temp.sent_now('not_opened') = 1, 'not opened: only the second admin');
select pg_temp.later();
select pg_temp.check_true(pg_temp.sent_now('no_answer') = 2, 'no answer: the second admin and the member who opened it');
select pg_temp.check_true(
  (select sends from public.event_member_notices
    where event_id = 'cccccccc-1103-0000-0000-000000000001' and member_id = 'aaaaaaaa-1103-0000-0000-00000000000b') = 3,
  'the second admin has had it three times');
select pg_temp.check_true(
  (select count(*) from public.notifications where kind = 'event_notice'
    and member_id = 'aaaaaaaa-1103-0000-0000-00000000000d') = 2,
  'the member who opened it gets a fresh one, beside the read one');
select pg_temp.check_true(
  (select count(*) from public.notifications where kind = 'event_notice'
    and member_id = 'aaaaaaaa-1103-0000-0000-00000000000b' and read_at is null) = 1,
  'an unopened one is brought back up, not doubled');

-- ================================================================ 4. Stats --
\echo '== 4. Stats =='
select pg_temp.check_true(
  (select jsonb_agg(right(p ->> 'member_id', 1) || ':' ||
                    case when (p ->> 'is_org_admin')::boolean then 'admin'
                         when (p ->> 'is_mentor')::boolean then 'mentor' else 'member' end
                    order by p ->> 'member_id')
     from pg_temp.as_member('a', 'select * from public.organization_people(''bbbbbbbb-1103-0000-0000-000000000001'')') p)
  = '["1:member", "a:admin", "b:admin", "c:mentor", "d:member", "e:member"]'::jsonb,
  'the people: admins, the mentor and members; not who left or is paused');
select pg_temp.check_true(
  (select p from pg_temp.as_member('a',
     'select notified, opened, going, interested, not_opened, no_answer, can_reach from public.organization_event_notices(''bbbbbbbb-1103-0000-0000-000000000001'') where event_id = ''cccccccc-1103-0000-0000-000000000001''') p)
  = '{"notified": 3, "opened": 1, "going": 0, "interested": 1, "not_opened": 1, "no_answer": 2, "can_reach": 0}'::jsonb,
  'the numbers for the event');
select pg_temp.check_true(
  (select jsonb_agg(right(p ->> 'event_id', 1) order by p ->> 'event_id') from pg_temp.as_member('a',
     'select event_id from public.organization_event_notices(''bbbbbbbb-1103-0000-0000-000000000001'')') p)
  = '["1", "3"]'::jsonb,
  'upcoming events; not a past one nobody was notified of');
insert into public.event_member_notices (event_id, member_id, organization_id, first_sent_at, last_sent_at)
values ('cccccccc-1103-0000-0000-000000000002', 'aaaaaaaa-1103-0000-0000-00000000000d',
        'bbbbbbbb-1103-0000-0000-000000000001', now() - interval '4 days', now() - interval '4 days');
select pg_temp.check_true(
  (select count(*) from pg_temp.as_member('a',
     'select * from public.organization_event_notices(''bbbbbbbb-1103-0000-0000-000000000001'')')) = 3,
  'a past event someone was notified of stays');
select pg_temp.check_true(
  (select p from pg_temp.as_member('a',
     'select people_going, people_interested from public.organization_event_notices(''bbbbbbbb-1103-0000-0000-000000000001'') where event_id = ''cccccccc-1103-0000-0000-000000000001''') p)
  = '{"people_going": 1, "people_interested": 1}'::jsonb,
  'its people''s answers, notified or not');
insert into public.event_rsvps (event_id, member_id, status)
values ('cccccccc-1103-0000-0000-000000000001', 'aaaaaaaa-1103-0000-0000-000000000001', 'going');
select pg_temp.check_true(
  (select (p ->> 'people_going')::integer from pg_temp.as_member('a',
     'select people_going from public.organization_event_notices(''bbbbbbbb-1103-0000-0000-000000000001'') where event_id = ''cccccccc-1103-0000-0000-000000000001''') p)
  = 1,
  'not the answer of someone in a block with the admin');
select pg_temp.check_true(
  (select jsonb_agg(right(p ->> 'member_id', 1) || ':' || coalesce(p ->> 'rsvp', '-') || ':' ||
                    (p ->> 'opened_at' is not null)::text || ':' || (p ->> 'sends'))
     from pg_temp.as_member('a', 'select * from public.event_people_answers(''cccccccc-1103-0000-0000-000000000001'')') p)
  = '["e:going:false:0", "c:interested:false:1", "d:-:true:2", "b:-:false:3", "a:-:false:0"]'::jsonb,
  'everyone and what each did: answered, opened, notified, then the rest');
select pg_temp.refused_as('d', 'select * from public.event_people_answers(''cccccccc-1103-0000-0000-000000000001'')', '42501');
select pg_temp.check_true(
  (select jsonb_object_agg(right(p ->> 'member_id', 1), p -> 'sees_event') @> '{"a": true, "d": false}'
     from pg_temp.as_member('a', 'select * from public.event_people_answers(''cccccccc-1103-0000-0000-000000000003'')') p),
  'says who cannot see an event for groups only');
select pg_temp.check_true(
  (select jsonb_agg(right(p ->> 'member_id', 1) || ':' || coalesce(p ->> 'rsvp', '-') || ':' ||
                    (p ->> 'opened_at' is not null)::text order by p ->> 'member_id')
     from pg_temp.as_member('a', 'select * from public.event_notice_recipients(''cccccccc-1103-0000-0000-000000000001'')') p)
  = '["b:-:false", "c:interested:false", "d:-:true"]'::jsonb,
  'who was told, and what each did');

-- ============================================================== 5. the bell --
\echo '== 5. the bell =='
select pg_temp.check_true(
  (select p ->> 'place' = 'Probe meet-up' and p ->> 'excerpt' = 'Probe Org'
          and p ->> 'url' = '/events/cccccccc-1103-0000-0000-000000000001' and p ->> 'detail' = 'again'
     from pg_temp.as_member('b', 'select * from public.my_notifications() where kind = ''event_notice''') p),
  'it names the event and the organization, and opens the event');
select pg_temp.check_true(
  (select notification_badge('aaaaaaaa-1103-0000-0000-00000000000b')) >= 1,
  'it counts on the icon');

-- ======================================================= 6. every new event --
\echo '== 6. every new event =='
select pg_temp.check_true(
  (select count(*) from pg_temp.as_member('a',
     'select 1 from (select public.notify_members_of_event(''cccccccc-1103-0000-0000-000000000003'') as n) q where n = 1')) = 1,
  'an event for groups only: just the org admin who sees it');

select pg_temp.as_member('a', 'select public.set_organization_notifies_members(''bbbbbbbb-1103-0000-0000-000000000001'', true) as done');
select pg_temp.check_true(
  (select notifies_members_since is not null from public.organizations where id = 'bbbbbbbb-1103-0000-0000-000000000001'),
  'the switch turns on');
update public.organizations set notifies_members_since = now() - interval '1 hour'
 where id = 'bbbbbbbb-1103-0000-0000-000000000001';

insert into public.event_series (id, series_key, title, repeat_unit, repeat_every, first_start, ends_after, added_by, template)
values ('dddddddd-1103-0000-0000-000000000001', 'probe-notice-series', 'Probe weekly', 'week', 1,
        now() + interval '2 days', 2, 'aaaaaaaa-1103-0000-0000-00000000000a', '{}'::jsonb);
insert into public.events (id, title, start_time, organization_id, audience, created_at, added_by, series_id) values
  ('cccccccc-1103-0000-0000-000000000004', 'Probe new',    now() + interval '5 days', 'bbbbbbbb-1103-0000-0000-000000000001', 'club', now() - interval '10 minutes', 'aaaaaaaa-1103-0000-0000-00000000000a', null),
  ('cccccccc-1103-0000-0000-000000000005', 'Probe just',   now() + interval '5 days', 'bbbbbbbb-1103-0000-0000-000000000001', 'club', now() - interval '1 minute',   'aaaaaaaa-1103-0000-0000-00000000000a', null),
  ('cccccccc-1103-0000-0000-000000000006', 'Probe before', now() + interval '5 days', 'bbbbbbbb-1103-0000-0000-000000000001', 'club', now() - interval '2 hours',    'aaaaaaaa-1103-0000-0000-00000000000a', null),
  ('cccccccc-1103-0000-0000-000000000007', 'Probe weekly', now() + interval '2 days', 'bbbbbbbb-1103-0000-0000-000000000001', 'club', now() - interval '10 minutes', 'aaaaaaaa-1103-0000-0000-00000000000a', 'dddddddd-1103-0000-0000-000000000001'),
  ('cccccccc-1103-0000-0000-000000000008', 'Probe weekly', now() + interval '9 days', 'bbbbbbbb-1103-0000-0000-000000000001', 'club', now() - interval '10 minutes', 'aaaaaaaa-1103-0000-0000-00000000000a', 'dddddddd-1103-0000-0000-000000000001');

select private.event_notices_auto();
select pg_temp.check_true(
  (select array_agg(right(event_id::text, 1) order by event_id::text) from public.event_notice_sends
    where event_id::text like 'cccccccc-1103-0000-0000-00000000000%' and who = 'everyone'
      and event_id not in ('cccccccc-1103-0000-0000-000000000001', 'cccccccc-1103-0000-0000-000000000003'))
  = array['4', '7'],
  'told: the new event and the first date of the repeating one; not one made a minute ago or before the switch');
select pg_temp.check_true(
  (select sent_by from public.event_notice_sends where event_id = 'cccccccc-1103-0000-0000-000000000004')
  = 'aaaaaaaa-1103-0000-0000-00000000000a',
  'from the org admin who made it');
select pg_temp.check_true(
  (select count(*) from public.event_member_notices where event_id = 'cccccccc-1103-0000-0000-000000000004') = 4,
  'to the second admin, the mentor and both members still in, nobody blocked');
select private.event_notices_auto();
select pg_temp.check_true(
  (select count(*) from public.event_notice_sends where event_id = 'cccccccc-1103-0000-0000-000000000004') = 1,
  'never twice');

select pg_temp.as_member('a', 'select public.set_organization_notifies_members(''bbbbbbbb-1103-0000-0000-000000000001'', false) as done');
select pg_temp.check_true(
  (select notifies_members_since is null from public.organizations where id = 'bbbbbbbb-1103-0000-0000-000000000001'),
  'the switch turns off');

\echo '== done: every line above PASS =='
rollback;
