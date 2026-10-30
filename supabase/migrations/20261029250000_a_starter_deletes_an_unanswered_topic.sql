-- ============================================================================
-- Whoever started a topic deletes it, while nobody else has posted in it
-- ============================================================================
-- The owner, 2026-10-29: removing a topic's opening post from its ••• left
-- the topic and its title standing, and only an administrator's Delete topic
-- took it away. Now the starter deletes their own topic while no other
-- member's post stands in it; once somebody has answered, Remove takes only
-- their post and the topic stays for the answers. As admin_delete_topic
-- (20261018020000): returns the photographs to delete, and reports keep
-- their own copy.
-- ============================================================================

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
    raise exception 'Somebody has answered, so the topic stays for them. You can remove your own post.'
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

comment on function public.chat_delete_my_topic(uuid) is
  'The starter deletes their own topic while no other member''s post stands in it. See 20261029250000.';

revoke all on function public.chat_delete_my_topic(uuid) from public, anon;
grant execute on function public.chat_delete_my_topic(uuid) to authenticated;
