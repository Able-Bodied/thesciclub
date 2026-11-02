-- ============================================================================
-- An organization's or partner's live code lets an email sign-up in
-- ============================================================================
-- The owner, 2026-11-01. 20261028960000 says such a code lets in whoever scans
-- it while joining is closed, and past this hook it does, but the hook never
-- looked at it: only Google and Apple got through, and an email sign-up was told
-- it was not on the invite list. As 20261022230000, with the code, which the
-- sign-up carries as `qr_code`. A code that only gives credit changes nothing.
-- ============================================================================

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
  code text := btrim(coalesce(event -> 'user' -> 'user_metadata' ->> 'qr_code', ''));
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
       or (
         code <> ''
         and exists (
           select 1 from public.qr_codes q
            where q.id = private.live_qr_code(code)
              and (q.organization_id is not null or q.made_as_partner)
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
  'Before User Created hook: an email sign-up needs a pending invite for its address, a live invite token, or a live code that admits, unless joining is open. A registration for an event never counts. See 20261012040000, 20261014000000, 20261022230000 and 20261101100000.';

revoke execute on function public.signup_needs_an_invite(jsonb) from public, anon, authenticated;
grant execute on function public.signup_needs_an_invite(jsonb) to supabase_auth_admin;
