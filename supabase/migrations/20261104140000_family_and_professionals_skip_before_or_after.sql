-- ============================================================================
-- Nor "Before or after your injury?"
-- ============================================================================
-- The owner, 2026-11-04: family and professionals are not asked when their
-- children arrived or their education ended relative to an injury either.
-- 20261104130000's member_profile_done, with those two inside its guard.
-- ============================================================================

create or replace function public.member_profile_done(m public.members)
returns boolean language sql stable set search_path = '' as $$
  select public.profile_answered(m.gender, 'gender', m.declined)
     and public.profile_answered(m.languages, 'languages', m.declined)
     and public.profile_answered(m.bio, 'bio', m.declined)
     and public.profile_answered(m.topics, 'topics', m.declined)
     and public.profile_answered(m.marital_status, 'maritalStatus', m.declined)
     and public.profile_answered(m.has_children, 'hasChildren', m.declined)
     and public.profile_answered(m.education, 'education', m.declined)
     and public.profile_answered(m.field_of_work, 'fieldOfWork', m.declined)
     -- onlyIf: aboutAnInjury, not for family or professionals.
     and (coalesce(m.injury_type in ('family', 'professional'), false) or (
           public.profile_answered(m.how_injured, 'howInjured', m.declined)
       -- onlyIf: hasChildren is Yes.
       and (m.has_children is not true
            or public.profile_answered(m.children_when, 'childrenWhen', m.declined))
       and public.profile_answered(m.education_when, 'educationWhen', m.declined)
       and public.profile_answered(m.independence, 'independence', m.declined)
       and public.profile_answered(m.employment, 'employment', m.declined)
       and public.profile_answered(m.interests, 'interests', m.declined)
       and public.profile_answered(m.sports_equipment, 'sportsEquipment', m.declined)
       and public.profile_answered(m.grants, 'grants', m.declined)
       and public.profile_answered(m.self_care, 'selfCare', m.declined)
       -- onlyIf: self care names one of SPECIFICS_FOR (or detail is already
       -- written, which answers it anyway).
       and (not coalesce(m.self_care && array[
              'Dictation software', 'Vehicle modifications', 'Wheelchair assist devices'
            ]::text[], false)
            or public.profile_answered(m.detail, 'detail', m.declined))
       and public.profile_answered(m.wants_to_mentor, 'wantsToMentor', m.declined)
     ));
$$;
revoke all on function public.member_profile_done(public.members) from public, anon, authenticated;
