-- ============================================================================
-- A day ahead and ten minutes before, and the day ahead by email
-- ============================================================================
-- The owner, 2026-10-28. A member going to an event is reminded:
--
--   24 hours before a timed event, as Google Calendar's "1 day before" does,
--   but never in the night: one that would fall from 9pm to 8am in the
--   event's zone goes at the 9pm before. Only for an event still 12 hours
--   off when it falls due, so "Tomorrow" is never said of today. An all-day
--   event keeps the daily run's 9am the day before.
--
--   Ten minutes before a timed event.
--
--   By email as well, at the same moment as the day-ahead push, unless they
--   switched it off on Me (members.email_event_reminders).
--
-- pg_cron runs push_event_reminders every minute. It records each member
-- due, once, in event_day_before_sent or event_starting_sent, puts them in
-- the bell, and sends the batch through push-notify ('day_before',
-- 'starting'), which also sends the day-ahead emails, through Resend, from
-- event_reminder_emails. push-notify needs deploying with this.
--
-- notifications_record is as 20261028000000, push_owed and my_notifications
-- as 20261028970000, notification_badge as 20261028010000: changed only for
-- these reminders.
-- ============================================================================

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'direct', 'group', 'reply', 'reply_participant', 'like', 'group_add', 'report',
  'invite_joined', 'event_reminder', 'org_events', 'grant_open', 'profile_reminder',
  'blocks_weekly', 'reaction', 'event_starting'
));

alter table public.push_muted_kinds drop constraint if exists push_muted_kinds_kind_check;
alter table public.push_muted_kinds add constraint push_muted_kinds_kind_check check (kind in (
  'group_add', 'reply_participant', 'report', 'invite_joined', 'event_reminder', 'org_events',
  'like', 'grant_open', 'profile_reminder', 'reaction', 'event_starting'
));

alter table public.members
  add column if not exists email_event_reminders boolean not null default true;

comment on column public.members.email_event_reminders is
  'Email the day before an event the member is going to. Set from Me. See 20261028980000.';

