-- ============================================================================
-- Chat, migration 3: joining a discussion room
-- ============================================================================
-- Who is in which room, and the two predicates every later chat policy asks
-- about a room. Landed before topics and posts because both of those need the
-- answer to "may this person write here", and that answer is a membership plus
-- the room being open.
--
-- ---------------------------------------------------------------------------
-- Joining is not what lets you read
-- ---------------------------------------------------------------------------
-- The mock's rooms promise "the whole history from before you joined", and
-- /chat prints that sentence. So membership does not gate reading at all: an
-- open room, its topics and its posts are readable by every member, joined or
-- not. What joining buys is the right to write in it, and a place in the room's
-- member count.
--
-- That makes reading the easy case and writing the interesting one, which is
-- the right way round — the failure mode of a forum is a member who cannot
-- read the thing they were sent a link to.
--
-- ---------------------------------------------------------------------------
-- Which rooms somebody joined is theirs
-- ---------------------------------------------------------------------------
-- Select is `member_id = auth.uid()` and there is no second policy. "Sex,
-- dating & fertility" is in this table, and a list of the rooms a named member
-- joined is a statement about them they did not make to the room — the same
-- reasoning as organization_follows, and the same step-that-matters in the
-- probe. The member *count* is published (see chat_room_stats in migration 5);
-- the names behind it are not, and nothing in this feature ever returns them.
--
-- Delete is unconditional on their own row: leaving a room must never be the
-- thing that fails. Insert wants an active member and an open room. There is no
-- update policy and no update grant — the row is (room, member, joined_at) and
-- there is nothing in it to change.
--
-- ---------------------------------------------------------------------------
-- Two predicates, written once
-- ---------------------------------------------------------------------------
-- `chat_room_is_readable` and `chat_can_post_in` are the read gate and the
-- write gate for everything in a room. Both are `security definer` and both
-- spell the rule out rather than leaning on the select policy of chat_rooms.
--
-- Leaning on it was the first draft, and it was a landmine. A policy expression
-- does have RLS applied to the tables it names, so inside a *policy*
-- `exists (select 1 from public.chat_rooms where id = room_id)` really does mean
-- "a room I can see". But the same expression inside a `security definer`
-- function runs as the owner, RLS is off, and it quietly means "a room that
-- exists" — which for a closed room is the opposite answer. chat_topics_for()
-- in migration 5 is exactly such a function. One helper that is safe in both
-- places is worth the rule being written in two files.
--
-- The cost is that chat_rooms' own select policy in 20260918020000 and
-- chat_room_is_readable below say the same thing twice and must move together.
-- The probe reads a closed room's topics as a member, so a change to one and
-- not the other is caught rather than assumed.
--
-- `chat_can_post_in` is deliberately not the readable rule plus a membership.
-- An administrator may post in a *closed* room — that is the whole point of
-- them being able to see one, per the owner's decision that rooms open one at a
-- time and somebody seeds a room before members are let into it — and they need
-- no membership row to do it.
-- ============================================================================

create table if not exists public.chat_room_members (
  room_id text not null references public.chat_rooms (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, member_id)
);

comment on table public.chat_room_members is
  'Who joined which discussion room. Joining buys the right to write, not the right to read.';

-- The primary key covers (room_id, member_id); this is the other direction,
-- for "which rooms did I join" on /chat and on Me.
create index if not exists chat_room_members_member_idx
  on public.chat_room_members (member_id);

alter table public.chat_room_members enable row level security;

drop policy if exists "a member sees their own memberships" on public.chat_room_members;
create policy "a member sees their own memberships"
  on public.chat_room_members for select
  using (member_id = auth.uid());

drop policy if exists "an active member joins an open room" on public.chat_room_members;
create policy "an active member joins an open room"
  on public.chat_room_members for insert
  with check (
    member_id = auth.uid()
    and public.is_active_member()
    and exists (
      select 1 from public.chat_rooms r
      where r.id = room_id and r.opened_at is not null
    )
  );

-- No is_active_member() here on purpose. Leaving is the one thing a suspended
-- member should still be able to do, and a door that opens and does not close
-- is worse than no door.
drop policy if exists "a member leaves a room" on public.chat_room_members;
create policy "a member leaves a room"
  on public.chat_room_members for delete
  using (member_id = auth.uid());

-- `authenticated` is named deliberately — see 20260918020000's header. Without
-- it the default privileges Supabase grants on creation stay in place, and an
-- ungranted verb fails as a silent no-op instead of a refusal.
revoke all on public.chat_room_members from anon, authenticated, public;
grant select, insert, delete on public.chat_room_members to authenticated;

-- --------------------------------------------------------------- the two gates
create or replace function public.chat_room_is_readable(room text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.is_member()
     and exists (
       select 1 from public.chat_rooms r
       where r.id = room and (r.opened_at is not null or public.is_admin())
     );
$$;

comment on function public.chat_room_is_readable(text) is
  'May the caller read this room and everything in it. The twin of the chat_rooms select policy; they move together.';

create or replace function public.chat_can_post_in(room text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.is_active_member()
     and (
       -- An administrator seeds a room before anybody can see it, so no
       -- membership row and no open room is required of them.
       public.is_admin()
       or exists (
         select 1
         from public.chat_rooms r
         join public.chat_room_members m on m.room_id = r.id
         where r.id = room
           and r.opened_at is not null
           and m.member_id = auth.uid()
       )
     );
$$;

comment on function public.chat_can_post_in(text) is
  'May the caller start a topic or post in this room: active, and joined an open one — or an administrator.';

revoke all on function public.chat_room_is_readable(text) from public, anon;
revoke all on function public.chat_can_post_in(text) from public, anon;
grant execute on function public.chat_room_is_readable(text) to authenticated;
grant execute on function public.chat_can_post_in(text) to authenticated;
