-- ============================================================================
-- How far each member's profile is, for Admin → Members
-- ============================================================================
-- The owner, 2026-11-15: each member's row shows "Profile 60% · next: Work",
-- the same percentage and next step their own Me card shows, and a filter
-- lists the unfinished. The app works both out (src/routes/profile/progress.ts),
-- so this hands it what it needs: for each joined member, only the columns the
-- percentage reads. Administrators only, as admin_member_search.
--
-- Undo: supabase/undo/20261115090000.sql.
-- ============================================================================

create or replace function public.admin_member_profiles()
returns table (id uuid, profile jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not an administrator' using errcode = '42501';
  end if;
  return query
  select m.id,
         jsonb_build_object(
           'exact_level', m.exact_level, 'injury_type', m.injury_type,
           'condition_name', m.condition_name, 'injury_date', m.injury_date,
           'injury_date_precision', m.injury_date_precision,
           'city', m.city, 'state', m.state, 'photo_path', m.photo_path,
           'declined', m.declined,
           'bio', m.bio, 'children_when', m.children_when, 'detail', m.detail,
           'education', m.education, 'education_when', m.education_when,
           'employment', m.employment, 'field_of_work', m.field_of_work,
           'gender', m.gender, 'grants', m.grants, 'has_children', m.has_children,
           'how_injured', m.how_injured, 'independence', m.independence,
           'interests', m.interests, 'languages', m.languages,
           'marital_status', m.marital_status,
           'other_organizations', m.other_organizations, 'self_care', m.self_care,
           'sports_equipment', m.sports_equipment, 'topics', m.topics,
           'wants_to_mentor', m.wants_to_mentor
         )
    from public.members m
   where not m.is_seed;
end;
$$;

revoke all on function public.admin_member_profiles() from public, anon;
grant execute on function public.admin_member_profiles() to authenticated;

comment on function public.admin_member_profiles() is
  'What each joined member''s profile percentage reads, for Admin → Members. Administrators only. See 20261115090000.';
