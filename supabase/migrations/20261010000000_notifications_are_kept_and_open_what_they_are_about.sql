-- ============================================================================
-- Notifications are kept, and each one opens what it is about
-- ============================================================================
-- The owner, 2026-10-09: every notification, pressed on the lock screen or
-- inside the app, should open the message, post or topic it is about; and the
-- app should list the notifications of the last while. Industry practice is
-- about thirty days (the owner's choice, over five).
--
-- ---------------------------------------------------------------------------
-- One record per member, written where every notification starts
-- ---------------------------------------------------------------------------
-- A notification was never stored: push_owed worked out, per device, who was
-- owed what, and the push service delivered it. A member with no device
-- subscribed (notifications refused, or a computer) had nothing. So
-- push_notify_send, which every notification passes through (the triggers and
-- the daily run), now first records one row per member who is owed it, with
-- the same rules as push_owed less the device: active, not the actor, not
-- through a mute of the conversation, topic or room, and a closed room only to
-- an administrator. The per-kind switches on Me are left to the phone: they
-- say what may interrupt somebody, and the list interrupts nobody.
--
-- Recording happens even where pushing is switched off (no push_notify_url),
-- and a failure to record never stops a push or the write that caused it.
--
-- ---------------------------------------------------------------------------
-- References, not words
-- ---------------------------------------------------------------------------
-- A row holds what it is about (a message, post, topic, event...), never a
-- copy of what was said. The list reads the words, names and titles when it
-- is opened, through my_notifications(), so a post taken back, a topic moved
-- to another room, a conversation left or a member deleted is shown as it is
-- now rather than as it was. Its address is worked out then too.
--
-- ---------------------------------------------------------------------------
-- Folded as the lock screen folds them
-- ---------------------------------------------------------------------------
-- The push tag already replaces one notification with the next on a phone:
-- one per conversation, per topic, per liked post. The list does the same
-- while a row is unread: a second message in a conversation moves its row to
-- the top with a count, rather than adding a row per message. Once read, the
-- next one starts a new row. Reading the conversation or topic itself marks
-- its rows read, so a count does not grow behind a conversation already seen.
--
-- ---------------------------------------------------------------------------
-- And the two addresses that were short
-- ---------------------------------------------------------------------------
-- push_owed is restated whole from 20261006000000 with two lines changed: a
-- message opens on that message (?message=), and a report opens Admin on its
-- Reports tab rather than on Members.
-- ============================================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  kind text not null check (kind in (
    'direct', 'group', 'reply', 'reply_participant', 'like', 'group_add', 'report',
    'invite_joined', 'event_reminder', 'org_events'
  )),
  tag text not null,
  actor_id uuid references public.members (id) on delete set null,
  thread_id uuid references public.chat_threads (id) on delete cascade,
  message_id uuid references public.chat_messages (id) on delete cascade,
  topic_id uuid references public.chat_topics (id) on delete cascade,
  post_id uuid references public.chat_posts (id) on delete cascade,
  event_id uuid references public.events (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete cascade,
  report_id uuid references public.chat_reports (id) on delete cascade,
  joined_id uuid references public.members (id) on delete cascade,
  -- Not words anybody wrote: an event's start time, or how many new events.
  detail text check (char_length(detail) <= 40),
  count integer not null default 1 check (count >= 1),
  created_at timestamptz not null default clock_timestamp(),
  seen_at timestamptz,
  read_at timestamptz
);

comment on table public.notifications is
  'What each member was notified about, for the list in the app. References only; words are read when listed. Kept 30 days.';

create unique index if not exists notifications_one_unread_per_tag
  on public.notifications (member_id, tag) where read_at is null;
create index if not exists notifications_member_recent
  on public.notifications (member_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "a member reads their own notifications" on public.notifications;
create policy "a member reads their own notifications"
  on public.notifications for select
  to authenticated
  using (member_id = auth.uid());

-- Read through my_notifications(); the table is selectable only so a new row
-- reaches the bell through realtime. Changed only by the functions below.
revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

-- One row per member owed it, or the unread row with the same tag moved to the
-- top and counted.
create or replace function public.notifications_record(p_event text, p_key jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  key_id uuid;
begin
  if p_event in ('message', 'post', 'report', 'member_joined') then
    key_id := (p_key ->> 'id')::uuid;
  end if;

  insert into public.notifications as n (
    member_id, kind, tag, actor_id, thread_id, message_id, topic_id, post_id,
    event_id, organization_id, report_id, joined_id, detail
  )
  select owed.member_id, owed.kind, owed.tag, owed.actor_id, owed.thread_id,
         owed.message_id, owed.topic_id, owed.post_id, owed.event_id,
         owed.organization_id, owed.report_id, owed.joined_id, owed.detail
    from (
      -- A message: everybody else in the conversation.
      select tm.member_id, t.kind, 'thread:' || t.id::text as tag, m.author_id as actor_id,
             t.id as thread_id, m.id as message_id, null::uuid as topic_id, null::uuid as post_id,
             null::uuid as event_id, null::uuid as organization_id, null::uuid as report_id,
             null::uuid as joined_id, null::text as detail
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
             null, null, p.topic_id, p.id, null, null, null, null, null
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
             null, null, tp.id, p.id, null, null, null, null, null
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
      -- Added to a group by somebody else.
      select tm.member_id, 'group_add', 'group_add:' || t.id::text, (p_key ->> 'by')::uuid,
             t.id, null, null, null, null, null, null, null, null
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
             null, null, null, null, null, null, rep.id, null, null
        from public.chat_reports rep
        join public.members r
          on r.is_admin and r.status = 'active' and r.id is distinct from rep.reporter_id
       where p_event = 'report' and rep.id = key_id

      union all
      -- Somebody joined on an invite: whoever vouched for them.
      select r.id, 'invite_joined', 'joined:' || joined.id::text, joined.id,
             null, null, null, null, null, null, null, joined.id, null
        from public.members joined
        join public.invites i on i.id = joined.invite_id
        join public.members r
          on r.id = i.invited_by_member_id and r.status = 'active' and r.id <> joined.id
       where p_event = 'member_joined' and joined.id = key_id

      union all
      -- Tomorrow's events, to everybody going.
      select r.id, 'event_reminder', 'event:' || e.id::text, null,
             null, null, null, null, e.id, null, null, null,
             lower(to_char(e.start_time at time zone coalesce(f.timezone, 'America/Los_Angeles'), 'FMHH12:MIam'))
        from public.events e
        left join public.data_feeds f on f.id = e.feed_id
        join public.event_rsvps rv on rv.event_id = e.id and rv.status = 'going'
        join public.members r on r.id = rv.member_id and r.status = 'active'
       where p_event = 'daily'
         and (e.start_time at time zone coalesce(f.timezone, 'America/Los_Angeles'))::date
             = (now() at time zone coalesce(f.timezone, 'America/Los_Angeles'))::date + 1

      union all
      -- New events from an organization a member follows, counted.
      select r.id, 'org_events', 'org:' || o.id::text, null,
             null, null, null, null, null, o.id, null, null, count(*)::text
        from public.organization_follows fo
        join public.organizations o on o.id = fo.organization_id
        join public.events e
          on e.organization_id = o.id
         and e.created_at > now() - interval '24 hours'
         and e.start_time > now()
        join public.members r on r.id = fo.member_id and r.status = 'active'
       where p_event = 'daily'
       group by r.id, o.id
    ) owed
  on conflict (member_id, tag) where read_at is null
  do update set
    created_at = clock_timestamp(),
    count = n.count + 1,
    actor_id = excluded.actor_id,
    message_id = excluded.message_id,
    post_id = excluded.post_id,
    detail = excluded.detail,
    seen_at = null;
end;
$$;

comment on function public.notifications_record(text, jsonb) is
  'Records who is owed a notification for one event, for the list in the app. Called by push_notify_send.';

revoke all on function public.notifications_record(text, jsonb) from public, anon, authenticated;

-- Restated from 20260927020000 with the record first. Its own block, so a
-- failure to record is a warning and the push still goes.
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
  begin
    perform public.notifications_record(p_event, p_key);
  exception when others then
    raise warning 'notifications_record: %', sqlerrm;
  end;

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
  raise warning 'push_notify_send: %', sqlerrm;
end;
$$;

revoke all on function public.push_notify_send(text, jsonb) from public, anon, authenticated;

-- The list, as the member may see it now. Definer, because it reads the words
-- and names behind each row; so every row is checked here as the screens
-- check it: still in the conversation, the room still readable, the post not
-- taken back, and reports to an administrator only.
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
         case when n.actor_id is null and n.kind in ('direct', 'group', 'reply', 'reply_participant', 'like', 'group_add')
              then 'Deleted member' else a.display_name end,
         a.photo_path,
         case
           when n.kind in ('direct', 'group', 'group_add') then
             coalesce(t.name, (select e.title from public.events e where e.id = t.event_id))
           when n.kind in ('reply', 'reply_participant', 'like') then tp.title
           when n.kind = 'event_reminder' then ev.title
           when n.kind = 'org_events' then o.name
           when n.kind = 'invite_joined' then j.display_name
         end,
         case
           when n.kind in ('direct', 'group') and m.removed_at is null then
             left(nullif(btrim(m.body), ''), 160)
           when n.kind in ('reply', 'reply_participant', 'like') and p.removed_at is null then
             left(nullif(btrim(p.body), ''), 160)
         end,
         n.detail,
         case
           when n.kind in ('direct', 'group') then
             '/chat/t/' || n.thread_id::text || coalesce('?message=' || n.message_id::text, '')
           when n.kind = 'group_add' then '/chat/t/' || n.thread_id::text
           when n.kind in ('reply', 'reply_participant', 'like') then
             '/chat/rooms/' || tp.room_id || '/topics/' || tp.id::text
               || coalesce('?post=' || n.post_id::text, '')
           when n.kind = 'report' then '/admin?tab=reports'
           when n.kind = 'invite_joined' then '/invites'
           when n.kind = 'event_reminder' then '/events/' || n.event_id::text
           when n.kind = 'org_events' then '/events/organizations/' || n.organization_id::text
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
       when n.kind = 'report' then public.is_admin()
       else true
     end
   order by n.created_at desc, n.id
   limit least(greatest(coalesce(max_rows, 40), 1), 100);
$$;

comment on function public.my_notifications(timestamptz, integer) is
  'The caller''s notifications from the last 30 days, newest first, with words, names and addresses as they are now.';

revoke all on function public.my_notifications(timestamptz, integer) from public, anon;
grant execute on function public.my_notifications(timestamptz, integer) to authenticated;

-- The bell's number: what has arrived since the list was last opened, counted
-- as the list shows it.
create or replace function public.my_unseen_notification_count()
returns integer
language sql
security definer
stable
set search_path = ''
as $$
  select count(*)::integer from public.my_notifications(null, 100) n where not n.seen;
$$;

revoke all on function public.my_unseen_notification_count() from public, anon;
grant execute on function public.my_unseen_notification_count() to authenticated;

create or replace function public.notifications_mark_seen()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications set seen_at = clock_timestamp()
   where member_id = auth.uid() and seen_at is null;
$$;

-- One row, or every row (null).
create or replace function public.notifications_mark_read(notification uuid default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
     set read_at = clock_timestamp(), seen_at = coalesce(seen_at, clock_timestamp())
   where member_id = auth.uid() and read_at is null
     and (notification is null or id = notification);
$$;

revoke all on function public.notifications_mark_seen() from public, anon;
revoke all on function public.notifications_mark_read(uuid) from public, anon;
grant execute on function public.notifications_mark_seen() to authenticated;
grant execute on function public.notifications_mark_read(uuid) to authenticated;

-- Reading a conversation or a topic reads what the list says about it.
create or replace function public.notifications_read_with_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'chat_thread_members' then
    if new.last_read_at is distinct from old.last_read_at then
      update public.notifications
         set read_at = clock_timestamp(), seen_at = coalesce(seen_at, clock_timestamp())
       where member_id = new.member_id and thread_id = new.thread_id and read_at is null
         and kind in ('direct', 'group', 'group_add');
    end if;
  else
    update public.notifications
       set read_at = clock_timestamp(), seen_at = coalesce(seen_at, clock_timestamp())
     where member_id = new.member_id and topic_id = new.topic_id and read_at is null;
  end if;
  return null;
exception when others then
  raise warning 'notifications_read_with_chat: %', sqlerrm;
  return null;
end;
$$;

revoke all on function public.notifications_read_with_chat() from public, anon, authenticated;

drop trigger if exists chat_thread_members_read_notifications on public.chat_thread_members;
create trigger chat_thread_members_read_notifications
  after update of last_read_at on public.chat_thread_members
  for each row execute function public.notifications_read_with_chat();

drop trigger if exists chat_topic_reads_read_notifications on public.chat_topic_reads;
create trigger chat_topic_reads_read_notifications
  after insert or update on public.chat_topic_reads
  for each row execute function public.notifications_read_with_chat();

-- Thirty days, then gone.
create or replace function public.notifications_forget()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.notifications where created_at < now() - interval '30 days';
$$;

revoke all on function public.notifications_forget() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'notifications-forget';
  perform cron.schedule('notifications-forget', '30 11 * * *', 'select public.notifications_forget()');
end;
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

  if p_event in ('message', 'post', 'report', 'member_joined') then
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
             null::int
        from l
        join public.members r on r.id = l.author_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
        left join public.members a on a.id = l.liker_id
       where l.author_id is distinct from l.liker_id
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
             '/admin?tab=reports', 'report:' || rep.id::text,
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
