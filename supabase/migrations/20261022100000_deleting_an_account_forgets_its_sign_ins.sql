-- ============================================================================
-- Deleting an account forgets its sign-ins
-- ============================================================================
-- The owner, 2026-10-22: a deleted member's email address and IP address go
-- from Supabase's sign-in log too, and the Privacy Policy says so.
--
-- auth.audit_log_entries keeps a row for each sign-in, sign-up, password
-- change and token refresh, with the IP address in ip_address and, in the
-- payload (json), actor_id and actor_username (the email address). Actions
-- taken on an account by somebody else name it in traits.user_id and
-- traits.user_email instead. Deleting auth.users touches none of it.
--
-- private.forget_sign_in_log removes every row naming the account, by id or
-- by its email address, and runs just before the auth user goes in both ways
-- an account is deleted: delete_my_account (20261012000000) and
-- admin_delete_member (20261020010000), otherwise unchanged.
--
-- Supabase's own platform logs (Logs Explorer) are outside the database and
-- expire on their own; nothing here reaches them.
-- ============================================================================

create or replace function private.forget_sign_in_log(account uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  address text;
begin
  select lower(u.email::text) into address from auth.users u where u.id = account;

  delete from auth.audit_log_entries a
   where a.payload ->> 'actor_id' = account::text
      or a.payload -> 'traits' ->> 'user_id' = account::text
      or (address is not null and (
            lower(a.payload ->> 'actor_username') = address
         or lower(a.payload -> 'traits' ->> 'user_email') = address));
end;
$$;

revoke all on function private.forget_sign_in_log(uuid) from public, anon, authenticated;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  my_email text;
  my_phone text;
  me_admin boolean;
begin
  if me is null then
    raise exception 'You are not signed in.';
  end if;

  select m.is_admin into me_admin from public.members m where m.id = me;
  if me_admin then
    raise exception 'An administrator''s account cannot be deleted from the app. Ask another administrator.';
  end if;

  -- Only addresses and numbers Auth has verified free an invite. members.phone
  -- is typed by the member and could name somebody else's.
  my_email := private.confirmed_email(me);
  my_phone := public.normalize_phone(auth.jwt() ->> 'phone');

  update public.invites
     set status = 'revoked', revoked_at = now()
   where invited_by_member_id = me
     and status = 'pending';

  delete from public.members where id = me;

  delete from public.invites
   where claimed_by = me
      or (my_email is not null and lower(email::text) = my_email)
      or (my_phone <> '' and phone = my_phone);

  perform private.forget_sign_in_log(me);
  delete from auth.users where id = me;
end;
$$;

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

  -- Their own invite, and any other live one that would let the same account
  -- back in, is revoked (20261020010000 says why).
  update public.invites
     set status = 'revoked', revoked_at = now()
   where status in ('pending', 'consumed')
     and (
       id = (select invite_id from public.members where id = target)
       or claimed_by = target
       or (target_email is not null and lower(email::text) = target_email)
     );

  -- Invites they issued that nobody has used yet go with them.
  update public.invites
     set status = 'revoked', revoked_at = now()
   where invited_by_member_id = target
     and status = 'pending';

  delete from public.members where id = target;
  perform private.forget_sign_in_log(target);
  delete from auth.users where id = target;
end;
$$;
