-- ============================================================================
-- Chat, migration 8: opening a direct conversation
-- ============================================================================
-- One function, and the only way a direct thread comes into existence. It is
-- called from the Message button on a member's profile, and it either returns
-- the thread the two of them already have or makes it.
--
-- ---------------------------------------------------------------------------
-- Why it is definer, and what it therefore has to check itself
-- ---------------------------------------------------------------------------
-- It writes two roster rows, and one of them belongs to somebody else. No
-- insert policy can express that: a policy can say "this row is mine", not
-- "these two rows are one decision". So there is no insert grant on either
-- table (migration 7) and this runs as the owner.
--
-- Which means RLS is off inside it and every rule it relies on is a rule it
-- states. There are four:
--
--   1. The caller is an active member. A suspended member reads and does not
--      write, and starting a conversation is writing — it puts a row in
--      somebody else's list.
--   2. Not yourself. A thread whose direct_key is `x:x` would be a conversation
--      with one person in it, and the list would draw it as "you".
--   3. The other person is findable: active, and in the directory. A member who
--      turned themselves off the deck cannot be *found* to be messaged — the
--      planner's default, and the reason it is a default rather than an
--      invisibility: their name still shows on everything they wrote.
--   4. ...unless the thread already exists. Somebody who talked to you and then
--      left the directory, or was suspended, has not unsent what they said, and
--      a conversation that stops opening is a conversation you cannot read
--      back. Hiding yourself stops new conversations; it does not close the ones
--      you are in.
--
-- Rule 4 is why the lookup comes first and the findable test second. Written the
-- other way round the function would refuse to reopen a thread it can see.
--
-- ---------------------------------------------------------------------------
-- The race, and why on conflict do nothing then re-select
-- ---------------------------------------------------------------------------
-- Two people tapping Message on each other at the same moment both find
-- nothing and both insert. `direct_key` is unique and is computed the same way
-- from either end — least/greatest over the pair, so A→B and B→A are one string
-- — so one insert wins and the other is swallowed by `on conflict do nothing`.
-- The re-select afterwards is what makes the loser correct rather than empty: it
-- returns the winner's thread, both of them are looking at the same
-- conversation, and neither had to retry.
--
-- The roster insert is `on conflict do nothing` for the same reason. If the
-- thread row was the loser's, the winner has already written both rows.
-- ============================================================================

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

  -- Ordered, so that the pair has one key and not two. See the header.
  key := least(me, other)::text || ':' || greatest(me, other)::text;

  select t.id into found_thread from public.chat_threads t where t.direct_key = key;
  if found_thread is not null then
    return found_thread;
  end if;

  -- Only now. A thread that exists reopens whatever has become of the person on
  -- the other end of it — rule 4 in the header.
  if not exists (
    select 1 from public.members m
    where m.id = other and m.status = 'active' and m.show_in_browse
  ) then
    raise exception 'That member cannot be messaged.' using errcode = 'P0002';
  end if;

  insert into public.chat_threads (kind, direct_key, created_by)
  values ('direct', key, me)
  on conflict (direct_key) do nothing
  returning id into found_thread;

  -- Null means somebody else's insert won the race. Theirs is the thread.
  if found_thread is null then
    select t.id into found_thread from public.chat_threads t where t.direct_key = key;
  end if;

  insert into public.chat_thread_members (thread_id, member_id)
  values (found_thread, me), (found_thread, other)
  on conflict (thread_id, member_id) do nothing;

  return found_thread;
end;
$$;

comment on function public.chat_open_direct(uuid) is
  'The conversation between the caller and one other member, made if it is not there. The only way a direct thread is created.';

revoke all on function public.chat_open_direct(uuid) from public, anon;
grant execute on function public.chat_open_direct(uuid) to authenticated;
