-- ============================================================================
-- A password reset link proves the address
-- ============================================================================
-- The owner, 2026-11-04: a reset link went to the address, so using it proves
-- it, as the code from Me does (20261104110000). And as whoever opened it owns
-- the address, every session the account had before it ends then, not only
-- once a new password is saved (Auth's own rule).
--
-- Auth keeps a reset link's token in auth.users.recovery_token and empties it
-- when the link is used, and nothing else empties it (tried locally on Auth
-- 2.118: password sign-in, refresh, password and profile changes, sign-out).
--
-- The Home Screen hand-off makes the same kind of token for whoever is signed
-- in on Safari (home-screen-handoff), which proves nothing. So an account with
-- a hand-off in the last day, longer than any token lasts, is not proved this
-- way; its member can still confirm with the code from Me.
-- ============================================================================

create table private.home_screen_sign_ins (
  account uuid primary key references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);

comment on table private.home_screen_sign_ins is
  'The last Home Screen hand-off per account, so its token is not read as a reset link (20261104120000).';

revoke all on table private.home_screen_sign_ins from public, anon, authenticated;

create function private.note_home_screen_sign_in(account uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.home_screen_sign_ins (account) values (account)
  on conflict (account) do update set at = now();
$$;

revoke all on function private.note_home_screen_sign_in(uuid) from public, anon, authenticated;

-- 20261012100000, noting the hand-off before its token is made.
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
  perform private.note_home_screen_sign_in(who);
  return private.confirmed_email(who);
end;
$$;
revoke all on function public.redeem_home_screen_handoff(text) from public, anon, authenticated;
grant execute on function public.redeem_home_screen_handoff(text) to service_role;

-- 20261015010000, likewise.
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
  perform private.note_home_screen_sign_in(who);
  return private.confirmed_email(who);
end;
$$;
revoke all on function public.redeem_home_screen_pairing(text) from public, anon, authenticated;
grant execute on function public.redeem_home_screen_pairing(text) to service_role;

create function private.reset_link_proves_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.email_unproven(new.id) and not exists (
    select 1 from private.home_screen_sign_ins h
     where h.account = new.id and h.at > now() - interval '1 day'
  ) then
    delete from private.unproven_emails where account = new.id;
    delete from private.email_proofs where account = new.id;
    -- The link's own session is made after this, so it stays.
    delete from auth.sessions where user_id = new.id;
    perform private.claim_event_registrations_for(new.id);
  end if;
  return new;
end;
$$;

revoke all on function private.reset_link_proves_email() from public, anon, authenticated;

create trigger reset_link_proves_email
  after update of recovery_token on auth.users
  for each row
  when (coalesce(old.recovery_token, '') <> '' and coalesce(new.recovery_token, '') = '')
  execute function private.reset_link_proves_email();
