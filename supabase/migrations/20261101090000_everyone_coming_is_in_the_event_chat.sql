-- ============================================================================
-- Everyone going or interested is in an event's group chat
-- ============================================================================
-- The owner, 2026-11-01: it was only whoever pressed Join. This reverses the
-- "not a trigger on event_rsvps" of 20260918140000 for joining, and keeps what
-- mattered there: no thread is made for an event nobody talks about, and nobody
-- is taken out of a conversation by changing their RSVP. Leaving is still the
-- group's Leave control.
--
-- The thread is still made by the first person to open it. The people coming
-- are added when somebody first says something, so an opened and abandoned chat
-- brings nobody in, and from then on as they RSVP. Whoever left and later says
-- Going afresh is back in: saying so again is a new answer.
--
-- Added quietly, as an introduction's group is: nobody added anybody, so there
-- is no "added you to a group" for each of them. They hear of the message as
-- any member does. A failure here must never cost the message or the RSVP.
-- ============================================================================

create function private.event_chat_gathers_who_is_coming()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  coming uuid;
  claims text := current_setting('request.jwt.claims', true);
  claim_sub text := current_setting('request.jwt.claim.sub', true);
begin
  if new.notice is not null then
    return new;
  end if;
  select t.event_id into coming from public.chat_threads t where t.id = new.thread_id;
  if coming is null or exists (
    select 1 from public.chat_messages m
     where m.thread_id = new.thread_id and m.id <> new.id and m.notice is null
  ) then
    return new;
  end if;

  begin
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    insert into public.chat_thread_members (thread_id, member_id)
    select new.thread_id, r.member_id
      from public.event_rsvps r
      join public.members m on m.id = r.member_id and m.status = 'active'
     where r.event_id = coming
       and not public.members_blocked(new.author_id, r.member_id)
    on conflict (thread_id, member_id) do nothing;
  exception when others then
    raise warning 'event_chat_gathers_who_is_coming: %', sqlerrm;
  end;
  perform set_config('request.jwt.claims', coalesce(claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(claim_sub, ''), true);
  return new;
end;
$$;

revoke all on function private.event_chat_gathers_who_is_coming() from public, anon, authenticated;

-- Named to run before chat_messages_push_notify, so those added hear of it.
create trigger chat_messages_gather_event_chat
  after insert on public.chat_messages
  for each row execute function private.event_chat_gathers_who_is_coming();

create function private.rsvp_joins_the_event_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  chat uuid;
begin
  select t.id into chat
    from public.chat_threads t
   where t.event_id = new.event_id
     and exists (
       select 1 from public.chat_messages m where m.thread_id = t.id and m.notice is null
     );
  if chat is not null then
    insert into public.chat_thread_members (thread_id, member_id)
    values (chat, new.member_id)
    on conflict (thread_id, member_id) do nothing;
  end if;
  return new;
exception when others then
  raise warning 'rsvp_joins_the_event_chat: %', sqlerrm;
  return new;
end;
$$;

revoke all on function private.rsvp_joins_the_event_chat() from public, anon, authenticated;

create trigger event_rsvps_join_event_chat
  after insert on public.event_rsvps
  for each row execute function private.rsvp_joins_the_event_chat();

-- The chats already under way.
insert into public.chat_thread_members (thread_id, member_id)
select t.id, r.member_id
  from public.chat_threads t
  join public.event_rsvps r on r.event_id = t.event_id
  join public.members m on m.id = r.member_id and m.status = 'active'
 where t.event_id is not null
   and exists (
     select 1 from public.chat_messages x where x.thread_id = t.id and x.notice is null
   )
on conflict (thread_id, member_id) do nothing;
