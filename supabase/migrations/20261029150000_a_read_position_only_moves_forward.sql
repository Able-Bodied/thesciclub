-- ============================================================================
-- A conversation's read position only moves forward (SPEED-PLAN.md, Step 3)
-- ============================================================================
-- Reopening a conversation rewrote the same read position: a disk write, and
-- a realtime change that makes every other open phone in the group reload its
-- read receipts. Now chat_mark_thread_read_through writes only when the
-- position moves. notifications_read_with_chat already ignored a write that
-- moved nothing, so notifications behave as before.
--
-- Not chat_mark_thread_read (older store apps): it reads up to now, which is
-- always later, so the guard would never skip a write. Not topics, whose
-- every read clears their notifications.
--
-- Probe: read-through-moves-forward.sql. Undo: supabase/undo/20261029150000.sql.
-- ============================================================================

create or replace function public.chat_mark_thread_read_through(thread uuid, message uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
    set last_read_at = delivered_at
    where thread_id = thread and member_id = auth.uid()
      and last_read_at < delivered_at;
end;
$$;
