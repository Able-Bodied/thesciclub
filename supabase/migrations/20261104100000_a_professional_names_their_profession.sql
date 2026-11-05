-- ============================================================================
-- A professional names their own profession
-- ============================================================================
-- The owner, 2026-11-04: trusted partners are called professionals, and each
-- writes on Me the profession shown beside their name ("Physical therapist,
-- SCI-FIT"). Until now only an administrator could (20261029100000). Making
-- somebody a professional is still an administrator's alone.
-- ============================================================================

create function public.set_my_professional_title(p_title text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean text := btrim(coalesce(p_title, ''));
begin
  if not private.is_partner(auth.uid()) then
    raise exception 'Only a professional names their profession.' using errcode = '42501';
  end if;
  if char_length(clean) < 2 or char_length(clean) > 80 then
    raise exception 'Write your profession in 2 to 80 characters, such as "Physical therapist, SCI-FIT".'
      using errcode = '22023';
  end if;
  update public.club_partners
     set title = clean, updated_at = now()
   where member_id = auth.uid();
  return clean;
end;
$$;

revoke all on function public.set_my_professional_title(text) from public, anon;
grant execute on function public.set_my_professional_title(text) to authenticated;
