-- ============================================================================
-- Verified professionals, who name their profession themselves
-- ============================================================================
-- The owner, 2026-11-04: an administrator makes a member a verified
-- professional without being asked for a title; the member writes it on Me
-- (set_my_professional_title, 20261104100000). Until then there is none, and
-- they are shown as a verified professional alone.
-- ============================================================================

alter table public.club_partners alter column title drop not null;

-- 20261029100000's, with the title optional: none keeps the one they have.
create or replace function public.admin_set_partner(p_member uuid, p_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean text := nullif(btrim(coalesce(p_title, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Not an administrator' using errcode = '42501';
  end if;
  if clean is not null and (char_length(clean) < 2 or char_length(clean) > 80) then
    raise exception 'Give them a profession of 2 to 80 characters, such as "Physical therapist, SCI-FIT".'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.members m where m.id = p_member and m.status = 'active' and not m.is_seed) then
    raise exception 'Only a member who has joined and is active can be a verified professional.' using errcode = 'P0002';
  end if;
  insert into public.club_partners (member_id, title, granted_by)
  values (p_member, clean, auth.uid())
  on conflict (member_id) do update
    set title = coalesce(excluded.title, public.club_partners.title), updated_at = now();
end;
$$;

revoke all on function public.admin_set_partner(uuid, text) from public, anon;
grant execute on function public.admin_set_partner(uuid, text) to authenticated;
