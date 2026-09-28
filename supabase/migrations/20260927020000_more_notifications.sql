-- Six more things that notify, a daily run for the two that are not a single
-- row arriving, the app badge, and a switch per kind.
--
-- Asked for by the owner on 2026-09-27, from the list the previous migration's
-- session raised. Each is a branch in `push_owed` and a line in compose.ts:
--
--   group_add          somebody added you to a group
--   reply_participant  a reply in a topic you posted in but did not start
--   report             a member reported something (administrators)
--   invite_joined      somebody you invited joined the club
--   event_reminder     an event you are going to is tomorrow      (daily)
--   org_events         new events from an organization you follow (daily)
--
-- ---------------------------------------------------------------------------
-- push_owed takes an event and a key now
-- ---------------------------------------------------------------------------
-- A thread membership has a two-column key and the daily run has none, so the
-- three-argument version from 20260927010000 is dropped rather than overloaded
-- — two functions of one name that PostgREST picks between by argument names
-- is a trap for whoever reads the next log. The trigger sends
-- `{ event, key }` and the function passes both through.
--
-- ---------------------------------------------------------------------------
-- Who added whom is the caller, captured in the trigger
-- ---------------------------------------------------------------------------
-- chat_thread_members has no "added by", and does not need one: the trigger
-- runs inside the request of whoever did it, so `auth.uid()` there *is* the
-- adder, and it goes into the key. Joining yourself (an event's group, or
-- creating a group, which puts the creator on its own roster) is the adder and
-- the added being the same person, and sends nothing. A direct conversation's
-- two rows send nothing either: its first message is the notification.
--
-- ---------------------------------------------------------------------------
-- What a lock screen may say, per kind
-- ---------------------------------------------------------------------------
-- The same rule as before. Names of people: yes, because the owner chose that
-- for messages and it is what makes a notification useful. Names of rooms,
-- topics and groups: never — they are named for what they are about. A report
-- names nobody and quotes nothing: "A member reported something." Event
-- titles and organization names are public (CONTEXT.md, "What is public"), so
-- a reminder can say which event.
--
-- ---------------------------------------------------------------------------
-- The daily run
-- ---------------------------------------------------------------------------
-- pg_cron at 16:00 UTC — nine in the morning in California in summer, eight
-- in winter — which is after the nightly ingest (04:10 UTC) has written
-- anything new. It sends `{ event: 'daily' }` through the same pipe, and
-- `push_daily_runs` makes a second run on the same day send nothing, so a
-- retry cannot remind somebody twice.
--
-- "Tomorrow" is the event's own calendar day in its feed's timezone, the rule
-- the Events tab already uses. "New" is created in the last twenty-four hours
-- and still in the future; one notification per organization, with a count,
-- rather than one per event — an organization that publishes its term's
-- calendar at once is a dozen events and should be one buzz.
--
-- ---------------------------------------------------------------------------
-- A switch per kind that is not a conversation
-- ---------------------------------------------------------------------------
-- Conversations, topics and rooms already have mutes where they are. The rest
-- have no place to put a Mute button, so they get a switch on Me, stored the
-- same way: a row in `push_muted_kinds` is a kind turned off.
--
-- ---------------------------------------------------------------------------
-- The badge
-- ---------------------------------------------------------------------------
-- A message push carries the recipient's unread count, so the service worker
-- can set the number on the app icon without opening the app.
-- `push_unread_count(member)` is chat_my_threads' definition of unread,
-- written for a member other than the caller; a test in the probe holds them
-- to the same answer.

create extension if not exists pg_cron;

-- ------------------------------------------------------ switches, per kind
create table if not exists public.push_muted_kinds (
  member_id uuid not null references public.members (id) on delete cascade,
  kind text not null check (kind in (
    'group_add', 'reply_participant', 'report', 'invite_joined', 'event_reminder', 'org_events'
  )),
  muted_at timestamptz not null default now(),
  primary key (member_id, kind)
);

comment on table public.push_muted_kinds is
  'A kind of notification a member has switched off on Me. Private to them.';

alter table public.push_muted_kinds enable row level security;

drop policy if exists "members read their own muted kinds" on public.push_muted_kinds;
create policy "members read their own muted kinds" on public.push_muted_kinds
  for select using (member_id = auth.uid());
drop policy if exists "members mute kinds for themselves" on public.push_muted_kinds;
create policy "members mute kinds for themselves" on public.push_muted_kinds
  for insert with check (member_id = auth.uid());
drop policy if exists "members unmute kinds for themselves" on public.push_muted_kinds;
create policy "members unmute kinds for themselves" on public.push_muted_kinds
  for delete using (member_id = auth.uid());

