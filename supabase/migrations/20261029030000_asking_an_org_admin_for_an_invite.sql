-- ============================================================================
-- Asking an org admin for an invite
-- ============================================================================
-- The owner, 2026-10-28. While joining is by invitation only, somebody with
-- no invite can ask for one: a public page lists the organizations that can
-- invite, each with its org admins by first name, and a short form (name,
-- email, an optional note) goes to the one chosen. They are told in the bell
-- and by push; every org admin of that organization sees the request on
-- Invites, where one press sends the invite (create_my_invite, as ever) and
-- answer_invite_request marks it answered.
--
-- Public: invite_request_choices and request_invite are callable signed
-- out. Neither says whether an address is a member's or already invited; a
-- request for a blocked address is accepted and goes nowhere. At most three
-- requests from one address a day, and 300 in all.
--
-- my_notifications and push_owed are as 20261028980000 with the new kind.
-- ============================================================================

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'direct', 'group', 'reply', 'reply_participant', 'like', 'group_add', 'report',
  'invite_joined', 'event_reminder', 'org_events', 'grant_open', 'profile_reminder',
  'blocks_weekly', 'reaction', 'event_starting', 'invite_request'
));

alter table public.push_muted_kinds drop constraint if exists push_muted_kinds_kind_check;
alter table public.push_muted_kinds add constraint push_muted_kinds_kind_check check (kind in (
  'group_add', 'reply_participant', 'report', 'invite_joined', 'event_reminder', 'org_events',
  'like', 'grant_open', 'profile_reminder', 'reaction', 'event_starting', 'invite_request'
));

