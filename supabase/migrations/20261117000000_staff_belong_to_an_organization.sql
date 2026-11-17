-- ============================================================================
-- Staff belong to an organization
-- ============================================================================
-- The owner, 2026-11-16: "The admin panel you can mark somebody as
-- professional, instead of that we should be marking them as staff ... Also,
-- both mentorship and staff should have an associated organization so if we
-- are marking somebody as either staff or mentor in the admin panel, we should
-- have selection for which organization".
--
-- A verified professional (club_partners, 20261029100000) is now called
-- staff, in the app's words only: the table and its functions keep their
-- names, which the iPhone app already on phones reads. Each one now names the
-- organization they are staff of. A mentor already has theirs
-- (organization_mentors, 20261028950000); Admin now asks which one and calls
-- grant_mentor, which an administrator may for any organization.
--
-- Expand only: a new nullable column (staff made before today have none until
-- an administrator chooses one), readable as the title is, and a new
-- function. admin_set_partner stays for older copies of the app.
-- ============================================================================

alter table public.club_partners
  add column if not exists organization_id uuid references public.organizations (id) on delete set null;

comment on column public.club_partners.organization_id is
  'The organization this member is staff of, chosen by an administrator. See 20261117000000.';

create index if not exists club_partners_organization_idx
  on public.club_partners (organization_id);

-- Shown beside their name with the title, so read as the title is.
grant select (organization_id) on public.club_partners to authenticated;

-- Make a member staff of an organization, or change which one. Their
-- profession (title) is kept; they write it on Me.
create or replace function public.admin_set_staff(p_member uuid, p_organization uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not an administrator' using errcode = '42501';
  end if;
  if p_organization is null or not exists (
    select 1 from public.organizations o where o.id = p_organization and o.removed_at is null
  ) then
    raise exception 'Choose an organization in the directory.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.members m where m.id = p_member and m.status = 'active' and not m.is_seed) then
    raise exception 'Only a member who has joined and is active can be staff.' using errcode = 'P0002';
  end if;
  insert into public.club_partners (member_id, title, organization_id, granted_by)
  values (p_member, null, p_organization, auth.uid())
  on conflict (member_id) do update
    set organization_id = excluded.organization_id, updated_at = now();
end;
$$;

comment on function public.admin_set_staff(uuid, uuid) is
  'An administrator makes a member staff of an organization, or changes which. See 20261117000000.';

revoke all on function public.admin_set_staff(uuid, uuid) from public, anon;
grant execute on function public.admin_set_staff(uuid, uuid) to authenticated;
