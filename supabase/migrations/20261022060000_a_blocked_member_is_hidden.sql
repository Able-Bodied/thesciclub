-- ============================================================================
-- What a block hides
-- ============================================================================
-- The owner, 2026-10-21 (20261022050000): when A blocks B, B's topics,
-- posts, replies, messages, likes and reactions are hidden from A
-- everywhere, shared rooms and groups included, and the two drop out of each
-- other's Peers.
--
-- Content is hidden one way, from the blocker. The helper a policy calls,
-- my_blocked_member_ids(), returns only the caller's own blocks, so B can
-- never call it to learn who blocked them. A topic B started is hidden whole,
-- with the replies under it: they answer something A cannot see.
--
-- Peers is both ways. browse_members and chat_authors are views that run as
-- their owner, so they read member_blocks directly and grant nothing new. A
-- member A blocked has no profile for A, and A has none for B; has_profile
-- says the same, so the two cannot be compared to find a block.
--
-- Counts stay as they were (replies, views, members): a number names nobody.
-- Administrators' tools are definer functions and see everything, as before.
-- ============================================================================

-- ---------------------------------------------------------------- policies --
drop policy "a member reads a readable room's topics" on public.chat_topics;
create policy "a member reads a readable room's topics" on public.chat_topics
  for select using (
    public.chat_room_is_readable(room_id)
    and not coalesce(author_id = any ((select public.my_blocked_member_ids())::uuid[]), false)
  );

-- The topic check runs under the topics' policy, so a hidden topic hides its
-- posts too.
drop policy "a member reads a readable topic's posts" on public.chat_posts;
create policy "a member reads a readable topic's posts" on public.chat_posts
  for select using (
    exists (
      select 1 from public.chat_topics t
       where t.id = chat_posts.topic_id and public.chat_room_is_readable(t.room_id)
    )
    and not coalesce(author_id = any ((select public.my_blocked_member_ids())::uuid[]), false)
  );

drop policy "a member reads the messages in a thread they are in" on public.chat_messages;
create policy "a member reads the messages in a thread they are in" on public.chat_messages
  for select using (
    public.is_thread_member(thread_id)
    and not coalesce(author_id = any ((select public.my_blocked_member_ids())::uuid[]), false)
  );

drop policy "a member reads the likes in a readable room" on public.chat_post_likes;
create policy "a member reads the likes in a readable room" on public.chat_post_likes
  for select to authenticated using (
    exists (
      select 1 from public.chat_posts p
        join public.chat_topics t on t.id = p.topic_id
       where p.id = chat_post_likes.post_id and public.chat_room_is_readable(t.room_id)
    )
    and not (member_id = any ((select public.my_blocked_member_ids())::uuid[]))
  );

drop policy "read reactions on readable standing posts" on public.chat_post_reactions;
create policy "read reactions on readable standing posts" on public.chat_post_reactions
  for select to authenticated using (
    exists (
      select 1 from public.chat_posts p
        join public.chat_topics t on t.id = p.topic_id
       where p.id = chat_post_reactions.target_id and p.removed_at is null
         and public.chat_room_is_readable(t.room_id)
    )
    and not (member_id = any ((select public.my_blocked_member_ids())::uuid[]))
  );

drop policy "read reactions in your conversation" on public.chat_message_reactions;
create policy "read reactions in your conversation" on public.chat_message_reactions
  for select to authenticated using (
    exists (
      select 1 from public.chat_messages m
       where m.id = chat_message_reactions.target_id and m.removed_at is null
         and m.notice is null and public.is_thread_member(m.thread_id)
    )
    and not (member_id = any ((select public.my_blocked_member_ids())::uuid[]))
  );

-- ------------------------------------------------------------------- views --
-- As 20261015000000, with the block in the where clause.
create or replace view public.browse_members with (security_barrier = true) as
select
  m.id,
  m.type,
  m.display_name,
  m.photo_path,
  m.photo_alt,
  m.avatar_color,
  m.city,
  m.state,
  m.level_range,
  m.exact_level,
  m.completeness,
  m.injury_date,
  m.injury_date_precision,
  m.region,
  (extract(year from age(m.birth_date::timestamptz)))::integer as age,
  m.how_injured,
  m.bio,
  m.detail,
  m.gender,
  m.languages,
  m.independence,
  m.employment,
  m.field_of_work,
  m.education,
  m.education_when,
  m.marital_status,
  m.has_children,
  m.children_when,
  m.interests,
  m.topics,
  m.self_care,
  m.affiliations,
  m.wants_to_mentor,
  m.is_seed,
  m.is_admin,
  m.created_at,
  coalesce((
    select jsonb_agg(
             jsonb_build_object('id', o.id, 'name', o.name, 'short_code', o.short_code, 'logo_path', o.logo_path)
             order by o.name, o.id)
      from public.organization_representatives r
      join public.organizations o on o.id = r.organization_id
     where r.member_id = m.id and o.removed_at is null
  ), '[]'::jsonb) as represented_organizations,
  m.sports_equipment,
  m.grants,
  m.username::text as username,
  m.injury_type,
  m.condition_name
from public.members m
where m.show_in_browse
  and m.status = 'active'
  and exists (
    select 1 from public.members viewer
     where viewer.id = auth.uid() and viewer.status = 'active'
  )
  and not exists (
    select 1 from public.member_blocks b
     where (b.blocker_id = auth.uid() and b.blocked_id = m.id)
        or (b.blocker_id = m.id and b.blocked_id = auth.uid())
  );

