-- ============================================================================
-- A member invites for the organizations they belong to
-- ============================================================================
-- The owner, 2026-11-05: "mentors and org members can also send invites. So
-- the list I should see should be of all the orgs I am a member of, not just
-- the ones I am an admin of."
--
-- create_my_invite took an organization only from its org admins (speaks_for)
-- or an administrator. It now also takes one the inviter is an active member
-- of. The person who joins on it joins that organization too
-- (member_joins_their_organization), so a member may do this only for an
-- organization open to all: one that approves its members first chooses them
-- itself (20261031010000), and only its org admins invite for it.
-- Nothing else changes: who may invite at all, and how many, are as before.
-- ============================================================================

create or replace function public.create_my_invite(
  raw_email text,
  note text default null,
  p_organization uuid default null
)
returns public.invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  address text := public.normalize_email(raw_email);
  chosen uuid := p_organization;
  created public.invites;
begin
  if me is null then
    raise exception 'You cannot add another invite.' using errcode = '42501';
  end if;
  -- One at a time for each inviter, so the count below sees the invite a
  -- parallel call has just made. Held to the end of the transaction.
  perform pg_advisory_xact_lock(hashtext('create_my_invite'), hashtext(me::text));

  -- The rules the direct-insert policy used to hold: an active member who may
  -- invite, within their allowance. 42501 is how the client already reads "the
  -- allowance is spent".
  if me is null
     or not exists (select 1 from public.my_invite_permissions() p where p.can_invite)
     or not (
       (select p.unlimited from public.my_invite_permissions() p)
       or public.live_invite_count(me) < public.mentor_invite_limit()
     ) then
    raise exception 'You cannot add another invite.' using errcode = '42501';
  end if;
  if not private.valid_email(address) then
    raise exception 'That does not look like an email address' using errcode = '22023';
  end if;
  if public.is_blocked_email(address) then
    raise exception 'That email address is blocked from the club and cannot be invited';
  end if;
  if exists (
    select 1 from public.invites i
     where lower(i.email::text) = address and i.status in ('pending', 'consumed')
  ) then
    raise exception 'That email address is already on the list' using errcode = '23505';
  end if;

  if chosen is not null then
    if not (
      public.speaks_for(chosen)
      or public.is_admin()
      or exists (
        select 1
          from public.organization_members om
          join public.organizations o on o.id = om.organization_id
         where om.organization_id = chosen
           and om.member_id = me
           and om.left_at is null
           and om.denied_at is null
           and o.removed_at is null
           and not o.joins_need_approval
      )
    ) then
      raise exception 'You cannot invite for that organization.' using errcode = '42501';
    end if;
  else
    select case when count(*) = 1 then (array_agg(o.id))[1] end
      into chosen
      from public.organizations o
     where o.id in (select public.my_organizations())
       and not o.is_the_club;
  end if;

  insert into public.invites (email, invited_by_member_id, note, for_organization_id)
  values (address::extensions.citext, me, nullif(btrim(coalesce(note, '')), ''), chosen)
  returning * into created;

  return created;
end;
$$;

revoke all on function public.create_my_invite(text, text, uuid) from public, anon;
grant execute on function public.create_my_invite(text, text, uuid) to authenticated;
