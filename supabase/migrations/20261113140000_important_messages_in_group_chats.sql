-- ============================================================================
-- Important messages in group chats
-- ============================================================================
-- The owner, 2026-11-13: "mark a specific message as important for the whole
-- group to read ... highlight the message ... a way for someone to see it even
-- if a lot of discussion happened about it later. If they tap into a chat the
-- message floats until they acknowledge it ... Let people see who has
-- acknowledged the message." Who may mark: "Group creator + admins". Not
-- time-sensitive ("probably too strong"): "a regular notification, but with a
-- reminder every couple hours and ... up to the top" of the bell.
--
-- * chat_important_messages: a group message marked Important, by whom and
--   when. Who may mark (private.may_mark_important): a member of the group
--   who started it, a club administrator in it, or, in an event's group chat,
--   whoever may change the event. Unmarking keeps the row (unmarked_at), so
--   the change reaches the screen as an UPDATE: Realtime does not apply RLS to
--   a DELETE (the check-in review, 2026-11-13).
-- * chat_important_acks: who has acknowledged it. Everyone in the group but
--   whoever marked it and whoever wrote it is asked to.
-- * Marking tells each of them, in the bell and by push (kind 'important',
--   which a member can switch off on Me like any other kind). It reaches a
--   group they have muted: that is what Important is for.
-- * push_important_reminders, every 15 minutes: whoever has not acknowledged
--   is pushed again 2 hours after the last push, three pushes in all (the
--   owner: "only three notifications every two hours"), within a day and a
--   half of the marking, and not between 9pm and 8am Pacific.
-- * Two hours after the third, whoever marked it is told, once, how many
--   have not acknowledged (kind 'important', detail 'waiting'): "notify the
--   author to either re-ping the non-acks or just let it be". Remind them
--   (chat_remind_important) pushes those once more, at most every 2 hours.
-- * Acknowledging reads the notification and stops the reminders.
--
-- An older copy of the app draws the kind as "Something new in the club" and
-- opens the conversation; it shows no highlight and no Acknowledge, and its
-- members can still read the message. Nothing breaks.
--
-- my_notifications as 20261113120000 left it, push_owed as 20261113120000
-- left it, each with 'important' added and nothing else changed.
--
-- Probe: supabase/tests/important-messages.sql.
-- ============================================================================

-- -------------------------------------------------------------- the kind
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'direct', 'group', 'reply', 'reply_participant', 'like', 'group_add', 'report',
  'invite_joined', 'event_reminder', 'org_events', 'grant_open', 'profile_reminder',
  'blocks_weekly', 'reaction', 'event_starting', 'invite_request', 'mention', 'introduction',
  'join_request', 'check_in_reminder', 'event_followup', 'calendar_invite',
  'organization_request', 'event_notice', 'family_link', 'checked_in', 'important'
));

alter table public.push_muted_kinds drop constraint if exists push_muted_kinds_kind_check;
alter table public.push_muted_kinds add constraint push_muted_kinds_kind_check check (kind in (
  'group_add', 'reply_participant', 'report', 'invite_joined', 'event_reminder', 'org_events',
  'like', 'grant_open', 'profile_reminder', 'reaction', 'event_starting', 'invite_request',
  'mention', 'introduction', 'join_request', 'check_in_reminder', 'event_followup',
  'calendar_invite', 'organization_request', 'event_notice', 'family_link', 'checked_in',
  'important'
));

-- ------------------------------------------------------------- the tables

create table if not exists public.chat_important_messages (
  message_id uuid primary key references public.chat_messages (id) on delete cascade,
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  marked_by uuid references public.members (id) on delete set null,
  marked_at timestamptz not null default now(),
  unmarked_at timestamptz
);

create index if not exists chat_important_messages_thread_idx
  on public.chat_important_messages (thread_id);

comment on table public.chat_important_messages is
  'Group messages marked Important, and by whom. Unmarked keeps the row. See 20261113140000.';

create table if not exists public.chat_important_acks (
  message_id uuid not null references public.chat_important_messages (message_id) on delete cascade,
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (message_id, member_id)
);

create index if not exists chat_important_acks_thread_idx
  on public.chat_important_acks (thread_id);
create index if not exists chat_important_acks_member_idx
  on public.chat_important_acks (member_id);

comment on table public.chat_important_acks is
  'Who acknowledged an Important message. See 20261113140000.';

-- Read by the group's members, so the screen can listen; written only by the
-- functions below.
alter table public.chat_important_messages enable row level security;
alter table public.chat_important_acks enable row level security;
revoke all on public.chat_important_messages from public, anon, authenticated;
revoke all on public.chat_important_acks from public, anon, authenticated;
grant select on public.chat_important_messages to authenticated;
grant select on public.chat_important_acks to authenticated;

drop policy if exists "a group reads its important messages" on public.chat_important_messages;
create policy "a group reads its important messages"
  on public.chat_important_messages for select
  to authenticated
  using (public.is_thread_member(thread_id));

drop policy if exists "a group reads who acknowledged" on public.chat_important_acks;
create policy "a group reads who acknowledged"
  on public.chat_important_acks for select
  to authenticated
  using (public.is_thread_member(thread_id));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public'
       and tablename = 'chat_important_messages'
  ) then
    alter publication supabase_realtime add table public.chat_important_messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public'
       and tablename = 'chat_important_acks'
  ) then
    alter publication supabase_realtime add table public.chat_important_acks;
  end if;
end;
$$;

