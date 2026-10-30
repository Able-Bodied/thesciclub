-- ============================================================================
-- An answered post is added to, never changed or taken away
-- ============================================================================
-- The owner, 2026-10-29, replacing 20261029240000's second half:
--
--   * Nobody else has replied: its author edits the words in place, any way,
--     and may remove it.
--   * Somebody else has replied: its author may only add, more words after
--     the ones there ("test" becomes "test 123") or more photographs, and
--     may not remove it. An administrator still removes anything.
--   * Earlier versions stay readable either way (20261029240000).
--
-- A reply is somebody else's standing post answering it, or, for a topic's
-- opening post, anybody else's standing post in the topic. The author's own
-- posts do not count, as with chat_delete_my_topic (20261029250000).
--
-- A topic posted with only its title is edited as its title:
-- chat_edit_topic_title changes the title and the opening post that repeats
-- it together, its old words kept in chat_edits like any edit.
-- ============================================================================

-- Whether somebody other than its author has answered this post.
create or replace function private.chat_post_is_answered(p public.chat_posts)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_posts r
     where r.topic_id = p.topic_id
       and r.id <> p.id
       and r.removed_at is null
       and r.author_id is distinct from p.author_id
       and (
         r.reply_to = p.id
         -- The opening post: the earliest in its topic.
         or not exists (
           select 1 from public.chat_posts e
            where e.topic_id = p.topic_id
              and (e.created_at, e.id) < (p.created_at, p.id)
         )
       )
  );
$$;

revoke all on function private.chat_post_is_answered(public.chat_posts) from public, anon, authenticated;

-- As 20261029240000, without its exception for a title-only topic (now
-- edited as a title, below), counting only somebody else's replies, and
-- keeping an answered post from being removed by its author.
create or replace function private.chat_post_keeps_answered_words()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.removed_at is not null and old.removed_at is null then
    if not public.is_admin() and private.chat_post_is_answered(old) then
      raise exception 'Someone has replied, so this post stays. You can add to it.'
        using errcode = '22023';
    end if;
    return new;
  end if;
  if new.removed_at is not null
     or (new.body is not distinct from old.body and new.attachments is not distinct from old.attachments) then
    return new;
  end if;
  if not private.chat_post_is_answered(old) then
    return new;
  end if;
  if left(new.body, char_length(old.body)) is distinct from old.body
     or new.attachments[1:cardinality(old.attachments)] is distinct from old.attachments then
    raise exception 'Someone has replied, so you can add to this post but not change what it says.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists chat_posts_keep_answered_words on public.chat_posts;
create trigger chat_posts_keep_answered_words
  before update of body, attachments, removed_at on public.chat_posts
  for each row execute function private.chat_post_keeps_answered_words();

-- A topic posted with only its title: the title is its words.
create or replace function public.chat_edit_topic_title(topic uuid, new_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.chat_topics;
  opening public.chat_posts;
  clean text := btrim(coalesce(new_title, ''));
begin
  if not public.is_active_member() then
    raise exception 'Only an active member can edit a topic.' using errcode = '42501';
  end if;
  select * into t from public.chat_topics x where x.id = topic for update;
  if not found or not public.chat_room_is_readable(t.room_id) then
    raise exception 'There is no such topic.' using errcode = 'P0002';
  end if;
  if t.author_id is distinct from auth.uid() then
    raise exception 'You can only edit your own topic.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.chat_rooms r where r.id = t.room_id and r.opened_at is not null) then
    raise exception 'This room is closed.' using errcode = '42501';
  end if;
  if char_length(clean) < 1 or char_length(clean) > 140 then
    raise exception 'A title is 1 to 140 characters.' using errcode = '22023';
  end if;
  if clean = btrim(t.title) then
    raise exception 'Nothing changed.' using errcode = '22023';
  end if;

  select * into opening from public.chat_posts p
   where p.topic_id = t.id
   order by p.created_at, p.id
   limit 1;
  if not found or opening.removed_at is not null
     or cardinality(opening.attachments) > 0 or btrim(opening.body) <> btrim(t.title) then
    raise exception 'This topic''s words are edited on its post.' using errcode = '22023';
  end if;

  -- The post repeats the title; editing it keeps the old words in chat_edits
  -- and answers to chat_post_keeps_answered_words like any edit.
  insert into public.chat_edits (post_id, body, attachments, edited_by)
  values (opening.id, opening.body, opening.attachments, auth.uid());
  update public.chat_posts set body = clean, edited_at = clock_timestamp() where id = opening.id;
  update public.chat_topics set title = clean where id = t.id;
end;
$$;

comment on function public.chat_edit_topic_title(uuid, text) is
  'The starter edits a topic posted with only its title: the title and the post repeating it, together. See 20261029260000.';

revoke all on function public.chat_edit_topic_title(uuid, text) from public, anon;
grant execute on function public.chat_edit_topic_title(uuid, text) to authenticated;

-- As 20261029250000, saying what is left to do now that an answered post stays.
create or replace function public.chat_delete_my_topic(topic uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  files text[];
begin
  if not public.is_active_member() then
    raise exception 'Only an active member can delete a topic.' using errcode = '42501';
  end if;
  perform 1 from public.chat_topics t
   where t.id = topic and t.author_id = auth.uid() and public.chat_room_is_readable(t.room_id)
     for update;
  if not found then
    raise exception 'Only whoever started a topic can delete it.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.chat_posts p
     where p.topic_id = topic and p.removed_at is null and p.author_id is distinct from auth.uid()
  ) then
    raise exception 'Somebody has answered, so the topic stays for them. You can add to your post.'
      using errcode = '22023';
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
  return files;
end;
$$;

