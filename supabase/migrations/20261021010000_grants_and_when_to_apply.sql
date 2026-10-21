-- ============================================================================
-- Grants, and when to apply for them
-- ============================================================================
-- The owner, 2026-10-20: an organization that gives grants shows each one on
-- its page, with a link, a line on what it pays for, and when to apply; while
-- applications are open the page says so, and its followers are notified.
--
-- A grant has windows. A window is either dated (one cycle) or yearly (the
-- same month and day every year; a close before the open crosses New Year).
-- A grant with no windows is "apply any time" when apply_any_time is set, and
-- otherwise has dates its organization does not publish.
--
-- The notification goes once per cycle, through grant_open_notices, from a
-- daily job: on the day a window opens, or the first run after a grant is
-- added while already open. It travels as the other kinds do (push_notify_send
-- records it for the list, push-notify sends it), with a switch on Me.
-- ============================================================================

create table if not exists public.organization_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  url text not null check (url ~ '^https://'),
  summary text not null check (length(summary) <= 400),
  apply_any_time boolean not null default false,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

comment on table public.organization_grants is
  'Grants an organization gives individuals: shown on its page; followers are told when one opens.';

create table if not exists public.organization_grant_windows (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.organization_grants (id) on delete cascade,
  opens_on date not null,
  closes_on date not null,
  -- Only the month and day count. Not 29 February, which most years lack.
  yearly boolean not null default false,
  check (yearly or closes_on >= opens_on),
  check (not yearly or (to_char(opens_on, 'MM-DD') <> '02-29' and to_char(closes_on, 'MM-DD') <> '02-29'))
);

create index if not exists organization_grant_windows_grant on public.organization_grant_windows (grant_id);

create table if not exists public.grant_open_notices (
  window_id uuid not null references public.organization_grant_windows (id) on delete cascade,
  cycle_opens date not null,
  sent_at timestamptz not null default now(),
  primary key (window_id, cycle_opens)
);

comment on table public.grant_open_notices is
  'One row per window cycle whose opening followers were told about, so it is told once.';

alter table public.organization_grants enable row level security;
alter table public.organization_grant_windows enable row level security;
alter table public.grant_open_notices enable row level security;

drop policy if exists "anyone reads grants" on public.organization_grants;
create policy "anyone reads grants" on public.organization_grants
  for select to anon, authenticated using (true);
drop policy if exists "anyone reads grant windows" on public.organization_grant_windows;
create policy "anyone reads grant windows" on public.organization_grant_windows
  for select to anon, authenticated using (true);

-- Written by migrations and the service key for now; no screen edits them yet.
revoke all on public.organization_grants from public, anon, authenticated;
revoke all on public.organization_grant_windows from public, anon, authenticated;
revoke all on public.grant_open_notices from public, anon, authenticated;
grant select on public.organization_grants to anon, authenticated;
grant select on public.organization_grant_windows to anon, authenticated;
grant select, insert, update, delete on public.organization_grants to service_role;
grant select, insert, update, delete on public.organization_grant_windows to service_role;
grant select, insert, update, delete on public.grant_open_notices to service_role;

-- --------------------------------------------------------------- the cycle
-- The cycle of a window that is open on `today` or comes next; nothing once a
-- dated window has closed. src/lib/grants.ts works this out the same way.
create or replace function public.grant_window_cycle(
  opens_on date, closes_on date, yearly boolean, today date
)
returns table (cycle_opens date, cycle_closes date)
language plpgsql
immutable
set search_path = ''
as $$
declare
  y integer;
  o date;
  c date;
begin
  if not yearly then
    if closes_on >= today then
      return query select opens_on, closes_on;
    end if;
    return;
  end if;
  for y in extract(year from today)::int - 1 .. extract(year from today)::int + 1 loop
    o := make_date(y, extract(month from opens_on)::int, extract(day from opens_on)::int);
    c := make_date(y, extract(month from closes_on)::int, extract(day from closes_on)::int);
    if c < o then
      c := make_date(y + 1, extract(month from closes_on)::int, extract(day from closes_on)::int);
    end if;
    if c >= today then
      return query select o, c;
      return;
    end if;
  end loop;
end;
$$;

revoke all on function public.grant_window_cycle(date, date, boolean, date) from public, anon, authenticated;
grant execute on function public.grant_window_cycle(date, date, boolean, date) to service_role;

