-- ============================================================================
-- Counts without building lists (SPEED-PLAN.md, Step 2)
-- ============================================================================
-- The load test's two costliest calls were the Chat dot and the bell, each
-- building a whole list only to count it. Same names, arguments, results and
-- grants; the app is unchanged.
--
-- chat_unread_count: counted directly, with chat_my_threads' own test (a
-- message newer than the reader's position, not their own) and its blocked
-- direct conversations left out. Still SECURITY INVOKER: the rules decide
-- what is visible, as before.
--
-- my_unseen_notification_count: the same newest 100 rows of my_notifications,
-- under the same rules, without names, previews or links. The two WHERE
-- clauses must change together; unseen-count-matches-list.sql holds them.
--
-- notification_badge already counts directly, so it is left alone.
--
-- Probes: unread-count-matches-list.sql, unseen-count-matches-list.sql.
-- Undo: supabase/undo/20261029140000.sql.
-- ============================================================================

create or replace function public.chat_unread_count()
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::int
    from public.chat_thread_members mine
    join public.chat_threads t on t.id = mine.thread_id
   where mine.member_id = (select auth.uid())
     and exists (
       select 1 from public.chat_messages n
        where n.thread_id = mine.thread_id
          and n.created_at > mine.last_read_at
          and n.author_id is distinct from (select auth.uid())
     )
     and not (t.kind = 'direct' and exists (
       select 1 from public.chat_thread_members o
        where o.thread_id = t.id
          and o.member_id = any ((select public.my_blocked_member_ids())::uuid[])
     ));
$$;

revoke all on function public.chat_unread_count() from public, anon;
grant execute on function public.chat_unread_count() to authenticated;

create or replace function public.my_unseen_notification_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
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
     limit 100
  ) listed
  where listed.seen_at is null;
$$;

revoke all on function public.my_unseen_notification_count() from public, anon;
grant execute on function public.my_unseen_notification_count() to authenticated;
