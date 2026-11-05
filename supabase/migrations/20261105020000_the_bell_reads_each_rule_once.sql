-- ============================================================================
-- The bell reads each rule once
-- ============================================================================
-- my_badge_counts was a third of all database time in the Pro load test.
-- Most of it was the bell and Me's dot: each read the same 30 days of
-- notifications, and for every row called is_member(), is_admin(),
-- chat_room_is_readable() or speaks_for() again, and hash-joined the whole
-- members table to find an introduction's other person.
--
-- private.my_unseen_counts() gives both numbers from one pass. The rules
-- are the same (20261104205000's text), but is_admin() is asked once, each
-- room and organization once, your conversations read once, and members
-- only for an introduction. my_unseen_notification_count() and
-- my_unseen_notification_count_outside_chat() now read it, so the rules
-- stay in one place; my_badge_counts reads it once for both.
-- Chat dot and icon unchanged. Probe: badge-counts-cheaper.sql.
-- Undo: supabase/undo/20261105020000.sql.
-- ============================================================================

create or replace function private.my_unseen_counts(out unseen integer, out unseen_outside_chat integer)
language sql
stable
security definer
set search_path = ''
as $$
  with me as materialized (
    select auth.uid() as id, public.is_admin() as admin
  ),
  my_threads as materialized (
    select x.thread_id from public.chat_thread_members x where x.member_id = (select id from me)
  ),
  -- The bell's rows of the last 30 days, with what the rules read.
  recent as materialized (
    select n.id, n.created_at, n.seen_at, n.kind, n.thread_id, n.organization_id, n.detail,
           n.actor_id, m.removed_at as message_removed, tp.room_id, tp.author_id as topic_author,
           p.removed_at as post_removed, ix.id as ix_id, ix.introduced_by, ox.id as other_id,
           ox.status as other_status
      from public.notifications n
      left join public.chat_messages m on m.id = n.message_id
      left join public.chat_topics tp on tp.id = n.topic_id
      left join public.chat_posts p on p.id = n.post_id
      left join public.introductions ix on ix.id = n.introduction_id
      -- The other person, looked up only for an introduction (not a scan of members).
      left join lateral (
        select o.id, o.status from public.members o
         where o.id = case when ix.first_id = n.member_id then ix.second_id else ix.first_id end
         offset 0
      ) ox on ix.id is not null
     where n.member_id = (select id from me)
       and public.is_member()
       and n.created_at > now() - interval '30 days'
  ),
  -- Each room and organization asked once, not once a row.
  rooms as materialized (
    select r.room_id, public.chat_room_is_readable(r.room_id) as readable
      from (select distinct room_id from recent where room_id is not null) r
  ),
  orgs as materialized (
    select o.organization_id, public.speaks_for(o.organization_id) as speaks
      from (select distinct organization_id from recent
             where kind in ('invite_request', 'join_request') and organization_id is not null) o
  ),
  shown as materialized (
    select n.id, n.created_at, n.seen_at,
           n.kind in ('direct', 'group', 'group_add') or (n.kind = 'reaction' and n.thread_id is not null) as in_chat
      from recent n
      left join rooms r on r.room_id = n.room_id
      left join orgs o on o.organization_id = n.organization_id
     where case
         when n.kind in ('direct', 'group', 'group_add') then exists (
           select 1 from my_threads x where x.thread_id = n.thread_id
         )
         when n.kind in ('reply', 'reply_participant') then coalesce(r.readable, false)
         when n.kind = 'like' then n.post_removed is null and coalesce(r.readable, false)
         when n.kind = 'reaction' and n.thread_id is not null then n.message_removed is null and exists (
           select 1 from my_threads x where x.thread_id = n.thread_id
         )
         when n.kind = 'reaction' then n.post_removed is null and coalesce(r.readable, false)
         when n.kind = 'mention' then n.post_removed is null and coalesce(r.readable, false)
         when n.kind in ('report', 'blocks_weekly') then (select admin from me)
         when n.kind = 'invite_request' then coalesce(o.speaks, false)
         when n.kind = 'join_request' then coalesce(o.speaks, false) or (select admin from me)
         when n.kind = 'introduction' and n.detail = 'opened' then n.introduced_by = (select id from me) or exists (
           select 1 from my_threads x where x.thread_id = n.thread_id
         )
         when n.kind = 'introduction' then n.ix_id is not null and n.other_status = 'active'
         else true
       end
       and not exists (
         select 1 from public.member_blocks b
          where (b.blocker_id = (select id from me) and b.blocked_id in (n.actor_id, n.topic_author, n.other_id))
           or (b.blocked_id = (select id from me) and b.blocker_id in (n.actor_id, n.topic_author, n.other_id)
               and not (select admin from me))
       )
  )
  select (select count(*)::integer from (
            select s.seen_at from shown s order by s.created_at desc, s.id limit 100
          ) listed where listed.seen_at is null),
         (select count(*)::integer from (
            select s.seen_at from shown s where not s.in_chat order by s.created_at desc, s.id limit 100
          ) listed where listed.seen_at is null);
$$;

comment on function private.my_unseen_counts() is
  'The bell and Me''s dot from one pass. See 20261105020000.';

revoke all on function private.my_unseen_counts() from public, anon;
grant execute on function private.my_unseen_counts() to authenticated;

create or replace function public.my_unseen_notification_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select u.unseen from private.my_unseen_counts() u;
$$;

create or replace function public.my_unseen_notification_count_outside_chat()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select u.unseen_outside_chat from private.my_unseen_counts() u;
$$;

create or replace function public.my_badge_counts()
returns table (chat_unread integer, unseen integer, unseen_outside_chat integer, icon_kinds integer)
language sql
stable
set search_path = ''
as $$
  select public.chat_unread_count(), u.unseen, u.unseen_outside_chat,
         public.my_unseen_notification_kinds()
    from private.my_unseen_counts() u;
$$;

notify pgrst, 'reload schema';