create table if not exists public.invite_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  admin_id uuid not null references public.members (id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 100),
  email extensions.citext not null check (
    email::text = lower(btrim(email::text))
    and char_length(email::text) <= 254
    and email::text ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  note text check (note is null or (note = btrim(note) and char_length(note) between 1 and 500)),
  status text not null default 'open' check (status in ('open', 'invited', 'dismissed')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  answered_by uuid references public.members (id) on delete set null
);

create unique index if not exists invite_requests_open_idx
  on public.invite_requests (organization_id, email) where status = 'open';
create index if not exists invite_requests_email_day_idx on public.invite_requests (email, created_at);

comment on table public.invite_requests is
  'Somebody asking an org admin for an invite. Read and answered through my_invite_requests and answer_invite_request. See 20261029030000.';

alter table public.invite_requests enable row level security;
revoke all on public.invite_requests from public, anon, authenticated;
grant select, insert, update, delete on public.invite_requests to service_role;

-- ------------------------------------------------------- who can be asked --
create or replace function public.invite_request_choices()
returns table (
  organization_id uuid,
  name text,
  short_code text,
  logo_path text,
  admins jsonb
)
language sql
security definer
stable
set search_path = ''
as $$
  select o.id, o.name, o.short_code, o.logo_path,
         jsonb_agg(
           jsonb_build_object('id', m.id, 'first_name', split_part(btrim(m.display_name), ' ', 1))
           order by m.display_name, m.id
         )
    from public.organizations o
    join public.organization_representatives r on r.organization_id = o.id
    join public.members m on m.id = r.member_id and m.status = 'active' and not m.is_seed
   where o.removed_at is null
     and (o.can_invite or o.is_the_club)
     and nullif(btrim(m.display_name), '') is not null
   group by o.id
   order by o.is_the_club desc, o.name;
$$;

revoke all on function public.invite_request_choices() from public;
grant execute on function public.invite_request_choices() to anon, authenticated;

-- ------------------------------------------------------------ the asking --
create or replace function public.request_invite(
  p_organization uuid,
  p_admin uuid,
  p_name text,
  p_email text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_name text := nullif(btrim(coalesce(p_name, '')), '');
  address text := public.normalize_email(p_email);
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
  made uuid;
begin
  if not exists (
    select 1
      from public.organizations o
      join public.organization_representatives r on r.organization_id = o.id and r.member_id = p_admin
      join public.members m on m.id = r.member_id and m.status = 'active' and not m.is_seed
     where o.id = p_organization and o.removed_at is null and (o.can_invite or o.is_the_club)
  ) then
    raise exception 'Choose somebody from the list to ask.' using errcode = '22023';
  end if;
  if clean_name is null or char_length(clean_name) > 100 then
    raise exception 'Say your name.' using errcode = '22023';
  end if;
  if address is null or not private.valid_email(address) then
    raise exception 'Enter an email address the invite can be sent to.' using errcode = '22023';
  end if;
  if clean_note is not null and char_length(clean_note) > 500 then
    raise exception 'Keep the note to 500 characters.' using errcode = '22023';
  end if;
  if (select count(*) from public.invite_requests q
       where q.email = address::extensions.citext and q.created_at > now() - interval '1 day') >= 3
     or (select count(*) from public.invite_requests q where q.created_at > now() - interval '1 day') >= 300 then
    raise exception 'Too many requests today. Try again tomorrow.' using errcode = '54000';
  end if;
  -- Said the same either way: a blocked address is accepted and goes nowhere.
  if public.is_blocked_email(address) then
    return;
  end if;

  insert into public.invite_requests (organization_id, admin_id, name, email, note)
  values (p_organization, p_admin, clean_name, address, clean_note)
  on conflict (organization_id, email) where status = 'open'
  do update set admin_id = excluded.admin_id, name = excluded.name, note = excluded.note,
                created_at = now()
  returning id into made;

  insert into public.notifications as n (member_id, kind, tag, organization_id, detail)
  values (p_admin, 'invite_request', 'invite_request:' || p_organization::text, p_organization, clean_name)
  on conflict (member_id, tag) where read_at is null
  do update set created_at = clock_timestamp(), count = n.count + 1, detail = excluded.detail,
                seen_at = null;

  perform public.push_notify_send('invite_request', jsonb_build_object('id', made));
end;
$$;

revoke all on function public.request_invite(uuid, uuid, text, text, text) from public;
grant execute on function public.request_invite(uuid, uuid, text, text, text) to anon, authenticated;

-- --------------------------------------------------------- the answering --
create or replace function public.my_invite_requests()
returns table (
  id uuid,
  organization_id uuid,
  organization_name text,
  asked text,
  name text,
  email text,
  note text,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select q.id, q.organization_id, o.name, split_part(btrim(a.display_name), ' ', 1),
         q.name, q.email::text, q.note, q.created_at
    from public.invite_requests q
    join public.organizations o on o.id = q.organization_id and o.removed_at is null
    left join public.members a on a.id = q.admin_id
   where q.status = 'open'
     and public.speaks_for(q.organization_id)
   order by q.created_at desc;
$$;

revoke all on function public.my_invite_requests() from public, anon;
grant execute on function public.my_invite_requests() to authenticated;

create or replace function public.answer_invite_request(p_request uuid, p_answer text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_answer not in ('invited', 'dismissed') then
    raise exception 'Invite or dismiss.' using errcode = '22023';
  end if;
  update public.invite_requests q
     set status = p_answer, answered_at = now(), answered_by = auth.uid()
   where q.id = p_request and q.status = 'open' and public.speaks_for(q.organization_id);
  if not found then
    raise exception 'That request has been answered already.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.answer_invite_request(uuid, text) from public, anon;
grant execute on function public.answer_invite_request(uuid, text) to authenticated;

-- ------------------------------------------------ the functions, extended --
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
           when n.kind in ('org_events', 'grant_open', 'invite_request') then o.name
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
           when n.kind = 'invite_request' then '/invites#requests'
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
       -- Only while they still speak for its organization.
       when n.kind = 'invite_request' then public.speaks_for(n.organization_id)
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

  if p_event in ('message', 'post', 'report', 'member_joined', 'grant_open', 'invite_request') then
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
        join public.members r on r.id = q.admin_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
       where q.id = (p_key ->> 'id')::uuid
         and q.status = 'open'
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'invite_request'
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

revoke all on function public.push_owed(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.push_owed(text, text, jsonb) to service_role;
