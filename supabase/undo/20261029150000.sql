-- Undo for 20261029150000_a_read_position_only_moves_forward.sql: the body
-- before it, from pg_get_functiondef on a fresh stack (2026-10-29).
-- Compare with the live definition before release.

CREATE OR REPLACE FUNCTION public.chat_mark_thread_read_through(thread uuid, message uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;
