-- Undo for 20261105101000_the_bell_reads_each_rule_once.sql: the bell and
-- Me's dot as 20261104205000 wrote them, my_badge_counts as 20261104211000
-- did, and the shared count dropped.

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
     and public.is_member()
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
     and public.is_member()
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

create or replace function public.my_badge_counts()
returns table (chat_unread integer, unseen integer, unseen_outside_chat integer, icon_kinds integer)
language sql
stable
set search_path = ''
as $$
  select public.chat_unread_count(),
         public.my_unseen_notification_count(),
         public.my_unseen_notification_count_outside_chat(),
         public.my_unseen_notification_kinds();
$$;

drop function if exists private.my_unseen_counts();

notify pgrst, 'reload schema';
