-- ============================================================================
-- A partner joins an introduction only if they choose to
-- ============================================================================
-- The owner, 2026-10-29: a trusted partner is not put in the conversation an
-- introduction opens. Making one, they may tick "Join the conversation
-- yourself" (off unless ticked). Either way the conversation opens with a
-- line, not a message: "Robert connected you because they thought you'd be a
-- good fit", and the partner's note under it (notice 'introduced', written
-- only here, authored by the partner, never pushed as a message).
--
-- So both members are told it opened by an introduction notification, and the
-- partner too; a partner not in it is taken to their page, not the chat.
--
-- make_introduction gains p_join (default false), answer_introduction opens it
-- so, my_notifications and push_owed are as 20261029100000 with that.
-- ============================================================================

alter table public.introductions
  add column if not exists partner_joins boolean not null default false;

comment on column public.introductions.partner_joins is
  'The partner asked to be in the conversation it opens. See 20261029120000.';

-- -------------------------------------------------------------- the line --
alter table public.chat_messages drop constraint if exists chat_messages_notice_check;
alter table public.chat_messages add constraint chat_messages_notice_check
  check (notice in ('renamed', 'pictured', 'unpictured', 'introduced'));

alter table public.chat_messages drop constraint if exists chat_messages_notice_shape;
alter table public.chat_messages add constraint chat_messages_notice_shape check (
  notice is null
  or (
    reply_to is null
    and (
      removed_at is not null
      or (notice = 'renamed' and char_length(btrim(body)) between 1 and 60 and cardinality(attachments) = 0)
      or (notice = 'pictured' and body = '' and cardinality(attachments) = 1)
      or (notice = 'unpictured' and body = '' and cardinality(attachments) = 0)
      -- The partner's note.
      or (notice = 'introduced' and char_length(btrim(body)) between 1 and 500 and cardinality(attachments) = 0)
    )
  )
);

comment on column public.chat_messages.notice is
  'Set on a line that records something, not something said: renamed, pictured or unpictured (chat_rename_group, chat_set_group_picture), or introduced (answer_introduction, 20261029120000).';

-- ------------------------------------------------------------ making one --
drop function if exists public.make_introduction(uuid, uuid, text);

create or replace function public.make_introduction(
  p_first uuid,
  p_second uuid,
  p_note text,
  p_join boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  clean text := btrim(coalesce(p_note, ''));
  made uuid;
begin
  if not private.is_partner(me) then
    raise exception 'Only a trusted partner introduces members.' using errcode = '42501';
  end if;
  if p_first is null or p_second is null or p_first = p_second then
    raise exception 'Choose two different members to introduce.' using errcode = '22023';
  end if;
  if me in (p_first, p_second) then
    raise exception 'Introduce two other members; message somebody yourself to meet them.' using errcode = '22023';
  end if;
  if char_length(clean) < 1 or char_length(clean) > 500 then
    raise exception 'Write a note to both of them, of 500 characters or fewer.' using errcode = '22023';
  end if;
  if not (public.chat_is_findable(p_first) and public.chat_is_findable(p_second)) then
    raise exception 'One of those members cannot be introduced.' using errcode = 'P0002';
  end if;
  if private.blocked_between(p_first, p_second)
     or private.blocked_between(me, p_first)
     or private.blocked_between(me, p_second) then
    raise exception 'One of those members cannot be introduced.' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    least(p_first, p_second)::text || greatest(p_first, p_second)::text, 0));
  if exists (
    select 1 from public.introductions i
     where least(i.first_id, i.second_id) = least(p_first, p_second)
       and greatest(i.first_id, i.second_id) = greatest(p_first, p_second)
       and private.introduction_status(i) = 'asked'
  ) then
    raise exception 'Those two have already been asked; they have % days to answer.', private.introduction_days()
      using errcode = '23505';
  end if;
  if (select count(*) from public.introductions i
       where i.introduced_by = me and i.created_at > now() - interval '7 days') >= 50 then
    raise exception 'That is 50 introductions this week. Try again in a few days.' using errcode = '54000';
  end if;

  insert into public.introductions (introduced_by, first_id, second_id, note, partner_joins)
  values (me, p_first, p_second, clean, coalesce(p_join, false))
  returning id into made;

  insert into public.notifications (member_id, kind, tag, actor_id, introduction_id, detail)
  select x, 'introduction', 'introduction:' || made::text, me, made, 'asked'
    from unnest(array[p_first, p_second]) as x;
  perform public.push_notify_send('introduction', jsonb_build_object('id', made, 'step', 'asked'));
  return made;
