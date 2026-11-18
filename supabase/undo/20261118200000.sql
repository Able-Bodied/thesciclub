-- Undo for 20261118200000_how_did_it_go_is_not_asked_of_its_organizers.sql:
-- push_event_reminders as 20261113130000 left it.

create or replace function public.push_event_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_at timestamptz := clock_timestamp();
  recorded integer;
begin
  -- A day ahead of a timed event, from its own zone.
  insert into public.event_day_before_sent (event_id, member_id, batch)
  select e.id, rv.member_id, run_at
    from public.events e
    left join public.data_feeds f on f.id = e.feed_id
    join public.event_rsvps rv on rv.event_id = e.id and rv.status = 'going'
    join public.members r on r.id = rv.member_id and r.status = 'active'
   where not e.all_day
     and e.start_time > now() + interval '12 hours'
     and e.start_time <= now() + interval '36 hours'
     and private.day_ahead_at(e.start_time, coalesce(e.timezone, f.timezone, 'America/Los_Angeles')) <= now()
  on conflict do nothing;
  get diagnostics recorded = row_count;
  if recorded > 0 then
  insert into public.notifications as n (member_id, kind, tag, event_id, detail)
  select sent.member_id, 'event_reminder', 'event:' || sent.event_id::text, sent.event_id,
         lower(to_char(e.start_time at time zone coalesce(e.timezone, f.timezone, 'America/Los_Angeles'), 'FMHH12:MIam'))
    from public.event_day_before_sent sent
    join public.events e on e.id = sent.event_id
    left join public.data_feeds f on f.id = e.feed_id
   where sent.batch = run_at
  on conflict (member_id, tag) where read_at is null
  do update set created_at = clock_timestamp(), detail = excluded.detail, seen_at = null;
    perform public.push_notify_send('day_before', jsonb_build_object('batch', run_at));
  end if;

  -- Ten minutes before a timed event.
  insert into public.event_starting_sent (event_id, member_id, batch)
  select e.id, rv.member_id, run_at
    from public.events e
    join public.event_rsvps rv on rv.event_id = e.id and rv.status = 'going'
    join public.members r on r.id = rv.member_id and r.status = 'active'
   where not e.all_day
     and e.start_time > now() + interval '5 minutes'
     and e.start_time <= now() + interval '15 minutes 30 seconds'
  on conflict do nothing;
  get diagnostics recorded = row_count;
  if recorded > 0 then
  insert into public.notifications as n (member_id, kind, tag, event_id, detail)
  select sent.member_id, 'event_starting', 'starting:' || sent.event_id::text, sent.event_id,
         lower(to_char(e.start_time at time zone coalesce(e.timezone, f.timezone, 'America/Los_Angeles'), 'FMHH12:MIam'))
    from public.event_starting_sent sent
    join public.events e on e.id = sent.event_id
    left join public.data_feeds f on f.id = e.feed_id
   where sent.batch = run_at
  on conflict (member_id, tag) where read_at is null
  do update set created_at = clock_timestamp(), detail = excluded.detail, seen_at = null;
    perform public.push_notify_send('starting', jsonb_build_object('batch', run_at));
  end if;

  -- Thirty minutes after a timed event ends, to whoever has not checked in.
  insert into public.event_check_in_reminders_sent (event_id, member_id, batch)
  select e.id, rv.member_id, run_at
    from public.events e
    join public.event_rsvps rv on rv.event_id = e.id and rv.status = 'going'
    join public.members r on r.id = rv.member_id and r.status = 'active'
   where not e.all_day
     and e.start_time <= now()
     and coalesce(e.end_time, e.start_time) > now() - interval '4 hours 45 minutes'
     and coalesce(e.end_time, e.start_time) <= now() - interval '30 minutes'
     and coalesce(e.end_time, e.start_time + interval '4 hours') + interval '30 minutes' <= now()
     and coalesce(e.end_time, e.start_time + interval '4 hours') + interval '45 minutes' > now()
     and not exists (
       select 1 from public.event_check_ins c
        where c.event_id = e.id and c.member_id = rv.member_id
     )
  on conflict do nothing;
  get diagnostics recorded = row_count;
  if recorded > 0 then
  insert into public.notifications as n (member_id, kind, tag, event_id)
  select sent.member_id, 'check_in_reminder', 'check_in:' || sent.event_id::text, sent.event_id
    from public.event_check_in_reminders_sent sent
   where sent.batch = run_at
  on conflict (member_id, tag) where read_at is null
  do update set created_at = clock_timestamp(), seen_at = null;
    perform public.push_notify_send('check_in_reminder', jsonb_build_object('batch', run_at));
  end if;

  -- At 10am the day after an event, to whoever checked in.
  insert into public.event_followups_sent (event_id, member_id, batch)
  select e.id, c.member_id, run_at
    from public.events e
    join public.event_check_ins c on c.event_id = e.id
    left join public.data_feeds f on f.id = e.feed_id
    join public.members r on r.id = c.member_id and r.status = 'active'
    cross join lateral (
      select (
        (((coalesce(e.end_time, e.start_time) at time zone z.zone)::date + 1) + interval '10 hours')
          at time zone z.zone
      ) as due
      from (select coalesce(e.timezone, f.timezone, 'America/Los_Angeles') as zone) z
    ) d
   where coalesce(e.end_time, e.start_time) > now() - interval '8 days'
     and coalesce(e.end_time, e.start_time) <= now() - interval '6 hours'
     and d.due <= now()
     -- In the hour after it was due; or, for whoever checked in after that
     -- (20261113130000), in the hour after they did. Each member once.
     and (d.due > now() - interval '1 hour' or c.checked_in_at > now() - interval '1 hour')
  on conflict do nothing;
  get diagnostics recorded = row_count;
  if recorded > 0 then
  insert into public.notifications as n (member_id, kind, tag, event_id)
  select sent.member_id, 'event_followup', 'followup:' || sent.event_id::text, sent.event_id
    from public.event_followups_sent sent
   where sent.batch = run_at
  on conflict (member_id, tag) where read_at is null
  do update set created_at = clock_timestamp(), seen_at = null;
    perform public.push_notify_send('event_followup', jsonb_build_object('batch', run_at));
  end if;
end;
$$;