-- As 20261015000000; has_profile false across a block, as browse_members.
create or replace view public.chat_authors with (security_barrier = true) as
select
  m.id,
  m.display_name,
  m.photo_path,
  m.photo_alt,
  m.avatar_color,
  m.level_range,
  m.exact_level,
  m.is_admin,
  (m.show_in_browse and m.status = 'active' and not exists (
    select 1 from public.member_blocks b
     where (b.blocker_id = auth.uid() and b.blocked_id = m.id)
        or (b.blocker_id = m.id and b.blocked_id = auth.uid())
  )) as has_profile,
  m.username::text as username,
  m.injury_type,
  m.condition_name
from public.members m
where public.is_member();

-- --------------------------------------------------------------- functions --
-- As live (20261019010000), without topics or faces of members the caller
-- blocked.
create or replace function public.chat_topics_for(room text)
returns table (
  id uuid,
  room_id text,
  title text,
  author_id uuid,
  created_at timestamptz,
  last_post_at timestamptz,
  reply_count int,
  view_count bigint,
  unread boolean,
  participant_ids uuid[]
)
language sql
security definer
stable
set search_path = ''
as $$
  with hidden as (select public.my_blocked_member_ids() as ids)
  select
    t.id,
    t.room_id,
    t.title,
    t.author_id,
    t.created_at,
    t.last_post_at,
    t.reply_count,
    (select count(distinct v.member_id) from (
       select tr.member_id from public.chat_topic_reads tr where tr.topic_id = t.id
       union all
       select s.member_id from public.chat_post_views s
         join public.chat_posts p on p.id = s.post_id where p.topic_id = t.id
       union all
       select l.member_id from public.chat_post_likes l
         join public.chat_posts p on p.id = l.post_id where p.topic_id = t.id
       union all
       select x.member_id from public.chat_post_reactions x
         join public.chat_posts p on p.id = x.target_id where p.topic_id = t.id
     ) v
     where v.member_id is distinct from t.author_id) as view_count,
    t.last_post_at > coalesce(
      (select r.last_read_at from public.chat_topic_reads r
        where r.topic_id = t.id and r.member_id = auth.uid()),
      '-infinity'::timestamptz
    ) as unread,
    (
      select coalesce(array_agg(s.author_id order by s.first_at), '{}'::uuid[])
      from (
        select p.author_id, min(p.created_at) as first_at
        from public.chat_posts p
        where p.topic_id = t.id and p.author_id is not null and p.removed_at is null
          and not (p.author_id = any (hidden.ids))
        group by p.author_id
        order by min(p.created_at)
        limit 4
      ) s
    ) as participant_ids
  from public.chat_topics t
  cross join hidden
  where t.room_id = room
    -- Definer: this is the only thing between a member and a closed room.
    and public.chat_room_is_readable(room)
    and not coalesce(t.author_id = any (hidden.ids), false)
  order by t.last_post_at desc;
$$;

-- As 20260930020000, without a direct conversation with somebody the caller
-- blocked. Invoker: the messages' own policy already hides theirs.
create or replace function public.chat_my_threads()
returns table (
  id uuid,
  kind text,
  name text,
  event_id uuid,
  created_at timestamptz,
  last_message_at timestamptz,
  member_count bigint,
  other_member_id uuid,
  last_body text,
  last_author_id uuid,
  last_at timestamptz,
  last_removed boolean,
  unread boolean,
  photo_path text,
  last_notice text
)
language sql
stable
set search_path = ''
as $$
  select
    t.id,
    t.kind,
    t.name,
    t.event_id,
    t.created_at,
    t.last_message_at,
    (select count(*) from public.chat_thread_members c where c.thread_id = t.id) as member_count,
    (
      select o.member_id
      from public.chat_thread_members o
      where o.thread_id = t.id and o.member_id <> auth.uid() and t.kind = 'direct'
      limit 1
    ) as other_member_id,
    newest.body as last_body,
    newest.author_id as last_author_id,
    newest.created_at as last_at,
    newest.removed_at is not null as last_removed,
    exists (
      select 1
      from public.chat_messages n
      where n.thread_id = t.id
        and n.created_at > mine.last_read_at
        and n.author_id is distinct from auth.uid()
    ) as unread,
    t.photo_path,
    newest.notice as last_notice
  from public.chat_threads t
  join public.chat_thread_members mine
    on mine.thread_id = t.id and mine.member_id = auth.uid()
  left join lateral (
    select g.body, g.author_id, g.created_at, g.removed_at, g.notice
    from public.chat_messages g
    where g.thread_id = t.id
    order by g.created_at desc, g.id desc
    limit 1
  ) newest on true
  where not (t.kind = 'direct' and exists (
    select 1 from public.chat_thread_members o
     where o.thread_id = t.id
       and o.member_id = any ((select public.my_blocked_member_ids())::uuid[])
  ))
  order by t.last_message_at desc;
$$;

-- The badge on the app's icon: not raised by somebody the member blocked.
create or replace function public.push_unread_count(member uuid)
returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int
    from public.chat_thread_members mine
   where mine.member_id = member
     and exists (
       select 1 from public.chat_messages n
        where n.thread_id = mine.thread_id
          and n.created_at > mine.last_read_at
          and n.author_id is distinct from member
          and not exists (
            select 1 from public.member_blocks b
             where b.blocker_id = member and b.blocked_id = n.author_id
          )
     );
$$;

-- As 20261022040000, without what a member the caller blocked did, or what
-- happened in a topic they started.
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
     and not exists (
       select 1 from public.member_blocks b
        where b.blocker_id = auth.uid()
          and b.blocked_id in (n.actor_id, tp.author_id)
     )
   order by n.created_at desc, n.id
   limit least(greatest(coalesce(max_rows, 40), 1), 100);
$$;
