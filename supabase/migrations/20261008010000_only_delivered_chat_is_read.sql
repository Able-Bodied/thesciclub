-- A paged read must not mark messages arriving during the fetch as read.
-- Keep the original RPCs for older clients; the corrected client supplies
-- the last delivered row. Look its timestamp up here rather than trusting
-- a browser timestamp, and retain the same visibility checks as the originals.

create or replace function public.chat_mark_thread_read_through(thread uuid, message uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare delivered_at timestamptz;
begin
  if not public.is_thread_member(thread) then
    raise exception 'There is no such conversation.' using errcode = 'P0002';
  end if;
  select m.created_at into delivered_at from public.chat_messages m
    where m.id = message and m.thread_id = thread;
  if delivered_at is null then
    raise exception 'There is no such message.' using errcode = 'P0002';
  end if;
  update public.chat_thread_members
    set last_read_at = greatest(last_read_at, delivered_at)
    where thread_id = thread and member_id = auth.uid();
end;
$$;
revoke all on function public.chat_mark_thread_read_through(uuid, uuid) from public, anon;
grant execute on function public.chat_mark_thread_read_through(uuid, uuid) to authenticated;

create or replace function public.chat_mark_topic_read_through(topic uuid, post uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare delivered_at timestamptz;
begin
  if not exists (select 1 from public.chat_topics t
    where t.id = topic and public.chat_room_is_readable(t.room_id)) then
    raise exception 'There is no such topic.' using errcode = 'P0002';
  end if;
  select p.created_at into delivered_at from public.chat_posts p
    where p.id = post and p.topic_id = topic;
  if delivered_at is null then
    raise exception 'There is no such post.' using errcode = 'P0002';
  end if;
  insert into public.chat_topic_reads (topic_id, member_id, last_read_at)
    values (topic, auth.uid(), delivered_at)
    on conflict (topic_id, member_id) do update
      set last_read_at = greatest(public.chat_topic_reads.last_read_at, excluded.last_read_at);
end;
$$;
revoke all on function public.chat_mark_topic_read_through(uuid, uuid) from public, anon;
grant execute on function public.chat_mark_topic_read_through(uuid, uuid) to authenticated;
