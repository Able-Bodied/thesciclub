-- ============================================================================
-- Photographs added to a post after it is posted
-- ============================================================================
-- The owner, 2026-10-28: a topic's photographs could only be chosen when it
-- was started. Editing one's own post may now add photographs too, up to the
-- four a post can carry (chat_posts_attachments_check). Each must be in the
-- topic's room folder and uploaded by the author, as for a new post: the
-- trigger chat_posts_check_attachments (20261018020000) checks the update.
--
-- As chat_edit_post (20260930000000) in every other way: the author only,
-- while the post stands and the room is open; the earlier version goes to
-- chat_edits; nothing changed is refused, so "Edited" is never a lie.
-- ============================================================================

create or replace function public.chat_edit_post_photographs(post uuid, new_body text, added text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.chat_posts;
  clean text := btrim(coalesce(new_body, ''));
  adding text[] := coalesce(added, '{}');
begin
  if not public.is_active_member() then
    raise exception 'Only an active member can edit a post.' using errcode = '42501';
  end if;

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

  if target.author_id is distinct from auth.uid() then
    raise exception 'You can only edit your own post.' using errcode = '42501';
  end if;

  if target.removed_at is not null then
    raise exception 'That post has been removed.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.chat_topics t
    join public.chat_rooms r on r.id = t.room_id
    where t.id = target.topic_id and r.opened_at is not null
  ) then
    raise exception 'This room is closed.' using errcode = '42501';
  end if;

  if char_length(clean) > 4000 then
    raise exception 'A post is at most 4,000 characters.' using errcode = '22023';
  end if;
  if cardinality(target.attachments) + cardinality(adding) > 4 then
    raise exception 'Up to 4 photographs on one post.' using errcode = '22023';
  end if;
  if clean = '' and cardinality(target.attachments) + cardinality(adding) = 0 then
    raise exception 'A post needs some words or a photograph.' using errcode = '22023';
  end if;

  if clean = target.body and cardinality(adding) = 0 then
    raise exception 'Nothing changed.' using errcode = '22023';
  end if;

  insert into public.chat_edits (post_id, body, attachments, edited_by)
  values (target.id, target.body, target.attachments, auth.uid());

  update public.chat_posts
     set body = clean,
         attachments = target.attachments || adding,
         edited_at = clock_timestamp()
   where id = target.id;
end;
$$;

revoke all on function public.chat_edit_post_photographs(uuid, text, text[]) from public, anon;
grant execute on function public.chat_edit_post_photographs(uuid, text, text[]) to authenticated;
