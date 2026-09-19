-- ============================================================================
-- Chat, migration 2: the twelve discussion rooms, all of them shut
-- ============================================================================
-- The rooms themselves and nothing that goes in them. Topics, posts and who
-- joined which room are the next migration; this one is the list, who may see
-- it, and the one control an administrator has over it.
--
-- ---------------------------------------------------------------------------
-- Why every room is seeded closed
-- ---------------------------------------------------------------------------
-- CONTEXT.md records the objection that kept topic rooms deferred, and it has
-- not stopped being true: a room of two dozen members is empty by
-- construction. The club has five members who are not seeded directory rows.
-- Twelve rooms opened at once is twelve rooms with nothing in them, which is
-- the "looks finished and does nothing" failure the same document rules out.
--
-- So `opened_at` is null on all twelve and the owner's decision is that they
-- open one at a time, from /admin, once there is somebody to fill one. Until an
-- administrator opens a room, a member cannot see that it exists — the select
-- policy, not a filter on the client.
--
-- `opened_at` is a timestamp rather than an `is_open` boolean because the date
-- a room opened is worth having and costs nothing to keep. Closing a room sets
-- it back to null, which does lose that date; a room that has been opened and
-- shut again is not a case anybody has yet, and a closed_at column for it would
-- be a second piece of state to keep consistent with the first.
--
-- ---------------------------------------------------------------------------
-- Names, descriptions, icons and categories come from the mock verbatim
-- ---------------------------------------------------------------------------
-- docs/index.html's ROOMS, copied rather than rewritten: the twelve subjects
-- are the mock's editorial work and they are good, and they are the part of it
-- that is not fiction. The mock's *threads* are invented and none of them are
-- here — CONTEXT.md forbids invented content, and a seeded post by a member who
-- does not exist is exactly that.
--
-- `sort_order` carries both orders at once. Rooms are drawn grouped by
-- category, and ordering the categories by the lowest sort_order in each gives
-- Body, Life, Kit — the mock's order — without a second column that could
-- disagree with this one. Rooms 1-5 are Body, 6-10 are Life, 11-12 are Kit.
--
-- The icons are text glyphs, not emoji, and they are decorative: the room's
-- name is printed beside every one of them. Nothing depends on a particular
-- font having them.
--
-- ---------------------------------------------------------------------------
-- Who may read the list, and who may change it
-- ---------------------------------------------------------------------------
-- Select is `is_member() and (opened_at is not null or is_admin())`. The
-- is_member() half is the same door as chat_authors and browse_members: a
-- session that verified a phone number and was never invited is not a member
-- and gets nothing. The second half is what "opened one at a time" means, and
-- an administrator is exempt from it because somebody has to be able to look at
-- a room before it is shown to anybody.
--
-- There is no insert, update or delete policy and no grant for any of them. The
-- twelve rooms are content, not member-generated, and the single thing an
-- administrator does to one goes through admin_set_room_open() — a definer
-- function that refuses in a sentence rather than an update policy that fails
-- as a silent no-op. An RLS update that matches no rows reports success, which
-- is the shape of half the bugs this project has had.
--
-- The parameter is `is_open` and not `open`: inside plpgsql, `open` at the head
-- of a statement is the cursor keyword, and a parameter that shadows it is a
-- trap set for whoever edits this next.
--
-- ---------------------------------------------------------------------------
-- `revoke all from anon, public` is not enough, and never was
-- ---------------------------------------------------------------------------
-- Found by running supabase/tests/chat-rooms.sql step 6 rather than by reading
-- it. Supabase ships `alter default privileges ... grant all on tables to anon,
-- authenticated, service_role`, so a table is born with every privilege already
-- granted to `authenticated`. Revoking from `anon` and `public` — which is what
-- every earlier migration in this repo does — leaves `authenticated` holding
-- insert, update, delete and truncate, and the subsequent `grant select` adds
-- nothing it did not already have.
--
-- RLS still stops the writes, but it stops them the quiet way: with no update
-- policy, `update chat_rooms ...` reports `UPDATE 0` and succeeds. A silent
-- no-op is the exact shape of half this project's bugs, and it means the second
-- line of defence is the only line of defence. So the revoke names
-- `authenticated` too, and the write verbs fail with `permission denied` as the
-- rule in the plan intends. Every chat table below follows suit.
--
-- The older tables are left alone. Changing their grants is a separate change
-- with its own blast radius, and it belongs in its own commit.
-- ============================================================================

