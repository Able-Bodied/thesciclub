-- ============================================================================
-- Event reminders every five minutes (20261105030000)
-- ============================================================================
-- The job is scheduled every 5 minutes, once. Stepping time in 5-minute
-- steps (events moved back 5 minutes per run), each ten-minutes-before and
-- check-in reminder is sent exactly once, at the first run its window
-- allows, with starts and ends just before, on and after the boundaries.
-- The ten-minute one goes 10 to 15 min 30 s before the start on time, and
-- 5 to 10 minutes before when it was not sent sooner: a start already that
-- close at the first run, or after a missed run (the owner, 2026-11-05).
-- Never under 5 minutes, never twice. A run 50 s late still sends a start
-- on the minute at over 10 minutes. Follow-ups go for events
-- that ended late or early yesterday (local), not today's or older ones,
-- and once. Every follow-up's due time, across zones and DST changes, lies
-- inside the new prefilter. The new index serves that prefilter.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/event-reminders-every-five-minutes.sql
--
-- Every check prints PASS or stops the script with FAIL. Rolls back. Do not
-- point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

begin;

create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;

-- Only this probe's rows count.
delete from public.event_starting_sent;
delete from public.event_check_in_reminders_sent;
delete from public.event_followups_sent;
delete from public.event_day_before_sent;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state) values
  ('a0000000-1105-0003-0000-000000000001', 'peer', 'active', 'Goer', '19991105301', '1980-01-01', 'T1–T6', 'CA'),
  ('a0000000-1105-0003-0000-000000000002', 'peer', 'active', 'Came', '19991105302', '1980-01-01', 'T1–T6', 'CA');

-- name, minutes from the first run: a start (ten), or an end (check-in,
-- with or without an end time).
create temp table plan (name text primary key, branch text, at interval, has_end boolean) on commit drop;
insert into plan values
  ('s-started', 'ten', interval '-1 second', null),
  ('s-4m59',    'ten', interval '4 minutes 59 seconds', null),
  ('s-5m',      'ten', interval '5 minutes', null),
  ('s-5m01',    'ten', interval '5 minutes 1 second', null),
  ('s-9m59',    'ten', interval '9 minutes 59 seconds', null),
  ('s-10m',     'ten', interval '10 minutes', null),
  ('s-10m01',   'ten', interval '10 minutes 1 second', null),
  ('s-10m29',   'ten', interval '10 minutes 29 seconds', null),
  ('s-10m30',   'ten', interval '10 minutes 30 seconds', null),
  ('s-10m31',   'ten', interval '10 minutes 31 seconds', null),
  ('s-14m59',   'ten', interval '14 minutes 59 seconds', null),
  ('s-15m',     'ten', interval '15 minutes', null),
  ('s-15m01',   'ten', interval '15 minutes 1 second', null),
  ('s-15m30',   'ten', interval '15 minutes 30 seconds', null),
  ('s-15m31',   'ten', interval '15 minutes 31 seconds', null),
  ('s-19m59',   'ten', interval '19 minutes 59 seconds', null),
  ('s-20m',     'ten', interval '20 minutes', null),
  ('s-20m01',   'ten', interval '20 minutes 1 second', null),
  ('s-37m',     'ten', interval '37 minutes', null),
  ('c-45m',     'check', interval '-45 minutes', true),
  ('c-44m59',   'check', interval '-44 minutes -59 seconds', true),
  ('c-30m01',   'check', interval '-30 minutes -1 second', true),
  ('c-30m',     'check', interval '-30 minutes', true),
  ('c-29m59',   'check', interval '-29 minutes -59 seconds', true),
  ('c-25m01',   'check', interval '-25 minutes -1 second', true),
  ('c-0s',      'check', interval '0', true),
  ('c-1s',      'check', interval '1 second', true),
  ('c-4h-30m',  'check', interval '-30 minutes', false),
  ('c-4h-44m59','check', interval '-44 minutes -59 seconds', false),
  ('c-4h-45m',  'check', interval '-45 minutes', false),
  ('c-4h+2m',   'check', interval '2 minutes', false),
  ('c-4h+13m',  'check', interval '13 minutes', false);

