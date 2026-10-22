-- ============================================================================
-- Sign in with Apple is revoked when the account goes
-- ============================================================================
-- App Store guideline 5.1.1(v), and Apple's rule since 2022-06-30: an app
-- offering Sign in with Apple calls Apple's revoke endpoint when an account is
-- deleted, so the app leaves the member's list in Settings → Apple Account.
-- Revoking needs a refresh token from Apple, which Supabase does not keep.
--
-- Keeping one: the `apple-token` edge function exchanges the authorization
-- code a native sign-in gives (client com.thesciclub.app), or checks the
-- refresh token a web sign-in brings back (com.thesciclub.web), and stores it
-- through apple_token_keep(). Only the service role may call that, and
-- private.apple_tokens is readable by nobody through the API.
--
-- Using it: a trigger on auth.identities. Deleting an Apple identity, by
-- unlinking it on Me or by deleting the account in any way (delete_my_account,
-- admin_delete_member, the dashboard: all cascade to auth.identities), moves
-- its tokens to private.apple_revocations and asks the `apple-revoke` function
-- to call Apple. The function deletes each row once Apple accepts it. A
-- failure never stops the deletion: the trigger only warns, and a refused or
-- unreachable revoke stays queued with its error, retried each day up to
-- seven times.
--
-- Vault secret `apple_revoke_url`: where the function is. Absent, nothing is
-- sent and the queue waits, so this is safe before the function is deployed.
-- ============================================================================

create schema if not exists private;

-- --------------------------------------------------------------- the tokens
create table if not exists private.apple_tokens (
  user_id uuid not null,
  apple_sub text not null,
  client_id text not null check (client_id in ('com.thesciclub.app', 'com.thesciclub.web')),
  refresh_token text not null,
  kept_at timestamptz not null default now(),
  primary key (user_id, apple_sub, client_id)
);

comment on table private.apple_tokens is
  'Apple refresh tokens, kept only to revoke them. No API access. See 20261022160000.';

alter table private.apple_tokens enable row level security;
revoke all on private.apple_tokens from public, anon, authenticated, service_role;

create table if not exists private.apple_revocations (
  id bigint generated always as identity primary key,
  client_id text not null,
  refresh_token text not null,
  queued_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_tried_at timestamptz,
  last_error text
);

comment on table private.apple_revocations is
  'Apple tokens waiting to be revoked; a row goes once Apple accepts. See 20261022160000.';

alter table private.apple_revocations enable row level security;
revoke all on private.apple_revocations from public, anon, authenticated, service_role;

-- -------------------------------------------------------------- keeping one
-- Called by apple-token after it has checked the token with Apple and the
-- caller's session. The identity must still be this account's.
create or replace function public.apple_token_keep(
  p_user uuid,
  p_sub text,
  p_client_id text,
  p_refresh_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from auth.identities i
     where i.provider = 'apple' and i.provider_id = p_sub and i.user_id = p_user
  ) then
    return false;
  end if;
  insert into private.apple_tokens (user_id, apple_sub, client_id, refresh_token)
  values (p_user, p_sub, p_client_id, p_refresh_token)
  on conflict (user_id, apple_sub, client_id)
  do update set refresh_token = excluded.refresh_token, kept_at = now();
  return true;
end;
$$;

revoke all on function public.apple_token_keep(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.apple_token_keep(uuid, text, text, text) to service_role;

-- ------------------------------------------------------------ asking Apple
create or replace function private.apple_revoke_send()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target text;
begin
  select s.decrypted_secret into target
    from vault.decrypted_secrets s where s.name = 'apple_revoke_url';
  if target is null or target = '' then
    return;  -- not switched on yet: the queue waits
  end if;
  perform net.http_post(
    url := target,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 10000
  );
exception when others then
  raise warning 'apple_revoke_send: %', sqlerrm;
end;
$$;

revoke all on function private.apple_revoke_send() from public, anon, authenticated;

-- An Apple identity gone: its tokens are queued, and Apple is asked. Never
-- raises, so a deletion cannot fail here.
create or replace function private.apple_identity_gone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  moved integer;
begin
  begin
    with gone as (
      delete from private.apple_tokens t
       where t.user_id = old.user_id and t.apple_sub = old.provider_id
      returning t.client_id, t.refresh_token
    )
    insert into private.apple_revocations (client_id, refresh_token)
    select g.client_id, g.refresh_token from gone g;
    get diagnostics moved = row_count;
    if moved > 0 then
      perform private.apple_revoke_send();
    end if;
  exception when others then
    raise warning 'apple_identity_gone: %', sqlerrm;
  end;
  return old;
end;
$$;

revoke all on function private.apple_identity_gone() from public, anon, authenticated;

drop trigger if exists apple_identity_gone on auth.identities;
create trigger apple_identity_gone
  after delete on auth.identities
  for each row
  when (old.provider = 'apple')
  execute function private.apple_identity_gone();

-- ------------------------------------------------- what the function reads
-- Claims what is due (not tried in the last ten minutes, fewer than seven
-- tries), so two calls at once do not both send.
create or replace function public.apple_revocations_due()
returns table (id bigint, client_id text, refresh_token text)
language sql
security definer
set search_path = ''
as $$
  update private.apple_revocations r
     set attempts = r.attempts + 1, last_tried_at = now()
   where r.id in (
     select q.id from private.apple_revocations q
      where q.attempts < 7
        and (q.last_tried_at is null or q.last_tried_at < now() - interval '10 minutes')
      order by q.id
      limit 50
      for update skip locked
   )
  returning r.id, r.client_id, r.refresh_token;
$$;

revoke all on function public.apple_revocations_due() from public, anon, authenticated;
grant execute on function public.apple_revocations_due() to service_role;

-- Apple accepted (p_error null): the row goes. Otherwise its error is kept.
create or replace function public.apple_revocation_done(p_id bigint, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_error is null then
    delete from private.apple_revocations where id = p_id;
  else
    update private.apple_revocations set last_error = left(p_error, 500) where id = p_id;
  end if;
end;
$$;

revoke all on function public.apple_revocation_done(bigint, text) from public, anon, authenticated;
grant execute on function public.apple_revocation_done(bigint, text) to service_role;

-- ---------------------------------------------------------------- retrying
create or replace function private.apple_revoke_retry()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from private.apple_revocations where attempts < 7) then
    perform private.apple_revoke_send();
  end if;
end;
$$;

revoke all on function private.apple_revoke_retry() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'apple-revoke-retry';
  perform cron.schedule('apple-revoke-retry', '40 16 * * *', 'select private.apple_revoke_retry()');
end;
$$;
