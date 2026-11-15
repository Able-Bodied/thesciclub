-- ============================================================================
-- Open in the app: a browser's sign-in carried into the iPhone app
-- ============================================================================
-- The owner, 2026-11-15: "What would be the smoothest way to pass the account
-- from the browser into the iOS app?" ... "Ok let's build it".
--
-- "Open in the app" on an iPhone browser opens the store app with
-- thesciclub://open?path=...&code=..., and the app trades the code for a
-- session of its own, as the Home Screen app does with the cookie iOS copies
-- in (20261012100000). The same table and the same redeeming
-- (redeem_home_screen_handoff, through the home-screen-handoff function).
--
-- The difference is the code's life. A link's code is made as the button is
-- pressed and used within seconds, and a link can be read by whatever opens
-- it, so it lasts two minutes, not thirty. Making one leaves the member's
-- thirty-minute Home Screen code alone: it takes back only their other codes
-- that end within two minutes, the earlier presses.
--
-- Probe: supabase/tests/open-in-the-app.sql.
-- ============================================================================

create function public.issue_app_handoff()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  code text;
begin
  -- Only for a session still signed in, as issue_home_screen_handoff since
  -- 20261018040000: a stolen access token must not become a lasting sign-in.
  if me is null or not private.my_session_is_live() then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  delete from public.home_screen_handoffs
   where expires_at <= now()
      or (user_id = me and expires_at <= now() + interval '2 minutes');

  -- 32 random bytes, base64url without padding: 43 characters, as the
  -- function's handler.ts expects.
  code := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  insert into public.home_screen_handoffs (code_hash, user_id, expires_at)
  values (encode(extensions.digest(code, 'sha256'), 'hex'), me, now() + interval '2 minutes');
  return code;
end;
$$;

revoke all on function public.issue_app_handoff() from public, anon;
grant execute on function public.issue_app_handoff() to authenticated;
