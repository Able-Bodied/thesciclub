-- ============================================================================
-- Google for the iPhone Home Screen app, by way of Chrome or Safari
-- ============================================================================
-- The owner, 2026-10-14. The Home Screen app keeps its own storage, so Google
-- finds no accounts in it, and Google's own sign-in page fails there ("Something
-- went wrong", then a 400 after Restart). Chrome and Safari have the member's
-- Google accounts. So the app opens one of them on /app-sign-in, the member
-- signs in there, confirms, and the browser leaves a sign-in for the app here;
-- the app, back in front, collects it through the `home-screen-handoff` edge
-- function (src/lib/google-in-browser.ts).
--
-- The app makes a secret and keeps it; the browser is given only its sha256
-- (the "pairing"), in the address it opens. Whoever holds the secret collects
-- the sign-in, so a pairing seen in a browser's history is no use by itself.
-- The confirmation on /app-sign-in is what stands between a member and a
-- pairing somebody else made and sent them as a link.
--
-- A pairing is filled once (the first account wins, so nobody can swap theirs
-- in after the member), lasts ten minutes, is used once, and an account has
-- one at a time.
-- ============================================================================

create table public.home_screen_pairings (
  pairing_hash text primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  expires_at   timestamptz not null
);

create index home_screen_pairings_user_idx on public.home_screen_pairings (user_id);

comment on table public.home_screen_pairings is
  'Sign-ins a browser leaves for the iPhone Home Screen app that asked for them. Written and read through the two functions below only. See 20261015010000.';

alter table public.home_screen_pairings enable row level security;
revoke all on public.home_screen_pairings from public, anon, authenticated;

-- For the signed-in browser: leaves this account's sign-in for the app holding
-- the secret behind `pairing`. False for a malformed pairing or one another
-- account filled; the same account again just renews it.
create or replace function public.pair_home_screen_app(pairing text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
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

revoke all on function public.pair_home_screen_app(text) from public, anon;
grant execute on function public.pair_home_screen_app(text) to authenticated;

-- For the edge function only: uses the pairing up, and answers the account's
-- confirmed address, or null for a pairing not filled yet, used or expired.
create or replace function public.redeem_home_screen_pairing(secret text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  who uuid;
begin
  if coalesce(btrim(secret), '') = '' then
    return null;
  end if;

  delete from public.home_screen_pairings
   where pairing_hash = encode(extensions.digest(btrim(secret), 'sha256'), 'hex')
     and expires_at > now()
  returning user_id into who;

  if who is null then
    return null;
  end if;
  return private.confirmed_email(who);
end;
$$;

revoke all on function public.redeem_home_screen_pairing(text) from public, anon, authenticated;
grant execute on function public.redeem_home_screen_pairing(text) to service_role;
