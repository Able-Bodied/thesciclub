-- ============================================================================
-- Whoever edits an organization can give it a logo
-- ============================================================================
-- Logos have been files put in the bucket by hand (20260911260000), so four in
-- five organizations showed only their short code and nobody in the app could
-- change that. The editor on Admin → Organizations and /organizations/manage
-- now takes a picture, and the same people who may change an organization's
-- words may change its picture: an administrator, or an active organization
-- account linked to it. The rule is save_organization's, stated once here as
-- can_edit_organization() so storage and the column cannot disagree.
--
-- ---------------------------------------------------------------------------
-- Where the files go
-- ---------------------------------------------------------------------------
-- organizations/<organization id>/<random>.<ext>. The id folder is what the
-- storage policies check; the random name means a new logo is a new URL, so a
-- signed URL cached for the old one cannot show it after the change. Reading
-- is unchanged: any signed-in account may read organizations/
-- (20261001000000), because a logo is shown before membership too.
--
-- The seeded organizations/ncs.webp sits outside any id folder. It stays
-- readable, and replacing NorCal SCI's logo leaves that file where it is
-- rather than letting an organization account delete something it did not
-- upload.
--
-- ---------------------------------------------------------------------------
-- Order
-- ---------------------------------------------------------------------------
-- The client uploads, then calls set_organization_logo, then deletes the old
-- file. A failure after the upload costs bytes; the other order could leave a
-- row pointing at nothing. The function refuses a path that is not in this
-- organization's folder or that was not uploaded, so the column only ever
-- names a file that exists and that its editor put there.
-- ============================================================================

create or replace function public.can_edit_organization(organization uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.organizations o
    where o.id = organization and o.removed_at is null
  )
  and (
    public.is_admin()
    or (
      public.speaks_for(organization)
      and exists (
        select 1 from public.members
        where id = auth.uid() and type = 'organization' and status = 'active'
      )
    )
  );
$$;

comment on function public.can_edit_organization(uuid) is
  'An administrator, or an active organization account linked to it. The same rule save_organization applies to an existing organization.';

revoke all on function public.can_edit_organization(uuid) from public, anon;
grant execute on function public.can_edit_organization(uuid) to authenticated;

-- Parsed by hand rather than cast in the policy: a folder that is not a uuid
-- would make the cast raise, and a policy that raises refuses with an error
-- nobody can read instead of a plain no.
create or replace function public.organization_logo_is_writable(object_name text)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  parts text[] := storage.foldername(object_name);
begin
  if coalesce(cardinality(parts), 0) <> 2
    or parts[1] <> 'organizations'
    or parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.can_edit_organization(parts[2]::uuid);
end;
$$;

comment on function public.organization_logo_is_writable(text) is
  'Whether the caller may write this object: organizations/<id>/<file> for an organization they can edit. Read by the photos bucket''s insert and delete policies.';

revoke all on function public.organization_logo_is_writable(text) from public, anon;
grant execute on function public.organization_logo_is_writable(text) to authenticated;

drop policy if exists "an organization's editor uploads its logo" on storage.objects;
create policy "an organization's editor uploads its logo"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'photos' and public.organization_logo_is_writable(name));

drop policy if exists "an organization's editor deletes its logo" on storage.objects;
create policy "an organization's editor deletes its logo"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'photos' and public.organization_logo_is_writable(name));

-- Returns the path it replaced, so the client can delete that file.
create or replace function public.set_organization_logo(organization uuid, logo_path text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous text;
begin
  if not public.can_edit_organization(organization) then
    raise exception 'You cannot change this organization.' using errcode = '42501';
  end if;
  if logo_path is not null then
    if logo_path !~ ('^organizations/' || organization::text || '/[A-Za-z0-9_-]{1,80}\.[a-z0-9]{1,5}$') then
      raise exception 'That picture is not in this organization''s folder.' using errcode = '22023';
    end if;
    if not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'photos' and o.name = set_organization_logo.logo_path
    ) then
      raise exception 'That picture was not uploaded.' using errcode = 'P0002';
    end if;
  end if;
  select o.logo_path into previous
    from public.organizations o where o.id = organization for update;
  update public.organizations o
    set logo_path = set_organization_logo.logo_path
    where o.id = organization;
  return previous;
end;
$$;

comment on function public.set_organization_logo(uuid, text) is
  'Points an organization at a logo its editor uploaded to organizations/<id>/, or at none. Returns the previous path.';

revoke all on function public.set_organization_logo(uuid, text) from public, anon;
grant execute on function public.set_organization_logo(uuid, text) to authenticated;