-- ------------------------------------------------------------ the new kind
alter table public.notifications add column if not exists grant_id uuid
  references public.organization_grants (id) on delete cascade;
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'direct', 'group', 'reply', 'reply_participant', 'like', 'group_add', 'report',
  'invite_joined', 'event_reminder', 'org_events', 'grant_open'
));

alter table public.push_muted_kinds drop constraint if exists push_muted_kinds_kind_check;
alter table public.push_muted_kinds add constraint push_muted_kinds_kind_check check (kind in (
  'group_add', 'reply_participant', 'report', 'invite_joined', 'event_reminder', 'org_events',
  'like', 'grant_open'
));

-- ------------------------------------------------------------ notifications
-- As 20261014020000, with the grant_open branch and grant_id, and tomorrow
-- counted in an event's own zone when it has one (20261021000000).
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
       where p_event = 'report' and rep.id = key_id

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
    ) owed
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

revoke all on function public.notifications_record(text, jsonb) from public, anon, authenticated;

-- As 20261014020000, with grant_open's place, words and address.
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
           when n.kind in ('org_events', 'grant_open') then o.name
           when n.kind = 'invite_joined' then j.display_name
         end,
         case
           when n.kind in ('direct', 'group') and m.removed_at is null then
             left(nullif(btrim(m.body), ''), 160)
           when n.kind in ('reply', 'reply_participant', 'like') and p.removed_at is null then
             left(nullif(btrim(p.body), ''), 160)
           when n.kind = 'grant_open' then gr.name
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
           when n.kind = 'invite_joined' and n.detail like 'qr:%' then '/admin?tab=invites'
           when n.kind = 'invite_joined' then '/invites'
           when n.kind = 'event_reminder' then '/events/' || n.event_id::text
           when n.kind in ('org_events', 'grant_open') then '/events/organizations/' || n.organization_id::text
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
       when n.kind = 'report' then public.is_admin()
       else true
     end
   order by n.created_at desc, n.id
   limit least(greatest(coalesce(max_rows, 40), 1), 100);
$$;

revoke all on function public.my_notifications(timestamptz, integer) from public, anon;
grant execute on function public.my_notifications(timestamptz, integer) to authenticated;

-- As 20261010000000, with the grant_open branch and an event's own zone.
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
             lower(to_char(e.start_time at time zone coalesce(e.timezone, f.timezone, 'America/Los_Angeles'), 'FMHH12:MIam')),
             '/events/' || e.id::text, 'event:' || e.id::text,
             null::int
        from public.events e
        left join public.data_feeds f on f.id = e.feed_id
        join public.event_rsvps rv on rv.event_id = e.id and rv.status = 'going'
        join public.members r on r.id = rv.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
       where (e.start_time at time zone coalesce(e.timezone, f.timezone, 'America/Los_Angeles'))::date
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

  elsif p_event = 'grant_open' then
    -- A grant's applications opened: everybody following its organization.
    -- body is the grant's name, detail the day this cycle closes.
    return query
      select s.endpoint, s.p256dh, s.auth,
             'grant_open'::text, null::text, g.name, 0,
             o.name,
             to_char(c.cycle_closes, 'FMMon FMDD'),
             '/events/organizations/' || o.id::text, 'grant:' || g.id::text,
             null::int
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
  end if;
end;
$$;

comment on function public.push_owed(text, text, jsonb) is
  'The devices owed a notification for one event, with what it may say. For the push-notify function only.';

revoke all on function public.push_owed(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.push_owed(text, text, jsonb) to service_role;

-- ------------------------------------------------------------ daily, cron
-- After push-daily (16:00 UTC). A cycle is told once: on its first day, or on
-- the first run after its grant was added while already open.
create or replace function public.grant_windows_notify()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'America/Los_Angeles')::date;
  w record;
begin
  for w in
    select gw.id, c.cycle_opens
      from public.organization_grant_windows gw
      join public.organization_grants g on g.id = gw.grant_id
      join public.organizations o on o.id = g.organization_id and o.removed_at is null
      cross join lateral public.grant_window_cycle(gw.opens_on, gw.closes_on, gw.yearly, today) c
     where c.cycle_opens <= today
  loop
    insert into public.grant_open_notices (window_id, cycle_opens)
    values (w.id, w.cycle_opens)
    on conflict do nothing;
    if found then
      perform public.push_notify_send('grant_open', jsonb_build_object('id', w.id));
    end if;
  end loop;
end;
$$;

revoke all on function public.grant_windows_notify() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'grant-open-notify';
  perform cron.schedule('grant-open-notify', '5 16 * * *', 'select public.grant_windows_notify()');
end;
$$;