create temp table probe_events (name text primary key, id uuid) on commit drop;
with made as (
  insert into public.events (title, host_name, start_time, end_time)
  select 'probe-5m ' || p.name, 'Probe',
         case when p.branch = 'ten' then now() + p.at
              when p.has_end then now() + p.at - interval '1 hour'
              else now() + p.at - interval '4 hours' end,
         case when p.branch = 'check' and p.has_end then now() + p.at end
    from plan p
  returning id, title
)
insert into probe_events select substr(title, 10), id from made;

insert into public.event_rsvps (event_id, member_id, status)
select e.id, m.id, 'going' from probe_events e
  cross join (values ('a0000000-1105-0003-0000-000000000001'::uuid),
                     ('a0000000-1105-0003-0000-000000000002'::uuid)) m(id);
-- Came checked in everywhere, so is never reminded to.
insert into public.event_check_ins (event_id, member_id)
select id, 'a0000000-1105-0003-0000-000000000002' from probe_events;

-- One run per step; the step each batch was.
create temp table runs (batch timestamptz, step integer, moved interval) on commit drop;
create temp table moved (by interval) on commit drop;
insert into moved values (interval '0');
create function pg_temp.run(step integer) returns void language plpgsql as $$
declare started timestamptz := clock_timestamp();
begin
  perform public.push_event_reminders();
  -- Only this call's batch.
  insert into runs
  select distinct batch, step, (select by from moved) from (
    select batch from public.event_starting_sent
    union select batch from public.event_check_in_reminders_sent) b
   where batch >= started;
end $$;
create function pg_temp.later(minutes integer, seconds integer default 0) returns void language sql as $$
  update public.events
     set start_time = start_time - make_interval(mins => minutes, secs => seconds),
         end_time = end_time - make_interval(mins => minutes, secs => seconds)
   where id in (select id from probe_events);
  update moved set by = by + make_interval(mins => minutes, secs => seconds);
$$;

do $$
begin
  for k in 0..12 loop
    perform pg_temp.run(k);
    perform pg_temp.later(5);
  end loop;
end $$;

-- Sent: member, event, the step it went at.
create temp table sent on commit drop as
select 'ten' as branch, s.member_id, e.name, r.step
  from public.event_starting_sent s join probe_events e on e.id = s.event_id join runs r using (batch)
union all
select 'check', s.member_id, e.name, r.step
  from public.event_check_in_reminders_sent s join probe_events e on e.id = s.event_id join runs r using (batch);

-- The step each should go at: the first k >= 0 inside its window, if any.
create temp table expected on commit drop as
select p.name, p.branch,
       (select min(k) from generate_series(0, 12) k
         where case when p.branch = 'ten'
                 then p.at > make_interval(mins => 5 * k + 5)
                  and p.at <= make_interval(mins => 5 * k + 15, secs => 30)
                 else p.at + interval '30 minutes' <= make_interval(mins => 5 * k)
                  and p.at + interval '45 minutes' > make_interval(mins => 5 * k) end) as step
  from plan p;

do $$
declare bad text;
begin
  select string_agg(format('%s expected %s got %s', x.name, x.step, s.steps), '; ') into bad
    from expected x
    left join (select name, branch, string_agg(step::text, ',' order by step) as steps
                 from sent where member_id = 'a0000000-1105-0003-0000-000000000001'
                group by 1, 2) s using (name, branch)
   where coalesce(x.step::text, '-') is distinct from coalesce(s.steps, '-');
  perform pg_temp.check_true(bad is null,
    'every ten-minute and check-in reminder went once, at the first run its window allows' || coalesce(' — ' || bad, ''));
end $$;

select pg_temp.check_true(
  (select count(*) from expected where step is not null and branch = 'ten') = 16
  and (select count(*) from expected where step is not null and branch = 'check') = 11
  and (select count(*) from expected where step is null) = 5,
  'the plan reaches 16 ten-minute and 11 check-in reminders, and 5 are never due');

select pg_temp.check_true(
  (select string_agg(name, ',' order by name) from expected where step is null and branch = 'ten')
    = 's-4m59,s-5m,s-started',
  'only starts already 5 minutes away or less at the first run go without');

-- The ten-minute lead, start minus the run's time, for every one sent: over
-- 5 minutes always, and over 10 for a start that was over 10 away at the
-- run before.
create function pg_temp.leads_ok() returns boolean language sql as $$
  select coalesce(bool_and(p.at - r.moved > interval '5 minutes'
                       and p.at - r.moved <= interval '15 minutes 30 seconds'), true)
    from public.event_starting_sent s join probe_events e on e.id = s.event_id
    join runs r using (batch) join plan p on p.name = e.name;