end;
$$;

revoke all on function public.make_introduction(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.make_introduction(uuid, uuid, text, boolean) to authenticated;

-- ------------------------------------------------------------- answering --
-- As 20261029100000, but the partner is in it only if they asked to be, and
-- it opens with the 'introduced' line; all three are told.
create or replace function public.answer_introduction(p_introduction uuid, p_yes boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  i public.introductions;
  -- The partner is still active and blocked by neither.
  by_ok boolean;
  joins boolean;
  group_name text;
  made uuid;
  claims text := current_setting('request.jwt.claims', true);
  claim_sub text := current_setting('request.jwt.claim.sub', true);
begin
  if p_yes is null then
    raise exception 'Say yes or no.' using errcode = '22023';
  end if;
  select * into i from public.introductions x
   where x.id = p_introduction and me in (x.first_id, x.second_id)
   for update;
  if not found then
    raise exception 'No such introduction.' using errcode = 'P0002';
  end if;
  if private.introduction_status(i) <> 'asked' then
    raise exception 'This introduction is no longer waiting for an answer.' using errcode = '22023';
  end if;
  if (me = i.first_id and i.first_answer is not null) or (me = i.second_id and i.second_answer is not null) then
    raise exception 'You have already answered.' using errcode = '22023';
  end if;

  if me = i.first_id then
    update public.introductions set first_answer = p_yes, first_answered_at = now()
     where id = i.id returning * into i;
  else
    update public.introductions set second_answer = p_yes, second_answered_at = now()
     where id = i.id returning * into i;
  end if;
  update public.notifications set read_at = coalesce(read_at, now()), seen_at = coalesce(seen_at, now())
   where member_id = me and introduction_id = i.id and detail = 'asked';

  -- Null until both have answered.
  if not coalesce(i.first_answer and i.second_answer, false) then
    return null;
  end if;

  if not exists (select 1 from public.members m where m.id = i.first_id and m.status = 'active')
     or not exists (select 1 from public.members m where m.id = i.second_id and m.status = 'active')
     or private.blocked_between(i.first_id, i.second_id) then
    raise exception 'This introduction can no longer go ahead.' using errcode = 'P0002';
  end if;
  by_ok := i.introduced_by is not null
    and exists (select 1 from public.members m where m.id = i.introduced_by and m.status = 'active')
    and not private.blocked_between(i.introduced_by, i.first_id)
    and not private.blocked_between(i.introduced_by, i.second_id);
  joins := by_ok and i.partner_joins;

  select left(
           split_part(btrim(a.display_name), ' ', 1) || ' & ' || split_part(btrim(b.display_name), ' ', 1),
           60)
    into group_name
    from public.members a, public.members b
   where a.id = i.first_id and b.id = i.second_id;

  insert into public.chat_threads (kind, name, created_by)
  values ('group', group_name, case when joins then i.introduced_by else i.first_id end)
  returning id into made;

  -- Nobody added anybody: without this, push_notify_enqueue tells the
  -- others that whoever answered last added them to a group.
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  insert into public.chat_thread_members (thread_id, member_id, joined_at)
  select made, x.member, clock_timestamp()
    from unnest(case when joins then array[i.introduced_by, i.first_id, i.second_id]
                     else array[i.first_id, i.second_id] end) with ordinality as x(member, n)
   order by x.n;
  perform set_config('request.jwt.claims', coalesce(claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(claim_sub, ''), true);

  update public.introductions set opened_at = now(), thread_id = made where id = i.id;

  if by_ok then
    -- "<partner> connected you…", with the note. A notice is never pushed.
    insert into public.chat_messages (thread_id, author_id, body, notice)
    values (made, i.introduced_by, i.note, 'introduced');
  end if;

  insert into public.notifications (member_id, kind, tag, actor_id, introduction_id, thread_id, detail)
  select x.member, 'introduction', 'introduction:' || i.id::text || ':opened',
         case when x.member = i.introduced_by then me
              when x.member = i.first_id then i.second_id
              else i.first_id end,
         i.id, made, 'opened'
    from unnest(case when by_ok then array[i.introduced_by, i.first_id, i.second_id]
                     else array[i.first_id, i.second_id] end) as x(member);
  perform public.push_notify_send('introduction', jsonb_build_object('id', i.id, 'step', 'opened'));
  return made;
end;
$$;

-- ---------------------------------------------- the bell and the push --
-- As 20261029100000; a partner not in the conversation goes to their page.
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
         case when n.actor_id is null and n.kind in ('direct', 'group', 'reply', 'reply_participant', 'like', 'group_add', 'reaction', 'mention', 'introduction')
              then 'Deleted member' else a.display_name end,
         a.photo_path,
         case
           when n.kind in ('direct', 'group', 'group_add')
                or (n.kind = 'reaction' and n.thread_id is not null) then
             coalesce(t.name, (select e.title from public.events e where e.id = t.event_id))
           when n.kind in ('reply', 'reply_participant', 'like', 'reaction', 'mention') then tp.title
           when n.kind in ('event_reminder', 'event_starting') then ev.title
           when n.kind in ('org_events', 'grant_open', 'invite_request') then o.name
           when n.kind = 'invite_joined' then j.display_name
           -- Who they are being introduced to; to the partner, the group.
           when n.kind = 'introduction' and n.detail = 'opened' and t.id is not null then t.name
           when n.kind = 'introduction' then ox.display_name
         end,
         case
           when (n.kind in ('direct', 'group') or (n.kind = 'reaction' and n.thread_id is not null))
                and m.removed_at is null then
             left(nullif(btrim(m.body), ''), 160)
           when n.kind in ('reply', 'reply_participant', 'like', 'reaction', 'mention')
                and p.removed_at is null then
             left(nullif(btrim(p.body), ''), 160)
           when n.kind = 'grant_open' then gr.name
           when n.kind = 'introduction' and n.detail = 'asked' then left(ix.note, 160)
         end,
         n.detail,
         case
           when n.kind in ('direct', 'group')
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
           when n.kind in ('event_reminder', 'event_starting') then '/events/' || n.event_id::text
           when n.kind in ('org_events', 'grant_open') then '/events/organizations/' || n.organization_id::text
           when n.kind = 'invite_request' then '/invites#requests'
           when n.kind = 'profile_reminder' and n.detail = 'details' then '/profile/details'
           when n.kind = 'profile_reminder' then '/profile?resume'
           -- A partner who is not in it goes to their page.
           when n.kind = 'introduction' and n.detail = 'opened'
                and not exists (select 1 from public.chat_thread_members x
                                 where x.thread_id = n.thread_id and x.member_id = n.member_id)
             then '/partner'
           when n.kind = 'introduction' and n.detail = 'opened' then '/chat/t/' || n.thread_id::text
           when n.kind = 'introduction' then '/introductions/' || n.introduction_id::text
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
    left join public.members ox
      on ox.id = case when ix.first_id = n.member_id then ix.second_id else ix.first_id end
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
       when n.kind = 'mention' then p.removed_at is null and public.chat_room_is_readable(tp.room_id)
       when n.kind in ('report', 'blocks_weekly') then public.is_admin()
       -- Only while they still speak for its organization.
       when n.kind = 'invite_request' then public.speaks_for(n.organization_id)
       when n.kind = 'introduction' and n.detail = 'opened' then ix.introduced_by = auth.uid() or exists (
         select 1 from public.chat_thread_members x
          where x.thread_id = n.thread_id and x.member_id = auth.uid()
       )
       when n.kind = 'introduction' then ix.id is not null and ox.status = 'active'
       else true
     end
     and not exists (
       select 1 from public.member_blocks b
        where b.blocker_id = auth.uid()
          and b.blocked_id in (n.actor_id, tp.author_id, ox.id)
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
            where b.blocker_id = r.id and b.blocked_id in (n.actor_id, ox.id)
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

revoke all on function public.my_notifications(timestamptz, integer) from public, anon;
grant execute on function public.my_notifications(timestamptz, integer) to authenticated;
revoke all on function public.push_owed(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.push_owed(text, text, jsonb) to service_role;

notify pgrst, 'reload schema';