revoke all on public.push_muted_kinds from anon, authenticated, public;
grant select, insert, delete on public.push_muted_kinds to authenticated;

-- ------------------------------------------------------------ daily guard
create table if not exists public.push_daily_runs (
  day date primary key,
  ran_at timestamptz not null default now()
);
alter table public.push_daily_runs enable row level security;
revoke all on public.push_daily_runs from anon, authenticated, public;

-- ------------------------------------------------------------- the badge
create or replace function public.push_unread_count(member uuid)
returns integer
language sql
security definer
stable
set search_path = ''
as $$
  select count(*)::int
    from public.chat_thread_members mine
   where mine.member_id = member
     and exists (
       select 1 from public.chat_messages n
        where n.thread_id = mine.thread_id
          and n.created_at > mine.last_read_at
          and n.author_id is distinct from member
     );
$$;

revoke all on function public.push_unread_count(uuid) from public, anon, authenticated;
grant execute on function public.push_unread_count(uuid) to service_role;

-- ----------------------------------------------------------- push_owed, v2
drop function if exists public.push_owed(text, text, uuid);

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

  if p_event in ('message', 'post', 'report', 'member_joined') then
    key_id := (p_key ->> 'id')::uuid;
  end if;

  if p_event = 'message' then
    -- Unchanged from 20260927010000, plus the badge.
    return query
      select s.endpoint, s.p256dh, s.auth,
             t.kind, a.display_name, m.body, cardinality(m.attachments),
             null::text, null::text,
             '/chat/t/' || t.id::text, 'thread:' || t.id::text,
             public.push_unread_count(r.id)
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
           select 1 from public.chat_thread_mutes x where x.thread_id = t.id and x.member_id = r.id
         );

  elsif p_event = 'post' then
    -- The starter ('reply'), and everybody else who has posted in the topic
    -- ('reply_participant'). Never the words: body is null for both.
    return query
      with p as (
        select p.id, p.author_id, tp.id as topic_id, tp.author_id as starter_id,
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
             owed.kind, a.display_name, null::text, 0,
             null::text, null::text,
             '/chat/rooms/' || p.room_id || '/topics/' || p.topic_id::text,
             'topic:' || p.topic_id::text,
             null::int
        from p
        join owed on true
        join public.members r on r.id = owed.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
        left join public.members a on a.id = p.author_id
       where (p.opened_at is not null or r.is_admin)
         and not exists (
           select 1 from public.chat_topic_mutes x where x.topic_id = p.topic_id and x.member_id = r.id
         )
         and not exists (
           select 1 from public.chat_room_mutes x where x.room_id = p.room_id and x.member_id = r.id
         )
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = owed.kind
         );

  elsif p_event = 'group_add' then
    return query
      select s.endpoint, s.p256dh, s.auth,
             'group_add'::text, a.display_name, null::text, 0,
             null::text, null::text,
             '/chat/t/' || t.id::text, 'thread:' || t.id::text,
             null::int
        from public.chat_threads t
        join public.chat_thread_members tm
          on tm.thread_id = t.id and tm.member_id = (p_key ->> 'member_id')::uuid
        join public.members r on r.id = tm.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
        left join public.members a on a.id = (p_key ->> 'by')::uuid
       where t.id = (p_key ->> 'thread_id')::uuid
         and t.kind = 'group'
         and t.event_id is null
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
             '/admin', 'report:' || rep.id::text,
             null::int
        from public.chat_reports rep
        join public.members r
          on r.is_admin and r.status = 'active' and r.id is distinct from rep.reporter_id
        join public.push_subscriptions s on s.member_id = r.id
       where rep.id = key_id
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'report'
         );

  elsif p_event = 'member_joined' then
    return query
      select s.endpoint, s.p256dh, s.auth,
             'invite_joined'::text, joined.display_name, null::text, 0,
             null::text, null::text,
             '/invites', 'joined:' || joined.id::text,
             null::int
        from public.members joined
        join public.invites i on i.id = joined.invite_id
        join public.members r
          on r.id = i.invited_by_member_id and r.status = 'active' and r.id <> joined.id
        join public.push_subscriptions s on s.member_id = r.id
       where joined.id = key_id
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'invite_joined'
         );

  elsif p_event = 'daily' then
    -- Tomorrow, in each event's own zone.
    return query
      select s.endpoint, s.p256dh, s.auth,
             'event_reminder'::text, null::text, null::text, 0,
             e.title,
             lower(to_char(e.start_time at time zone coalesce(f.timezone, 'America/Los_Angeles'), 'FMHH12:MIam')),
             '/events/' || e.id::text, 'event:' || e.id::text,
             null::int
        from public.events e
        left join public.data_feeds f on f.id = e.feed_id
        join public.event_rsvps rv on rv.event_id = e.id and rv.status = 'going'
        join public.members r on r.id = rv.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
       where (e.start_time at time zone coalesce(f.timezone, 'America/Los_Angeles'))::date
             = (now() at time zone coalesce(f.timezone, 'America/Los_Angeles'))::date + 1
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
             null::int
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
  end if;
