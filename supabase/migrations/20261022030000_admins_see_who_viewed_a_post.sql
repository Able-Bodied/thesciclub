-- ============================================================================
-- Administrators see who viewed a post, and on what
-- ============================================================================
-- The owner, 2026-10-20: an administrator may see who has viewed each post,
-- including views from before today, and whether each was on a phone or a
-- computer. Members still see only the count. The privacy policy says so in
-- the same change (src/routes/legal/privacy.tsx).
--
-- Who viewed is what the count already counts (20261019010000): a read of
-- the topic through the post, a Home view, a like, a reaction. The device is
-- new and starts today: chat_post_view_devices holds each device a member
-- first saw a post on. The client says which ('mobile' or 'desktop'); older
-- clients call the old signatures, which still work and record no device.
-- ============================================================================

create table public.chat_post_view_devices (
  post_id uuid not null references public.chat_posts (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  device text not null check (device in ('mobile', 'desktop')),
  seen_at timestamptz not null default now(),
  primary key (post_id, member_id, device)
);
create index chat_post_view_devices_member_idx on public.chat_post_view_devices (member_id);
alter table public.chat_post_view_devices enable row level security;
revoke all on public.chat_post_view_devices from public, anon, authenticated;
grant select, insert, update, delete on public.chat_post_view_devices to service_role;

comment on table public.chat_post_view_devices is
  'The devices a member first saw each post on. Written by the view functions; read only by admin_post_viewers.';
comment on table public.chat_post_views is
  'Posts a member has seen on Home. Written only by chat_mark_posts_seen; read by the count functions and admin_post_viewers.';

-- A Home view, with the device it was seen on.
create or replace function public.chat_mark_posts_seen(post_ids uuid[], device text)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if device is null or device not in ('mobile', 'desktop') then
    raise exception 'A device is mobile or desktop.' using errcode = '22023';
  end if;
  perform public.chat_mark_posts_seen(post_ids);
  insert into public.chat_post_view_devices (post_id, member_id, device)
  select p.id, auth.uid(), device
  from public.chat_posts p
  join public.chat_topics t on t.id = p.topic_id
  where p.id = any(post_ids[1:200])
    and p.removed_at is null
    and p.author_id is distinct from auth.uid()
    and public.is_active_member()
    and public.chat_room_is_readable(t.room_id)
  on conflict do nothing;
end;
$$;
revoke all on function public.chat_mark_posts_seen(uuid[], text) from public, anon;
grant execute on function public.chat_mark_posts_seen(uuid[], text) to authenticated;

-- A topic opened in its room: every post read through, on this device.
create or replace function public.chat_mark_topic_read_through(topic uuid, post uuid, device text)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare delivered_at timestamptz;
begin
  if device is null or device not in ('mobile', 'desktop') then
    raise exception 'A device is mobile or desktop.' using errcode = '22023';
  end if;
  -- Checks the topic and the post, and raises as it always has.
  perform public.chat_mark_topic_read_through(topic, post);
  select p.created_at into delivered_at from public.chat_posts p
    where p.id = post and p.topic_id = topic;
  insert into public.chat_post_view_devices (post_id, member_id, device)
  select p.id, auth.uid(), device
  from public.chat_posts p
  where p.topic_id = topic
    and p.created_at <= delivered_at
    and p.removed_at is null
    and p.author_id is distinct from auth.uid()
  on conflict do nothing;
end;
$$;
revoke all on function public.chat_mark_topic_read_through(uuid, uuid, text) from public, anon;
grant execute on function public.chat_mark_topic_read_through(uuid, uuid, text) to authenticated;

-- Who viewed one post: the same four ways in as chat_post_view_counts, never
-- the author. `seen_at` is the earliest time known; a topic read and a
-- reaction keep none, so a viewer known only by those has none.
create or replace function public.admin_post_viewers(post uuid)
returns table (
  member_id uuid,
  display_name text,
  photo_path text,
  photo_alt text,
  seen_at timestamptz,
  devices text[]
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Not an administrator' using errcode = '42501';
  end if;

  return query
  with target as (
    select p.id, p.topic_id, p.created_at, p.author_id
    from public.chat_posts p where p.id = post
  ),
  seen as (
    select r.member_id, null::timestamptz as at
      from public.chat_topic_reads r, target
      where r.topic_id = target.topic_id and r.last_read_at >= target.created_at
    union all
    select s.member_id, s.seen_at from public.chat_post_views s, target
      where s.post_id = target.id
    union all
    select l.member_id, l.liked_at from public.chat_post_likes l, target
      where l.post_id = target.id
    union all
    select x.member_id, null::timestamptz from public.chat_post_reactions x, target
      where x.target_id = target.id
    union all
    select d.member_id, d.seen_at from public.chat_post_view_devices d, target
      where d.post_id = target.id
  )
  select
    m.id,
    m.display_name,
    m.photo_path,
    m.photo_alt,
    min(seen.at),
    array(
      select d.device from public.chat_post_view_devices d
      where d.post_id = post and d.member_id = m.id
      order by d.device
    )
  from seen
  join public.members m on m.id = seen.member_id
  cross join target
  where seen.member_id is distinct from target.author_id
  group by m.id, m.display_name, m.photo_path, m.photo_alt
  order by min(seen.at) desc nulls last, m.display_name;
end;
$$;
revoke all on function public.admin_post_viewers(uuid) from public, anon;
grant execute on function public.admin_post_viewers(uuid) to authenticated;