create table if not exists public.event_day_before_sent (
  event_id uuid not null references public.events (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  batch timestamptz not null,
  primary key (event_id, member_id)
);

create index if not exists event_day_before_sent_batch_idx on public.event_day_before_sent (batch);

comment on table public.event_day_before_sent is
  'Who was reminded a day ahead of which timed event, once, and in which run. See 20261028980000.';

alter table public.event_day_before_sent enable row level security;
revoke all on public.event_day_before_sent from public, anon, authenticated;
grant select, insert, update, delete on public.event_day_before_sent to service_role;

create table if not exists public.event_starting_sent (
  event_id uuid not null references public.events (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  batch timestamptz not null,
  primary key (event_id, member_id)
);

create index if not exists event_starting_sent_batch_idx on public.event_starting_sent (batch);

comment on table public.event_starting_sent is
  'Who was reminded ten minutes before which event, once, and in which run. See 20261028980000.';

alter table public.event_starting_sent enable row level security;
revoke all on public.event_starting_sent from public, anon, authenticated;
grant select, insert, update, delete on public.event_starting_sent to service_role;

create table if not exists public.event_reminder_emails_sent (
  event_id uuid not null references public.events (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (event_id, member_id)
);

alter table public.event_reminder_emails_sent enable row level security;
revoke all on public.event_reminder_emails_sent from public, anon, authenticated;
grant select, insert, update, delete on public.event_reminder_emails_sent to service_role;

-- -------------------------------------------------------- when a day ahead --
-- 24 hours before, moved to the 9pm before when that falls from 9pm to 8am
-- in the event's zone: never later than 24 hours before, never in the night.
create or replace function private.day_ahead_at(p_start timestamptz, p_zone text)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when extract(hour from x.local_at) >= 8 and extract(hour from x.local_at) < 21 then x.at
    when extract(hour from x.local_at) >= 21
      then (date_trunc('day', x.local_at) + interval '21 hours') at time zone p_zone
    else (date_trunc('day', x.local_at) - interval '3 hours') at time zone p_zone
  end
  from (
    select p_start - interval '24 hours' as at,
           (p_start - interval '24 hours') at time zone p_zone as local_at
  ) x;
$$;

revoke all on function private.day_ahead_at(timestamptz, text) from public, anon, authenticated;

-- ---------------------------------------------------------- every minute --
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
end;
$$;

revoke all on function public.push_event_reminders() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'push-event-reminders';
  perform cron.schedule('push-event-reminders', '* * * * *', 'select public.push_event_reminders()');
end;
$$;

-- ------------------------------------------------- the day ahead by email --
-- For push-notify, with its secret: who to email about which event, each
-- recorded so that a second run sends nothing. A batch from
-- push_event_reminders for a timed event; tomorrow's all-day events in the
-- daily run.
create or replace function public.event_reminder_emails(p_secret text, p_key jsonb)
returns table (
  email text,
  name text,
  title text,
  starts text,
  place text,
  url text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch_at timestamptz := (p_key ->> 'batch')::timestamptz;
begin
  if p_secret is null or p_secret is distinct from (
    select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'push_notify_secret'
  ) then
    raise exception 'Not the notification trigger.' using errcode = '42501';
  end if;

  return query
    with candidates as (
      select sent.event_id, sent.member_id
        from public.event_day_before_sent sent
       where batch_at is not null and sent.batch = batch_at
      union
      select e.id, rv.member_id
        from public.events e
        left join public.data_feeds f on f.id = e.feed_id
        join public.event_rsvps rv on rv.event_id = e.id and rv.status = 'going'
       where batch_at is null
         and e.all_day
         and (e.start_time at time zone coalesce(e.timezone, f.timezone, 'America/Los_Angeles'))::date
             = (now() at time zone coalesce(e.timezone, f.timezone, 'America/Los_Angeles'))::date + 1
    ),
    due as (
      insert into public.event_reminder_emails_sent (event_id, member_id)
      select c.event_id, c.member_id
        from candidates c
        join public.members r on r.id = c.member_id and r.status = 'active'
       where r.email_event_reminders
         and private.confirmed_email(r.id) is not null
      on conflict do nothing
      returning event_id, member_id
    )
    select private.confirmed_email(d.member_id),
           r.display_name,
           e.title,
           case when e.all_day
                then to_char(e.start_time at time zone coalesce(e.timezone, f.timezone, 'America/Los_Angeles'), 'FMDay, FMMonth FMDD') || ', all day'
                else to_char(e.start_time at time zone coalesce(e.timezone, f.timezone, 'America/Los_Angeles'), 'FMDay, FMMonth FMDD "at" FMHH12:MI ')
                     || lower(to_char(e.start_time at time zone coalesce(e.timezone, f.timezone, 'America/Los_Angeles'), 'AM'))
           end,
           case when e.event_format = 'online' then 'Online'
                else nullif(concat_ws(', ', nullif(btrim(e.location), ''), nullif(btrim(e.city), '')), '')
           end,
           'https://thesciclub.com/events/' || e.id::text
      from due d
      join public.events e on e.id = d.event_id
      left join public.data_feeds f on f.id = e.feed_id
      join public.members r on r.id = d.member_id;
end;
$$;

revoke all on function public.event_reminder_emails(text, jsonb) from public, anon, authenticated;
grant execute on function public.event_reminder_emails(text, jsonb) to service_role;

-- ------------------------------------------------ the functions, extended --
create or replace function public.notifications_record(p_event text, p_key jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  key_id uuid;
begin
  if p_event in ('message', 'post', 'report', 'member_joined', 'grant_open') then
    key_id := (p_key ->> 'id')::uuid;
  end if;

  insert into public.notifications as n (
    member_id, kind, tag, actor_id, thread_id, message_id, topic_id, post_id,
    event_id, organization_id, report_id, joined_id, detail, grant_id
  )
  select owed.member_id, owed.kind, owed.tag, owed.actor_id, owed.thread_id,
         owed.message_id, owed.topic_id, owed.post_id, owed.event_id,
         owed.organization_id, owed.report_id, owed.joined_id, owed.detail, owed.grant_id
    from (
      -- A message: everybody else in the conversation.
      select tm.member_id, t.kind, 'thread:' || t.id::text as tag, m.author_id as actor_id,
             t.id as thread_id, m.id as message_id, null::uuid as topic_id, null::uuid as post_id,
             null::uuid as event_id, null::uuid as organization_id, null::uuid as report_id,
             null::uuid as joined_id, null::text as detail, null::uuid as grant_id
        from public.chat_messages m
        join public.chat_threads t on t.id = m.thread_id
        join public.chat_thread_members tm
          on tm.thread_id = t.id and tm.member_id is distinct from m.author_id
        join public.members r on r.id = tm.member_id and r.status = 'active'
       where p_event = 'message' and m.id = key_id and m.removed_at is null
         and not exists (
           select 1 from public.chat_thread_mutes x where x.thread_id = t.id and x.member_id = r.id
         )

      union all
      -- A reply: the topic's starter, and everybody else who has posted in it.
      select owed.member_id, owed.kind, 'topic:' || p.topic_id::text, p.author_id,
             null, null, p.topic_id, p.id, null, null, null, null, null, null
        from (
          select p.id, p.author_id, p.topic_id, tp.author_id as starter_id, tp.room_id, rm.opened_at
            from public.chat_posts p
            join public.chat_topics tp on tp.id = p.topic_id
            join public.chat_rooms rm on rm.id = tp.room_id
           where p_event = 'post' and p.id = key_id and p.removed_at is null
        ) p
        join lateral (
          select p.starter_id as member_id, 'reply'::text as kind
           where p.starter_id is not null and p.starter_id is distinct from p.author_id
          union
          select distinct o.author_id, 'reply_participant'::text
            from public.chat_posts o
           where o.topic_id = p.topic_id and o.removed_at is null
             and o.author_id is not null
             and o.author_id is distinct from p.author_id
             and o.author_id is distinct from p.starter_id
        ) owed on true
        join public.members r on r.id = owed.member_id and r.status = 'active'
       where (p.opened_at is not null or r.is_admin)
         and not exists (
           select 1 from public.chat_topic_mutes x where x.topic_id = p.topic_id and x.member_id = r.id
         )
         and not exists (
           select 1 from public.chat_room_mutes x where x.room_id = p.room_id and x.member_id = r.id
         )

      union all
      -- A like: the author of the post.
      select p.author_id, 'like', 'like:' || p.id::text, lk.member_id,
             null, null, tp.id, p.id, null, null, null, null, null, null
        from public.chat_post_likes lk
        join public.chat_posts p on p.id = lk.post_id and p.removed_at is null
        join public.chat_topics tp on tp.id = p.topic_id
        join public.chat_rooms rm on rm.id = tp.room_id
        join public.members r on r.id = p.author_id and r.status = 'active'
       where p_event = 'like'
         and lk.post_id = (p_key ->> 'post_id')::uuid
         and lk.member_id = (p_key ->> 'member_id')::uuid
         and p.author_id is distinct from lk.member_id
         and (rm.opened_at is not null or r.is_admin)
         and not exists (
           select 1 from public.chat_topic_mutes x where x.topic_id = tp.id and x.member_id = r.id
         )
         and not exists (
           select 1 from public.chat_room_mutes x where x.room_id = tp.room_id and x.member_id = r.id
         )

      union all
      -- A reaction to a message: its author, still in the conversation.
      select m.author_id, 'reaction', 'reaction:' || m.id::text, x.member_id,
             t.id, m.id, null, null, null, null, null, null, 'message:' || x.emoji, null
        from public.chat_message_reactions x
        join public.chat_messages m
          on m.id = x.target_id and m.removed_at is null and m.notice is null
        join public.chat_threads t on t.id = m.thread_id
        join public.chat_thread_members tm on tm.thread_id = t.id and tm.member_id = m.author_id
        join public.members r on r.id = m.author_id and r.status = 'active'
       where p_event = 'reaction' and p_key ->> 'target' = 'message'
         and x.target_id = (p_key ->> 'id')::uuid
         and x.member_id = (p_key ->> 'member_id')::uuid
         and x.emoji is not null
         and m.author_id is distinct from x.member_id
         and not exists (
           select 1 from public.member_blocks b
            where b.blocker_id = x.member_id and b.blocked_id = r.id
         )
         and not exists (
           select 1 from public.chat_thread_mutes q where q.thread_id = t.id and q.member_id = r.id
         )

      union all
      -- A reaction to a post: its author, as a like.
      select p.author_id, 'reaction', 'reaction:' || p.id::text, x.member_id,
             null, null, tp.id, p.id, null, null, null, null, 'post:' || x.emoji, null
        from public.chat_post_reactions x
        join public.chat_posts p on p.id = x.target_id and p.removed_at is null
        join public.chat_topics tp on tp.id = p.topic_id
        join public.chat_rooms rm on rm.id = tp.room_id
        join public.members r on r.id = p.author_id and r.status = 'active'
       where p_event = 'reaction' and p_key ->> 'target' = 'post'
         and x.target_id = (p_key ->> 'id')::uuid
         and x.member_id = (p_key ->> 'member_id')::uuid
         and x.emoji is not null
         and p.author_id is distinct from x.member_id
         and (rm.opened_at is not null or r.is_admin)
         and not exists (
           select 1 from public.member_blocks b
            where b.blocker_id = x.member_id and b.blocked_id = r.id
         )
         and not exists (
           select 1 from public.chat_topic_mutes q where q.topic_id = tp.id and q.member_id = r.id
         )
         and not exists (
           select 1 from public.chat_room_mutes q where q.room_id = tp.room_id and q.member_id = r.id
         )

      union all
      -- Added to a group by somebody else.
      select tm.member_id, 'group_add', 'group_add:' || t.id::text, (p_key ->> 'by')::uuid,
             t.id, null, null, null, null, null, null, null, null, null
        from public.chat_threads t
        join public.chat_thread_members tm
          on tm.thread_id = t.id and tm.member_id = (p_key ->> 'member_id')::uuid
        join public.members r on r.id = tm.member_id and r.status = 'active'
       where p_event = 'group_add'
         and t.id = (p_key ->> 'thread_id')::uuid
         and t.kind = 'group' and t.event_id is null
         and (p_key ->> 'by') is not null
         and (p_key ->> 'by')::uuid <> tm.member_id

      union all
      -- A report: administrators other than the reporter.
      select r.id, 'report', 'report:' || rep.id::text, null,
             null, null, null, null, null, null, rep.id, null, null, null
        from public.chat_reports rep
        join public.members r
          on r.is_admin and r.status = 'active' and r.id is distinct from rep.reporter_id
       where p_event = 'report' and rep.id = key_id and rep.kind <> 'block'

      union all
      -- Somebody joined on an invite: whoever vouched for them. From an
      -- administrator's QR code, detail says so: 'qr:' and the event, if any.
      select r.id, 'invite_joined', 'joined:' || joined.id::text, joined.id,
             null, null, null, null, null, null, null, joined.id,
             case when i.qr_code_id is not null then 'qr:' || coalesce(q.event_name, '') end, null
        from public.members joined
        join public.invites i on i.id = joined.invite_id
        left join public.qr_codes q on q.id = i.qr_code_id
        join public.members r
          on r.id = i.invited_by_member_id and r.status = 'active' and r.id <> joined.id
       where p_event = 'member_joined' and joined.id = key_id

      union all
      -- Tomorrow's events, to everybody going.
      select r.id, 'event_reminder', 'event:' || e.id::text, null,
             null, null, null, null, e.id, null, null, null,
             lower(to_char(e.start_time at time zone coalesce(e.timezone, f.timezone, 'America/Los_Angeles'), 'FMHH12:MIam')),
             null
        from public.events e
        left join public.data_feeds f on f.id = e.feed_id
        join public.event_rsvps rv on rv.event_id = e.id and rv.status = 'going'
        join public.members r on r.id = rv.member_id and r.status = 'active'
       where p_event = 'daily'
         -- A timed event's is 24 hours before (push_event_reminders).
         and e.all_day
         and (e.start_time at time zone coalesce(e.timezone, f.timezone, 'America/Los_Angeles'))::date
             = (now() at time zone coalesce(e.timezone, f.timezone, 'America/Los_Angeles'))::date + 1

      union all
      -- New events from an organization a member follows, counted.
      select r.id, 'org_events', 'org:' || o.id::text, null,
             null, null, null, null, null, o.id, null, null, count(*)::text, null
        from public.organization_follows fo
        join public.organizations o on o.id = fo.organization_id
        join public.events e
          on e.organization_id = o.id
         and e.created_at > now() - interval '24 hours'
         and e.start_time > now()
        join public.members r on r.id = fo.member_id and r.status = 'active'
       where p_event = 'daily'
       group by r.id, o.id

      union all
      -- A grant's applications opening: everybody following its organization.
      -- detail is the day this cycle closes.
      select r.id, 'grant_open', 'grant:' || g.id::text, null,
             null, null, null, null, null, g.organization_id, null, null,
             to_char(c.cycle_closes, 'YYYY-MM-DD'), g.id
        from public.organization_grant_windows gw
        join public.organization_grants g on g.id = gw.grant_id
        join public.organizations o on o.id = g.organization_id and o.removed_at is null
        cross join lateral public.grant_window_cycle(
          gw.opens_on, gw.closes_on, gw.yearly, (now() at time zone 'America/Los_Angeles')::date
        ) c
        join public.organization_follows fo on fo.organization_id = g.organization_id
        join public.members r on r.id = fo.member_id and r.status = 'active'
       where p_event = 'grant_open' and gw.id = key_id

      union all
      -- A reminder to finish Your details or the profile (20261022040000):
      -- whoever profile_reminders_notify picked today. detail is the step.
      select pr.member_id, 'profile_reminder', 'profile:' || pr.step, null,
             null, null, null, null, null, null, null, null, pr.step, null
        from public.profile_reminders pr
        join public.members r on r.id = pr.member_id and r.status = 'active'
       where p_event = 'profile_reminder' and pr.sent_on = (p_key ->> 'day')::date
    ) owed
   -- Nothing from a member the recipient blocked, nor from a topic they
   -- started (20261022080000).
   where not exists (
     select 1 from public.member_blocks b
      where b.blocker_id = owed.member_id
        and b.blocked_id in (
          owed.actor_id,
          (select tp.author_id from public.chat_topics tp where tp.id = owed.topic_id)
        )
   )
  on conflict (member_id, tag) where read_at is null
  do update set
    created_at = clock_timestamp(),
    count = n.count + 1,
    actor_id = excluded.actor_id,
    message_id = excluded.message_id,
    post_id = excluded.post_id,
    detail = excluded.detail,
    grant_id = excluded.grant_id,
    seen_at = null;
end;
$$;

create or replace function public.notification_badge(member uuid)
returns integer
language sql
security definer
stable
set search_path = ''
as $$
  select count(distinct case
           when n.kind in ('direct', 'group', 'group_add') then 'messages'
           when n.kind in ('reply', 'reply_participant') then 'replies'
           when n.kind in ('event_reminder', 'event_starting', 'org_events') then 'events'
           when n.kind in ('report', 'blocks_weekly') then 'reports'
           else n.kind
         end)::integer
    from public.notifications n
    join public.members r on r.id = n.member_id and r.status in ('active', 'suspended')
    left join public.chat_messages m on m.id = n.message_id
    left join public.chat_topics tp on tp.id = n.topic_id
    left join public.chat_rooms rm on rm.id = tp.room_id
    left join public.chat_posts p on p.id = n.post_id
   where n.member_id = member
     and n.seen_at is null
     and n.created_at > now() - interval '30 days'
     and not exists (
       select 1 from public.push_muted_kinds x
        where x.member_id = member
          and x.kind = case n.kind when 'blocks_weekly' then 'report' else n.kind end
     )
     and case
       when n.kind in ('direct', 'group', 'group_add') then exists (
         select 1 from public.chat_thread_members x
          where x.thread_id = n.thread_id and x.member_id = member
       )
       when n.kind = 'reaction' and n.thread_id is not null then m.removed_at is null and exists (
         select 1 from public.chat_thread_members x
          where x.thread_id = n.thread_id and x.member_id = member
       )
       when n.kind in ('reply', 'reply_participant') then
         rm.opened_at is not null or (r.is_admin and r.status = 'active')
       when n.kind in ('like', 'reaction') then p.removed_at is null
         and (rm.opened_at is not null or (r.is_admin and r.status = 'active'))
       when n.kind in ('report', 'blocks_weekly') then r.is_admin and r.status = 'active'
       else true
     end
     and not exists (
       select 1 from public.member_blocks b
        where b.blocker_id = member
          and b.blocked_id in (n.actor_id, tp.author_id)
     );
$$;

create or replace function public.my_notifications(before timestamptz default null, max_rows integer default 40)
returns table (
  id uuid,
  kind text,
  count integer,
  created_at timestamptz,
  seen boolean,
  read boolean,
  actor_id uuid,
  actor_name text,
  actor_photo text,
  place text,
  excerpt text,
  detail text,
  url text
)
language sql
security definer
stable
set search_path = ''
as $$
  select n.id, n.kind, n.count, n.created_at, n.seen_at is not null, n.read_at is not null,
         n.actor_id,
         case when n.actor_id is null and n.kind in ('direct', 'group', 'reply', 'reply_participant', 'like', 'group_add', 'reaction')
              then 'Deleted member' else a.display_name end,
         a.photo_path,
         case
           when n.kind in ('direct', 'group', 'group_add')
                or (n.kind = 'reaction' and n.thread_id is not null) then
             coalesce(t.name, (select e.title from public.events e where e.id = t.event_id))
           when n.kind in ('reply', 'reply_participant', 'like', 'reaction') then tp.title
           when n.kind in ('event_reminder', 'event_starting') then ev.title
           when n.kind in ('org_events', 'grant_open') then o.name
           when n.kind = 'invite_joined' then j.display_name
         end,
         case
           when (n.kind in ('direct', 'group') or (n.kind = 'reaction' and n.thread_id is not null))
                and m.removed_at is null then
             left(nullif(btrim(m.body), ''), 160)
           when n.kind in ('reply', 'reply_participant', 'like', 'reaction') and p.removed_at is null then
             left(nullif(btrim(p.body), ''), 160)
           when n.kind = 'grant_open' then gr.name
         end,
         n.detail,
         case
           when n.kind in ('direct', 'group')
                or (n.kind = 'reaction' and n.thread_id is not null) then
             '/chat/t/' || n.thread_id::text || coalesce('?message=' || n.message_id::text, '')
           when n.kind = 'group_add' then '/chat/t/' || n.thread_id::text
           when n.kind in ('reply', 'reply_participant', 'like', 'reaction') then
             '/chat/rooms/' || tp.room_id || '/topics/' || tp.id::text
               || coalesce('?post=' || n.post_id::text, '')
           when n.kind = 'report' then '/admin?tab=reports'
           when n.kind = 'blocks_weekly' then '/admin?tab=reports#blocks'
           -- From a QR code or link: the administrators' tally, or for an
           -- org admin, who joined (20261028970000).
           when n.kind = 'invite_joined' and n.detail like 'qr:%' and public.is_admin() then '/admin?tab=invites'
           when n.kind = 'invite_joined' and n.detail like 'qr:%' then '/peers/' || n.joined_id::text
           when n.kind = 'invite_joined' then '/invites'
           when n.kind in ('event_reminder', 'event_starting') then '/events/' || n.event_id::text
           when n.kind in ('org_events', 'grant_open') then '/events/organizations/' || n.organization_id::text
           when n.kind = 'profile_reminder' and n.detail = 'details' then '/profile/details'
           when n.kind = 'profile_reminder' then '/profile?resume'
         end
    from public.notifications n
    left join public.members a on a.id = n.actor_id
    left join public.chat_threads t on t.id = n.thread_id
    left join public.chat_messages m on m.id = n.message_id
    left join public.chat_topics tp on tp.id = n.topic_id
    left join public.chat_posts p on p.id = n.post_id
    left join public.events ev on ev.id = n.event_id
    left join public.organizations o on o.id = n.organization_id
    left join public.members j on j.id = n.joined_id
    left join public.organization_grants gr on gr.id = n.grant_id
   where n.member_id = auth.uid()
     and (before is null or n.created_at < before)
     and n.created_at > now() - interval '30 days'
     and case
       when n.kind in ('direct', 'group', 'group_add') then exists (
         select 1 from public.chat_thread_members x
          where x.thread_id = n.thread_id and x.member_id = auth.uid()
       )
       when n.kind in ('reply', 'reply_participant') then public.chat_room_is_readable(tp.room_id)
       -- A like is about the post, so it goes with the post.
       when n.kind = 'like' then p.removed_at is null and public.chat_room_is_readable(tp.room_id)
       when n.kind = 'reaction' and n.thread_id is not null then m.removed_at is null and exists (
         select 1 from public.chat_thread_members x
          where x.thread_id = n.thread_id and x.member_id = auth.uid()
       )
       when n.kind = 'reaction' then p.removed_at is null and public.chat_room_is_readable(tp.room_id)
       when n.kind in ('report', 'blocks_weekly') then public.is_admin()
       else true
     end
     and not exists (
       select 1 from public.member_blocks b
        where b.blocker_id = auth.uid()
          and b.blocked_id in (n.actor_id, tp.author_id)
     )
   order by n.created_at desc, n.id
   limit least(greatest(coalesce(max_rows, 40), 1), 100);
$$;

create or replace function public.push_owed(p_secret text, p_event text, p_key jsonb)
returns table (
  endpoint text,
  p256dh text,
  auth text,
  kind text,
  actor_name text,
  body text,
  photo_count integer,
  subject text,
  detail text,
  url text,
  tag text,
  badge integer
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  key_id uuid;
begin
  if p_secret is null or p_secret is distinct from (
    select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'push_notify_secret'
  ) then
    raise exception 'Not the notification trigger.' using errcode = '42501';
  end if;

  if p_event in ('message', 'post', 'report', 'member_joined', 'grant_open') then
    key_id := (p_key ->> 'id')::uuid;
  end if;

  if p_event = 'message' then
    -- Opens on the message itself (?message=), which the conversation
    -- scrolls to: a later look at the notification should not land on
    -- whatever was said since.
    return query
      select s.endpoint, s.p256dh, s.auth,
             t.kind, a.display_name, m.body, cardinality(m.attachments),
             null::text, null::text,
             '/chat/t/' || t.id::text || '?message=' || m.id::text, 'thread:' || t.id::text,
             public.notification_badge(r.id)
        from public.chat_messages m
        join public.chat_threads t on t.id = m.thread_id
        join public.chat_thread_members tm
          on tm.thread_id = t.id and tm.member_id is distinct from m.author_id
        join public.members r on r.id = tm.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
        left join public.members a on a.id = m.author_id
       where m.id = key_id
         and m.removed_at is null
         and not exists (
           select 1 from public.member_blocks b
            where b.blocker_id = r.id and b.blocked_id = m.author_id
         )
         and not exists (
           select 1 from public.chat_thread_mutes x where x.thread_id = t.id and x.member_id = r.id
         );

  elsif p_event = 'post' then
    -- The starter ('reply'), and everybody else who has posted in the topic
    -- ('reply_participant'). Since 20261003000000 with the reply's words and
    -- its photograph count, as a message has; still no room and no topic.
    return query
      with p as (
        select p.id, p.author_id, p.body, p.attachments,
               tp.id as topic_id, tp.author_id as starter_id,
               tp.room_id, rm.opened_at
          from public.chat_posts p
          join public.chat_topics tp on tp.id = p.topic_id
          join public.chat_rooms rm on rm.id = tp.room_id
         where p.id = key_id and p.removed_at is null
      ),
      owed as (
        select p.starter_id as member_id, 'reply'::text as kind from p
         where p.starter_id is not null and p.starter_id is distinct from p.author_id
        union
        select distinct o.author_id, 'reply_participant'::text
          from p
          join public.chat_posts o on o.topic_id = p.topic_id and o.removed_at is null
         where o.author_id is not null
           and o.author_id is distinct from p.author_id
           and o.author_id is distinct from p.starter_id
      )
      select s.endpoint, s.p256dh, s.auth,
             owed.kind, a.display_name, p.body, coalesce(cardinality(p.attachments), 0),
             null::text, null::text,
             '/chat/rooms/' || p.room_id || '/topics/' || p.topic_id::text || '?post=' || p.id::text,
             'topic:' || p.topic_id::text,
             public.notification_badge(r.id)
        from p
        join owed on true
        join public.members r on r.id = owed.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
        left join public.members a on a.id = p.author_id
       where (p.opened_at is not null or r.is_admin)
         and not exists (
           select 1 from public.member_blocks b
            where b.blocker_id = r.id and b.blocked_id in (p.author_id, p.starter_id)
         )
         and not exists (
           select 1 from public.chat_topic_mutes x where x.topic_id = p.topic_id and x.member_id = r.id
         )
         and not exists (
           select 1 from public.chat_room_mutes x where x.room_id = p.room_id and x.member_id = r.id
         )
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = owed.kind
         );

  elsif p_event = 'like' then
    -- The author of the liked post, once, with the start of their own post.
    -- Not the liker (the policy refuses liking your own, and this says so
    -- too), not somebody paused, not a post taken back or a like already
    -- undone by the time this runs, not a closed room to a member who can no
    -- longer read it, and not through a topic's or room's mute or the switch
    -- on Me. `detail` says whether it was the topic's opening post.
    return query
      with l as (
        select lk.member_id as liker_id, p.id as post_id, p.author_id, p.body,
               p.attachments, tp.id as topic_id, tp.room_id, rm.opened_at,
               p.id = (select f.id from public.chat_posts f
                        where f.topic_id = tp.id
                        order by f.created_at, f.id limit 1) as is_opening
          from public.chat_post_likes lk
          join public.chat_posts p on p.id = lk.post_id and p.removed_at is null
          join public.chat_topics tp on tp.id = p.topic_id
          join public.chat_rooms rm on rm.id = tp.room_id
         where lk.post_id = (p_key ->> 'post_id')::uuid
           and lk.member_id = (p_key ->> 'member_id')::uuid
      )
      select s.endpoint, s.p256dh, s.auth,
             'like'::text, a.display_name, l.body, coalesce(cardinality(l.attachments), 0),
             null::text, case when l.is_opening then 'topic' else 'post' end,
             '/chat/rooms/' || l.room_id || '/topics/' || l.topic_id::text || '?post=' || l.post_id::text,
             'like:' || l.post_id::text,
             public.notification_badge(r.id)
        from l
        join public.members r on r.id = l.author_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
        left join public.members a on a.id = l.liker_id
       where l.author_id is distinct from l.liker_id
         and not exists (
           select 1 from public.member_blocks b
            where b.blocker_id = r.id
              and b.blocked_id in (
                l.liker_id,
                (select tp.author_id from public.chat_topics tp where tp.id = l.topic_id)
              )
         )
         and (l.opened_at is not null or r.is_admin)
         and not exists (
           select 1 from public.chat_topic_mutes x where x.topic_id = l.topic_id and x.member_id = r.id
         )
         and not exists (
           select 1 from public.chat_room_mutes x where x.room_id = l.room_id and x.member_id = r.id
         )
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'like'
         );

  elsif p_event = 'reaction' and p_key ->> 'target' = 'message' then
    -- The message's author, with their own words; the emoji is as it is now,
    -- so one cleared before this runs sends nothing.
    return query
      select s.endpoint, s.p256dh, s.auth,
             'reaction'::text, a.display_name, m.body, coalesce(cardinality(m.attachments), 0),
             null::text, 'message:' || x.emoji,
             '/chat/t/' || t.id::text || '?message=' || m.id::text,
             'reaction:' || m.id::text,
             public.notification_badge(r.id)
        from public.chat_message_reactions x
        join public.chat_messages m
          on m.id = x.target_id and m.removed_at is null and m.notice is null
        join public.chat_threads t on t.id = m.thread_id
        join public.chat_thread_members tm on tm.thread_id = t.id and tm.member_id = m.author_id
        join public.members r on r.id = m.author_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
        left join public.members a on a.id = x.member_id
       where x.target_id = (p_key ->> 'id')::uuid
         and x.member_id = (p_key ->> 'member_id')::uuid
         and x.emoji is not null
         and m.author_id is distinct from x.member_id
         and not exists (
           select 1 from public.member_blocks b
            where (b.blocker_id = r.id and b.blocked_id = x.member_id)
               or (b.blocker_id = x.member_id and b.blocked_id = r.id)
         )
         and not exists (
           select 1 from public.chat_thread_mutes q where q.thread_id = t.id and q.member_id = r.id
         )
         and not exists (
           select 1 from public.push_muted_kinds q where q.member_id = r.id and q.kind = 'reaction'
         );

  elsif p_event = 'reaction' and p_key ->> 'target' = 'post' then
    -- The post's author, as a like: 'topic:' for the topic's opening post.
    return query
      with l as (
        select x.member_id as reactor_id, x.emoji, p.id as post_id, p.author_id, p.body,
               p.attachments, tp.id as topic_id, tp.author_id as starter_id, tp.room_id, rm.opened_at,
               p.id = (select f.id from public.chat_posts f
                        where f.topic_id = tp.id
                        order by f.created_at, f.id limit 1) as is_opening
          from public.chat_post_reactions x
          join public.chat_posts p on p.id = x.target_id and p.removed_at is null
          join public.chat_topics tp on tp.id = p.topic_id
          join public.chat_rooms rm on rm.id = tp.room_id
         where x.target_id = (p_key ->> 'id')::uuid
           and x.member_id = (p_key ->> 'member_id')::uuid
           and x.emoji is not null
      )
      select s.endpoint, s.p256dh, s.auth,
             'reaction'::text, a.display_name, l.body, coalesce(cardinality(l.attachments), 0),
             null::text, case when l.is_opening then 'topic:' else 'post:' end || l.emoji,
             '/chat/rooms/' || l.room_id || '/topics/' || l.topic_id::text || '?post=' || l.post_id::text,
             'reaction:' || l.post_id::text,
             public.notification_badge(r.id)
        from l
        join public.members r on r.id = l.author_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
        left join public.members a on a.id = l.reactor_id
       where l.author_id is distinct from l.reactor_id
         and not exists (
           select 1 from public.member_blocks b
            where (b.blocker_id = r.id and b.blocked_id in (l.reactor_id, l.starter_id))
               or (b.blocker_id = l.reactor_id and b.blocked_id = r.id)
         )
         and (l.opened_at is not null or r.is_admin)
         and not exists (
           select 1 from public.chat_topic_mutes q where q.topic_id = l.topic_id and q.member_id = r.id
         )
         and not exists (
           select 1 from public.chat_room_mutes q where q.room_id = l.room_id and q.member_id = r.id
         )
         and not exists (
           select 1 from public.push_muted_kinds q where q.member_id = r.id and q.kind = 'reaction'
         );

  elsif p_event = 'group_add' then
    return query
      select s.endpoint, s.p256dh, s.auth,
             'group_add'::text, a.display_name, null::text, 0,
             null::text, null::text,
             '/chat/t/' || t.id::text, 'thread:' || t.id::text,
             public.notification_badge(r.id)
        from public.chat_threads t
        join public.chat_thread_members tm
          on tm.thread_id = t.id and tm.member_id = (p_key ->> 'member_id')::uuid
        join public.members r on r.id = tm.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
        left join public.members a on a.id = (p_key ->> 'by')::uuid
       where t.id = (p_key ->> 'thread_id')::uuid
         and t.kind = 'group'
         and t.event_id is null
         and not exists (
           select 1 from public.member_blocks b
            where b.blocker_id = r.id and b.blocked_id = (p_key ->> 'by')::uuid
         )
         and (p_key ->> 'by') is not null
         and (p_key ->> 'by')::uuid <> tm.member_id
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'group_add'
         );

  elsif p_event = 'report' then
    -- Administrators, and not whoever made the report. Nothing about it
    -- reaches the lock screen but that it exists.
    return query
      select s.endpoint, s.p256dh, s.auth,
             'report'::text, null::text, null::text, 0,
             null::text, null::text,
             '/admin?tab=reports', 'report:' || rep.id::text,
             public.notification_badge(r.id)
        from public.chat_reports rep
        join public.members r
          on r.is_admin and r.status = 'active' and r.id is distinct from rep.reporter_id
        join public.push_subscriptions s on s.member_id = r.id
       where rep.id = key_id
         and rep.kind <> 'block'
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'report'
         );

  elsif p_event = 'member_joined' then
    return query
      select s.endpoint, s.p256dh, s.auth,
             'invite_joined'::text, joined.display_name, null::text, 0,
             null::text, null::text,
             -- From a QR code or link: who joined (20261028970000).
             case when i.qr_code_id is not null then '/peers/' || joined.id::text else '/invites' end,
             'joined:' || joined.id::text,
             public.notification_badge(r.id)
        from public.members joined
        join public.invites i on i.id = joined.invite_id
        join public.members r
          on r.id = i.invited_by_member_id and r.status = 'active' and r.id <> joined.id
        join public.push_subscriptions s on s.member_id = r.id
       where joined.id = key_id
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'invite_joined'
         );

  -- 20261028980000: 24 hours before (quiet hours kept), and ten minutes before.
  elsif p_event = 'day_before' then
    return query
      select s.endpoint, s.p256dh, s.auth,
             'event_reminder'::text, null::text, null::text, 0,
             e.title,
             lower(to_char(e.start_time at time zone coalesce(e.timezone, f.timezone, 'America/Los_Angeles'), 'FMHH12:MIam')),
             '/events/' || e.id::text, 'event:' || e.id::text,
             public.notification_badge(r.id)
        from public.event_day_before_sent sent
        join public.events e on e.id = sent.event_id
        left join public.data_feeds f on f.id = e.feed_id
        join public.members r on r.id = sent.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
       where sent.batch = (p_key ->> 'batch')::timestamptz
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'event_reminder'
         );

  elsif p_event = 'starting' then
    return query
      select s.endpoint, s.p256dh, s.auth,
             'event_starting'::text, null::text, null::text, 0,
             e.title,
             lower(to_char(e.start_time at time zone coalesce(e.timezone, f.timezone, 'America/Los_Angeles'), 'FMHH12:MIam')),
             '/events/' || e.id::text, 'starting:' || e.id::text,
             public.notification_badge(r.id)
        from public.event_starting_sent sent
        join public.events e on e.id = sent.event_id
        left join public.data_feeds f on f.id = e.feed_id
        join public.members r on r.id = sent.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
       where sent.batch = (p_key ->> 'batch')::timestamptz
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'event_starting'
         );

  elsif p_event = 'daily' then
    -- Tomorrow, in each event's own zone.
    return query
      select s.endpoint, s.p256dh, s.auth,
             'event_reminder'::text, null::text, null::text, 0,
             e.title,
             lower(to_char(e.start_time at time zone coalesce(e.timezone, f.timezone, 'America/Los_Angeles'), 'FMHH12:MIam')),
             '/events/' || e.id::text, 'event:' || e.id::text,
             public.notification_badge(r.id)
        from public.events e
        left join public.data_feeds f on f.id = e.feed_id
        join public.event_rsvps rv on rv.event_id = e.id and rv.status = 'going'
        join public.members r on r.id = rv.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
       where e.all_day
         and (e.start_time at time zone coalesce(e.timezone, f.timezone, 'America/Los_Angeles'))::date
             = (now() at time zone coalesce(e.timezone, f.timezone, 'America/Los_Angeles'))::date + 1
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'event_reminder'
         );

    -- New in the last day from organizations a member follows, one per
    -- organization, counted.
    return query
      select s.endpoint, s.p256dh, s.auth,
             'org_events'::text, null::text, null::text, 0,
             o.name,
             count(*)::text,
             '/events/organizations/' || o.id::text, 'org:' || o.id::text,
             public.notification_badge(s.member_id)
        from public.organization_follows fo
        join public.organizations o on o.id = fo.organization_id
        join public.events e
          on e.organization_id = o.id
         and e.created_at > now() - interval '24 hours'
         and e.start_time > now()
        join public.members r on r.id = fo.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
       where not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'org_events'
         )
       group by s.endpoint, s.p256dh, s.auth, o.id, o.name;

  elsif p_event = 'grant_open' then
    -- A grant's applications opened: everybody following its organization.
    -- body is the grant's name, detail the day this cycle closes.
    return query
      select s.endpoint, s.p256dh, s.auth,
             'grant_open'::text, null::text, g.name, 0,
             o.name,
             to_char(c.cycle_closes, 'FMMon FMDD'),
             '/events/organizations/' || o.id::text, 'grant:' || g.id::text,
             public.notification_badge(r.id)
        from public.organization_grant_windows gw
        join public.organization_grants g on g.id = gw.grant_id
        join public.organizations o on o.id = g.organization_id and o.removed_at is null
        cross join lateral public.grant_window_cycle(
          gw.opens_on, gw.closes_on, gw.yearly, (now() at time zone 'America/Los_Angeles')::date
        ) c
        join public.organization_follows fo on fo.organization_id = g.organization_id
        join public.members r on r.id = fo.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
       where gw.id = key_id
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'grant_open'
         );

  elsif p_event = 'profile_reminder' then
    -- Today's reminders to finish Your details or the profile. detail is the
    -- step; the address opens it.
    return query
      select s.endpoint, s.p256dh, s.auth,
             'profile_reminder'::text, null::text, null::text, 0,
             null::text, pr.step,
             case pr.step when 'details' then '/profile/details' else '/profile?resume' end,
             'profile:' || pr.step,
             public.notification_badge(r.id)
        from public.profile_reminders pr
        join public.members r on r.id = pr.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
       where pr.sent_on = (p_key ->> 'day')::date
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'profile_reminder'
         );

  elsif p_event = 'blocks_weekly' then
    -- The week's count of blocks: the rows blocks_weekly_notify recorded, to
    -- administrators who have not switched off New reports. Names nobody.
    return query
      select s.endpoint, s.p256dh, s.auth,
             'blocks_weekly'::text, null::text, null::text, 0,
             null::text, n.detail,
             '/admin?tab=reports#blocks', n.tag,
             public.notification_badge(r.id)
        from public.notifications n
        join public.members r on r.id = n.member_id and r.is_admin and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
       where n.kind = 'blocks_weekly'
         and n.tag = 'blocks:' || (p_key ->> 'day')
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'report'
         );
  end if;
end;
$$;

revoke all on function public.notifications_record(text, jsonb) from public, anon, authenticated;
revoke all on function public.push_owed(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.push_owed(text, text, jsonb) to service_role;