end;
$$;

comment on function public.push_owed(text, text, jsonb) is
  'The devices owed a notification for one event, with what it may say. For the push-notify function only.';

revoke all on function public.push_owed(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.push_owed(text, text, jsonb) to service_role;

-- ---------------------------------------------------------------- sending
-- One place that knows the URL, the secret and the shape of the call, shared
-- by the triggers and the daily run.
create or replace function public.push_notify_send(p_event text, p_key jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target text;
  secret text;
begin
  select s.decrypted_secret into target
    from vault.decrypted_secrets s where s.name = 'push_notify_url';
  if target is null or target = '' then
    return;  -- switched off
  end if;
  select s.decrypted_secret into secret
    from vault.decrypted_secrets s where s.name = 'push_notify_secret';

  perform net.http_post(
    url := target,
    body := jsonb_build_object('event', p_event, 'key', p_key),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', secret),
    timeout_milliseconds := 10000
  );
exception when others then
  -- A notification that could not be queued must never cost what caused it.
  raise warning 'push_notify_send: %', sqlerrm;
end;
$$;

revoke all on function public.push_notify_send(text, jsonb) from public, anon, authenticated;

create or replace function public.push_notify_enqueue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if tg_table_name = 'chat_messages' then
    perform public.push_notify_send('message', jsonb_build_object('id', new.id));
  elsif tg_table_name = 'chat_posts' then
    perform public.push_notify_send('post', jsonb_build_object('id', new.id));
  elsif tg_table_name = 'chat_thread_members' then
    -- Only somebody added by somebody else; see the header.
    if actor is not null and actor <> new.member_id then
      perform public.push_notify_send('group_add', jsonb_build_object(
        'thread_id', new.thread_id, 'member_id', new.member_id, 'by', actor));
    end if;
  elsif tg_table_name = 'chat_reports' then
    perform public.push_notify_send('report', jsonb_build_object('id', new.id));
  elsif tg_table_name = 'members' then
    if new.invite_id is not null then
      perform public.push_notify_send('member_joined', jsonb_build_object('id', new.id));
    end if;
  end if;
  return null;
exception when others then
  raise warning 'push_notify_enqueue: %', sqlerrm;
  return null;
end;
$$;

revoke all on function public.push_notify_enqueue() from public, anon, authenticated;

drop trigger if exists chat_thread_members_push_notify on public.chat_thread_members;
create trigger chat_thread_members_push_notify
  after insert on public.chat_thread_members
  for each row execute function public.push_notify_enqueue();

drop trigger if exists chat_reports_push_notify on public.chat_reports;
create trigger chat_reports_push_notify
  after insert on public.chat_reports
  for each row execute function public.push_notify_enqueue();

drop trigger if exists members_push_notify on public.members;
create trigger members_push_notify
  after insert on public.members
  for each row execute function public.push_notify_enqueue();

-- ------------------------------------------------------------ forgetting
-- Not a subscription made in the last ten minutes. Found running it: a push
-- sent seconds after a Chromium subscribed came back 404, the function
-- forgot the device, and every notification after it went nowhere — the
-- member's switch still said On. A push service still settling a brand-new
-- registration is the likely cause; either way a phone that is really gone
-- will say so again on the next message, and one that is not should not be
-- dropped for a first stumble.
create or replace function public.push_forget(p_secret text, p_endpoints text[])
returns void
language plpgsql
security definer
volatile
set search_path = ''
as $$
begin
  if p_secret is null or p_secret is distinct from (
    select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'push_notify_secret'
  ) then
    raise exception 'Not the notification trigger.' using errcode = '42501';
  end if;
  delete from public.push_subscriptions
   where endpoint = any (p_endpoints)
     and created_at < now() - interval '10 minutes';
end;
$$;

revoke all on function public.push_forget(text, text[]) from public, anon, authenticated;
grant execute on function public.push_forget(text, text[]) to service_role;

-- ------------------------------------------------------------ daily, cron
create or replace function public.push_daily()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'America/Los_Angeles')::date;
begin
  insert into public.push_daily_runs (day) values (today) on conflict do nothing;
  if not found then
    return;  -- already ran today
  end if;
  perform public.push_notify_send('daily', jsonb_build_object('day', today));
end;
$$;

revoke all on function public.push_daily() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'push-daily';
  perform cron.schedule('push-daily', '0 16 * * *', 'select public.push_daily()');
end;
$$;
