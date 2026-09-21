-- ============================================================================
-- Chat, migration 14: the group chat for an event
-- ============================================================================
-- One function. A member who has said they are going to an event opens the
-- group for it, and the group is made the first time somebody does.
--
-- ---------------------------------------------------------------------------
-- Lazy, and not a trigger on event_rsvps
-- ---------------------------------------------------------------------------
-- CHAT-PLAN.md asked for the reason to be written here. A trigger across RSVP
-- and chat would make a thread for every event anybody ever tapped Going on,
-- most of which nobody would ever open, and it would add and remove people
-- from a conversation as a side effect of a button that says nothing about
-- conversations. Un-RSVPing would then either drop somebody out of a chat
-- mid-sentence or leave them in one the trigger claims to own.
--
-- So: the thread is made by the first person who opens it, joining is a thing
-- somebody does, and leaving is the Leave control. Changing your mind about an
-- event does not remove you from the group — you were in that conversation,
-- and taking somebody out of a conversation is not something an RSVP button
-- should do quietly. The screen says so.
--
-- ---------------------------------------------------------------------------
-- What it checks, in the order it checks it
-- ---------------------------------------------------------------------------
-- Definer, so RLS is off in here and every rule is stated — the Phase 2 lesson.
--
--   1. The caller is an active member. Joining writes a row.
--   2. If the thread exists and they are already on its roster, return it.
--      Before anything else, for the reason chat_open_direct looks a thread up
--      before applying its findable test: a conversation you are in must not
--      stop opening because something about you or the event changed. This is
--      what makes a past event's group readable by whoever was in it.
--   3. Joining is new, so it needs a Going RSVP. Interested is not going.
--      `event_rsvps` is own-row-only under RLS, which is exactly why this has
--      to be definer and exactly why the check has to name `member_id`.
--   4. The event has to exist and not be over. A group chat that can still be
--      joined a year later is a mailing list for a day that happened.
--
-- ---------------------------------------------------------------------------
-- No cap here, unlike chat_create_group
-- ---------------------------------------------------------------------------
-- A member-made group is capped at 50 because a flat thread bigger than that is
-- a room without a room's reading rules. An event group's roster is however
-- many people are going, and refusing the fifty-first is refusing somebody the
-- conversation about an event they are attending. If a partner organization
-- ever runs something with two hundred people at it, that is a real problem and
-- a cap is the wrong shape for it.
--
-- ---------------------------------------------------------------------------
-- The name is the event's title, cut
-- ---------------------------------------------------------------------------
-- `chat_threads.name` stops at 60 characters and event titles from a scraped
-- feed do not. Cutting at 59 with an ellipsis says it was cut; cutting at 60
-- leaves a name that looks like somebody typed it and stopped. The name is
-- fixed at creation and does not follow a later re-scrape: it is what the group
-- was called when people joined it.
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
  event_ends timestamptz;
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

  if not exists (
    select 1 from public.event_rsvps r
    where r.event_id = event and r.member_id = me and r.status = 'going'
  ) then
    raise exception 'The group chat is for everybody going to this event.'
      using errcode = 'P0002';
  end if;

  select e.title, coalesce(e.end_time, e.start_time)
    into event_title, event_ends
    from public.events e where e.id = event;

  if event_title is null then
    raise exception 'There is no such event.' using errcode = 'P0002';
  end if;

  if event_ends < now() then
    raise exception 'This event is over. Its group chat stays open to whoever was already in it.'
      using errcode = '22023';
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

comment on function public.chat_join_event_group(uuid) is
  'The group chat for an event, made on first use. For members who said they are going, and it does not follow a change of mind.';

revoke all on function public.chat_join_event_group(uuid) from public, anon;
grant execute on function public.chat_join_event_group(uuid) to authenticated;
