-- ============================================================================
-- browse_members: a session is not membership
-- ============================================================================
-- The view was granted to `authenticated` and filtered only on the *subject*
-- being browsable. It never checked the *viewer*.
--
-- Anybody who verified a phone number therefore held a session that could read
-- every profile in the club — names, photos, injury levels, and bios that
-- describe catheters, bowel programmes and who lives with whom. An invite was
-- required to create a member row, but not to look at everybody else's.
--
-- Being turned away at the door and being able to read the room through the
-- window are different things, and only the first was implemented.
--
-- The component that redirects a non-member to the welcome screen is a
-- courtesy. This is the boundary: the view now yields nothing at all unless the
-- caller is themselves an active member. The subquery runs as the view's owner,
-- which is why it can see `members` at all.
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
