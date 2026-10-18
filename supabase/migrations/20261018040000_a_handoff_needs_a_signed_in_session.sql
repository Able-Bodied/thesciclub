-- A Home Screen hand-off is made only for a session that is still signed in.
--
-- The security scan of 2026-10-17 (finding F15). issue_home_screen_handoff
-- and pair_home_screen_app checked only auth.uid(), and an access token is
-- accepted until it expires, up to an hour, even after its session has signed
-- out or been revoked. What they make can be traded at home-screen-handoff
-- for a new session with its own refresh token. So a stolen access token
-- became a lasting sign-in that outlived both the token and the member's
-- signing out. record_sign_in already refuses a token whose session is gone
-- (20261016000000); these two now do the same.
--
-- As 20261012100000 and 20261015010000, with the session checked.

create or replace function private.my_session_is_live()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from auth.sessions s
     where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
       and s.user_id = auth.uid()
  );
$$;

comment on function private.my_session_is_live() is
  'True while the caller''s token names a session that still exists for them: false once it signed out or was revoked, though the token itself is accepted until it expires. See 20261018040000.';

revoke all on function private.my_session_is_live() from public, anon, authenticated;

create or replace function public.issue_home_screen_handoff()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  code text;
begin
  if me is null or not private.my_session_is_live() then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  delete from public.home_screen_handoffs where user_id = me or expires_at <= now();

  -- 32 random bytes, base64url without padding: 43 characters.
  code := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  insert into public.home_screen_handoffs (code_hash, user_id, expires_at)
  values (encode(extensions.digest(code, 'sha256'), 'hex'), me, now() + interval '30 minutes');
  return code;
end;
$$;

create or replace function public.pair_home_screen_app(pairing text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not private.my_session_is_live() then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if coalesce(pairing, '') !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  delete from public.home_screen_pairings where user_id = me or expires_at <= now();

  insert into public.home_screen_pairings (pairing_hash, user_id, expires_at)
  values (pairing, me, now() + interval '10 minutes')
  on conflict (pairing_hash) do nothing;
  return found;
end;
$$;
