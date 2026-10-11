-- ============================================================================
-- Apple sign-in has a renewal date
-- ============================================================================
-- The owner, 2026-10-10. Apple's web sign-in takes no fixed secret: Supabase's
-- Apple provider holds a JWT signed with the club's .p8 key, and Apple refuses
-- one older than six months. When it runs out, every Apple sign-in fails with
-- `invalid_client` and nobody is told. So the club keeps the date, shows it
-- on Admin (Sign-in tab), and emails the owner as it comes due.
--
-- The secret itself is never here: it lives in the Supabase dashboard, and
-- scripts/apple-secret.mjs makes it. Only the date it runs out is kept, set by
-- an administrator after pasting a new one.
--
-- The reminder: pg_cron calls sign_in_secret_remind() each morning; it posts
-- to the `sign-in-reminder` edge function with a secret made here, and the
-- function asks sign_in_secret_due() what to say, which checks that secret.
-- Two vault secrets, the first the switch, as push_notify_send has them:
--
--   sign_in_reminder_url     where the function is. Absent, nothing is sent,
--                            so this is safe before the function is deployed.
--   sign_in_reminder_secret  made here at random; never leaves the database
--                            except in the call.
--
-- Due: 30, 14, 7, 3 and 1 days before, the day itself, and every day after
-- until it is renewed. At most once a day.
-- ============================================================================

create table if not exists public.sign_in_secrets (
  provider text primary key check (provider in ('apple')),
  expires_on date not null,
  renewed_at timestamptz not null default now(),
  renewed_by uuid references public.members (id) on delete set null,
  last_reminded_on date
);

comment on table public.sign_in_secrets is
  'When each sign-in provider''s secret runs out. Never the secret itself. See 20261011080000.';

alter table public.sign_in_secrets enable row level security;
revoke all on public.sign_in_secrets from public, anon, authenticated;
grant select on public.sign_in_secrets to authenticated;

drop policy if exists "administrators read sign-in secret dates" on public.sign_in_secrets;
create policy "administrators read sign-in secret dates"
  on public.sign_in_secrets for select
  using (public.is_admin());

-- The first secret, made 2026-10-10 by scripts/apple-secret.mjs.
insert into public.sign_in_secrets (provider, expires_on)
values ('apple', date '2027-04-09')
on conflict (provider) do nothing;

-- -------------------------------------------------------------- renewing
create or replace function public.admin_renew_sign_in_secret(p_provider text, p_expires_on date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can do that.' using errcode = '42501';
  end if;
  -- Apple's limit is six months; a date past it is a typing slip.
  if p_expires_on is null or p_expires_on <= current_date or p_expires_on > current_date + 190 then
    raise exception 'The date should be in the next six months: the one the script printed.'
      using errcode = '22023';
  end if;
  update public.sign_in_secrets
     set expires_on = p_expires_on,
         renewed_at = now(),
         renewed_by = auth.uid(),
         last_reminded_on = null
   where provider = p_provider;
  if not found then
    raise exception 'No such sign-in provider.' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.admin_renew_sign_in_secret(text, date) from public, anon;
grant execute on function public.admin_renew_sign_in_secret(text, date) to authenticated;

-- ------------------------------------------------------------- reminding
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'sign_in_reminder_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'sign_in_reminder_secret',
      'Sent by sign_in_secret_remind and checked by sign_in_secret_due. Never leaves the database.'
    );
  end if;
end;
$$;

-- What is due a reminder today, marked as reminded. The edge function only.
create or replace function public.sign_in_secret_due(p_secret text)
returns table (provider text, expires_on date, days_left integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_secret is null or p_secret is distinct from (
    select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'sign_in_reminder_secret'
  ) then
    raise exception 'Not the reminder.' using errcode = '42501';
  end if;

  return query
  with reminded as (
    update public.sign_in_secrets t
       set last_reminded_on = current_date
     where t.last_reminded_on is distinct from current_date
       and (t.expires_on - current_date in (30, 14, 7, 3, 1) or t.expires_on <= current_date)
    returning t.provider, t.expires_on
  )
  select r.provider, r.expires_on, (r.expires_on - current_date)::integer from reminded r;
end;
$$;

revoke all on function public.sign_in_secret_due(text) from public, anon, authenticated;
grant execute on function public.sign_in_secret_due(text) to service_role;

create or replace function public.sign_in_secret_remind()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target text;
  secret text;
begin
  select s.decrypted_secret into target
    from vault.decrypted_secrets s where s.name = 'sign_in_reminder_url';
  if target is null or target = '' then
    return;  -- switched off
  end if;
  select s.decrypted_secret into secret
    from vault.decrypted_secrets s where s.name = 'sign_in_reminder_secret';

  perform net.http_post(
    url := target,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-reminder-secret', secret),
    timeout_milliseconds := 10000
  );
exception when others then
  raise warning 'sign_in_secret_remind: %', sqlerrm;
end;
$$;

revoke all on function public.sign_in_secret_remind() from public, anon, authenticated;

-- Ten past nine in the morning in California in summer, after push-daily.
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'sign-in-secret-reminder';
  perform cron.schedule('sign-in-secret-reminder', '10 16 * * *', 'select public.sign_in_secret_remind()');
end;
$$;