$$;
select pg_temp.check_true(pg_temp.leads_ok(),
  'every ten-minute reminder went 5 to 15 min 30 s before the start, never under 5');
select pg_temp.check_true(
  (select bool_and(p.at - r.moved > interval '10 minutes')
     from public.event_starting_sent s join probe_events e on e.id = s.event_id
     join runs r using (batch) join plan p on p.name = e.name
    where p.at > interval '15 minutes 30 seconds'),
  'on-time runs send 10 to 15 min 30 s before: every start seen early went over 10 minutes ahead');

select pg_temp.check_true(
  not exists (select 1 from sent where branch = 'ten' and name = 's-started'),
  'no ten-minute reminder for an event already started');

select pg_temp.check_true(
  not exists (select 1 from sent where branch = 'check' and member_id = 'a0000000-1105-0003-0000-000000000002'),
  'nobody who checked in is reminded to');

select pg_temp.check_true(
  (select count(*) from public.notifications
    where member_id = 'a0000000-1105-0003-0000-000000000001' and kind = 'event_starting'
      and event_id in (select id from probe_events)) = 16
  and (select count(*) from public.notifications
    where member_id = 'a0000000-1105-0003-0000-000000000001' and kind = 'check_in_reminder'
      and event_id in (select id from probe_events)) = 11,
  'one notification for each reminder sent');

-- A run 50 s late, then one missed. Fresh events, the clock from zero.
delete from runs;
update moved set by = interval '0';
insert into plan values
  ('late-15m',     'ten', interval '15 minutes', null),
  ('late-15m20',   'ten', interval '15 minutes 20 seconds', null),
  ('late-16m',     'ten', interval '16 minutes', null),
  ('late-20m',     'ten', interval '20 minutes', null),
  ('late-21m',     'ten', interval '21 minutes', null),
  ('missed-22m',   'ten', interval '22 minutes', null),
  ('missed-25m',   'ten', interval '25 minutes', null),
  ('missed-25m20', 'ten', interval '25 minutes 20 seconds', null),
  ('missed-30m',   'ten', interval '30 minutes', null);
with made as (
  insert into public.events (title, host_name, start_time)
  select 'probe-5m ' || name, 'Probe', now() + at from plan where name ~ '^(late|missed)-'
  returning id, title
)
insert into probe_events select substr(title, 10), id from made;
insert into public.event_rsvps (event_id, member_id, status)
select id, 'a0000000-1105-0003-0000-000000000001', 'going' from probe_events where name ~ '^(late|missed)-';
-- Runs at 0, at 5 m 50 s (50 s late), none at 10 m (missed), then 15 m.
select pg_temp.run(0);
select pg_temp.later(5, 50);
select pg_temp.run(1);
select pg_temp.later(9, 10);
select pg_temp.run(3);

select pg_temp.check_true(
  (select string_agg(e.name || '@' || r.step, ',' order by e.name)
     from public.event_starting_sent s join probe_events e on e.id = s.event_id
     join runs r using (batch) where e.name ~ '^(late|missed)-')
    = 'late-15m@0,late-15m20@0,late-16m@1,late-20m@1,late-21m@1,missed-22m@3,missed-25m@3,missed-25m20@3,missed-30m@3',
  'a run 50 s late still sends a start on the minute; after a missed one, every start still goes, once');

select pg_temp.check_true(
  (select bool_and(p.at - r.moved > interval '5 minutes' and p.at - r.moved <= interval '10 minutes')
     from public.event_starting_sent s join probe_events e on e.id = s.event_id
     join runs r using (batch) join plan p on p.name = e.name
    where e.name in ('missed-22m', 'missed-25m'))
  and (select bool_and(p.at - r.moved > interval '10 minutes')
     from public.event_starting_sent s join probe_events e on e.id = s.event_id
     join runs r using (batch) join plan p on p.name = e.name
    where e.name like 'late-%'),
  'what the missed run had goes late, 5 to 10 minutes before; the 50 s late run still sends over 10');

select pg_temp.check_true(pg_temp.leads_ok(),
  'late and after a missed run, never under 5 minutes before');

