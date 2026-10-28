-- ============================================================================
-- Everything the club renews
-- ============================================================================
-- The owner, 2026-10-27: "add all renewal dates in the admin panel". Admin →
-- Keys & renewals lists each key, certificate and membership that runs out,
-- with its date and the steps to renew it, and an administrator changes a
-- date or adds one without a code change.
--
-- Never a secret: names, purposes, steps and dates only (the repo is public).
--
-- The Apple secret's date stays in sign_in_secrets (20261011080000), its one
-- source: its row here names it by sign_in_provider and keeps no date, and
-- admin_set_renewal_date hands it to admin_renew_sign_in_secret.
--
-- Reminders: renewals_due is sign_in_secret_due for every dated item, on the
-- same days (30, 14, 7, 3, 1, the day, every day after), with the same vault
-- secret. sign-in-reminder calls it once redeployed; until then the deployed
-- one calls sign_in_secret_due, kept, and both mark the Apple row, so no
-- second email.
-- ============================================================================

create table if not exists public.renewals (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 120),
  purpose text not null default '' check (char_length(purpose) <= 1000),
  -- In order. `text` in backticks is drawn as code.
  steps text[] not null default '{}'
    check (cardinality(steps) <= 20 and char_length(array_to_string(steps, '')) <= 20000),
  -- False: it never runs out (an APNs key). True with no date: not entered yet.
  expires boolean not null default true,
  expires_on date,
  sign_in_provider text unique references public.sign_in_secrets (provider) on delete restrict,
  last_reminded_on date,
  renewed_at timestamptz,
  renewed_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references public.members (id) on delete set null,
  check (expires or expires_on is null),
  check (sign_in_provider is null or (expires and expires_on is null))
);

comment on table public.renewals is
  'What the club must renew, when, and how. Never a secret. The Apple secret''s date is in sign_in_secrets. See 20261028200000.';

alter table public.renewals enable row level security;
revoke all on public.renewals from public, anon, authenticated;
grant select on public.renewals to authenticated;
grant select, insert, update, delete on public.renewals to service_role;

drop policy if exists "administrators read renewals" on public.renewals;
create policy "administrators read renewals"
  on public.renewals for select
  using (public.is_admin());

