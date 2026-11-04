-- Undo for 20261104020000_opening_a_topic_writes_only_when_something_changes.sql:
-- the body before it, from pg_get_functiondef on a fresh stack (2026-11-04).
-- Compare with the live definition before release.

CREATE OR REPLACE FUNCTION public.chat_mark_topic_read_through(topic uuid, post uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$

;
