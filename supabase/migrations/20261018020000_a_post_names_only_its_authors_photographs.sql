-- A post names only photographs its author uploaded, and moderating a post
-- deletes only those.
--
-- The security scan of 2026-10-17 (findings F3 and F4). A member inserts
-- chat_posts directly, and the only check on `attachments` was the rooms/
-- prefix (chat_posts_attachments_check). So a post could name any member's
-- photograph in any room. When an administrator removed that post, or
-- deleted its topic, the administrator's client deleted every path the post
-- named through the storage API, and the chat bucket lets an administrator
-- delete anything: other members' photographs, gone for good.
--
-- Three changes:
--
--   chat_posts_check_attachments: a photograph added to a post must be in its
--     topic's room folder and uploaded by the post's author, as
--     chat_add_first_post_photographs already required of a room's first
--     post. Files go up before the row everywhere else (20260923000000), so
--     the object is there to check. Skipped with no signed-in caller
--     (migrations, the seed, the service role).
--   admin_delete_topic returns only the paths whose file the naming post's
--     author uploaded, for rows written before the trigger.
--   chat_remove_post returns the same for the one post, and the topic page
--     deletes what it returns instead of what the row said. It returned
--     nothing before, so it is dropped and made again.

-- -------------------------------------------- what a post may name, checked
create or replace function public.chat_check_post_attachments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  added text[];
  room text;
begin
  if auth.uid() is null then
    return new;
  end if;

  -- Only what this write adds: a removal empties the list, and the first
  -- post's photographs are checked by the function that adds them as well.
  added := array(
    select unnest(new.attachments)
    except
    select unnest(case when tg_op = 'UPDATE' then old.attachments else '{}'::text[] end)
  );
  if cardinality(added) = 0 then
    return new;
  end if;

  select t.room_id into room from public.chat_topics t where t.id = new.topic_id;
  if room is null or not public.chat_paths_under(added, 'rooms/' || room || '/') then
    raise exception 'Those photographs are not in this room.' using errcode = '22023';
  end if;

  if (
    select count(*)
      from storage.objects o
     where o.bucket_id = 'chat'
       and o.name = any (added)
       and o.owner_id = new.author_id::text
  ) <> cardinality(added) then
    raise exception 'Those photographs have not been uploaded.' using errcode = '22023';
  end if;

  return new;
end;
$$;

comment on function public.chat_check_post_attachments() is
  'Trigger: a photograph added to a post is in its topic''s room folder and was uploaded by the post''s author. See 20261018020000.';

revoke all on function public.chat_check_post_attachments() from public, anon, authenticated;

drop trigger if exists chat_posts_check_attachments on public.chat_posts;
create trigger chat_posts_check_attachments
  before insert or update of attachments on public.chat_posts
  for each row execute function public.chat_check_post_attachments();

-- ---------------------------------------------- the files a removal deletes
-- A post's paths whose file its author uploaded. Definer: storage.objects is
-- read to check the owner.
create or replace function private.chat_files_of(author uuid, paths text[])
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct o.name), '{}')
    from storage.objects o
   where o.bucket_id = 'chat'
     and o.name = any (coalesce(paths, '{}'))
     and o.owner_id = author::text;
$$;

comment on function private.chat_files_of(uuid, text[]) is
  'The paths, of those given, whose file in the chat bucket the author uploaded: what removing their post may delete. See 20261018020000.';

revoke all on function private.chat_files_of(uuid, text[]) from public, anon, authenticated;

-- As 20260927040000, returning only the files the posts' authors uploaded.
create or replace function public.admin_delete_topic(topic uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  files text[];
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can delete a topic.' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct f.path), '{}') into files
    from (
      select unnest(private.chat_files_of(p.author_id, p.attachments)) as path
        from public.chat_posts p where p.topic_id = topic
      union
      select unnest(private.chat_files_of(p.author_id, b.attachments))
        from public.chat_removed_bodies b
        join public.chat_posts p on p.id = b.post_id
       where p.topic_id = topic
    ) f;

  delete from public.chat_topics t where t.id = topic;
  if not found then
    raise exception 'That topic is not there any more.' using errcode = 'P0002';
  end if;

  return files;
end;
$$;

-- As 20260927030000, returning the files to delete.
drop function if exists public.chat_remove_post(uuid);
create function public.chat_remove_post(post uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.chat_posts;
begin
  select * into target from public.chat_posts p where p.id = post;
  if not found then
    raise exception 'There is no such post.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.chat_topics t
    where t.id = target.topic_id and public.chat_room_is_readable(t.room_id)
  ) then
    raise exception 'There is no such post.' using errcode = 'P0002';
  end if;

  if target.author_id is distinct from auth.uid() and not public.is_admin() then
    raise exception 'Only the person who wrote a post, or an administrator, can remove it.'
      using errcode = '42501';
  end if;

  if target.removed_at is not null then
    return '{}';
  end if;

  insert into public.chat_removed_bodies (post_id, body, attachments, removed_by)
  values (target.id, target.body, target.attachments, auth.uid())
  on conflict (post_id) do nothing;

  update public.chat_posts
     set body = '',
         attachments = '{}',
         removed_at = now(),
         removed_by_admin = (target.author_id is distinct from auth.uid())
   where id = target.id;

  -- Its replies stand, as posts of their own. Nothing says "reply to a
  -- removed post".
  update public.chat_posts
     set reply_to = null
   where reply_to = target.id;

  update public.chat_topics t
     set reply_count = public.chat_topic_reply_count(target.topic_id)
   where t.id = target.topic_id;

  -- Only the author's own uploads: the row was written by the author and may
  -- name anybody's file (before chat_posts_check_attachments).
  return private.chat_files_of(target.author_id, target.attachments);
end;
$$;

comment on function public.chat_remove_post(uuid) is
  'Remove a post: its author, or an administrator. Returns the photographs to delete through the storage API, only those its author uploaded. See 20261018020000.';

revoke all on function public.chat_remove_post(uuid) from public, anon;
grant execute on function public.chat_remove_post(uuid) to authenticated, service_role;
