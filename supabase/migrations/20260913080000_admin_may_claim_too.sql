-- ============================================================================
-- An administrator vouching in their own name may attach a directory claim
-- ============================================================================
-- 20260913070000 added the club-vouches-for-itself option and kept a rule
-- alongside it: a claim still needs an organization. That was wrong, and the
-- reasoning behind it was borrowed from a policy about somebody else.
--
-- The rule it came from is in 20260910130000, and it is about mentors:
--
--   "Mentors get two invites each. If a mentor could point an invite at a
--    seeded row, they could hand a seeded person's identity to anyone they
--    liked."
--
-- That is a real risk and the protection against it is a policy on `invites`
-- requiring `seed_member_id is null` for a mentor's insert. It is untouched
-- and keeps working, because a mentor cannot call this function at all.
--
-- An administrator is not who that rule was written about. They can already
-- delete any member, block any number, change anybody's type and invite
-- anybody — so withholding a claim protects nothing, while forcing them to
-- name NorCal SCI as the voucher puts a false attribution in the record that
-- exists to say who vouched. That is exactly the lie 20260913070000 set out
-- to stop telling.
--
-- The check that matters stays: a claim may only ever point at a seeded row,
-- so an invite cannot be aimed at a real member and delete them on consumption.
-- ============================================================================

create or replace function public.admin_create_invite(
  raw_phone text,
  organization uuid default null,
  claim_member uuid default null,
  invite_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Not an administrator';
  end if;

  if length(public.normalize_phone(raw_phone)) < 11 then
    raise exception 'That does not look like a full US phone number';
  end if;

  if organization is not null
     and not exists (select 1 from public.organizations where id = organization and can_invite) then
    raise exception 'That organization cannot issue invites';
  end if;

  -- The one claim rule that is about safety rather than attribution: an
  -- invite pointed at a real member would delete them when it was consumed.
  if claim_member is not null
     and not exists (select 1 from public.members where id = claim_member and is_seed) then
    raise exception 'That profile is not one of the seeded directory entries';
  end if;

  if public.has_active_invite(raw_phone) then
    raise exception 'That number is already on the list';
  end if;

  insert into public.invites (
    phone_raw, invited_by_organization_id, invited_by_member_id, seed_member_id, note
  )
  values (
    raw_phone,
    organization,
    case when organization is null then auth.uid() end,
    claim_member,
    invite_note
  )
  returning id into new_id;

  return new_id;
end;
$$;
