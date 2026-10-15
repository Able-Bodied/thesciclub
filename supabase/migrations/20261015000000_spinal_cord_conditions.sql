-- ============================================================================
-- A spinal cord injury or a spinal cord condition
-- ============================================================================
-- The owner, 2026-10-14: the club is for anybody with a spinal cord injury or
-- disease, so onboarding asks what kind first, on the same screen as the rest:
--
--   para          a level from T1 down
--   quad          a level in the neck
--   central_cord  central cord syndrome: neither a level nor a disease, and
--                 named that way by the people who have it
--   condition     a disease or syndrome (transverse myelitis, spina bifida,
--                 cauda equina syndrome, ...), typed in the member's words,
--                 with a level too if they know one
--
-- Both new columns are nullable: every member who joined before this has
-- neither, and reads exactly as before (their level, or its range). The level
-- columns are unchanged, and level_range is still derived from the exact level
-- by the client, so a condition with no level is 'Not sure yet' and its region
-- 'Unknown', as an unknown level always was.
--
-- The three views that show a member's level carry the two columns, appended,
-- so a card, a post and an event's list can say "Transverse myelitis" rather
-- than "Not sure yet". Each keeps its security barrier (20261003030000): a
-- create or replace without it drops it, as 20261012090000 found.
-- ============================================================================

alter table public.members
  add column if not exists injury_type text,
  add column if not exists condition_name text;

alter table public.members
  add constraint members_injury_type_check
    check (injury_type is null or injury_type in ('para', 'quad', 'central_cord', 'condition')),
  add constraint members_condition_name_check
    check (
      condition_name is null
      or (condition_name = btrim(condition_name) and char_length(condition_name) between 1 and 100)
    ),
  -- A condition's name means nothing on a para's row: changing the answer
  -- clears it, and the database holds the client to that. Coalesced: with no
  -- kind at all, `injury_type = 'condition'` is null, and a check passes null.
  add constraint members_condition_name_needs_condition
    check (condition_name is null or coalesce(injury_type = 'condition', false));

comment on column public.members.injury_type is
  'para, quad, central_cord or condition; null before 20261015000000 or when not said.';
comment on column public.members.condition_name is
  'The spinal cord condition, in the member''s words. Only with injury_type condition.';

-- ------------------------------------------------------------------- views --
-- As 20261012000000, with the two columns appended.
create or replace view public.browse_members with (security_barrier = true) as
select
  m.id,
  m.type,
  m.display_name,
  m.photo_path,
  m.photo_alt,
  m.avatar_color,
  m.city,
  m.state,
  m.level_range,
  m.exact_level,
  m.completeness,
  m.injury_date,
  m.injury_date_precision,
  m.region,
  (extract(year from age(m.birth_date::timestamptz)))::integer as age,
  m.how_injured,
  m.bio,
  m.detail,
  m.gender,
  m.languages,
  m.independence,
  m.employment,
  m.field_of_work,
  m.education,
  m.education_when,
  m.marital_status,
  m.has_children,
  m.children_when,
  m.interests,
  m.topics,
  m.self_care,
  m.affiliations,
  m.wants_to_mentor,
  m.is_seed,
  m.is_admin,
  m.created_at,
  coalesce((
    select jsonb_agg(
             jsonb_build_object('id', o.id, 'name', o.name, 'short_code', o.short_code, 'logo_path', o.logo_path)
             order by o.name, o.id)
      from public.organization_representatives r
      join public.organizations o on o.id = r.organization_id
     where r.member_id = m.id and o.removed_at is null
  ), '[]'::jsonb) as represented_organizations,
  m.sports_equipment,
  m.grants,
  m.username::text as username,
  m.injury_type,
  m.condition_name
from public.members m
where m.show_in_browse
  and m.status = 'active'
  and exists (
    select 1 from public.members viewer
     where viewer.id = auth.uid() and viewer.status = 'active'
  );

-- As 20261012010000, with the two columns appended, and the barrier.
create or replace view public.chat_authors with (security_barrier = true) as
select
  m.id,
  m.display_name,
  m.photo_path,
  m.photo_alt,
  m.avatar_color,
  m.level_range,
  m.exact_level,
  m.is_admin,
  (m.show_in_browse and m.status = 'active') as has_profile,
  m.username::text as username,
  m.injury_type,
  m.condition_name
from public.members m
where public.is_member();

-- As 20260911200000, with the two columns appended, and the barrier.
create or replace view public.event_attendees with (security_barrier = true) as
select
  r.event_id,
  r.status,
  r.created_at as rsvp_created_at,
  m.id as member_id,
  m.display_name,
  m.photo_path,
  m.photo_alt,
  m.avatar_color,
  m.city,
  m.level_range,
  m.exact_level,
  m.type,
  m.injury_type,
  m.condition_name
from public.event_rsvps r
join public.browse_members m on m.id = r.member_id;
