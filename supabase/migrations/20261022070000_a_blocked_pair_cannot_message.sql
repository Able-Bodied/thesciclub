-- ============================================================================
-- A blocked pair cannot message each other
-- ============================================================================
-- The owner, 2026-10-21 (20261022050000): once either has blocked the other,
-- neither can start a direct conversation, and one they already have takes
-- no new message from either side. Refused here, not only on the screen.
--
-- Every refusal says the same neutral "You can't message this member.",
-- which is all the owner allows the blocked member to learn. Adding one of
-- the pair to a group by the other is refused with the sentence a member who
-- cannot be found already gets. Both can still be in a group somebody else
-- made, or an event's; 20261022060000 hides what the blocked one says there.
-- ============================================================================

-- As 20260918080000, refusing a blocked pair before an existing thread is
-- returned.
create or replace function public.chat_open_direct(other uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  key text;
  found_thread uuid;
begin
  if not public.is_active_member() then
    raise exception 'Only an active member can start a conversation.' using errcode = '42501';
  end if;

  if other is null or other = me then
    raise exception 'A conversation needs somebody else in it.' using errcode = '22023';
  end if;

  if public.members_blocked(me, other) then
    raise exception 'You can''t message this member.' using errcode = '42501';
  end if;

  key := least(me, other)::text || ':' || greatest(me, other)::text;

  select t.id into found_thread from public.chat_threads t where t.direct_key = key;
  if found_thread is not null then
    return found_thread;
  end if;

  if not public.chat_is_findable(other) then
    raise exception 'That member cannot be messaged.' using errcode = 'P0002';
  end if;

  insert into public.chat_threads (kind, direct_key, created_by)
  values ('direct', key, me)
  on conflict (direct_key) do nothing
  returning id into found_thread;

  if found_thread is null then
    select t.id into found_thread from public.chat_threads t where t.direct_key = key;
  end if;

  insert into public.chat_thread_members (thread_id, member_id)
  values (found_thread, me), (found_thread, other)
  on conflict (thread_id, member_id) do nothing;

  return found_thread;
end;
$$;

-- A message into a direct conversation between a blocked pair, either way.
create function public.chat_refuse_blocked_message()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1
      from public.chat_threads t
      join public.chat_thread_members o
        on o.thread_id = t.id and o.member_id is distinct from new.author_id
     where t.id = new.thread_id and t.kind = 'direct'
       and public.members_blocked(new.author_id, o.member_id)
  ) then
    raise exception 'You can''t message this member.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.chat_refuse_blocked_message() from public, anon, authenticated;

create trigger chat_messages_refuse_blocked
  before insert on public.chat_messages
  for each row execute function public.chat_refuse_blocked_message();

-- One of a blocked pair adding the other to a group: chat_create_group and
-- chat_add_to_group both insert here as the adder. Joining yourself (an
-- event's group) is not adding anybody.
create function public.chat_refuse_blocked_group_add()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null
     and new.member_id <> auth.uid()
     and public.members_blocked(auth.uid(), new.member_id)
     and exists (select 1 from public.chat_threads t where t.id = new.thread_id and t.kind = 'group')
  then
    raise exception 'That member cannot be added to a group.' using errcode = 'P0002';
  end if;
  return new;
end;
$$;
revoke all on function public.chat_refuse_blocked_group_add() from public, anon, authenticated;

create trigger chat_thread_members_refuse_blocked
  before insert on public.chat_thread_members
  for each row execute function public.chat_refuse_blocked_group_add();
