-- Photographs on the first post of a new room.
--
-- The owner asked for them on 2026-09-23. A new topic has carried photographs
-- since 20260918200000; a new room could not, and the reason is the order
-- things have to happen in. Everywhere else the file goes up first, under a
-- folder the upload policy can check — rooms/<room_id>/ — and then the row
-- names it. A room's folder is named after an id that chat_create_room makes
-- inside its own transaction, so there is nothing to upload into until the
-- room, its first topic and that topic's first post all exist.
--
-- So the first post is made without its pictures, and this function adds them
-- afterwards. It is the one place a post's attachments change after the
-- insert, and it is held narrow so that it stays a completion of the room
-- rather than a way to edit a post:
--
--   the caller started the room and wrote the post   (created_by, author_id)
--   the post has no photographs yet                  (once, not again)
--   nobody has replied                               (the topic is still one post)
--   the files are in the room's folder, up to four,
--   and every one of them is in the bucket, uploaded
--   by the caller                                    (the row names what exists)
--
-- Definer, because chat_posts grants no update to anybody — a post is not
-- edited — and because storage.objects is read here to check the files are
-- real. The row-first order means a client that dies between the upload and
-- this call leaves files in the bucket that nothing names; that is the same
-- orphan the delete-on-refusal path already handles, and photo-cleanup.sql's
-- afternoon covers what becomes of it.

create or replace function public.chat_add_first_post_photographs(room text, paths text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  first_post uuid;
  topic uuid;
begin
  if not public.is_active_member() then
    raise exception 'Only an active member can add photographs.';
  end if;

  select t.id, p.id
    into topic, first_post
  from public.chat_rooms r
  join public.chat_topics t on t.room_id = r.id
  join public.chat_posts p on p.topic_id = t.id
  where r.id = room
    and r.created_by = caller
    and t.author_id = caller
    and p.author_id = caller
  order by t.created_at, p.created_at
  limit 1;

  if first_post is null then
    raise exception 'Only the member who started the room can add photographs to its first post.'
      using errcode = '42501';
  end if;

  if exists (select 1 from public.chat_posts p where p.id = first_post and cardinality(p.attachments) > 0) then
    raise exception 'The first post already has its photographs.';
  end if;

  if exists (select 1 from public.chat_posts p where p.topic_id = topic and p.id <> first_post) then
    raise exception 'Somebody has already replied, so the first post stays as it is.';
  end if;

  if cardinality(paths) < 1 or cardinality(paths) > 4 then
    raise exception 'Up to four photographs on one post.' using errcode = '22023';
  end if;

  if not public.chat_paths_under(paths, 'rooms/' || room || '/') then
    raise exception 'Those photographs are not in this room.' using errcode = '22023';
  end if;

  if (
    select count(*)
    from storage.objects o
    where o.bucket_id = 'chat'
      and o.name = any (paths)
      and o.owner_id = caller::text
  ) <> cardinality(paths) then
    raise exception 'Those photographs have not been uploaded.';
  end if;

  update public.chat_posts p set attachments = paths where p.id = first_post;
end;
$$;

comment on function public.chat_add_first_post_photographs(text, text[]) is
  'Put photographs on the first post of a room the caller just started, once, before anybody replies. The room''s folder cannot exist before the room does.';

revoke all on function public.chat_add_first_post_photographs(text, text[]) from public, anon;
grant execute on function public.chat_add_first_post_photographs(text, text[]) to authenticated;
