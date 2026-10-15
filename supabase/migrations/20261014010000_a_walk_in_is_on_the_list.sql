-- ============================================================================
-- Somebody who joins while joining is open goes on the list
-- ============================================================================
-- The owner, 2026-10-14: a walk-in (20261014000000) should show on Admin's
-- invite list like anybody else, with their address, and say under it that
-- they joined when invite only was off.
--
-- So when a member row is made with no invite to consume, while joining is
-- open, consume_invite_for_new_member writes the invite the walk-in never had:
-- their confirmed address, already used, claimed by them, and marked
-- joined_while_open. members.invite_id points at it, as it would at any other.
--
-- Easy to get wrong:
--   * invites_require_inviter refuses an invite with nobody behind it. A
--     walk-in has nobody, so that rule now excuses joined_while_open rows.
--   * invites_refuse_blocked raises its own message. A blocked address is
--     never written here (it is checked first), so a blocked walk-in still
--     meets the members insert policy's refusal, not a different one.
--   * The address may already be on the live list as a used invite (a rare
--     leftover). invites_live_email_idx allows one, so the write steps aside
--     and the member joins with no invite_id, rather than failing to join.
--   * Only the member making their own row (auth.uid() = new.id). Rows made
--     by the service role or a script are not walk-ins.
--   * The member_joined notification goes to whoever vouched: nobody here, so
--     it reaches nobody.
--
-- A refused insert (blocked, unconfirmed, closed again) rolls the new invite
-- back with it: it is written in the same statement.
-- ============================================================================

alter table public.invites
  add column if not exists joined_while_open boolean not null default false;

comment on column public.invites.joined_while_open is
  'Written for a member who joined while anybody could join, with no invite. Nobody vouched. See 20261014010000.';

-- ------------------------------------------------- an invite needs somebody
create or replace function public.invites_require_inviter()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.invited_by_member_id is null
     and new.invited_by_organization_id is null
     and not new.joined_while_open then
    raise exception 'An invite must come from a member organization or a mentor';
  end if;
  return new;
end;
$$;

revoke all on function public.invites_require_inviter() from public, anon, authenticated;

-- ------------------------------------------------ consuming, or writing one
-- As 20261012000000, with the walk-in's invite written when there is none.
create or replace function public.consume_invite_for_new_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_id uuid;
  account_email text := private.confirmed_email(new.id);
begin
  select i.id into matched_id
    from public.invites i
   where i.status = 'pending'
     and (
       i.claimed_by = new.id
       or (account_email is not null and lower(i.email::text) = account_email)
     )
   order by coalesce(i.claimed_by = new.id, false) desc, i.created_at
   limit 1
     for update;

  if matched_id is not null then
    update public.invites
       set status = 'consumed', consumed_at = now()
     where id = matched_id;
  elsif new.invite_id is null
        and auth.uid() = new.id
        and account_email is not null
        and not public.is_blocked_email(account_email)
        and public.joining_is_open() then
    insert into public.invites (
      email, status, consumed_at, claimed_by, claimed_at, joined_while_open
    )
    values (account_email, 'consumed', now(), new.id, now(), true)
    on conflict (email) where status in ('pending', 'consumed') and email is not null
    do nothing
    returning id into matched_id;
  end if;

  new.invite_id := coalesce(new.invite_id, matched_id);

  -- An instruction to this trigger, not a fact about the member: never
  -- stored. members_start_fresh_not_stored holds it to false afterwards.
  new.start_fresh := false;

  return new;
end;
$$;

revoke all on function public.consume_invite_for_new_member() from public, anon, authenticated;

-- ------------------------------------------------------------ admin's list
-- As 20261012000000, with joined_while_open appended.
create or replace view public.admin_invites with (security_barrier = true) as
select
  i.id,
  i.phone,
  i.phone_raw,
  i.status,
  i.note,
  i.created_at,
  i.consumed_at,
  o.name as invited_by_organization,
  inviter.display_name as invited_by_member,
  inviter.is_admin as invited_by_member_is_admin,
  claim.display_name as claimable_name,
  i.seed_member_id,
  holder.display_name as held_by,
  holder.status as held_by_status,
  (coalesce(
     private.account_created_at_for_invite(i.claimed_by, i.email::text),
     private.account_created_at(i.phone)
   ) is not null) as has_account,
  coalesce(
    private.account_created_at_for_invite(i.claimed_by, i.email::text),
    private.account_created_at(i.phone)
  ) as account_created_at,
  i.email,
  i.claimed_by,
  i.claimed_at,
  i.sent_at,
  i.joined_while_open
from public.invites i
left join public.organizations o on o.id = i.invited_by_organization_id
left join public.members inviter on inviter.id = i.invited_by_member_id
left join public.members claim on claim.id = i.seed_member_id
left join lateral (
  select h.display_name, h.status
    from public.members h
   where h.invite_id = i.id
      or (i.phone is not null and h.phone = i.phone)
   order by coalesce(h.invite_id = i.id, false) desc
   limit 1
) holder on true
where public.is_admin();