-- ------------------------------------------------------------- the list
insert into public.renewals (name, purpose, steps, expires, expires_on, sign_in_provider)
values
  (
    'Sign in with Apple secret',
    'Lets members sign in with Apple. Apple refuses it after six months, and then Apple sign-ins fail with no warning.',
    array[
      'On your computer, in the project folder, run `node scripts/apple-secret.mjs` followed by the path to the Sign in with Apple key, your `AuthKey_….p8` file. It prints the new secret and the date it runs out.',
      'In Supabase, open Authentication → Sign In / Providers → Apple, paste it into Secret Key (for OAuth), and save. Check Apple is switched on.'
    ],
    true, null, 'apple'
  ),
  (
    'iPhone app distribution certificate',
    'Signs the iPhone app when GitHub builds it for TestFlight and the App Store (GitHub secrets `DIST_CERT_P12_BASE64` and `DIST_CERT_PASSWORD`, app-store environment of Alfredx48/TheSciClub). Once it runs out no new build can be uploaded; the app already in the store keeps working. The date is approximate: Apple Developer → Certificates shows the exact one.',
    array[
      'On your computer (no Mac needed), make a key and a signing request: `openssl genrsa -out dist.key 2048`, then `openssl req -new -key dist.key -out dist.csr -subj "/emailAddress=<your Apple Account email>/CN=<your name>/C=US"`.',
      'In Apple Developer → Certificates, Identifiers & Profiles → Certificates, press +, choose Apple Distribution, upload `dist.csr`, and download the certificate, `distribution.cer`. Its page shows the date it runs out.',
      'Make the .p12 with the older encryption macOS can read: `openssl x509 -inform DER -in distribution.cer -out dist.pem`, then `openssl pkcs12 -export -inkey dist.key -in dist.pem -out dist.p12 -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1`, choosing a password when asked.',
      'Before anything else, save the .p12 (as text: `base64 -w0 dist.p12`) and its password in your password manager, and check they are there. GitHub never shows a secret again.',
      'Replace the two GitHub secrets: `base64 -w0 dist.p12 | gh secret set DIST_CERT_P12_BASE64 --env app-store -R Alfredx48/TheSciClub`, then `gh secret set DIST_CERT_PASSWORD --env app-store -R Alfredx48/TheSciClub` and type the password.',
      'Make the next TestFlight build (a tag, or Actions → iOS release → Run workflow on main) and approve it: it makes a new App Store profile for the new certificate by itself. If it says there is no Apple Distribution identity, make the .p12 again exactly as in step 3.',
      'Once that build is in TestFlight, revoke the old certificate in Apple Developer → Certificates, and delete `dist.key`, `dist.csr`, `distribution.cer`, `dist.pem` and `dist.p12` from your computer.'
    ],
    true, date '2027-10-21', null
  ),
  (
    'GitHub token for address lookups',
    'Lets the database start the Geocode workflow on GitHub, which puts a changed address on the map in a couple of minutes; without it, addresses wait for the nightly import. A fine-grained token with Actions read and write on Alfredx48/TheSciClub only, kept in the Supabase vault as `geocode_github_token`.',
    array[
      'On GitHub, signed in as Alfredx48: Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token. Resource owner Alfredx48; Repository access: Only select repositories, Alfredx48/TheSciClub; Permissions → Repository → Actions: Read and write, nothing else. Choose the longest expiry offered, generate it, and copy the token.',
      'In Supabase → SQL Editor, run `select vault.update_secret((select id from vault.secrets where name = ''geocode_github_token''), ''<the new token>'');` with the token in place of <the new token>.',
      'Check it: run `select private.geocode_send();` in the SQL Editor, and Alfredx48/TheSciClub → Actions → Geocode shows a run that started a moment ago.',
      'Delete the old token on the same GitHub page.'
    ],
    true, date '2027-10-26', null
  ),
  (
    'Apple Developer Program membership',
    'The club''s Apple Developer account, renewed every year. If it lapses, the iPhone app leaves the App Store and no new build can be made.',
    array[
      'Sign in at developer.apple.com/account with the Apple Account that holds the club''s team, and open Membership details: it shows the date the membership runs out.',
      'Renew it there, or turn on automatic renewal, and pay the yearly fee.'
    ],
    true, null, null
  ),
  (
    'thesciclub.com domain',
    'The club''s address, registered at Spaceship. If it lapses, the website, links into the app and every email at thesciclub.com stop working.',
    array[
      'Sign in at spaceship.com and open Domain Manager → thesciclub.com: it shows the date it runs out and whether auto-renew is on.',
      'Renew it, or turn on auto-renew with a card that will still be valid then, and pay.'
    ],
    true, null, null
  ),
  (
    'Apple push notification key',
    'Lets push-notify send notifications to the iPhone app (Supabase secrets `APNS_KEY_ID` and `APNS_KEY_P8`). Apple''s push keys never run out: it needs replacing only if it is revoked or lost.',
    array[
      'In Apple Developer → Certificates, Identifiers & Profiles → Keys, press +, tick Apple Push Notifications service (APNs), and download the .p8 (Apple offers it once). Save it in your password manager first.',
      'In the project folder: `pnpm exec supabase secrets set APNS_KEY_ID=<new key ID> APNS_KEY_P8="$(base64 < AuthKey_<new key ID>.p8 | tr -d ''\n'')"`.',
      'Run `pnpm exec supabase functions deploy push-notify --no-verify-jwt`, check a notification reaches a phone, then revoke the old key in Apple Developer → Keys.'
    ],
    false, null, null
  )
on conflict (name) do nothing;

