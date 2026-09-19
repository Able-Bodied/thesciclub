-- ============================================================================
-- Chat, migration 1: who is in the club, and who wrote this
-- ============================================================================
-- Nothing member-facing here. Two predicates and one projection that every
-- later chat migration leans on, landed on their own so that the tables which
-- follow read as tables rather than as tables plus a pile of boilerplate.
--
-- ---------------------------------------------------------------------------
-- is_active_member() and is_member()
-- ---------------------------------------------------------------------------
-- `exists (select 1 from public.members m where m.id = auth.uid() and
-- m.status = 'active')` has been copy-pasted into a policy at a time since the
-- beginning — event_rsvps, event_dismissals, organization_follows, and the
-- viewer check inside browse_members. Chat adds a dozen more policies, and a
-- dozen more copies of a predicate is a dozen more places for one of them to
-- be subtly the wrong one. `is_admin()` already exists and is the shape these
-- are cut to.
--
-- The split is the one event_rsvps makes: a suspended member reads and does not
-- write. So `is_member()` is the read gate and admits 'active' and 'suspended';
-- `is_active_member()` is the write gate and admits 'active' only. 'removed' is
-- in neither — a removed member's row survives so their words keep an author,
-- but the person is out of the club and reads nothing.
--
-- RequireMember sends a suspended member to the suspended screen before they
-- reach any of this, so today `is_member()` and `is_active_member()` differ
-- only in theory. That is the right way round: the component is the courtesy
-- and these are the boundary, and the boundary should not depend on a redirect
-- staying in place.
--
-- `security definer` because the caller cannot read anybody's `members` row but
-- their own — including, in the suspended case, to find out that they are. And
-- `set search_path = ''` rather than the `public, pg_temp` the older definer
-- functions use: every name below is schema-qualified anyway, so the empty path
-- costs nothing and removes the question entirely. New definer functions in
-- this feature follow suit.
--
-- ---------------------------------------------------------------------------
-- chat_authors: the one projection that names somebody in a chat
-- ---------------------------------------------------------------------------
-- browse_members cannot do this job, and the reason is exactly what it is for.
-- It hides members with `show_in_browse = false` and members who are not
-- active, which is correct for a deck of people to meet and wrong for a post
-- somebody wrote. Somebody who wrote forty posts and then turned themselves off
-- the directory has not unwritten them; through browse_members their name comes
-- back empty and every one of those posts renders as nobody.
--
-- So chat_authors carries *every* member row regardless of `show_in_browse` and
-- regardless of status, and carries only what it takes to print a byline: a
-- name, an avatar, a level. No city, no bio, no interests, no age — a hidden
-- member is visible here as an author and not as a profile.
--
-- `has_profile` is that distinction made explicit, and it is the same condition
-- browse_members selects on. True means /peers/:id will show them, so the
-- avatar links; false means it will not, so the byline is plain text. The
-- client must not work this out from the columns itself, or the day the
-- directory rule changes there will be two rules.
--
-- The viewer check is browse_members' own, verbatim and deliberately: being
-- turned away at the door and reading the room through the window are still
-- different things, and a session that merely verified a phone number gets
-- nothing here either. It uses is_member() rather than the inline exists, so a
-- suspended member reading their own history still sees names.
--
-- Photographs: the `photos` bucket's select policy is "anyone can view photos",
-- unconditional on the viewer or the subject, so a hidden member's `photo_path`
-- is readable and the avatar renders. Checked rather than assumed, because the
-- fallback if it were not would be the letter tile — and loosening a storage
-- policy to avoid a letter tile is not a trade to make quietly.
-- ============================================================================

create or replace function public.is_active_member()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.members
    where id = auth.uid() and status = 'active'
  );
$$;

comment on function public.is_active_member() is
  'The caller is a member in good standing. The write gate: posting, messaging, joining.';

create or replace function public.is_member()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.members
    where id = auth.uid() and status in ('active', 'suspended')
  );
$$;

comment on function public.is_member() is
  'The caller is in the club, suspended or not. The read gate. A removed member is not one.';

revoke all on function public.is_active_member() from public, anon;
revoke all on function public.is_member() from public, anon;
grant execute on function public.is_active_member() to authenticated;
grant execute on function public.is_member() to authenticated;

-- --------------------------------------------------------------- the byline
drop view if exists public.chat_authors;

create view public.chat_authors as
select
  m.id,
  m.display_name,
  m.photo_path,
  m.photo_alt,
  m.avatar_color,
  m.level_range,
  m.exact_level,
  m.is_admin,
  -- Whether /peers/:id will show them: browse_members' own condition, named
  -- once here rather than re-derived by whatever draws an avatar.
  (m.show_in_browse and m.status = 'active') as has_profile
from public.members m
where public.is_member();

comment on view public.chat_authors is
  'Every member, as an author: name, avatar, level. Not a profile — see has_profile. Readable only by members.';

revoke all on public.chat_authors from anon, public;
grant select on public.chat_authors to authenticated;
