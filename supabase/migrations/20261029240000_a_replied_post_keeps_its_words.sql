-- ============================================================================
-- A replied post keeps its words, and anybody may read what it said before
-- ============================================================================
-- The owner, 2026-10-29: an edit can make the replies under a post stop
-- making sense. So:
--
-- 1. Members read a post's earlier versions (chat_edits) whenever they can
--    read the post itself and it is standing. The subquery reads chat_posts
--    as the member, so its own rules (readable room, blocks) decide. A
--    conversation's message's earlier versions stay administrators' only.
--
-- 2. Once a post has a reply, an edit keeps its words exactly and may only
--    add after them, and photographs only be added. A reply is a standing
--    post answering it, or, for a topic's opening post, any other standing
--    post in the topic. A topic posted with only its title is the exception:
--    its words are the title, shown above it anyway, so details may replace
--    them. Checked by a trigger, so chat_edit_post and
--    chat_edit_post_photographs both answer to it. A removal is not an edit.
-- ============================================================================

drop policy if exists "a member reads a readable post's earlier versions" on public.chat_edits;
create policy "a member reads a readable post's earlier versions"
  on public.chat_edits for select
  using (
    post_id is not null
    and exists (
      select 1 from public.chat_posts p
       where p.id = chat_edits.post_id and p.removed_at is null
    )
  );

create or replace function private.chat_post_keeps_answered_words()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.removed_at is not null
     or (new.body is not distinct from old.body and new.attachments is not distinct from old.attachments) then
    return new;
  end if;
  -- Only its title: details may replace it.
  if cardinality(old.attachments) = 0
     and exists (select 1 from public.chat_topics t where t.id = old.topic_id and btrim(t.title) = btrim(old.body)) then
    return new;
  end if;
  if not exists (
    select 1 from public.chat_posts r
     where r.topic_id = old.topic_id
       and r.id <> old.id
       and r.removed_at is null
       and (
         r.reply_to = old.id
         -- The opening post: the earliest in its topic.
         or not exists (
           select 1 from public.chat_posts e
            where e.topic_id = old.topic_id
              and (e.created_at, e.id) < (old.created_at, old.id)
         )
       )
  ) then
    return new;
  end if;
  if left(new.body, char_length(old.body)) is distinct from old.body
     or new.attachments[1:cardinality(old.attachments)] is distinct from old.attachments then
    raise exception 'Someone has replied, so what you wrote stays. You can add an update under it.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function private.chat_post_keeps_answered_words() from public, anon, authenticated;

drop trigger if exists chat_posts_keep_answered_words on public.chat_posts;
create trigger chat_posts_keep_answered_words
  before update of body, attachments on public.chat_posts
  for each row execute function private.chat_post_keeps_answered_words();