-- -------------------------------------------------------------- changing
create or replace function public.admin_set_renewal_date(p_id uuid, p_expires_on date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.renewals;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can do that.' using errcode = '42501';
  end if;
  select * into item from public.renewals r where r.id = p_id;
  if not found then
    raise exception 'No such renewal.' using errcode = '22023';
  end if;
  if item.sign_in_provider is not null then
    -- Its date lives there, with Apple's six-month check.
    perform public.admin_renew_sign_in_secret(item.sign_in_provider, p_expires_on);
    return;
  end if;
  if not item.expires then
    raise exception 'This one never runs out.' using errcode = '22023';
  end if;
  if p_expires_on is null or p_expires_on <= current_date
     or p_expires_on > current_date + interval '10 years' then
    raise exception 'The date should be after today and within ten years.' using errcode = '22023';
  end if;
  update public.renewals r
     set expires_on = p_expires_on,
         renewed_at = now(),
         renewed_by = auth.uid(),
         last_reminded_on = null
   where r.id = p_id;
end;
$$;

revoke all on function public.admin_set_renewal_date(uuid, date) from public, anon;
grant execute on function public.admin_set_renewal_date(uuid, date) to authenticated, service_role;

create or replace function public.admin_add_renewal(
  p_name text,
  p_purpose text,
  p_steps text[],
  p_expires boolean,
  p_expires_on date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_name text := btrim(coalesce(p_name, ''));
  clean_steps text[] := array(
    select btrim(s) from unnest(coalesce(p_steps, '{}')) with ordinality as u(s, n)
     where btrim(s) <> '' order by n
  );
  new_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can do that.' using errcode = '42501';
  end if;
  if clean_name = '' or char_length(clean_name) > 120 then
    raise exception 'Give it a name, up to 120 characters.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_purpose, '')) > 1000 then
    raise exception 'What it is for should be up to 1,000 characters.' using errcode = '22023';
  end if;
  if cardinality(clean_steps) > 20
     or exists (select 1 from unnest(clean_steps) s where char_length(s) > 1000) then
    raise exception 'Up to 20 steps, each up to 1,000 characters.' using errcode = '22023';
  end if;
  if p_expires is not true and p_expires_on is not null then
    raise exception 'Something that never runs out has no date.' using errcode = '22023';
  end if;
  if p_expires_on is not null
     and (p_expires_on <= current_date or p_expires_on > current_date + interval '10 years') then
    raise exception 'The date should be after today and within ten years.' using errcode = '22023';
  end if;
  if exists (select 1 from public.renewals r where lower(r.name) = lower(clean_name)) then
    raise exception 'There is already one called that.' using errcode = '22023';
  end if;
  insert into public.renewals (name, purpose, steps, expires, expires_on, created_by)
  values (clean_name, btrim(coalesce(p_purpose, '')), clean_steps, p_expires is true, p_expires_on, auth.uid())
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.admin_add_renewal(text, text, text[], boolean, date) from public, anon;
grant execute on function public.admin_add_renewal(text, text, text[], boolean, date)
  to authenticated, service_role;

-- ------------------------------------------------------------- reminding
-- What is due a reminder today, marked as reminded. sign-in-reminder only.
create or replace function public.renewals_due(p_secret text)
returns table (
  provider text,
  name text,
  purpose text,
  steps text[],
  expires_on date,
  days_left integer
)
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
  with secrets as (
    update public.sign_in_secrets t
       set last_reminded_on = current_date
     where t.last_reminded_on is distinct from current_date
       and (t.expires_on - current_date in (30, 14, 7, 3, 1) or t.expires_on <= current_date)
    returning t.provider, t.expires_on
  ),
  others as (
    update public.renewals r
       set last_reminded_on = current_date
     where r.sign_in_provider is null
       and r.expires_on is not null
       and r.last_reminded_on is distinct from current_date
       and (r.expires_on - current_date in (30, 14, 7, 3, 1) or r.expires_on <= current_date)
    returning r.name, r.purpose, r.steps, r.expires_on
  )
  select a.provider, n.name, n.purpose, n.steps, a.expires_on, (a.expires_on - current_date)::integer
    from secrets a left join public.renewals n on n.sign_in_provider = a.provider
  union all
  select null::text, o.name, o.purpose, o.steps, o.expires_on, (o.expires_on - current_date)::integer
    from others o;
end;
$$;

revoke all on function public.renewals_due(text) from public, anon, authenticated;
grant execute on function public.renewals_due(text) to service_role;
