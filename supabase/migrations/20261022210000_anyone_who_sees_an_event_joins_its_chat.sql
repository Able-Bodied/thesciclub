-- ============================================================================
-- An event's group chat is for anyone who can see the event
-- ============================================================================
-- The owner, 2026-10-22: "you should not have to be going to an event to
-- enter the chatroom for it." Until now chat_join_event_group needed a Going
-- RSVP (20260918140000). Now it needs only an event the member can see
-- (can_see_event, 20261022180000): its audience, or whoever may change it.
-- And at any time, before the event or after it (the owner, the same day:
-- "sometimes people might want to ask questions about an event they
-- missed"), so a finished event no longer closes its chat to newcomers.
-- Every event has its chat: made the first time anybody opens it.
-- ============================================================================

create or replace function public.chat_join_event_group(event uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  found_thread uuid;
  event_title text;
begin
  if not public.is_active_member() then
    raise exception 'Only an active member can join a group chat.' using errcode = '42501';
  end if;

  if event is null then
    raise exception 'There is no such event.' using errcode = '22023';
  end if;

  select t.id into found_thread
    from public.chat_threads t where t.event_id = event;

  -- Step 2 in the header: already in it is already in it.
  if found_thread is not null and exists (
    select 1 from public.chat_thread_members m
    where m.thread_id = found_thread and m.member_id = me
  ) then
    return found_thread;
  end if;

  if not public.can_see_event(event) then
    raise exception 'There is no such event.' using errcode = 'P0002';
  end if;

  select e.title into event_title from public.events e where e.id = event;

  if event_title is null then
    raise exception 'There is no such event.' using errcode = 'P0002';
  end if;

  if found_thread is null then
    insert into public.chat_threads (kind, name, event_id, created_by)
    values (
      'group',
      case when char_length(btrim(event_title)) > 60
        then left(btrim(event_title), 59) || '…'
        else btrim(event_title)
      end,
      event,
      me
    )
    -- Two people tapping at the same moment both find nothing and both insert.
    -- `event_id` is unique, so one wins and the loser re-selects — the same
    -- shape, and the same reason, as direct_key in migration 8.
    on conflict (event_id) do nothing
    returning id into found_thread;

    if found_thread is null then
      select t.id into found_thread from public.chat_threads t where t.event_id = event;
    end if;
  end if;

  insert into public.chat_thread_members (thread_id, member_id)
  values (found_thread, me)
  on conflict (thread_id, member_id) do nothing;

  return found_thread;
end;
$$;