create table if not exists public.chat_rooms (
  -- A slug, not a uuid. It is in the URL (/chat/rooms/bowel), it is what the
  -- topic-to-room map keys on, and there are twelve of them forever.
  id text primary key,
  name text not null,
  description text not null,
  category text not null check (category in ('Body', 'Life', 'Kit')),
  icon text not null,
  sort_order int not null,
  opened_at timestamptz
);

comment on table public.chat_rooms is
  'The twelve discussion rooms. Seeded closed; an administrator opens them one at a time.';
comment on column public.chat_rooms.opened_at is
  'When an administrator opened the room. Null means closed, and closed means invisible to members.';

alter table public.chat_rooms enable row level security;

drop policy if exists "members see open rooms, admins see all" on public.chat_rooms;
create policy "members see open rooms, admins see all"
  on public.chat_rooms for select
  using (public.is_member() and (opened_at is not null or public.is_admin()));

-- `authenticated` is named deliberately — see the header. Without it the
-- default privileges Supabase grants on creation stay, and a member's update
-- fails as a silent no-op instead of a refusal.
revoke all on public.chat_rooms from anon, authenticated, public;
grant select on public.chat_rooms to authenticated;

-- ----------------------------------------------------------------- the twelve
-- `on conflict do nothing` rather than an upsert: re-running this must not
-- reopen a room an administrator has closed, or undo an edit to a description.
insert into public.chat_rooms (id, name, description, category, icon, sort_order) values
  ('bowel', 'Bowel management',
   'The one nobody talks about anywhere else. Programmes, timing, travel, and what to do when it goes wrong.',
   'Body', '◍', 1),
  ('bladder', 'Bladder & catheters',
   'Intermittent, suprapubic, Mitrofanoff, Foley. UTIs, supplies, and getting through a work day.',
   'Body', '◌', 2),
  ('skin', 'Skin & pressure sores',
   'Prevention, cushions, what a stage two actually looks like, and how long people were really down for.',
   'Body', '▣', 3),
  ('pain', 'Pain management',
   'Neuropathic pain, shoulders, spasticity. What worked, what did not, what people wish they had tried sooner.',
   'Body', '◈', 4),
  ('aging', 'Aging with SCI',
   'Shoulders, transitions to power, bone density, and what changes at year twenty and year thirty.',
   'Body', '◐', 5),
  ('newsci', 'Newly injured',
   'First weeks, first year. Rehab, going home, and the questions that feel too basic to ask out loud.',
   'Life', '✦', 6),
  ('intimacy', 'Sex, dating & fertility',
   'Dating after injury, what to say and when, function, fertility. Plain language, no euphemisms.',
   'Life', '♡', 7),
  ('work', 'Work & school',
   'Going back, starting over, accommodations, disclosure, and what employers actually do.',
   'Life', '▤', 8),
  ('sport', 'Adaptive sport',
   'Rugby, handcycling, monoski, basketball. Where to try things, and what the first session is really like.',
   'Life', '◎', 9),
  ('funding', 'Funding & benefits',
   'SSI and SSDI, Medi-Cal, the Department of Rehab, grants, and the paperwork nobody explains.',
   'Life', '◇', 10),
  ('equip', 'Equipment & assistive tech',
   'Chairs, cushions, power assist, mounts, dictation. The stuff you only find out about from someone who owns one.',
   'Kit', '⚙', 11),
  ('driving', 'Driving & vehicles',
   'Hand controls, evaluations, funding, transfers, and loading the chair without taking it apart.',
   'Kit', '⛭', 12)
on conflict (id) do nothing;

-- ------------------------------------------------------- opening and closing
create or replace function public.admin_set_room_open(room text, is_open boolean)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  result timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can open or close a room.'
      using errcode = '42501';
  end if;

  update public.chat_rooms
     -- Opening a room that is already open keeps the date it first opened, so
     -- a double tap on the switch is not a rewrite of history.
     set opened_at = case when is_open then coalesce(opened_at, now()) else null end
   where id = room
  returning opened_at into result;

  if not found then
    raise exception 'There is no room called %.', room using errcode = 'P0002';
  end if;

  return result;
end;
$$;

comment on function public.admin_set_room_open(text, boolean) is
  'Open or close a discussion room. Administrators only; returns the room''s opened_at.';

revoke all on function public.admin_set_room_open(text, boolean) from public, anon;
grant execute on function public.admin_set_room_open(text, boolean) to authenticated;
