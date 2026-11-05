-- ============================================================================
-- The notify list counts each event once (20261104215000)
-- ============================================================================
-- organization_event_notices, rewritten for speed, must return what the
-- 20261103085000 version returned, row for row and in order. An organization
-- with org admins, a mentor, members (one left, one denied, one paused, one
-- removed), people who follow it, a group, notices sent to its people and to
-- outsiders, answers, and blocks both ways; 110 upcoming events (past the 100
-- shown) plus past ones with and without notices.
--
-- Each viewer asks the new function and a copy of the old one, here in
-- pg_temp.old_notices. One transaction, rolled back. With psql:
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p <port> -U postgres -d postgres \
--     -f - < supabase/tests/event-notices-same-rows.sql
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off
begin;

create function pg_temp.m(i int) returns uuid language sql immutable as
$$ select ('a0000000-1104-0000-0000-' || lpad(i::text, 12, '0'))::uuid $$;
create function pg_temp.ev(i int) returns uuid language sql immutable as
$$ select ('e0000000-1104-0000-0000-' || lpad(i::text, 12, '0'))::uuid $$;

-- 1-2 org admins, 3 a paused org admin, 4 mentor, 5-20 members, 21 left,
-- 22 denied, 23 paused member, 24 removed member, 25 blocked org admin 1,
-- 26 org admin 1 blocked, 30-34 outsiders (30-31 follow, 32 in the group),
-- 35 a club admin, 36 another org's org admin.
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin)
select pg_temp.m(i), 'peer',
       case when i in (3, 23) then 'suspended' when i = 24 then 'removed' else 'active' end,
       'Probe ' || i, '1997110' || lpad(i::text, 4, '0'), '1980-01-01', 'T1–T6', 'CA', i = 35
  from generate_series(1, 36) i;
insert into public.organizations (id, short_code, name, city, state) values
  ('c0000000-1104-0000-0000-000000000001', 'QPRB', 'Probe Org', 'Fresno', 'CA'),
  ('c0000000-1104-0000-0000-000000000002', 'QPRC', 'Other Probe Org', 'Fresno', 'CA');
insert into public.organization_representatives (organization_id, member_id) values
  ('c0000000-1104-0000-0000-000000000001', pg_temp.m(1)),
  ('c0000000-1104-0000-0000-000000000001', pg_temp.m(2)),
  ('c0000000-1104-0000-0000-000000000001', pg_temp.m(3)),
  ('c0000000-1104-0000-0000-000000000002', pg_temp.m(36));
insert into public.organization_mentors (organization_id, member_id) values
  ('c0000000-1104-0000-0000-000000000001', pg_temp.m(4));
insert into public.organization_members (organization_id, member_id, joined_via, left_at, denied_at)
select 'c0000000-1104-0000-0000-000000000001', pg_temp.m(i), 'code',
       case when i = 21 then now() end, case when i = 22 then now() end
  from (select generate_series(5, 26) union all select 4) s(i)
on conflict (organization_id, member_id) do update set left_at = excluded.left_at, denied_at = excluded.denied_at;
insert into public.organization_follows (organization_id, member_id) values
  ('c0000000-1104-0000-0000-000000000001', pg_temp.m(30)),
  ('c0000000-1104-0000-0000-000000000001', pg_temp.m(31)),
  ('c0000000-1104-0000-0000-000000000001', pg_temp.m(12))
on conflict do nothing;
insert into public.member_blocks (blocker_id, blocked_id) values
  (pg_temp.m(25), pg_temp.m(1)), (pg_temp.m(1), pg_temp.m(26)), (pg_temp.m(7), pg_temp.m(8));
insert into public.chat_threads (id, kind, name) values ('d0000000-1104-0000-0000-000000000001', 'group', 'Probe group');
insert into public.chat_thread_members (thread_id, member_id)
select 'd0000000-1104-0000-0000-000000000001', pg_temp.m(i) from (values (5), (6), (9), (25), (32)) v(i);

-- 1-110 upcoming, audiences in turn; 111 three days ago, notified; 112 three
-- days ago, not; 113 ten days ago, notified; 114 another org's.
insert into public.events (id, title, start_time, end_time, organization_id, audience, added_by, timezone)
select pg_temp.ev(i), 'Probe event ' || i,
       case when i <= 110 then now() + i * interval '5 hours'
            when i in (111, 112) then now() - interval '3 days'
            when i = 113 then now() - interval '10 days'
            else now() + interval '1 day' end,
       null,
       case when i = 114 then 'c0000000-1104-0000-0000-000000000002'::uuid
            else 'c0000000-1104-0000-0000-000000000001'::uuid end,
       (array['public', 'club', 'followers', 'groups'])[1 + i % 4],
       case when i % 7 = 0 then pg_temp.m(10) else pg_temp.m(1) end, 'America/Los_Angeles'
  from generate_series(1, 114) i;
insert into public.event_audience_groups (event_id, thread_id)
select pg_temp.ev(i), 'd0000000-1104-0000-0000-000000000001' from generate_series(1, 114) i where i % 4 = 3;
-- Notices to people 2-34 on some events, opened by some.
insert into public.event_member_notices (event_id, member_id, organization_id, first_sent_at, last_sent_at, sends, opened_at)
select pg_temp.ev(e), pg_temp.m(p), 'c0000000-1104-0000-0000-000000000001',
       now() - interval '4 days', now() - (p % 5) * interval '1 hour', 1 + p % 2,
       case when (e + p) % 3 = 0 then now() end
  from generate_series(1, 113) e, generate_series(2, 34) p
 where e % 3 <> 1 and (e + p) % 4 <> 0;
