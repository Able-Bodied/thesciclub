-- ============================================================================
-- Seeing an Important message, or opening its notification, acknowledges it
-- ============================================================================
-- The owner, 2026-11-15, asked whether seeing an Important message is the same
-- as acknowledging it: "Yes seeing counts or clicking on the notification."
-- It also lets the iPhone app already on phones take part: it has no
-- Acknowledge button (20261113140000), but it does record reading a
-- conversation, and its bell does mark a notification read.
--
-- * Reading: chat_mark_thread_read_through, which every copy of the app and
--   the website call when a conversation is on screen, acknowledges for the
--   reader each Important message in it up to the message read through. Even
--   when the read position does not move: a message read before it was
--   marked is acknowledged the next time the conversation is opened.
-- * The notification: marking the bell's 'important:<message>' notification
--   read, by tapping it or a push that opens it, acknowledges that message.
-- * Only for whoever is asked (private.important_audience), only while it is
--   still marked; Acknowledge itself stays, and does the same.
--
-- Acknowledging still reads the notification and stops the reminders, as
-- 20261113140000 has it: every reminder and the "waiting" note read
-- chat_important_acks, which is all this writes.
--
-- chat_mark_thread_read_through as 20261029150000 left it, with the
-- acknowledging added after the read position.
--
-- Probe: supabase/tests/important-messages.sql.
-- ============================================================================

-- Acknowledges for p_member each Important message in p_thread sent at or
-- before p_through, and reads their notifications.
create or replace function private.acknowledge_important_seen(
  p_member uuid,
  p_thread uuid,
  p_through timestamptz
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  seen uuid[];
begin
  with acked as (
    insert into public.chat_important_acks (message_id, thread_id, member_id)
    select im.message_id, im.thread_id, p_member
      from public.chat_important_messages im
      join public.chat_messages m on m.id = im.message_id
     where im.thread_id = p_thread
       and im.unmarked_at is null
       and m.created_at <= p_through
       and p_member in (select a.member_id from private.important_audience(im.message_id) a)
    on conflict do nothing
    returning message_id
  )
  select coalesce(array_agg(message_id), '{}') into seen from acked;

  if cardinality(seen) > 0 then
    update public.notifications n
       set read_at = now(), seen_at = coalesce(n.seen_at, now())
     where n.member_id = p_member
       and n.read_at is null
       and n.tag in (select 'important:' || s::text from unnest(seen) s);
  end if;
end;
$$;

revoke all on function private.acknowledge_important_seen(uuid, uuid, timestamptz)
  from public, anon, authenticated;

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
  -- Seen is acknowledged (20261115140000).
  perform private.acknowledge_important_seen(auth.uid(), thread, delivered_at);
end;
$$;

-- Opening an Important message's notification acknowledges it.
create or replace function private.important_notification_opened()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  msg uuid;
  found_thread uuid;
begin
  if new.tag is null or new.tag not like 'important:%' then
    return null;
  end if;
  begin
    msg := substr(new.tag, length('important:') + 1)::uuid;
  exception when invalid_text_representation then
    return null;
  end;
  select im.thread_id into found_thread
    from public.chat_important_messages im
   where im.message_id = msg and im.unmarked_at is null;
  if found_thread is null
     or new.member_id not in (select a.member_id from private.important_audience(msg) a) then
    return null;
  end if;
  insert into public.chat_important_acks (message_id, thread_id, member_id)
  values (msg, found_thread, new.member_id)
  on conflict do nothing;
  return null;
end;
$$;

revoke all on function private.important_notification_opened() from public, anon, authenticated;

drop trigger if exists important_notification_opened on public.notifications;
create trigger important_notification_opened
  after update of read_at on public.notifications
  for each row
  when (old.read_at is null and new.read_at is not null)
  execute function private.important_notification_opened();
