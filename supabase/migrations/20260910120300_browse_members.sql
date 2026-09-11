-- ============================================================================
-- browse_members — the one projection through which a member sees another
-- ============================================================================
-- `public.members` keeps own-row-only RLS. That is deliberate and it stays: a
-- direct `select * from members` can never return somebody else's row, so it
-- can never leak a phone number no matter what the client asks for.
--
-- The Peers deck obviously has to show other people. Rather than loosening the
-- table's select policy — which would put `phone` and `birth_date` one
-- `select *` away from any client — every browse surface reads this view, and
-- this view does not select those two columns at all. `BrowseMember` in
-- src/types/domain.ts makes the same cut in TypeScript, so neither one alone
-- is load-bearing.
--
-- ---------------------------------------------------------------------------
-- Why this view is intentionally SECURITY DEFINER
-- ---------------------------------------------------------------------------
-- It is created WITHOUT `security_invoker = true`, i.e. with the Postgres
-- default, so it runs as its owner and the underlying own-row-only RLS is not
-- re-applied per caller. That is the entire point: with security_invoker on,
-- every member would browse a deck containing exactly themselves.
--
-- The safety comes from the view's own definition, not from RLS underneath it:
-- the column list excludes the two sensitive columns, the WHERE clause honours
-- each member's show_in_browse opt-out and drops anybody not in good standing,
-- and access is granted only to `authenticated`. There is no argument a caller
-- can pass that widens any of those.
--
-- Supabase's linter WILL flag this with `security_definer_view`. That warning
-- is expected and is being accepted knowingly. Do not "fix" it by adding
-- security_invoker = true — that silently empties the deck rather than
-- erroring, which is the worst possible failure mode.
--
-- ---------------------------------------------------------------------------
-- Who can read it
-- ---------------------------------------------------------------------------
-- `authenticated` only. docs/CONTEXT.md draws the line here: events are public,
-- people are not. `anon` and `public` are revoked explicitly rather than merely
-- not granted, because a security-definer view is exactly the object where an
-- inherited or default grant would be a real leak.
-- ============================================================================

drop view if exists public.browse_members;

create view public.browse_members as
select
  id,
  type,
  display_name,
  photo_url,
  photo_alt,
  avatar_color,
  city,
  state,
  level_range,
  exact_level,
  completeness,
  injury_date,
  injury_date_precision,
  region,
  -- Age, derived on read. A stored age is wrong within a year, and birth_date
  -- itself never crosses this boundary.
  extract(year from age(birth_date))::int as age,
  how_injured,
  bio,
  detail,
  gender,
  languages,
  independence,
  employment,
  field_of_work,
  education,
  education_when,
  marital_status,
  has_children,
  children_when,
  interests,
  topics,
  self_care,
  affiliations,
  wants_to_mentor,
  is_seed,
  created_at
from public.members
where show_in_browse
  and status = 'active';

revoke all on public.browse_members from anon;
revoke all on public.browse_members from public;

grant select on public.browse_members to authenticated;
