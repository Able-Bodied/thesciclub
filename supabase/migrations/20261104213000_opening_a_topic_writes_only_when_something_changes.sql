-- ============================================================================
-- Opening a topic writes only when something changes
-- ============================================================================
-- Speed report, 2026-11-03: every topic open wrote its read row (1,874 writes
-- in the Pro run), moved or not, and disk writes stalled both plans.
--
-- chat_mark_topic_read_through(topic, post) now writes only when the read
-- position moves, or when a notification about the topic is waiting: the
-- write is what clears it (notifications_read_with_chat), so reopening a
-- topic still clears a like or a reaction. Otherwise it returns having
-- written nothing. Same checks, errors, return and grants. The device
-- version calls it; its device rows were already insert-if-missing.
--
-- Probe: topic-read-writes-only-on-change.sql.
-- Undo: supabase/undo/20261104213000.sql.
-- ============================================================================

create or replace function public.chat_mark_topic_read_through(topic uuid, post uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
  -- Read this far already and nothing to clear: no write.
  if exists (select 1 from public.chat_topic_reads r
      where r.topic_id = topic and r.member_id = auth.uid()
        and r.last_read_at >= delivered_at)
     and not exists (select 1 from public.notifications n
      where n.member_id = auth.uid() and n.topic_id = topic and n.read_at is null) then
    return;
  end if;
  insert into public.chat_topic_reads (topic_id, member_id, last_read_at)
    values (topic, auth.uid(), delivered_at)
    on conflict (topic_id, member_id) do update
      set last_read_at = greatest(public.chat_topic_reads.last_read_at, excluded.last_read_at);
end;
$$;
