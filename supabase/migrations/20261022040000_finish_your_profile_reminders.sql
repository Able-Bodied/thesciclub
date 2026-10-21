-- ============================================================================
-- Reminders to finish Your details, then the profile
-- ============================================================================
-- The owner, 2026-10-21: a member whose Your details is not finished is
-- reminded to finish it; once it is, a member whose profile (the survey) is
-- not finished is reminded to finish that. The first reminder two days after
-- joining, then weekly, at most five for each step, and none once the step is
-- done. A tap opens the step: /profile/details, or /profile?resume, which
-- opens the survey at its first unanswered screen.
--
-- "Finished" is what Me's rings say is 100%, restated here because the daily
-- job runs in the database: member_details_done is detailsPercent
-- (src/routes/profile/details-api.ts), member_profile_done is progressOf
-- (src/routes/profile/questions.ts). src/routes/profile/finished-sql.test.ts
-- fails if a question or a detail is added there and not here.
--
-- It travels as the other daily kinds do (push_notify_send records it for the
-- list, push-notify words and sends it), with a switch on Me. A member who
-- switched it off is not picked at all, so nothing is recorded for them.
--
-- Also: admin_member_reach, for Admin → Members, says for each member how many
-- devices have notifications on and when the Home Screen app last began a
-- session. Privacy says administrators see both.
-- ============================================================================

-- ------------------------------------------------------------ finished
-- Answered, as isAnswered says, or declined ("Rather not say").
create or replace function public.profile_answered(v text, k text, declined text[])
returns boolean language sql immutable set search_path = '' as $$
  select btrim(coalesce(v, '')) <> '' or k = any(coalesce(declined, '{}'::text[]));
$$;
create or replace function public.profile_answered(v text[], k text, declined text[])
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(cardinality(v), 0) > 0 or k = any(coalesce(declined, '{}'::text[]));
$$;
create or replace function public.profile_answered(v boolean, k text, declined text[])
returns boolean language sql immutable set search_path = '' as $$
  select v is not null or k = any(coalesce(declined, '{}'::text[]));
$$;

-- detailsPercent = 100: the five in DECLINABLE_DETAILS, filled or declined.
create or replace function public.member_details_done(m public.members)
returns boolean language sql stable set search_path = '' as $$
  select public.profile_answered(m.photo_path, 'photo', m.declined)
     and (public.profile_answered(m.exact_level, 'exactLevel', m.declined)
          or btrim(coalesce(m.condition_name, '')) <> '')
     and (m.injury_date is not null or 'injuryDate' = any(coalesce(m.declined, '{}'::text[])))
     and public.profile_answered(m.city, 'city', m.declined)
     and public.profile_answered(m.state, 'state', m.declined);
$$;

-- progressOf = 100: every question that applies (QUESTIONS, with onlyIf).
create or replace function public.member_profile_done(m public.members)
returns boolean language sql stable set search_path = '' as $$
  select public.profile_answered(m.gender, 'gender', m.declined)
     and public.profile_answered(m.languages, 'languages', m.declined)
     and public.profile_answered(m.bio, 'bio', m.declined)
     and public.profile_answered(m.how_injured, 'howInjured', m.declined)
     and public.profile_answered(m.topics, 'topics', m.declined)
     and public.profile_answered(m.marital_status, 'maritalStatus', m.declined)
     and public.profile_answered(m.has_children, 'hasChildren', m.declined)
     -- onlyIf: hasChildren is Yes.
     and (m.has_children is not true
          or public.profile_answered(m.children_when, 'childrenWhen', m.declined))
     and public.profile_answered(m.independence, 'independence', m.declined)
     and public.profile_answered(m.employment, 'employment', m.declined)
     and public.profile_answered(m.education, 'education', m.declined)
     and public.profile_answered(m.education_when, 'educationWhen', m.declined)
     and public.profile_answered(m.field_of_work, 'fieldOfWork', m.declined)
     and public.profile_answered(m.interests, 'interests', m.declined)
     and public.profile_answered(m.sports_equipment, 'sportsEquipment', m.declined)
     and public.profile_answered(m.grants, 'grants', m.declined)
     and public.profile_answered(m.self_care, 'selfCare', m.declined)
     -- onlyIf: self care names one of SPECIFICS_FOR (or detail is already
     -- written, which answers it anyway).
     and (not coalesce(m.self_care && array[
            'Dictation software', 'Vehicle modifications', 'Wheelchair assist devices'
          ]::text[], false)
          or public.profile_answered(m.detail, 'detail', m.declined))
     and public.profile_answered(m.wants_to_mentor, 'wantsToMentor', m.declined);
$$;

revoke all on function public.profile_answered(text, text, text[]) from public, anon, authenticated;
revoke all on function public.profile_answered(text[], text, text[]) from public, anon, authenticated;
revoke all on function public.profile_answered(boolean, text, text[]) from public, anon, authenticated;
revoke all on function public.member_details_done(public.members) from public, anon, authenticated;
revoke all on function public.member_profile_done(public.members) from public, anon, authenticated;

