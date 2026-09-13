-- ============================================================================
-- The admin list distinguishes a mentor from an organization, and says whether
-- somebody ever actually signed up
-- ============================================================================
-- Two questions an administrator could not answer from `/admin`, both about
-- invites that are not doing what they were meant to.
--
-- ---------------------------------------------------------------------------
-- 1. Who vouched — and whether they were a person or an organization
-- ---------------------------------------------------------------------------
-- The view has carried `invited_by_organization` and `invited_by_member` as
-- separate columns since it was written, and the page collapsed them into one
-- name: `organization ?? member ?? 'unknown'`. So "NorCal SCI" and "Todd" read
-- identically, and there was no way to tell an organization's invite from a
-- mentor's — which is the difference that matters when a number turns out to
-- belong to somebody who should not be here. That is a rendering problem and
-- is fixed in the page, not here.
--
-- What this migration adds is the count on the other side: how many of their
-- two a mentor has spent. Without it, answering "has Todd used his invites"
-- meant reading the whole invite list and matching names by eye.
--
-- ---------------------------------------------------------------------------
-- 2. Whether the person ever signed up at all
-- ---------------------------------------------------------------------------
-- `held_by` answers "is there a member on this number", which is not the same
-- question as "did anybody ever try". An invite reads "not used yet" in three
-- quite different situations:
--
--   a. Nobody has touched it. The number is waiting.
--   b. They verified the number, landed in onboarding, and abandoned it. The
--      invite is still pending, because it is consumed by a trigger on the
--      *member* insert, and no member row was ever written.
--   c. They joined and were later deleted, which revokes the invite.
--
-- (b) is invisible today and is the one an administrator would act on: the
-- person tried, something stopped them, and nobody knows. So the view reports
-- whether an auth account exists for the number.
--
-- Only that, and only to administrators. `where public.is_admin()` already
-- gates every row, and the two columns added say that an account exists and
-- when it was made — not the session, not the last sign-in, nothing about what
-- they did. The join is on `phone`, for the same reason the holder join is:
-- Supabase auth stores the verified number as digits with the country code and
-- no '+', which is exactly what `invites.phone` normalizes to.
--
-- This is a view over `auth.users`, which `authenticated` cannot read
-- directly. That is deliberate and is why the column set is this narrow: the
-- view is the whole of the exposure, and widening it later should be as
-- considered as adding it was.
-- ============================================================================

drop view if exists public.admin_invites;

create view public.admin_invites as
select
  i.id,
  i.phone,
  i.phone_raw,
  i.status,
  i.note,
  i.created_at,
  i.consumed_at,
  o.name as invited_by_organization,
  inviter.display_name as invited_by_member,
  claim.display_name as claimable_name,
  i.seed_member_id,
  holder.display_name as held_by,
  holder.status as held_by_status,
  -- Whether anybody has ever verified this number. See (b) above: an invite
  -- with an account and no member is somebody who started and stopped.
  (u.id is not null) as has_account,
  u.created_at as account_created_at
from public.invites i
left join public.organizations o on o.id = i.invited_by_organization_id
left join public.members inviter on inviter.id = i.invited_by_member_id
left join public.members claim on claim.id = i.seed_member_id
left join public.members holder on holder.phone = i.phone
left join auth.users u on u.phone = i.phone
where public.is_admin();

revoke all on public.admin_invites from anon, public;
grant select on public.admin_invites to authenticated;

-- ---------------------------------------------------------------- the roster
-- `invites_used` is live_invite_count(), the same function the insert policy
-- caps on, so the roster and the policy cannot disagree about what a mentor
-- has spent. It is computed for everybody rather than only mentors — a peer
-- who once was a mentor can still hold invites they issued, and reporting
-- zero for them would hide exactly that.
drop view if exists public.admin_members;

create view public.admin_members as
select
  m.id,
  m.display_name,
  m.phone,
  m.type,
  m.status,
  m.is_admin,
  m.is_seed,
  m.city,
  m.state,
  m.level_range,
  m.exact_level,
  m.show_in_browse,
  m.created_at,
  m.updated_at,
  public.live_invite_count(m.id) as invites_used
from public.members m
where public.is_admin();

revoke all on public.admin_members from anon, public;
grant select on public.admin_members to authenticated;
