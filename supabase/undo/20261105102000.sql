-- Undo for 20261105102000_event_reminders_every_five_minutes.sql: every
-- minute again, and the body of 20261031070000 (from pg_get_functiondef on a
-- fresh stack, 2026-11-05). Compare with the live definition before release.

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'push-event-reminders';
  perform cron.schedule('push-event-reminders', '* * * * *', 'select public.push_event_reminders()');
end;
$$;

CREATE OR REPLACE FUNCTION public.push_event_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
     and e.start_time > now() + interval '1 minute'
     and e.start_time <= now() + interval '10 minutes'
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
    from public.event_check_ins c
    join public.events e on e.id = c.event_id
    left join public.data_feeds f on f.id = e.feed_id
    join public.members r on r.id = c.member_id and r.status = 'active'
    cross join lateral (
      select (
        (((coalesce(e.end_time, e.start_time) at time zone z.zone)::date + 1) + interval '10 hours')
          at time zone z.zone
      ) as due
      from (select coalesce(e.timezone, f.timezone, 'America/Los_Angeles') as zone) z
    ) d
   where d.due <= now()
     and d.due > now() - interval '1 hour'
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
$function$;

drop index if exists public.events_end_or_start_idx;