-- ------------------------------------------------------------ reminders
create table public.profile_reminders (
  member_id uuid not null references public.members (id) on delete cascade,
  step text not null check (step in ('details', 'profile')),
  sent_on date not null,
  primary key (member_id, sent_on)
);
create index profile_reminders_member_step_idx on public.profile_reminders (member_id, step);
alter table public.profile_reminders enable row level security;
revoke all on public.profile_reminders from public, anon, authenticated;
grant select, insert, update, delete on public.profile_reminders to service_role;

comment on table public.profile_reminders is
  'Each reminder to finish Your details or the profile, one a member a day at most. Written by profile_reminders_notify.';

-- The schedule, in one place: two days after joining, a week apart, five a step.
create or replace function public.profile_reminders_notify()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'America/Los_Angeles')::date;
begin
  insert into public.profile_reminders (member_id, step, sent_on)
  select m.id, s.step, today
    from public.members m
    cross join lateral (
      select case
        when not public.member_details_done(m) then 'details'
        when not public.member_profile_done(m) then 'profile'
      end as step
    ) s
   where s.step is not null
     and m.status = 'active'
     and m.type <> 'organization'
     and not m.is_seed
     and m.created_at <= now() - interval '2 days'
     and (select count(*) from public.profile_reminders r
           where r.member_id = m.id and r.step = s.step) < 5
     and not exists (
       select 1 from public.profile_reminders r
        where r.member_id = m.id and r.sent_on > today - 7
     )
     and not exists (
       select 1 from public.push_muted_kinds x
        where x.member_id = m.id and x.kind = 'profile_reminder'
     )
  on conflict do nothing;
  if found then
    perform public.push_notify_send('profile_reminder', jsonb_build_object('day', today));
  end if;
end;
$$;

revoke all on function public.profile_reminders_notify() from public, anon, authenticated;

-- ------------------------------------------------------------ the new kind
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'direct', 'group', 'reply', 'reply_participant', 'like', 'group_add', 'report',
  'invite_joined', 'event_reminder', 'org_events', 'grant_open', 'profile_reminder'
));

alter table public.push_muted_kinds drop constraint if exists push_muted_kinds_kind_check;
alter table public.push_muted_kinds add constraint push_muted_kinds_kind_check check (kind in (
  'group_add', 'reply_participant', 'report', 'invite_joined', 'event_reminder', 'org_events',
  'like', 'grant_open', 'profile_reminder'
));

-- ------------------------------------------------------------ notifications
-- As 20261021010000, with the profile_reminder branch.
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

      union all
      -- A reminder to finish Your details or the profile (20261022040000):
      -- whoever profile_reminders_notify picked today. detail is the step.
      select pr.member_id, 'profile_reminder', 'profile:' || pr.step, null,
             null, null, null, null, null, null, null, null, pr.step, null
        from public.profile_reminders pr
        join public.members r on r.id = pr.member_id and r.status = 'active'
       where p_event = 'profile_reminder' and pr.sent_on = (p_key ->> 'day')::date
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

-- As 20261021010000, with profile_reminder's address.
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
       when n.kind = 'report' then public.is_admin()
       else true
     end
   order by n.created_at desc, n.id
   limit least(greatest(coalesce(max_rows, 40), 1), 100);
$$;

revoke all on function public.my_notifications(timestamptz, integer) from public, anon;
grant execute on function public.my_notifications(timestamptz, integer) to authenticated;

-- As 20261021010000, with the profile_reminder branch.
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

  elsif p_event = 'profile_reminder' then
    -- Today's reminders to finish Your details or the profile. detail is the
    -- step; the address opens it.
    return query
      select s.endpoint, s.p256dh, s.auth,
             'profile_reminder'::text, null::text, null::text, 0,
             null::text, pr.step,
             case pr.step when 'details' then '/profile/details' else '/profile?resume' end,
             'profile:' || pr.step,
             null::int
        from public.profile_reminders pr
        join public.members r on r.id = pr.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
       where pr.sent_on = (p_key ->> 'day')::date
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'profile_reminder'
         );
  end if;
end;
$$;

comment on function public.push_owed(text, text, jsonb) is
  'The devices owed a notification for one event, with what it may say. For the push-notify function only.';

revoke all on function public.push_owed(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.push_owed(text, text, jsonb) to service_role;

-- ------------------------------------------------------------ daily, cron
-- After push-daily (16:00 UTC) and the grants (16:05): 9:10 in the morning
-- in California in summer, 8:10 in winter.
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'profile-reminders';
  perform cron.schedule('profile-reminders', '10 16 * * *', 'select public.profile_reminders_notify()');
end;
$$;

-- ------------------------------------------------------------ admin
-- For Admin → Members: devices with notifications on, and the last time a
-- session began in the Home Screen app (sign_ins, kept from 2026-10-16).
create or replace function public.admin_member_reach()
returns table (member_id uuid, push_devices integer, home_screen_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not an administrator' using errcode = '42501';
  end if;
  return query
    select m.id,
           (select count(*)::int from public.push_subscriptions s where s.member_id = m.id),
           (select max(si.at) from public.sign_ins si where si.user_id = m.id and si.home_screen)
      from public.members m;
end;
$$;

revoke all on function public.admin_member_reach() from public, anon;
grant execute on function public.admin_member_reach() to authenticated;