-- Every push of an Important message, first, reminders and Remind them, by run.
create table if not exists private.important_pushes (
  message_id uuid not null references public.chat_messages (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  batch timestamptz not null,
  primary key (message_id, member_id, batch)
);

create index if not exists important_pushes_batch_idx on private.important_pushes (batch);

comment on table private.important_pushes is
  'Each push of an Important message to a member: the first, then reminders. See 20261113140000.';

revoke all on private.important_pushes from public, anon, authenticated;

-- Whoever marked it, told that some have not acknowledged: once.
create table if not exists private.important_waiting_told (
  message_id uuid primary key references public.chat_messages (id) on delete cascade,
  batch timestamptz not null
);

create index if not exists important_waiting_told_batch_idx on private.important_waiting_told (batch);

revoke all on private.important_waiting_told from public, anon, authenticated;

-- ------------------------------------------------------------ who may mark

create or replace function private.may_mark_important(p_thread uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_threads t
     where t.id = p_thread
       and t.kind = 'group'
       and public.is_member()
       and public.is_thread_member(t.id)
       and (
         t.created_by = auth.uid()
         or public.is_admin()
         or (t.event_id is not null and public.may_change_event(t.event_id))
       )
  );
$$;

revoke all on function private.may_mark_important(uuid) from public, anon, authenticated;

-- Who is asked to acknowledge: the group, but not whoever marked it or wrote it,
-- nor anybody blocked from or blocking the author.
create or replace function private.important_audience(p_message uuid)
returns table(member_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select tm.member_id
    from public.chat_important_messages im
    join public.chat_messages m on m.id = im.message_id
    join public.chat_thread_members tm on tm.thread_id = im.thread_id
    join public.members r on r.id = tm.member_id and r.status = 'active'
   where im.message_id = p_message
     and tm.member_id is distinct from im.marked_by
     and tm.member_id is distinct from m.author_id
     -- Not somebody who does not see the author's words (a block, either way).
     and not private.blocked_between(tm.member_id, m.author_id);
$$;

revoke all on function private.important_audience(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- marking

create or replace function public.chat_mark_important(p_message uuid, p_important boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  found_message record;
  was_active boolean;
  run_at timestamptz := clock_timestamp();
begin
  select m.id, m.thread_id, m.author_id, m.removed_at, m.notice into found_message
    from public.chat_messages m where m.id = p_message;
  if me is null or found_message.id is null
     or not private.may_mark_important(found_message.thread_id) then
    raise exception 'Only whoever started this group, or an administrator, can mark a message Important.'
      using errcode = '42501';
  end if;

  if not p_important then
    update public.chat_important_messages im
       set unmarked_at = now()
     where im.message_id = p_message and im.unmarked_at is null;
    delete from public.notifications n
     where n.tag in ('important:' || p_message::text, 'important_waiting:' || p_message::text)
       and n.read_at is null;
    return;
  end if;

  if found_message.removed_at is not null or found_message.notice is not null then
    raise exception 'That message cannot be marked Important.' using errcode = '22023';
  end if;

  select im.unmarked_at is null into was_active
    from public.chat_important_messages im where im.message_id = p_message;
  if was_active then
    return;
  end if;

  -- Marked again after unmarking starts over: new time, nobody acknowledged,
  -- three pushes again.
  delete from public.chat_important_acks a where a.message_id = p_message;
  delete from private.important_pushes p where p.message_id = p_message;
  delete from private.important_waiting_told w where w.message_id = p_message;
  insert into public.chat_important_messages (message_id, thread_id, marked_by, marked_at)
  values (p_message, found_message.thread_id, me, now())
  on conflict (message_id) do update
    set marked_by = excluded.marked_by, marked_at = excluded.marked_at, unmarked_at = null;

  insert into public.notifications as n (member_id, kind, tag, actor_id, thread_id, message_id)
  select a.member_id, 'important', 'important:' || p_message::text,
         found_message.author_id, found_message.thread_id, p_message
    from private.important_audience(p_message) a
  on conflict (member_id, tag) where read_at is null
  do update set created_at = clock_timestamp(), seen_at = null;

  insert into private.important_pushes (message_id, member_id, batch)
  select p_message, a.member_id, run_at
    from private.important_audience(p_message) a
  on conflict do nothing;
  perform public.push_notify_send('important', jsonb_build_object('batch', run_at));
end;
$$;

revoke all on function public.chat_mark_important(uuid, boolean) from public, anon;
grant execute on function public.chat_mark_important(uuid, boolean) to authenticated;

-- ---------------------------------------------------------- acknowledging

create or replace function public.chat_acknowledge_important(p_message uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  found_thread uuid;
begin
  select im.thread_id into found_thread
    from public.chat_important_messages im
   where im.message_id = p_message and im.unmarked_at is null;
  if me is null or found_thread is null or not public.is_member()
     or not public.is_thread_member(found_thread) then
    raise exception 'That message is not Important in a group you are in.' using errcode = 'P0002';
  end if;

  insert into public.chat_important_acks (message_id, thread_id, member_id)
  values (p_message, found_thread, me)
  on conflict do nothing;

  update public.notifications n
     set read_at = now(), seen_at = coalesce(n.seen_at, now())
   where n.member_id = me and n.tag = 'important:' || p_message::text and n.read_at is null;
end;
$$;

revoke all on function public.chat_acknowledge_important(uuid) from public, anon;
grant execute on function public.chat_acknowledge_important(uuid) to authenticated;

-- ------------------------------------------------------------ the screens

-- A group's Important messages, for its members: whether the reader may mark,
-- and for each, who acknowledged and who is still asked to.
create or replace function public.chat_thread_important(p_thread uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_member() or not public.is_thread_member(p_thread) then
    return jsonb_build_object('can_mark', false, 'items', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'can_mark', private.may_mark_important(p_thread),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'message_id', im.message_id,
               'marked_by', im.marked_by,
               'marked_at', im.marked_at,
               -- For the banner, which shows it however far up it is.
               'author_id', m.author_id,
               'author_name', (select a.display_name from public.members a where a.id = m.author_id),
               'body', m.body,
               'photo_count', cardinality(m.attachments),
               'asked', coalesce((
                 select jsonb_agg(a.member_id) from private.important_audience(im.message_id) a
               ), '[]'::jsonb),
               'acknowledged', coalesce((
                 select jsonb_agg(jsonb_build_object('member_id', k.member_id, 'at', k.acknowledged_at)
                                  order by k.acknowledged_at)
                   from public.chat_important_acks k
                  where k.message_id = im.message_id
                    and k.member_id in (select a.member_id from private.important_audience(im.message_id) a)
               ), '[]'::jsonb)
             ) order by im.marked_at)
        from public.chat_important_messages im
        join public.chat_messages m on m.id = im.message_id
       where im.thread_id = p_thread
         and im.unmarked_at is null
         and m.removed_at is null
         and not private.blocked_between(auth.uid(), m.author_id)
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.chat_thread_important(uuid) from public, anon;
grant execute on function public.chat_thread_important(uuid) to authenticated;

-- Who is asked to acknowledge one, with names, for the group's members: the
-- "Acknowledged by 3 of 5" sheet. Acknowledged first, then not yet.
create or replace function public.chat_important_people(p_message uuid)
returns table(
  member_id uuid, display_name text, photo_path text, photo_alt text, acknowledged_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.member_id, r.display_name, r.photo_path, r.photo_alt, k.acknowledged_at
    from public.chat_important_messages im
    cross join lateral private.important_audience(im.message_id) a
    join public.members r on r.id = a.member_id
    left join public.chat_important_acks k
      on k.message_id = im.message_id and k.member_id = a.member_id
   where im.message_id = p_message
     and im.unmarked_at is null
     and public.is_member()
     and public.is_thread_member(im.thread_id)
   order by k.acknowledged_at nulls last, r.display_name;
$$;

revoke all on function public.chat_important_people(uuid) from public, anon;
grant execute on function public.chat_important_people(uuid) to authenticated;

-- What the reader is still asked to acknowledge, anywhere: the top of the bell.
create or replace function public.chat_my_important()
returns table(
  message_id uuid, thread_id uuid, thread_name text, author_id uuid, author_name text,
  body text, photo_count integer, marked_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select im.message_id, im.thread_id,
         coalesce(t.name, (select e.title from public.events e where e.id = t.event_id)),
         m.author_id, a.display_name, m.body, cardinality(m.attachments), im.marked_at
    from public.chat_important_messages im
    join public.chat_messages m on m.id = im.message_id
    join public.chat_threads t on t.id = im.thread_id
    join public.chat_thread_members tm on tm.thread_id = im.thread_id and tm.member_id = auth.uid()
    left join public.members a on a.id = m.author_id
   where public.is_member()
     and im.unmarked_at is null
     and m.removed_at is null
     and im.marked_at > now() - interval '30 days'
     and auth.uid() is distinct from im.marked_by
     and auth.uid() is distinct from m.author_id
     and not exists (
       select 1 from public.chat_important_acks k
        where k.message_id = im.message_id and k.member_id = auth.uid()
     )
     and not private.blocked_between(auth.uid(), m.author_id)
   order by im.marked_at desc
   limit 20;
$$;

revoke all on function public.chat_my_important() from public, anon;
grant execute on function public.chat_my_important() to authenticated;

-- -------------------------------------------------------------- reminders

create or replace function public.push_important_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_at timestamptz := clock_timestamp();
  recorded integer;
  local_hour integer := extract(hour from now() at time zone 'America/Los_Angeles');
begin
  if local_hour < 8 or local_hour >= 21 then
    return;
  end if;

  insert into private.important_pushes (message_id, member_id, batch)
  select im.message_id, a.member_id, run_at
    from public.chat_important_messages im
    join public.chat_messages m on m.id = im.message_id
    cross join lateral private.important_audience(im.message_id) a
    cross join lateral (
      select count(*) as sent, max(p.batch) as last
        from private.important_pushes p
       where p.message_id = im.message_id and p.member_id = a.member_id
    ) pushed
   where im.unmarked_at is null
     and m.removed_at is null
     and im.marked_at > now() - interval '36 hours'
     and pushed.sent between 1 and 2
     and pushed.last <= now() - interval '2 hours'
     and not exists (
       select 1 from public.chat_important_acks k
        where k.message_id = im.message_id and k.member_id = a.member_id
     )
  on conflict do nothing;
  get diagnostics recorded = row_count;
  if recorded > 0 then
    insert into public.notifications as n (member_id, kind, tag, actor_id, thread_id, message_id, detail)
    select p.member_id, 'important', 'important:' || p.message_id::text,
           m.author_id, m.thread_id, p.message_id, 'reminder'
      from private.important_pushes p
      join public.chat_messages m on m.id = p.message_id
     where p.batch = run_at
    on conflict (member_id, tag) where read_at is null
    do update set created_at = clock_timestamp(), seen_at = null, detail = 'reminder';
    perform public.push_notify_send('important', jsonb_build_object('batch', run_at));
  end if;

  -- Two hours after somebody's third push, still not acknowledged: whoever
  -- marked it is told how many are waiting, once.
  insert into private.important_waiting_told (message_id, batch)
  select im.message_id, run_at
    from public.chat_important_messages im
    join public.chat_messages m on m.id = im.message_id
    join public.members mk on mk.id = im.marked_by and mk.status = 'active'
   where im.unmarked_at is null
     and m.removed_at is null
     and exists (
       select 1 from public.chat_thread_members x
        where x.thread_id = im.thread_id and x.member_id = im.marked_by
     )
     and exists (
       select 1
         from private.important_audience(im.message_id) a
         cross join lateral (
           select count(*) as sent, max(p.batch) as last
             from private.important_pushes p
            where p.message_id = im.message_id and p.member_id = a.member_id
         ) pushed
        where pushed.sent >= 3
          and pushed.last <= now() - interval '2 hours'
          and not exists (
            select 1 from public.chat_important_acks k
             where k.message_id = im.message_id and k.member_id = a.member_id
          )
     )
  on conflict do nothing;
  get diagnostics recorded = row_count;
  if recorded > 0 then
    insert into public.notifications as n
      (member_id, kind, tag, actor_id, thread_id, message_id, detail, count)
    select im.marked_by, 'important', 'important_waiting:' || im.message_id::text,
           m.author_id, im.thread_id, im.message_id, 'waiting',
           greatest((select count(*) from private.important_audience(im.message_id) a
             where not exists (
               select 1 from public.chat_important_acks k
                where k.message_id = im.message_id and k.member_id = a.member_id
             ))::integer, 1)
      from private.important_waiting_told w
      join public.chat_important_messages im on im.message_id = w.message_id
      join public.chat_messages m on m.id = im.message_id
     where w.batch = run_at
    on conflict (member_id, tag) where read_at is null
    do update set created_at = clock_timestamp(), seen_at = null, count = excluded.count;
    perform public.push_notify_send('important', jsonb_build_object('waiting', run_at));
  end if;
end;
$$;

revoke all on function public.push_important_reminders() from public, anon, authenticated;

-- Remind them: whoever marked it, or may mark in the group, pushes those who
-- have not acknowledged once more; at most every 2 hours, and not overnight
-- is theirs to judge.
create or replace function public.chat_remind_important(p_message uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_thread uuid;
  run_at timestamptz := clock_timestamp();
  recorded integer;
begin
  select im.thread_id into found_thread
    from public.chat_important_messages im
   where im.message_id = p_message and im.unmarked_at is null;
  if auth.uid() is null or found_thread is null or not private.may_mark_important(found_thread) then
    raise exception 'Only whoever started this group, or an administrator, can send a reminder.'
      using errcode = '42501';
  end if;
  if exists (
    select 1 from private.important_pushes p
     where p.message_id = p_message and p.batch > now() - interval '2 hours'
  ) then
    raise exception 'A reminder went out less than 2 hours ago.' using errcode = '22023';
  end if;

  insert into private.important_pushes (message_id, member_id, batch)
  select p_message, a.member_id, run_at
    from private.important_audience(p_message) a
   where not exists (
     select 1 from public.chat_important_acks k
      where k.message_id = p_message and k.member_id = a.member_id
   )
  on conflict do nothing;
  get diagnostics recorded = row_count;
  if recorded > 0 then
    insert into public.notifications as n (member_id, kind, tag, actor_id, thread_id, message_id, detail)
    select p.member_id, 'important', 'important:' || p.message_id::text,
           m.author_id, m.thread_id, p.message_id, 'reminder'
      from private.important_pushes p
      join public.chat_messages m on m.id = p.message_id
     where p.batch = run_at and p.message_id = p_message
    on conflict (member_id, tag) where read_at is null
    do update set created_at = clock_timestamp(), seen_at = null, detail = 'reminder';
    perform public.push_notify_send('important', jsonb_build_object('batch', run_at));
  end if;
  -- Their own "still waiting" is answered.
  update public.notifications n
     set read_at = now(), seen_at = coalesce(n.seen_at, now())
   where n.member_id = auth.uid() and n.tag = 'important_waiting:' || p_message::text
     and n.read_at is null;
  return recorded;
end;
$$;

revoke all on function public.chat_remind_important(uuid) from public, anon;
grant execute on function public.chat_remind_important(uuid) to authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'push-important-reminders';
  perform cron.schedule('push-important-reminders', '*/15 * * * *', 'select public.push_important_reminders()');
end;
$$;

-- ------------------------------------------------- the bell and the push --

CREATE OR REPLACE FUNCTION public.my_notifications(before timestamp with time zone DEFAULT NULL::timestamp with time zone, max_rows integer DEFAULT 40)
 RETURNS TABLE(id uuid, kind text, count integer, created_at timestamp with time zone, seen boolean, read boolean, actor_id uuid, actor_name text, actor_photo text, place text, excerpt text, detail text, url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select n.id, n.kind, n.count, n.created_at, n.seen_at is not null, n.read_at is not null,
         n.actor_id,
         case when n.actor_id is null and n.kind in ('direct', 'group', 'reply', 'reply_participant', 'like', 'group_add', 'reaction', 'mention', 'introduction', 'join_request', 'organization_request', 'family_link', 'checked_in', 'important')
              then 'Deleted member' else a.display_name end,
         a.photo_path,
         case
           when n.kind in ('direct', 'group', 'group_add', 'important')
                or (n.kind = 'reaction' and n.thread_id is not null) then
             coalesce(t.name, (select e.title from public.events e where e.id = t.event_id))
           when n.kind in ('reply', 'reply_participant', 'like', 'reaction', 'mention') then tp.title
           when n.kind in ('event_reminder', 'event_starting', 'check_in_reminder', 'event_followup', 'event_notice', 'checked_in') then ev.title
           when n.kind in ('org_events', 'grant_open', 'invite_request', 'join_request') then o.name
           when n.kind = 'invite_joined' then j.display_name
           when n.kind = 'calendar_invite' then ci.payload ->> 'title'
           when n.kind = 'organization_request' then orq.draft ->> 'name'
           -- Who they are being introduced to; to the partner, the group.
           when n.kind = 'introduction' and n.detail = 'opened' and t.id is not null then t.name
           when n.kind = 'introduction' then ox.display_name
           -- What the actor is to the reader (20261107100000).
           when n.kind = 'family_link' then
             case when fl.asker_id = n.member_id then fl.relation else private.family_inverse(fl.relation) end
         end,
         case
           when (n.kind in ('direct', 'group', 'important') or (n.kind = 'reaction' and n.thread_id is not null))
                and m.removed_at is null then
             left(nullif(btrim(m.body), ''), 160)
           when n.kind in ('reply', 'reply_participant', 'like', 'reaction', 'mention')
                and p.removed_at is null then
             left(nullif(btrim(p.body), ''), 160)
           when n.kind = 'grant_open' then gr.name
           when n.kind = 'event_notice' then o.name
           when n.kind = 'introduction' and n.detail = 'asked' then left(ix.note, 160)
         end,
         n.detail,
         case
           when n.kind in ('direct', 'group', 'important')
                or (n.kind = 'reaction' and n.thread_id is not null) then
             '/chat/t/' || n.thread_id::text || coalesce('?message=' || n.message_id::text, '')
           when n.kind = 'group_add' then '/chat/t/' || n.thread_id::text
           when n.kind in ('reply', 'reply_participant', 'like', 'reaction', 'mention') then
             '/chat/rooms/' || tp.room_id || '/topics/' || tp.id::text
               || coalesce('?post=' || n.post_id::text, '')
           when n.kind = 'report' then '/admin?tab=reports'
           when n.kind = 'blocks_weekly' then '/admin?tab=reports#blocks'
           -- From a QR code or link: the administrators' tally, or for an
           -- org admin, who joined (20261028970000).
           when n.kind = 'invite_joined' and n.detail like 'qr:%' and public.is_admin() then '/admin?tab=invites'
           when n.kind = 'invite_joined' and n.detail like 'qr:%' then '/peers/' || n.joined_id::text
           when n.kind = 'invite_joined' then '/invites'
           when n.kind in ('event_reminder', 'event_starting', 'event_notice', 'checked_in') then '/events/' || n.event_id::text
           when n.kind = 'check_in_reminder' then '/events/' || n.event_id::text || '/check-in'
           when n.kind = 'event_followup' then '/events/' || n.event_id::text || '/review'
           when n.kind in ('org_events', 'grant_open', 'join_request') then '/events/organizations/' || n.organization_id::text
           when n.kind = 'invite_request' then '/invites#requests'
           when n.kind = 'calendar_invite' and n.detail in ('held', 'choose') then '/events/invites'
           when n.kind = 'calendar_invite' and ci.event_id is not null then '/events/' || ci.event_id::text
           when n.kind = 'calendar_invite' then '/events'
           when n.kind = 'organization_request' and n.detail = 'asked' then '/admin?tab=organizations'
           when n.kind = 'organization_request' and orq.organization_id is not null
             then '/events/organizations/' || orq.organization_id::text
           when n.kind = 'organization_request' then '/events?segment=orgs'
           when n.kind = 'profile_reminder' and n.detail = 'details' then '/profile/details'
           when n.kind = 'profile_reminder' then '/profile?resume'
           -- A partner who is not in it goes to their page.
           when n.kind = 'introduction' and n.detail = 'opened'
                and not exists (select 1 from public.chat_thread_members x
                                 where x.thread_id = n.thread_id and x.member_id = n.member_id)
             then '/partner'
           when n.kind = 'introduction' and n.detail = 'opened' then '/chat/t/' || n.thread_id::text
           when n.kind = 'introduction' then '/introductions/' || n.introduction_id::text
           when n.kind = 'family_link' then '/peers/' || n.actor_id::text
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
    left join public.introductions ix on ix.id = n.introduction_id
    left join public.calendar_invites ci on ci.id = n.calendar_invite_id
    left join public.organization_requests orq on orq.id = n.organization_request_id
    left join public.family_links fl on fl.id = n.family_link_id
    left join public.members ox
      on ox.id = case when ix.first_id = n.member_id then ix.second_id else ix.first_id end
   where n.member_id = auth.uid()
     and public.is_member()
     and (before is null or n.created_at < before)
     and n.created_at > now() - interval '30 days'
     and case
       when n.kind in ('direct', 'group', 'group_add', 'important') then exists (
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
       when n.kind = 'mention' then p.removed_at is null and public.chat_room_is_readable(tp.room_id)
       when n.kind in ('report', 'blocks_weekly') then public.is_admin()
       when n.kind = 'organization_request' and n.detail = 'asked' then public.is_admin()
       -- Only while they still speak for its organization.
       when n.kind = 'invite_request' then public.speaks_for(n.organization_id)
       when n.kind = 'join_request' then public.speaks_for(n.organization_id) or public.is_admin()
       when n.kind = 'introduction' and n.detail = 'opened' then ix.introduced_by = auth.uid() or exists (
         select 1 from public.chat_thread_members x
          where x.thread_id = n.thread_id and x.member_id = auth.uid()
       )
       when n.kind = 'introduction' then ix.id is not null and ox.status = 'active'
       when n.kind = 'family_link' then fl.id is not null
       else true
     end
     and not exists (
       select 1 from public.member_blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id in (n.actor_id, tp.author_id, ox.id))
           or (b.blocked_id = auth.uid() and b.blocker_id in (n.actor_id, tp.author_id, ox.id)
               and not public.is_admin())
     )
   order by n.created_at desc, n.id
   limit least(greatest(coalesce(max_rows, 40), 1), 100);
$function$;

CREATE OR REPLACE FUNCTION public.push_owed(p_secret text, p_event text, p_key jsonb)
 RETURNS TABLE(endpoint text, p256dh text, auth text, kind text, actor_name text, body text, photo_count integer, subject text, detail text, url text, tag text, badge integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  key_id uuid;
begin
  if p_secret is null or p_secret is distinct from (
    select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'push_notify_secret'
  ) then
    raise exception 'Not the notification trigger.' using errcode = '42501';
  end if;

  if p_event in ('message', 'post', 'report', 'member_joined', 'grant_open', 'invite_request') then
    key_id := (p_key ->> 'id')::uuid;
  end if;

  if p_event = 'message' then
    -- Opens on the message itself (?message=), which the conversation
    -- scrolls to: a later look at the notification should not land on
    -- whatever was said since. Only those notifications_record marked for
    -- this message (20261105160000); detail is how many are unread, if more
    -- than one.
    return query
      select s.endpoint, s.p256dh, s.auth,
             t.kind, a.display_name, m.body, cardinality(m.attachments),
             -- A group's name, or its event's title (as the bell's place).
             case when t.kind = 'group' then
               coalesce(t.name, (select e.title from public.events e where e.id = t.event_id))
             end,
             case when n.count > 1 then n.count::text end,
             '/chat/t/' || t.id::text || '?message=' || m.id::text, 'thread:' || t.id::text,
             public.notification_badge(r.id)
        from public.chat_messages m
        join public.chat_threads t on t.id = m.thread_id
        join public.chat_thread_members tm
          on tm.thread_id = t.id and tm.member_id is distinct from m.author_id
        join public.members r on r.id = tm.member_id and r.status = 'active'
        join public.notifications n
          on n.member_id = r.id and n.tag = 'thread:' || t.id::text
         and n.read_at is null and n.pushed_message = m.id
        join public.push_subscriptions s on s.member_id = r.id
        left join public.members a on a.id = m.author_id
       where m.id = key_id
         and m.removed_at is null
         and not exists (
           select 1 from public.member_blocks b
            where (b.blocker_id = r.id and b.blocked_id = m.author_id)
               or (b.blocker_id = m.author_id and b.blocked_id = r.id and not r.is_admin)
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
            where (b.blocker_id = r.id and b.blocked_id in (p.author_id, p.starter_id))
               or (b.blocker_id in (p.author_id, p.starter_id) and b.blocked_id = r.id and not r.is_admin)
         )
         and not exists (
           select 1 from public.chat_topic_mutes x where x.topic_id = p.topic_id and x.member_id = r.id
         )
         and not exists (
           select 1 from public.chat_room_mutes x where x.room_id = p.room_id and x.member_id = r.id
         )
         -- Named in it: the mention says so instead, unless its push is off.
         and not exists (
           select 1 from public.chat_post_mentions x
            where x.post_id = p.id and x.member_id = r.id
              and not exists (
                select 1 from public.push_muted_kinds q where q.member_id = r.id and q.kind = 'mention'
              )
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
            where (b.blocker_id = r.id or (b.blocked_id = r.id and not r.is_admin))
              and (case when b.blocker_id = r.id then b.blocked_id else b.blocker_id end) in (
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
               or (b.blocker_id = l.starter_id and b.blocked_id = r.id and not r.is_admin)
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

  elsif p_event = 'mention' then
    -- Each member the post named for the first time, checked again: 'topic'
    -- for a topic's opening post, as a like.
    return query
      with l as (
        select p.id as post_id, p.author_id, p.body, p.attachments,
               tp.id as topic_id, tp.author_id as starter_id, tp.room_id, rm.opened_at,
               p.id = (select f.id from public.chat_posts f
                        where f.topic_id = tp.id
                        order by f.created_at, f.id limit 1) as is_opening
          from public.chat_posts p
          join public.chat_topics tp on tp.id = p.topic_id
          join public.chat_rooms rm on rm.id = tp.room_id
         where p.id = (p_key ->> 'id')::uuid and p.removed_at is null
      )
      select s.endpoint, s.p256dh, s.auth,
             'mention'::text, a.display_name, l.body, coalesce(cardinality(l.attachments), 0),
             null::text, case when l.is_opening then 'topic' else 'post' end,
             '/chat/rooms/' || l.room_id || '/topics/' || l.topic_id::text || '?post=' || l.post_id::text,
             'mention:' || l.post_id::text,
             public.notification_badge(r.id)
        from l
        join public.chat_post_mentions x
          on x.post_id = l.post_id and x.created_at = (p_key ->> 'at')::timestamptz
        join public.members r on r.id = x.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
        left join public.members a on a.id = l.author_id
       where r.id is distinct from l.author_id
         and (l.opened_at is not null or r.is_admin)
         and not exists (
           select 1 from public.member_blocks b
            where (b.blocker_id = r.id and b.blocked_id in (l.author_id, l.starter_id))
               or (b.blocker_id = l.author_id and b.blocked_id = r.id)
               or (b.blocker_id = l.starter_id and b.blocked_id = r.id and not r.is_admin)
         )
         and not exists (
           select 1 from public.chat_topic_mutes q where q.topic_id = l.topic_id and q.member_id = r.id
         )
         and not exists (
           select 1 from public.chat_room_mutes q where q.room_id = l.room_id and q.member_id = r.id
         )
         and not exists (
           select 1 from public.push_muted_kinds q where q.member_id = r.id and q.kind = 'mention'
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
            where (b.blocker_id = r.id and b.blocked_id = (p_key ->> 'by')::uuid)
               or (b.blocker_id = (p_key ->> 'by')::uuid and b.blocked_id = r.id and not r.is_admin)
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

  elsif p_event = 'invite_request' then
    -- Somebody asked an org admin for an invite (20261029030000).
    return query
      select s.endpoint, s.p256dh, s.auth,
             'invite_request'::text, null::text, null::text, 0,
             o.name,
             q.name,
             '/invites#requests', 'invite_request:' || o.id::text,
             public.notification_badge(r.id)
        from public.invite_requests q
        join public.organizations o on o.id = q.organization_id
        join public.members r on r.status = 'active' and (r.id = q.admin_id or r.id in (
          select d.member_id from private.invite_request_desk d
            join public.organization_representatives dr
              on dr.member_id = d.member_id and dr.organization_id = q.organization_id))
        join public.push_subscriptions s on s.member_id = r.id
       where q.id = (p_key ->> 'id')::uuid
         and q.status = 'open'
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'invite_request'
         );

  elsif p_event = 'event_followup' then
    -- The morning after the event (20261031070000).
    return query
      select s.endpoint, s.p256dh, s.auth,
             'event_followup'::text, null::text, null::text, 0,
             e.title,
             null::text,
             '/events/' || e.id::text || '/review', 'followup:' || e.id::text,
             public.notification_badge(r.id)
        from public.event_followups_sent sent
        join public.events e on e.id = sent.event_id
        join public.members r on r.id = sent.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
       where sent.batch = (p_key ->> 'batch')::timestamptz
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'event_followup'
         );

  elsif p_event = 'check_in_reminder' then
    -- Thirty minutes after the event (20261031050000). Not once they have
    -- checked in after all.
    return query
      select s.endpoint, s.p256dh, s.auth,
             'check_in_reminder'::text, null::text, null::text, 0,
             e.title,
             null::text,
             '/events/' || e.id::text || '/check-in', 'check_in:' || e.id::text,
             public.notification_badge(r.id)
        from public.event_check_in_reminders_sent sent
        join public.events e on e.id = sent.event_id
        join public.members r on r.id = sent.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
       where sent.batch = (p_key ->> 'batch')::timestamptz
         and not exists (
           select 1 from public.event_check_ins c
            where c.event_id = e.id and c.member_id = r.id
         )
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'check_in_reminder'
         );

  elsif p_event = 'calendar_invite' then
    -- What became of a calendar invitation (20261101000000): the row its
    -- trigger recorded, to whoever sent it. detail says which.
    return query
      select s.endpoint, s.p256dh, s.auth,
             'calendar_invite'::text, null::text, null::text, 0,
             ci.payload ->> 'title',
             n.detail,
             case when n.detail in ('held', 'choose') then '/events/invites'
                  when ci.event_id is not null then '/events/' || ci.event_id::text
                  else '/events' end,
             n.tag,
             public.notification_badge(r.id)
        from public.notifications n
        join public.calendar_invites ci on ci.id = n.calendar_invite_id
        join public.members r on r.id = n.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
       where n.kind = 'calendar_invite'
         and n.calendar_invite_id = (p_key ->> 'id')::uuid
         and n.read_at is null
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'calendar_invite'
         );

  elsif p_event = 'organization_request' then
    -- A member asked to add an organization, or was answered (20261101010000):
    -- the rows the request's functions recorded. detail says which.
    return query
      select s.endpoint, s.p256dh, s.auth,
             'organization_request'::text, a.display_name, null::text, 0,
             q.draft ->> 'name',
             n.detail,
             case when n.detail = 'asked' then '/admin?tab=organizations'
                  when q.organization_id is not null
                    then '/events/organizations/' || q.organization_id::text
                  else '/events?segment=orgs' end,
             n.tag,
             public.notification_badge(r.id)
        from public.notifications n
        join public.organization_requests q on q.id = n.organization_request_id
        join public.members r on r.id = n.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
        left join public.members a on a.id = n.actor_id
       where n.kind = 'organization_request'
         and n.organization_request_id = (p_key ->> 'id')::uuid
         and n.detail = p_key ->> 'step'
         and n.read_at is null
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'organization_request'
         );

  elsif p_event = 'join_request' then
    -- Somebody asked to join (20261031030000): the rows the trigger recorded.
    return query
      select s.endpoint, s.p256dh, s.auth,
             'join_request'::text, a.display_name, null::text, 0,
             o.name,
             n.count::text,
             '/events/organizations/' || o.id::text, n.tag,
             public.notification_badge(r.id)
        from public.organization_join_requests q
        join public.organizations o on o.id = q.organization_id
        join public.members a on a.id = q.member_id
        join public.notifications n
          on n.kind = 'join_request'
         and n.organization_id = q.organization_id
         and n.actor_id = q.member_id
         and n.read_at is null
        join public.members r on r.id = n.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
       where q.organization_id = (p_key ->> 'organization_id')::uuid
         and q.member_id = (p_key ->> 'member_id')::uuid
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'join_request'
         );

  elsif p_event = 'introduction' then
    -- A partner introduced them, or both said yes (20261029100000): the rows
    -- make_introduction and answer_introduction recorded.
    return query
      select s.endpoint, s.p256dh, s.auth,
             'introduction'::text, a.display_name, left(ix.note, 160), 0,
             case when n.detail = 'opened' then t.name else ox.display_name end,
             n.detail,
             case when n.detail = 'opened'
                       and not exists (select 1 from public.chat_thread_members x
                                        where x.thread_id = n.thread_id and x.member_id = r.id)
                    then '/partner'
                  when n.detail = 'opened' then '/chat/t/' || n.thread_id::text
                  else '/introductions/' || ix.id::text end,
             n.tag,
             public.notification_badge(r.id)
        from public.notifications n
        join public.introductions ix on ix.id = n.introduction_id
        join public.members r on r.id = n.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
        left join public.members a on a.id = n.actor_id
        left join public.members ox
          on ox.id = case when ix.first_id = r.id then ix.second_id else ix.first_id end
        left join public.chat_threads t on t.id = n.thread_id
       where n.kind = 'introduction'
         and n.introduction_id = (p_key ->> 'id')::uuid
         and n.detail = p_key ->> 'step'
         and n.read_at is null
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'introduction'
         )
         and not exists (
           select 1 from public.member_blocks b
            where (b.blocker_id = r.id and b.blocked_id in (n.actor_id, ox.id))
               or (b.blocker_id in (n.actor_id, ox.id) and b.blocked_id = r.id and not r.is_admin)
         );

  elsif p_event = 'family_link' then
    -- Asked to link as family, or the answer was yes (20261107100000).
    -- subject is what the actor is to the recipient.
    return query
      select s.endpoint, s.p256dh, s.auth,
             'family_link'::text, a.display_name, null::text, 0,
             case when fl.asker_id = r.id then fl.relation else private.family_inverse(fl.relation) end,
             n.detail,
             '/peers/' || n.actor_id::text,
             n.tag,
             public.notification_badge(r.id)
        from public.notifications n
        join public.family_links fl on fl.id = n.family_link_id
        join public.members r on r.id = n.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
        left join public.members a on a.id = n.actor_id
       where n.kind = 'family_link'
         and n.family_link_id = (p_key ->> 'id')::uuid
         and n.detail = p_key ->> 'step'
         and n.read_at is null
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'family_link'
         )
         and not private.blocked_between(r.id, n.actor_id);

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
  elsif p_event = 'event_notice' then
    -- An org admin told them of an event (20261103000000): the rows that send wrote.
    return query
      select s.endpoint, s.p256dh, s.auth,
             'event_notice'::text, o.name, null::text, 0,
             e.title,
             n.detail,
             '/events/' || e.id::text, n.tag,
             public.notification_badge(r.id)
        from public.notifications n
        join public.events e on e.id = n.event_id
        join public.organizations o on o.id = n.organization_id
        join public.members r on r.id = n.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
       where n.kind = 'event_notice'
         and n.event_id = (p_key ->> 'event_id')::uuid
         and n.created_at = (p_key ->> 'batch')::timestamptz
         and n.read_at is null
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'event_notice'
         );
  elsif p_event = 'checked_in' then
    -- An organizer ticked them as there (20261113120000): subject the event,
    -- detail the organization it made them a member of, if any.
    return query
      select s.endpoint, s.p256dh, s.auth,
             'checked_in'::text, a.display_name, null::text, 0,
             e.title,
             n.detail,
             '/events/' || e.id::text, n.tag,
             public.notification_badge(r.id)
        from public.notifications n
        join public.events e on e.id = n.event_id
        join public.members r on r.id = n.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
        left join public.members a on a.id = n.actor_id
       where n.kind = 'checked_in'
         and n.event_id = (p_key ->> 'event_id')::uuid
         and n.member_id = (p_key ->> 'member_id')::uuid
         and n.read_at is null
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'checked_in'
         )
         and not private.blocked_between(r.id, n.actor_id);

  elsif p_event = 'important' and p_key ? 'waiting' then
    -- Whoever marked a message Important, told how many have not
    -- acknowledged after their three pushes (20261113140000).
    return query
      select s.endpoint, s.p256dh, s.auth,
             'important'::text, a.display_name, m.body, cardinality(m.attachments),
             coalesce(t.name, (select e.title from public.events e where e.id = t.event_id)),
             'waiting:' || n.count::text,
             '/chat/t/' || t.id::text || '?message=' || m.id::text,
             'important_waiting:' || m.id::text,
             public.notification_badge(r.id)
        from private.important_waiting_told w
        join public.chat_important_messages im on im.message_id = w.message_id
        join public.chat_messages m on m.id = im.message_id
        join public.chat_threads t on t.id = im.thread_id
        join public.members r on r.id = im.marked_by and r.status = 'active'
        join public.notifications n
          on n.member_id = r.id and n.tag = 'important_waiting:' || m.id::text and n.read_at is null
        join public.push_subscriptions s on s.member_id = r.id
        left join public.members a on a.id = m.author_id
       where w.batch = (p_key ->> 'waiting')::timestamptz
         and im.unmarked_at is null
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'important'
         );

  elsif p_event = 'important' then
    -- A message marked Important (20261113140000), first or again: to each
    -- member in that run who has not acknowledged it. Through a muted group,
    -- not past a block. detail 'reminder' after the first.
    return query
      select s.endpoint, s.p256dh, s.auth,
             'important'::text, a.display_name, m.body, cardinality(m.attachments),
             coalesce(t.name, (select e.title from public.events e where e.id = t.event_id)),
             case when (
               select count(*) from private.important_pushes q
                where q.message_id = p.message_id and q.member_id = p.member_id
             ) > 1 then 'reminder' end,
             '/chat/t/' || t.id::text || '?message=' || m.id::text,
             'important:' || m.id::text,
             public.notification_badge(r.id)
        from private.important_pushes p
        join public.chat_important_messages im on im.message_id = p.message_id and im.unmarked_at is null
        join public.chat_messages m on m.id = p.message_id and m.removed_at is null
        join public.chat_threads t on t.id = im.thread_id
        join public.chat_thread_members tm on tm.thread_id = t.id and tm.member_id = p.member_id
        join public.members r on r.id = p.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
        left join public.members a on a.id = m.author_id
       where p.batch = (p_key ->> 'batch')::timestamptz
         and not exists (
           select 1 from public.chat_important_acks k
            where k.message_id = p.message_id and k.member_id = p.member_id
         )
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'important'
         )
         and not private.blocked_between(r.id, m.author_id);
  end if;
end;
$function$;
