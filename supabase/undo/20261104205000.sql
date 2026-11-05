-- Undo for 20261104205000_a_paused_member_reads_nothing.sql: suspended members
-- read again, as before. The bell's functions as live before it.

create or replace function public.is_member()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.members
    where id = auth.uid() and status in ('active', 'suspended')
  );
$$;

comment on function public.is_member() is
  'The caller is in the club, suspended or not. The read gate. A removed member is not one.';

alter policy "a member reads their own notifications" on public.notifications
  using ((member_id = (select auth.uid())));

CREATE OR REPLACE FUNCTION public.my_notifications(before timestamp with time zone DEFAULT NULL::timestamp with time zone, max_rows integer DEFAULT 40)
 RETURNS TABLE(id uuid, kind text, count integer, created_at timestamp with time zone, seen boolean, read boolean, actor_id uuid, actor_name text, actor_photo text, place text, excerpt text, detail text, url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select n.id, n.kind, n.count, n.created_at, n.seen_at is not null, n.read_at is not null,
         n.actor_id,
         case when n.actor_id is null and n.kind in ('direct', 'group', 'reply', 'reply_participant', 'like', 'group_add', 'reaction', 'mention', 'introduction', 'join_request', 'organization_request')
              then 'Deleted member' else a.display_name end,
         a.photo_path,
         case
           when n.kind in ('direct', 'group', 'group_add')
                or (n.kind = 'reaction' and n.thread_id is not null) then
             coalesce(t.name, (select e.title from public.events e where e.id = t.event_id))
           when n.kind in ('reply', 'reply_participant', 'like', 'reaction', 'mention') then tp.title
           when n.kind in ('event_reminder', 'event_starting', 'check_in_reminder', 'event_followup', 'event_notice') then ev.title
           when n.kind in ('org_events', 'grant_open', 'invite_request', 'join_request') then o.name
           when n.kind = 'invite_joined' then j.display_name
           when n.kind = 'calendar_invite' then ci.payload ->> 'title'
           when n.kind = 'organization_request' then orq.draft ->> 'name'
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
           when n.kind = 'event_notice' then o.name
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
           when n.kind in ('event_reminder', 'event_starting', 'event_notice') then '/events/' || n.event_id::text
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
       when n.kind = 'organization_request' and n.detail = 'asked' then public.is_admin()
       -- Only while they still speak for its organization.
       when n.kind = 'invite_request' then public.speaks_for(n.organization_id)
       when n.kind = 'join_request' then public.speaks_for(n.organization_id) or public.is_admin()
       when n.kind = 'introduction' and n.detail = 'opened' then ix.introduced_by = auth.uid() or exists (
         select 1 from public.chat_thread_members x
          where x.thread_id = n.thread_id and x.member_id = auth.uid()
       )
       when n.kind = 'introduction' then ix.id is not null and ox.status = 'active'
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

CREATE OR REPLACE FUNCTION public.my_unseen_notification_count()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select count(*)::integer from (
    -- my_notifications(null, 100)'s rows: its joins that the WHERE reads.
    select n.seen_at
      from public.notifications n
      left join public.chat_messages m on m.id = n.message_id
      left join public.chat_topics tp on tp.id = n.topic_id
      left join public.chat_posts p on p.id = n.post_id
      left join public.introductions ix on ix.id = n.introduction_id
      left join public.members ox
        on ox.id = case when ix.first_id = n.member_id then ix.second_id else ix.first_id end
     where n.member_id = auth.uid()
       and n.created_at > now() - interval '30 days'
       and case
         when n.kind in ('direct', 'group', 'group_add') then exists (
           select 1 from public.chat_thread_members x
            where x.thread_id = n.thread_id and x.member_id = auth.uid()
         )
         when n.kind in ('reply', 'reply_participant') then public.chat_room_is_readable(tp.room_id)
         when n.kind = 'like' then p.removed_at is null and public.chat_room_is_readable(tp.room_id)
         when n.kind = 'reaction' and n.thread_id is not null then m.removed_at is null and exists (
           select 1 from public.chat_thread_members x
            where x.thread_id = n.thread_id and x.member_id = auth.uid()
         )
         when n.kind = 'reaction' then p.removed_at is null and public.chat_room_is_readable(tp.room_id)
         when n.kind = 'mention' then p.removed_at is null and public.chat_room_is_readable(tp.room_id)
         when n.kind in ('report', 'blocks_weekly') then public.is_admin()
         when n.kind = 'invite_request' then public.speaks_for(n.organization_id)
         when n.kind = 'join_request' then public.speaks_for(n.organization_id) or public.is_admin()
         when n.kind = 'introduction' and n.detail = 'opened' then ix.introduced_by = auth.uid() or exists (
           select 1 from public.chat_thread_members x
            where x.thread_id = n.thread_id and x.member_id = auth.uid()
         )
         when n.kind = 'introduction' then ix.id is not null and ox.status = 'active'
         else true
       end
       and not exists (
         select 1 from public.member_blocks b
          where (b.blocker_id = auth.uid() and b.blocked_id in (n.actor_id, tp.author_id, ox.id))
           or (b.blocked_id = auth.uid() and b.blocker_id in (n.actor_id, tp.author_id, ox.id)
               and not public.is_admin())
       )
     order by n.created_at desc, n.id
     limit 100
  ) listed
  where listed.seen_at is null;
$function$;

CREATE OR REPLACE FUNCTION public.my_unseen_notification_count_outside_chat()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select count(*)::integer from (
    -- my_notifications(null, 100)'s rows: its joins that the WHERE reads.
    select n.seen_at
      from public.notifications n
      left join public.chat_messages m on m.id = n.message_id
      left join public.chat_topics tp on tp.id = n.topic_id
      left join public.chat_posts p on p.id = n.post_id
      left join public.introductions ix on ix.id = n.introduction_id
      left join public.members ox
        on ox.id = case when ix.first_id = n.member_id then ix.second_id else ix.first_id end
     where n.member_id = auth.uid()
       and n.created_at > now() - interval '30 days'
       and n.kind not in ('direct', 'group', 'group_add')
       and not (n.kind = 'reaction' and n.thread_id is not null)
       and case
         when n.kind in ('direct', 'group', 'group_add') then exists (
           select 1 from public.chat_thread_members x
            where x.thread_id = n.thread_id and x.member_id = auth.uid()
         )
         when n.kind in ('reply', 'reply_participant') then public.chat_room_is_readable(tp.room_id)
         when n.kind = 'like' then p.removed_at is null and public.chat_room_is_readable(tp.room_id)
         when n.kind = 'reaction' and n.thread_id is not null then m.removed_at is null and exists (
           select 1 from public.chat_thread_members x
            where x.thread_id = n.thread_id and x.member_id = auth.uid()
         )
         when n.kind = 'reaction' then p.removed_at is null and public.chat_room_is_readable(tp.room_id)
         when n.kind = 'mention' then p.removed_at is null and public.chat_room_is_readable(tp.room_id)
         when n.kind in ('report', 'blocks_weekly') then public.is_admin()
         when n.kind = 'invite_request' then public.speaks_for(n.organization_id)
         when n.kind = 'join_request' then public.speaks_for(n.organization_id) or public.is_admin()
         when n.kind = 'introduction' and n.detail = 'opened' then ix.introduced_by = auth.uid() or exists (
           select 1 from public.chat_thread_members x
            where x.thread_id = n.thread_id and x.member_id = auth.uid()
         )
         when n.kind = 'introduction' then ix.id is not null and ox.status = 'active'
         else true
       end
       and not exists (
         select 1 from public.member_blocks b
          where (b.blocker_id = auth.uid() and b.blocked_id in (n.actor_id, tp.author_id, ox.id))
           or (b.blocked_id = auth.uid() and b.blocker_id in (n.actor_id, tp.author_id, ox.id)
               and not public.is_admin())
       )
     order by n.created_at desc, n.id
     limit 100
  ) listed
  where listed.seen_at is null;
$function$;

CREATE OR REPLACE FUNCTION public.notification_badge(member uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select count(distinct case
           when n.kind in ('direct', 'group', 'group_add') then 'messages'
           when n.kind in ('reply', 'reply_participant') then 'replies'
           when n.kind in ('event_reminder', 'event_starting', 'check_in_reminder', 'event_followup', 'org_events', 'event_notice') then 'events'
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
       when n.kind in ('like', 'reaction', 'mention') then p.removed_at is null
         and (rm.opened_at is not null or (r.is_admin and r.status = 'active'))
       when n.kind in ('report', 'blocks_weekly') then r.is_admin and r.status = 'active'
       else true
     end
     and not exists (
       select 1 from public.member_blocks b
        where (b.blocker_id = member and b.blocked_id in (n.actor_id, tp.author_id))
           or (b.blocked_id = member and b.blocker_id in (n.actor_id, tp.author_id) and not r.is_admin)
     );
$function$;

