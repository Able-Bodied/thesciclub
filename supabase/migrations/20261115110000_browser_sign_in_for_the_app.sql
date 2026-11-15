-- ============================================================================
-- The iPhone app signed in by the browser, in one tap
-- ============================================================================
-- The owner, 2026-11-15: "Could we add an option in the app to open the
-- browser and pass the cookie back?", then "Could we do it without even having
-- the user tap?" ... "Yes please".
--
-- Welcome back in the app has "Continue sign in using your browser (no
-- password)". The app makes a secret and keeps it, and opens /app-sign-in in
-- the member's browser with only its sha256 (the pairing). That browser,
-- signed in, at once makes a two-minute code bound to the pairing and sends it
-- straight to the app (thesciclub://open?...&code=...). No confirmation to
-- press: the code goes to the phone the browser is on, never to whoever made
-- the link, and it signs in only with the secret behind the pairing. Somebody
-- sending a member a link of their own making gets nothing: the code lands in
-- the member's app, which does not hold that person's secret.
--
-- So a bound code is redeemed only by redeem_app_handoff with the secret, and
-- redeem_home_screen_handoff, which takes a code alone, now leaves bound codes
-- be. Unbound codes (the Home Screen cookie, Open in the app) are as before.
--
-- Additive: one nullable column, two new functions, and one function that
-- refuses a kind of code nothing made before this.
--
-- Probe: supabase/tests/open-in-the-app.sql.
-- ============================================================================

alter table public.home_screen_handoffs
  add column challenge text
  constraint home_screen_handoffs_challenge_hex check (challenge ~ '^[0-9a-f]{64}$');

comment on column public.home_screen_handoffs.challenge is
  'For a code made by /app-sign-in for the iPhone app: the sha256 hex of the secret the app kept, which redeem_app_handoff asks for. Null for every other code. 20261115110000.';

-- For the signed-in browser the app sent: a two-minute code for this account,
-- bound to `pairing`. Null for a malformed pairing.
create function public.issue_app_handoff_for(pairing text)
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
  if me is null or not private.my_session_is_live() then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if coalesce(pairing, '') !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  -- As issue_app_handoff: the member's thirty-minute Home Screen code stays.
  delete from public.home_screen_handoffs
   where expires_at <= now() or (user_id = me and expires_at <= now() + interval '2 minutes');
  code := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  insert into public.home_screen_handoffs (code_hash, user_id, expires_at, challenge)
  values (encode(extensions.digest(code, 'sha256'), 'hex'), me, now() + interval '2 minutes', pairing);
  return code;
end;
$$;

revoke all on function public.issue_app_handoff_for(text) from public, anon;
grant execute on function public.issue_app_handoff_for(text) to authenticated;

-- For the edge function only: uses the code up whatever the secret, and
-- answers the account's address when the secret is the one it is bound to, or
-- when it is bound to none.
create function public.redeem_app_handoff(code text, verifier text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  who uuid;
  bound text;
begin
  if coalesce(btrim(code), '') = '' then
    return null;
  end if;

  delete from public.home_screen_handoffs
   where code_hash = encode(extensions.digest(btrim(code), 'sha256'), 'hex')
     and expires_at > now()
  returning user_id, challenge into who, bound;

  if who is null then
    return null;
  end if;
  if bound is not null
     and bound is distinct from encode(extensions.digest(btrim(coalesce(verifier, '')), 'sha256'), 'hex') then
    return null;
  end if;
  perform private.note_home_screen_sign_in(who);
  return private.confirmed_email(who);
end;
$$;

revoke all on function public.redeem_app_handoff(text, text) from public, anon, authenticated;
grant execute on function public.redeem_app_handoff(text, text) to service_role;

-- 20261104120000's, leaving bound codes to redeem_app_handoff.
create or replace function public.redeem_home_screen_handoff(code text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  who uuid;
begin
  if coalesce(btrim(code), '') = '' then
    return null;
  end if;

  delete from public.home_screen_handoffs
   where code_hash = encode(extensions.digest(btrim(code), 'sha256'), 'hex')
     and expires_at > now()
     and challenge is null
  returning user_id into who;

  if who is null then
    return null;
  end if;
  perform private.note_home_screen_sign_in(who);
  return private.confirmed_email(who);
end;
$$;
revoke all on function public.redeem_home_screen_handoff(text) from public, anon, authenticated;
grant execute on function public.redeem_home_screen_handoff(text) to service_role;
