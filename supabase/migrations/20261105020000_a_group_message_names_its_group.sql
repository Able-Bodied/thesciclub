-- A group message names its group (the owner, 2026-11-05): push_owed's
-- subject is the group's name, or its event's title, for push-notify's
-- title. Direct messages are unchanged. Otherwise as 20261104203000.
-- Undo: supabase/undo/20261105020000.sql.

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
    -- whatever was said since.
    return query
      select s.endpoint, s.p256dh, s.auth,
             t.kind, a.display_name, m.body, cardinality(m.attachments),
             -- A group's name, or its event's title (as the bell's place).
             case when t.kind = 'group' then
               coalesce(t.name, (select e.title from public.events e where e.id = t.event_id))
             end,
             null::text,
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
        join public.members r on r.id = q.admin_id and r.status = 'active'
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
  end if;
end;
$function$;
