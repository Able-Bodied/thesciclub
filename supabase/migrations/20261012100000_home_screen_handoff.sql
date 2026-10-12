-- ============================================================================
-- Signed in in Safari, signed in in the Home Screen app
-- ============================================================================
-- The owner, 2026-10-11. On an iPhone the Home Screen app has its own storage:
-- somebody who joins in Safari and then adds the club opens an app that is
-- signed out. iOS copies a site's cookies into the app once, when it is added,
-- and nothing else (the club's session lives in localStorage).
--
-- So a signed-in Safari tab keeps a short-lived, single-use handoff code in a
-- cookie (src/lib/home-screen-handoff.ts). The app, opening with no session
-- and that cookie, sends the code to the `home-screen-handoff` edge function,
-- which redeems it here and signs the app in with a session of its own.
--
-- A session of its own, not Safari's: two copies of one refresh token would
-- trip Supabase's reuse detection the first time either refreshed, and sign
-- the person out of both.
--
-- Only the code's sha256 is stored, as with invite tokens. A code lasts 30
-- minutes, is used once, and a new one replaces the last for that account.
-- ============================================================================

create table public.home_screen_handoffs (
  code_hash  text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null
);

create index home_screen_handoffs_user_idx on public.home_screen_handoffs (user_id);

comment on table public.home_screen_handoffs is
  'Single-use codes that carry a Safari sign-in into the Home Screen app. Written and read through the two functions below only. See 20261012100000.';

alter table public.home_screen_handoffs enable row level security;
revoke all on public.home_screen_handoffs from public, anon, authenticated;

-- For the signed-in browser: a fresh code, replacing this account's last one.
create or replace function public.issue_home_screen_handoff()
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
  if me is null then
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

revoke all on function public.issue_home_screen_handoff() from public, anon;
grant execute on function public.issue_home_screen_handoff() to authenticated;

-- For the edge function only: uses the code up, and answers the account's
-- confirmed address, or null for an unknown, used or expired code alike.
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
  returning user_id into who;

  if who is null then
    return null;
  end if;
  return private.confirmed_email(who);
end;
$$;

revoke all on function public.redeem_home_screen_handoff(text) from public, anon, authenticated;
grant execute on function public.redeem_home_screen_handoff(text) to service_role;
