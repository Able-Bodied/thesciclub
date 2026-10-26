-- ============================================================================
-- Address lookups run on GitHub
-- ============================================================================
-- 2026-10-26: Nominatim answers 403 to every lookup from Supabase Edge, and
-- 200 to the nightly import on GitHub Actions. So a changed address now asks
-- GitHub to run the `geocode` workflow (.github/workflows/geocode.yml), which
-- works the same queue as the import (20261025030000), under the same caps
-- and spacing. The geocode-event function is retired; geocodes_due, which
-- only it called, goes.
--
-- Two vault secrets; while either is missing nothing is sent, and the queue
-- waits for the nightly import:
--   geocode_github_repo   owner/name of the repository whose Actions run it
--   geocode_github_token  a fine-grained token with Actions: read and write
--                         on that repository only
-- ============================================================================

create or replace function private.geocode_send()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  repo text;
  token text;
begin
  -- Once a transaction: a series of dates is one run.
  if current_setting('club.geocode_sent', true) = 'yes' then
    return;
  end if;
  select s.decrypted_secret into repo
    from vault.decrypted_secrets s where s.name = 'geocode_github_repo';
  select s.decrypted_secret into token
    from vault.decrypted_secrets s where s.name = 'geocode_github_token';
  if coalesce(token, '') = '' or coalesce(repo, '') !~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' then
    return;  -- not switched on: the nightly import places it
  end if;
  perform net.http_post(
    url := 'https://api.github.com/repos/' || repo || '/actions/workflows/geocode.yml/dispatches',
    body := '{"ref":"main"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || token,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'thesciclub-geocode',
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 10000
  );
  perform set_config('club.geocode_sent', 'yes', true);
exception when others then
  raise warning 'geocode_send: %', sqlerrm;
end;
$$;

revoke all on function private.geocode_send() from public, anon, authenticated;

drop function if exists public.geocodes_due(text);

-- A claimed row the runner never reached goes back without counting as a
-- lookup, so the next run need not wait out the claim.
create or replace function public.geocode_release(p_kind text, p_target uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.geocode_queue q
     set claimed_until = null, claimed_query = null, claimed_owner = null
   where q.kind = p_kind and q.target_id = p_target;
$$;

revoke all on function public.geocode_release(text, uuid) from public, anon, authenticated;
grant execute on function public.geocode_release(text, uuid) to service_role;
