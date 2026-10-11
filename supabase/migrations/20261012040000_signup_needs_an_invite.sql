-- ============================================================================
-- An email sign-up needs an invite before the account is made
-- ============================================================================
-- The owner, 2026-10-11: an address that is not invited is refused at the
-- join form, before Supabase sends a confirmation email. That saves the
-- Resend send, and nobody confirms an address only to be told afterwards that
-- it was never going to get in.
--
-- ---------------------------------------------------------------------------
-- What it costs, decided knowingly
-- ---------------------------------------------------------------------------
-- 20260911120000 built the same gate for phone numbers and left it off: a
-- refusal at sign-up makes /auth/v1/signup answer differently for an invited
-- address (200) than for one that is not (403), so anybody can type somebody
-- else's address and learn whether it is on the list of a club for people
-- with a spinal cord injury. The owner was told exactly that, was offered an
-- invite-link-only gate that tells nobody anything, and chose this one
-- (2026-10-11). Do not switch it off as an oversight; it is the owner's call.
--
-- ---------------------------------------------------------------------------
-- What passes
-- ---------------------------------------------------------------------------
-- * Google and Apple. They send no email, and their address is known only
--   after the round trip; the not-invited screen still answers them after
--   sign-in, as before.
-- * An email sign-up whose address has a pending invite and is not blocked.
-- * An email sign-up that carries a pending, unclaimed invite's token in
--   user_metadata.invite_token (the join form sends the one /join?invite=
--   left behind). That keeps "invited at one address, joining with another"
--   working, and it says nothing about any address. The address must still
--   not be blocked.
--
-- Everything else is refused before the user row exists: an uninvited or
-- blocked address, a used, revoked or claimed invite's token, a phone or
-- anonymous sign-up, and an account added by hand in the dashboard for an
-- address that is not invited (invite it first).
--
-- Payload, confirmed against the local GoTrue on 2026-10-11:
--   { "user": { "email": "lower@case.address", "phone": "",
--               "app_metadata": { "provider": "email", ... },
--               "user_metadata": { "invite_token": "..." } }, "metadata": {...} }
-- A refusal reaches the client as 403 {"error_code":"unknown","msg":<message>},
-- and no user row and no email follow it. src/lib/auth-email.ts matches the
-- message below, word for word.
--
-- Switched on in supabase/config.toml for the local stack. The hosted project
-- needs it set by hand, AFTER this migration is pushed and the client that
-- sends the token is live: Authentication > Hooks > Before User Created,
-- Postgres function public.signup_needs_an_invite.
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
begin
  if provider in ('google', 'apple') then
    return '{}'::jsonb;
  end if;

  -- Only an email sign-up is judged on its address and token. Anything else
  -- (phone, anonymous, a payload with no provider) is refused: it fails closed.
  if provider = 'email'
     and address is not null
     and not public.is_blocked_email(address)
     and (
       exists (
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
  'Before User Created hook: an email sign-up needs a pending invite for its address, or a live invite token. See 20261012040000.';

revoke execute on function public.signup_needs_an_invite(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.signup_needs_an_invite(jsonb) to supabase_auth_admin;
