-- A used invite lets in only the account that used it.
--
-- The security scan of 2026-10-17 (finding F1). i_am_invited(), which the
-- members insert policy trusts, counted a consumed invite for any account
-- that had claimed it or whose confirmed address it named. It has to count
-- consumed ones at all: the policy is judged after
-- consume_invite_for_new_member has marked the invite consumed. But nothing
-- recorded who consumed it, so one invite admitted two accounts:
--
--   Alice is invited and forwards her link to Bob. Bob claims the token and
--   joins, consuming the invite. Alice then signs in with Google, and the
--   consumed invite still names her address, so she joins too. If an
--   administrator deletes her, nothing is revoked (her invite_id is null)
--   and she joins again.
--
-- And a member who changed their address away from the invited one left the
-- old address able to join with no invite at all.
--
-- Now the account that consumes an invite is written on it, in claimed_by,
-- and a consumed invite counts only for that account. A pending invite counts
-- as before, for whoever claimed it or for the address it names.
-- admin_delete_member revokes every live invite tied to the member, not only
-- the one on their row.

-- --------------------------------------------- consuming records who joined
-- As 20261014020000, with claimed_by written when the invite is consumed.
create or replace function public.consume_invite_for_new_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_id uuid;
  account_email text := private.confirmed_email(new.id);
  from_code uuid;
  from_admin uuid;
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
    -- Whoever joins on it is who it was used by, whoever claimed it first.
    update public.invites
       set status = 'consumed',
           consumed_at = now(),
           claimed_by = new.id,
           claimed_at = coalesce(claimed_at, now())
     where id = matched_id;
  elsif new.invite_id is null
        and auth.uid() = new.id
        and account_email is not null
        and not public.is_blocked_email(account_email)
        and public.joining_is_open() then
    -- Credit for the code they came from, if its maker is still an active
    -- administrator. Turned off since the claim still counts: it was live then.
    select q.id, q.admin_id into from_code, from_admin
      from public.qr_code_claims c
      join public.qr_codes q on q.id = c.qr_code_id
      join public.members a on a.id = q.admin_id and a.is_admin and a.status = 'active'
     where c.account = new.id;

    insert into public.invites (
      email, status, consumed_at, claimed_by, claimed_at, joined_while_open,
      invited_by_member_id, qr_code_id
    )
    values (account_email, 'consumed', now(), new.id, now(), true, from_admin, from_code)
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

-- -------------------------------------------------------------- who may join
-- As 20261014000000, with a consumed invite counted only for who used it.
create or replace function public.i_am_invited()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from (
        select auth.uid() as id, private.confirmed_email(auth.uid()) as email
      ) me
     where me.id is not null
       and not (me.email is not null and public.is_blocked_email(me.email))
       and (
         (public.joining_is_open() and me.email is not null)
         or exists (
           select 1 from public.invites i
            where (
                    i.status = 'pending'
                    and (
                      i.claimed_by = me.id
                      or (me.email is not null and lower(i.email::text) = me.email)
                    )
                  )
               -- Consumed counts too, since the members insert policy is
               -- judged after consume_invite_for_new_member has marked it,
               -- but only for the account it was consumed by.
               or (i.status = 'consumed' and i.claimed_by = me.id)
         )
       )
  );
$$;

comment on function public.i_am_invited() is
  'True when joining is open and the caller has a CONFIRMED address, or a pending invite is claimed by the caller or names that address, or the caller is who consumed an invite; never when the address is blocked. Answers only about the caller.';

revoke all on function public.i_am_invited() from public, anon;
grant execute on function public.i_am_invited() to authenticated;

-- ------------------------------------------------ deleting revokes them all
-- As 20260912000000, revoking every live invite tied to the member.
create or replace function public.admin_delete_member(target uuid)
returns void
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  target_is_admin boolean;
  target_email text := private.confirmed_email(target);
begin
  if not public.is_admin() then
    raise exception 'Not an administrator';
  end if;
  if target = auth.uid() then
    raise exception 'You cannot delete your own account from here';
  end if;

  select is_admin into target_is_admin from public.members where id = target;
  if not found then
    raise exception 'No such member';
  end if;
  if target_is_admin then
    -- Deliberate: an administrator is removed by the service role, so two
    -- administrators cannot lock each other out of the club they run.
    raise exception 'An administrator cannot be deleted from the application';
  end if;

  -- Their own invite is revoked, which frees their address for a fresh one
  -- and returns the allowance to whoever spent it on them. So is any other
  -- live invite that would let the same account back in: one they used or
  -- claimed, and one naming their confirmed address. Revoked, not deleted:
  -- the row keeps who vouched for them and when.
  update public.invites
     set status = 'revoked', revoked_at = now()
   where status in ('pending', 'consumed')
     and (
       id = (select invite_id from public.members where id = target)
       or claimed_by = target
       or (target_email is not null and lower(email::text) = target_email)
     );

  -- Invites they issued that nobody has used yet go with them. The issuer is
  -- the reason those addresses are on the list, and a standing invite from an
  -- account that no longer exists is a door left open by nobody.
  --
  -- Invites they issued that *were* used are left alone. Those are other
  -- members, already in, and revoking would free an address that is still
  -- spoken for. Their `invited_by_member_id` becomes null on the delete below,
  -- which is allowed and is the honest record: the mentor who vouched has left.
  update public.invites
     set status = 'revoked', revoked_at = now()
   where invited_by_member_id = target
     and status = 'pending';

  -- The member row goes. The auth account behind it survives and is inert:
  -- browse_members yields nothing without a membership, and rejoining still
  -- requires an invite. Deleting the auth user needs the service role.
  delete from public.members where id = target;
end;
$$;

-- ------------------------------------------------- the invites already used
-- Every consumed invite a member joined on names that member, so they keep
-- passing i_am_invited for their own row. Only members with an account:
-- claimed_by references auth.users.
update public.invites i
   set claimed_by = m.id,
       claimed_at = coalesce(i.claimed_at, i.consumed_at, now())
  from public.members m
 where m.invite_id = i.id
   and i.status = 'consumed'
   and i.claimed_by is distinct from m.id
   and exists (select 1 from auth.users u where u.id = m.id);
