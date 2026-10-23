-- ============================================================================
-- A registration for an event is never an invite
-- ============================================================================
-- The owner, 2026-10-22: "No, I didn't agree to that change. If you register,
-- it no longer counts as an invite. That's a security hole."
--
-- 20261022190000 let any address registered for a public event pass
-- i_am_invited (the members insert policy) and the sign-up hook. Every event
-- is public (20261022200000), and the form takes any address, so anybody
-- could register and then join an invite-only club (CONTEXT.md, Invite only).
--
-- Both functions go back to 20261018010000 and 20261014000000. Everything
-- else about registrations stays: the guest list, the 90-day expiry, and a
-- registration becoming the RSVP of a member with that confirmed address.
-- ============================================================================

-- As 20261018010000.
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
               -- Consumed counts only for the account it was consumed by.
               or (i.status = 'consumed' and i.claimed_by = me.id)
         )
       )
  );
$$;

comment on function public.i_am_invited() is
  'True when joining is open and the caller has a CONFIRMED address, or a pending invite is claimed by the caller or names that address, or the caller is who consumed an invite; never when the address is blocked. A registration for an event never counts (20261022230000). Answers only about the caller.';

revoke all on function public.i_am_invited() from public, anon;
grant execute on function public.i_am_invited() to authenticated;

-- As 20261014000000.
create or replace function public.signup_needs_an_invite(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  provider text := coalesce(event -> 'user' -> 'app_metadata' ->> 'provider', '');
  address text := public.normalize_email(event -> 'user' ->> 'email');
  token text := btrim(coalesce(event -> 'user' -> 'user_metadata' ->> 'invite_token', ''));
begin
  if provider in ('google', 'apple') then
    return '{}'::jsonb;
  end if;

  -- Anything but an email sign-up is refused, open or not.
  if provider = 'email'
     and address is not null
     and not public.is_blocked_email(address)
     and (
       public.joining_is_open()
       or exists (
         select 1 from public.invites i
          where i.status = 'pending'
            and lower(i.email::text) = address
       )
       or (
         token <> ''
         and exists (
           select 1 from public.invites i
            where i.token_hash = encode(extensions.digest(token, 'sha256'), 'hex')
              and i.status = 'pending'
              and i.claimed_by is null
         )
       )
     ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error',
    jsonb_build_object(
      'http_code', 403,
      'message', 'This email is not on the invite list.'
    )
  );
end;
$$;

comment on function public.signup_needs_an_invite(jsonb) is
  'Before User Created hook: an email sign-up needs a pending invite for its address, or a live invite token, unless joining is open. A registration for an event never counts. See 20261012040000, 20261014000000 and 20261022230000.';

revoke execute on function public.signup_needs_an_invite(jsonb) from public, anon, authenticated;
grant execute on function public.signup_needs_an_invite(jsonb) to supabase_auth_admin;

comment on table public.event_registrations is
  'Sign-ups from a public event''s page, account or not. Read through event_guest_list only. Never an invite (20261022230000). See 20261022190000.';