-- Answers from everyone, on most events.
insert into public.event_rsvps (event_id, member_id, status)
select pg_temp.ev(e), pg_temp.m(p), case when (e + p) % 2 = 0 then 'going' else 'interested' end
  from generate_series(1, 114) e, generate_series(1, 36) p
 where (e * p) % 5 in (1, 2);

-- The old function, word for word but for its name.
create function pg_temp.old_notices(p_organization uuid)
returns table (
  event_id uuid,
  title text,
  start_time timestamptz,
  timezone text,
  all_day boolean,
  notified integer,
  opened integer,
  going integer,
  interested integer,
  not_opened integer,
  no_answer integer,
  can_reach integer,
  last_sent_at timestamptz,
  people_going integer,
  people_interested integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.speaks_for(p_organization) or public.is_admin()) then
    raise exception 'Only its org admins can see this.' using errcode = '42501';
  end if;
  return query
    select e.id, e.title, e.start_time, e.timezone, e.all_day,
           count(x.member_id)::integer,
           count(x.opened_at)::integer,
           count(x.member_id) filter (where r.status = 'going')::integer,
           count(x.member_id) filter (where r.status = 'interested')::integer,
           count(x.member_id) filter (where x.opened_at is null and r.status is null)::integer,
           count(x.member_id) filter (where r.status is null)::integer,
           (
             select count(*)::integer
               from private.organization_people_ids(p_organization) p
              where p.member_id is distinct from auth.uid()
                and private.member_sees_event(p.member_id, e.id)
                and not exists (
                  select 1 from public.event_rsvps y where y.event_id = e.id and y.member_id = p.member_id
                )
                and not exists (
                  select 1 from public.event_member_notices z
                   where z.event_id = e.id and z.member_id = p.member_id
                )
                and not public.members_blocked(auth.uid(), p.member_id)
           ),
           max(x.last_sent_at),
           a.going,
           a.interested
      from public.events e
      left join public.event_member_notices x on x.event_id = e.id
      left join public.event_rsvps r on r.event_id = e.id and r.member_id = x.member_id
      cross join lateral (
        select count(*) filter (where y.status = 'going')::integer as going,
               count(*) filter (where y.status = 'interested')::integer as interested
          from private.event_people(e.id, auth.uid()) q
          join public.event_rsvps y on y.event_id = e.id and y.member_id = q.member_id
      ) a
     where e.organization_id = p_organization
       and coalesce(e.end_time, e.start_time) > now() - interval '7 days'
       and (
         e.start_time > now()
         or exists (select 1 from public.event_member_notices z where z.event_id = e.id)
       )
     group by e.id, a.going, a.interested
     order by e.start_time, e.id
     limit 100;
end;
$$;

-- Every row as text, in order, or 'refused'.
create function pg_temp.outcome(old boolean, org uuid) returns text language plpgsql as $$
declare
  r text;
begin
  if old then
    select string_agg(t::text, E'\n' order by n) into r
      from (select row_number() over () n, t from pg_temp.old_notices(org) t) z;
  else
    select string_agg(t::text, E'\n' order by n) into r
      from (select row_number() over () n, t from public.organization_event_notices(org) t) z;
  end if;
  return coalesce(r, '');
exception when insufficient_privilege then
  return 'refused';
end;
$$;
grant execute on all functions in schema pg_temp to authenticated;

create temp table seen (who text, old text, new text);
grant all on seen to authenticated;

create function pg_temp.ask(who text, viewer int, org text default '1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.m(viewer), 'role', 'authenticated')::text, true);
  insert into seen values (who,
    pg_temp.outcome(true, ('c0000000-1104-0000-0000-00000000000' || org)::uuid),
    pg_temp.outcome(false, ('c0000000-1104-0000-0000-00000000000' || org)::uuid));
end;
$$;
grant execute on function pg_temp.ask(text, int, text) to authenticated;

set local role authenticated;
select pg_temp.ask('1 org admin, blocks both ways', 1);
select pg_temp.ask('2 org admin, no blocks', 2);
select pg_temp.ask('3 club admin', 35);
select pg_temp.ask('4 member', 5);
select pg_temp.ask('5 mentor', 4);
select pg_temp.ask('6 non-member', 33);
select pg_temp.ask('7 member who blocked the org admin', 25);
select pg_temp.ask('8 paused org admin', 3);
select pg_temp.ask('9 another org''s org admin', 36);
select pg_temp.ask('10 another org''s org admin, own org', 36, '2');
reset role;

\echo '== each viewer: the old and the new give the same rows =='
\echo '   expect: 1 same 100 | 2 same 100 | 3 same 100 | 4-9 same refused | 10 same 1'
select who, case when old = new then 'same' else 'DIFFERENT' end as result,
       case when new = 'refused' then 'refused' when new = '' then '0'
            else (array_length(string_to_array(new, E'\n'), 1))::text end as rows
  from seen order by split_part(who, ' ', 1)::int;

\echo ''
\echo '== org admin 1 (blocks, not counted themselves) and org admin 2 get different counts =='
\echo '   expect: f (the two lists differ)'
select (select new from seen where who like '1 %') = (select new from seen where who like '2 %') as alike;

\echo ''
\echo '== the list covers the cases: past notified shown, past un-notified and 10 days old not =='
\echo '   expect: t | f | f | t (111 shown, 112 and 113 not, 110th upcoming cut by the limit)'
select position(pg_temp.ev(111)::text in new) > 0,
       position(pg_temp.ev(112)::text in new) > 0,
       position(pg_temp.ev(113)::text in new) > 0,
       position(pg_temp.ev(110)::text in new) = 0
  from seen where who like '1 %';

rollback;
