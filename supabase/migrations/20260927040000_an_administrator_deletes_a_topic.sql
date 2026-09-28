-- An administrator can delete a topic, and everything in it.
--
-- The owner, 2026-09-27. Until now nothing deleted a topic: no delete grant,
-- no delete policy, and CONTEXT.md's "what people write in a room is theirs".
-- That still holds for members — nobody can delete somebody else's words, and
-- a member still cannot delete their own topic — but an administrator needs a
-- way to take down a topic that should not be there at all, which closing the
-- whole room was too blunt for.
--
-- ---------------------------------------------------------------------------
-- What goes, and what stays
-- ---------------------------------------------------------------------------
-- The topic row, and by cascade: its posts, who read it, who muted it, and the
-- words of posts removed earlier (chat_removed_bodies — the moderation copy of
-- a removed post goes with the topic it belonged to).
--
-- Reports stay. chat_reports.post_id is ON DELETE SET NULL and the report
-- keeps its own snapshot of the words, its photograph paths, and its topic and
-- room ids (which are not foreign keys, so they survive as a record of where).
-- admin_chat_reports already reads a report whose post is gone as "already
-- removed". A photograph named on a report cannot be deleted by anybody
-- (20260918210000), so the storage delete the client makes afterwards skips
-- those and the report keeps its picture.
--
-- ---------------------------------------------------------------------------
-- Photographs
-- ---------------------------------------------------------------------------
-- Files cannot be deleted from SQL — storage.protect_delete() refuses — so this
-- returns every path the topic's posts carried, standing or removed, and the
-- client removes them through the storage API, as removing one post does.
--
-- ---------------------------------------------------------------------------
-- The latch that can now fire
-- ---------------------------------------------------------------------------
-- chat_create_room refuses a member who has a room with no topics in it
-- ("Fill your last room before starting another", 20260918170000). Nothing
-- could empty a room until now. Deleting a member-started room's only topic
-- does, and its starter then cannot start another room until they write a
-- topic in that one — which they can, while it is open. Left as it is: it is
-- what the latch was for.

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

  select coalesce(array_agg(distinct x.path), '{}') into files
    from (
      select unnest(p.attachments) as path
        from public.chat_posts p where p.topic_id = topic
      union
      select unnest(b.attachments)
        from public.chat_removed_bodies b
        join public.chat_posts p on p.id = b.post_id
       where p.topic_id = topic
    ) x;

  delete from public.chat_topics t where t.id = topic;
  if not found then
    raise exception 'That topic is not there any more.' using errcode = 'P0002';
  end if;

  return files;
end;
$$;

comment on function public.admin_delete_topic(uuid) is
  'An administrator deletes a topic and its posts; returns the photograph paths for the client to remove from storage.';

revoke all on function public.admin_delete_topic(uuid) from public, anon;
grant execute on function public.admin_delete_topic(uuid) to authenticated;
