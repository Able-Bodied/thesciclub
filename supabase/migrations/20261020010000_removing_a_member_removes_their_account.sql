-- ============================================================================
-- Removing a member removes their sign-in account
-- ============================================================================
-- The owner, 2026-10-20: a member an administrator deleted, invited again,
-- got no confirmation email on joining, and Admin listed them as "signed up,
-- never finished joining". admin_delete_member (20261018010000) deleted the
-- member row and kept the auth account, so the address still had a confirmed
-- account: Supabase answers a sign-up for one without sending anything, and
-- the invite list read the account as a sign-up in progress.
--
-- CONTEXT.md "Leaving" already says a removed member's account is gone, as a
-- deleted one's is. Now it is: the same as 20261018010000 with the auth user
-- deleted last. Every table pointing at it cascades or sets null; a block on
-- the address (blocked_emails) is separate and still keeps them out.
-- ============================================================================

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

  -- The member row goes, then the sign-in account, as delete_my_account does
  -- (20261012000000): signed out everywhere, and the address free to be
  -- invited and join again.
  delete from public.members where id = target;
  delete from auth.users where id = target;
end;
$$;
