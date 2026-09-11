-- ============================================================================
-- browse_members: expose is_admin, so an official account can look like one
-- ============================================================================
-- The club's own account answers questions and is run by whoever administers
-- the club. It should be recognisable as that rather than sitting in the deck
-- pretending to be a peer with a blank profile.
--
-- Publishing the flag to members is deliberate, not a leak: knowing which
-- account is official is the entire point, and it is the same knowledge as
-- "this is the account that will answer you". It grants nothing — every
-- administrative action is gated on is_admin() server-side.
-- ============================================================================

drop view if exists public.browse_members;

create view public.browse_members as
select
  id,
  type,
  display_name,
  photo_path,
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
  is_admin,
  created_at
from public.members
where show_in_browse
  and status = 'active'
  -- The viewer has to be in the club too.
  and exists (
    select 1
    from public.members viewer
    where viewer.id = auth.uid()
      and viewer.status = 'active'
  );

revoke all on public.browse_members from anon;
revoke all on public.browse_members from public;

grant select on public.browse_members to authenticated;