select pg_temp.check_true(
  (select count(*) from public.event_starting_sent s join probe_events e on e.id = s.event_id
    where e.name ~ '^(late|missed)-')
  = (select count(distinct e.name) from public.event_starting_sent s join probe_events e on e.id = s.event_id
    where e.name ~ '^(late|missed)-'),
  'none twice');

-- Follow-ups: in the whole-hour zone where it is now 10am, "yesterday" ended
-- events are due this hour.
create temp table zone_now on commit drop as
select z.name as zone, (now() at time zone z.name)::date as today
  from pg_timezone_names z
 where z.name ~ '^Etc/GMT[+-][0-9]+$' and extract(hour from now() at time zone z.name) = 10
 limit 1;
select pg_temp.check_true((select count(*) from zone_now) = 1, 'a zone where it is 10am now');

with made as (
  insert into public.events (title, host_name, start_time, end_time, timezone)
  select 'probe-5m ' || f.name, 'Probe', f.ends - interval '1 hour', f.ends, z.zone
    from zone_now z,
         lateral (values
           ('f-yesterday-late',  ((z.today - 1) + time '23:59:59') at time zone z.zone),
           ('f-yesterday-early', ((z.today - 1) + time '00:00:00') at time zone z.zone),
           ('f-today',           (z.today + time '00:00:01') at time zone z.zone),
           ('f-two-days',        ((z.today - 2) + time '23:59:00') at time zone z.zone)
         ) f(name, ends)
  returning id, title
)
insert into probe_events select substr(title, 10), id from made;
insert into public.event_check_ins (event_id, member_id)
select id, 'a0000000-1105-0003-0000-000000000002' from probe_events where name like 'f-%';

select public.push_event_reminders();
select public.push_event_reminders();

select pg_temp.check_true(
  (select string_agg(e.name, ',' order by e.name) from public.event_followups_sent s
     join probe_events e on e.id = s.event_id) = 'f-yesterday-early,f-yesterday-late',
  'follow-ups for events that ended late and early yesterday, not today''s or older ones');

select pg_temp.check_true(
  (select count(*) from public.notifications
    where member_id = 'a0000000-1105-0003-0000-000000000002' and kind = 'event_followup'
      and event_id in (select id from probe_events)) = 2,
  'each follow-up sent once, though the job ran twice');

-- The prefilter holds every due time: 10am the next local day is at least
-- 6 hours and under 47 hours after the end, across zones and DST changes.
do $$
declare worst_low interval; worst_high interval;
begin
  select min(due - ts), max(due - ts) into worst_low, worst_high
    from (values ('America/Los_Angeles'), ('America/New_York'), ('Europe/London'),
                 ('Australia/Lord_Howe'), ('Antarctica/Troll'), ('Pacific/Kiritimati'),
                 ('Pacific/Pago_Pago'), ('Pacific/Chatham'), ('Asia/Kathmandu'),
                 ('America/St_Johns')) z(zone),
         lateral (select generate_series(d, d + interval '3 days', interval '7 minutes') as ts
                    from (values (timestamptz '2026-03-06'), (timestamptz '2026-03-27'),
                                 (timestamptz '2026-04-03'), (timestamptz '2026-09-25'),
                                 (timestamptz '2026-10-02'), (timestamptz '2026-10-23'),
                                 (timestamptz '2026-10-30')) s(d)) g,
         lateral (select ((((ts at time zone z.zone)::date + 1) + interval '10 hours')
                           at time zone z.zone) as due) x;
  perform pg_temp.check_true(worst_low >= interval '6 hours' and worst_high < interval '47 hours',
    format('every follow-up due time falls inside the prefilter (%s to %s after the end)', worst_low, worst_high));
end $$;

select pg_temp.check_true(
  (select count(*) from cron.job where jobname = 'push-event-reminders') = 1
  and (select schedule from cron.job where jobname = 'push-event-reminders') = '*/5 * * * *',
  'push-event-reminders runs every 5 minutes, once');

set local enable_seqscan = off;
do $$
declare plan_text text := '';
        line text;
begin
  for line in execute 'explain select 1 from public.events e
      where coalesce(e.end_time, e.start_time) > now() - interval ''2 days''
        and coalesce(e.end_time, e.start_time) <= now() - interval ''6 hours''' loop
    plan_text := plan_text || line || ' ';
  end loop;
  perform pg_temp.check_true(plan_text like '%events_end_or_start_idx%',
    'the end-or-start prefilter can use its index');
end $$;

rollback;
