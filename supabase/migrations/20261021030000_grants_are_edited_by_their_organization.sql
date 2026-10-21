-- ============================================================================
-- Grants are edited on Admin, by whoever edits their organization
-- ============================================================================
-- The owner, 2026-10-20: a screen for grant dates, so a round can be entered
-- when an organization announces it (Kelly Brush's 2027 Active Fund, say).
-- Whoever may edit the organization (can_edit_organization: an administrator,
-- or its own account) may edit its grants, as with its logo.
--
-- A save replaces the grant's windows with the ones sent. So "told already"
-- is kept per grant and cycle, not per window: correcting a closing date on
-- an open round must not tell its followers a second time. grant_open_notices
-- was empty when this replaced it.
-- ============================================================================

drop table if exists public.grant_open_notices;
create table public.grant_open_notices (
  grant_id uuid not null references public.organization_grants (id) on delete cascade,
  cycle_opens date not null,
  sent_at timestamptz not null default now(),
  primary key (grant_id, cycle_opens)
);

comment on table public.grant_open_notices is
  'One row per grant and cycle whose opening followers were told about, so it is told once.';

alter table public.grant_open_notices enable row level security;
revoke all on public.grant_open_notices from public, anon, authenticated;
grant select, insert, update, delete on public.grant_open_notices to service_role;

-- As 20261021010000, keyed by grant.
create or replace function public.grant_windows_notify()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'America/Los_Angeles')::date;
  w record;
begin
  for w in
    select gw.id, gw.grant_id, c.cycle_opens
      from public.organization_grant_windows gw
      join public.organization_grants g on g.id = gw.grant_id
      join public.organizations o on o.id = g.organization_id and o.removed_at is null
      cross join lateral public.grant_window_cycle(gw.opens_on, gw.closes_on, gw.yearly, today) c
     where c.cycle_opens <= today
  loop
    insert into public.grant_open_notices (grant_id, cycle_opens)
    values (w.grant_id, w.cycle_opens)
    on conflict do nothing;
    if found then
      perform public.push_notify_send('grant_open', jsonb_build_object('id', w.id));
    end if;
  end loop;
end;
$$;

revoke all on function public.grant_windows_notify() from public, anon, authenticated;

-- ------------------------------------------------------------------ saving
-- `windows` is a JSON array of { opens_on, closes_on, yearly }. Returns the
-- grant's id, which a new one only has once saved.
create or replace function public.save_organization_grant(
  grant_id uuid,
  organization uuid,
  name text,
  url text,
  summary text,
  apply_any_time boolean,
  windows jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved uuid;
  w jsonb;
  opens date;
  closes date;
  yearly boolean;
begin
  if not public.can_edit_organization(organization) then
    raise exception 'You cannot change this organization.' using errcode = '42501';
  end if;
  if grant_id is not null and not exists (
    select 1 from public.organization_grants g
     where g.id = save_organization_grant.grant_id and g.organization_id = organization
  ) then
    raise exception 'That grant is not this organization''s.' using errcode = '42501';
  end if;
  if name is null or length(btrim(name)) not between 1 and 120
    or url is null or url !~ '^https://[^[:space:]]+$' or length(url) > 2000
    or summary is null or length(summary) > 400
    or apply_any_time is null
    or windows is null or jsonb_typeof(windows) <> 'array' or jsonb_array_length(windows) > 6 then
    raise exception 'Enter a name, a link starting https://, a summary of up to 400 characters, and up to six rounds.'
      using errcode = '22023';
  end if;

  if grant_id is null then
    insert into public.organization_grants (organization_id, name, url, summary, apply_any_time)
    values (organization, btrim(name), btrim(url), btrim(summary), apply_any_time)
    returning id into saved;
  else
    update public.organization_grants g
       set name = btrim(save_organization_grant.name),
           url = btrim(save_organization_grant.url),
           summary = btrim(save_organization_grant.summary),
           apply_any_time = save_organization_grant.apply_any_time,
           updated_at = now()
     where g.id = save_organization_grant.grant_id
    returning g.id into saved;
    delete from public.organization_grant_windows x where x.grant_id = saved;
  end if;

  for w in select * from jsonb_array_elements(windows) loop
    begin
      opens := (w ->> 'opens_on')::date;
      closes := (w ->> 'closes_on')::date;
      yearly := coalesce((w ->> 'yearly')::boolean, false);
    exception when others then
      raise exception 'Each round needs an opening and a closing date.' using errcode = '22023';
    end;
    if opens is null or closes is null then
      raise exception 'Each round needs an opening and a closing date.' using errcode = '22023';
    end if;
    if not yearly and closes < opens then
      raise exception 'A round cannot close before it opens.' using errcode = '22023';
    end if;
    if yearly and (to_char(opens, 'MM-DD') = '02-29' or to_char(closes, 'MM-DD') = '02-29') then
      raise exception 'A round every year cannot open or close on February 29.' using errcode = '22023';
    end if;
    insert into public.organization_grant_windows (grant_id, opens_on, closes_on, yearly)
    values (saved, opens, closes, yearly);
  end loop;
  return saved;
exception when unique_violation then
  raise exception 'This organization already has a grant with that name.' using errcode = '23505';
end;
$$;

create or replace function public.remove_organization_grant(grant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization uuid;
begin
  select g.organization_id into organization
    from public.organization_grants g where g.id = remove_organization_grant.grant_id;
  if organization is null or not public.can_edit_organization(organization) then
    raise exception 'You cannot change this organization.' using errcode = '42501';
  end if;
  delete from public.organization_grants g where g.id = remove_organization_grant.grant_id;
end;
$$;

revoke all on function public.save_organization_grant(uuid, uuid, text, text, text, boolean, jsonb) from public, anon;
revoke all on function public.remove_organization_grant(uuid) from public, anon;
grant execute on function public.save_organization_grant(uuid, uuid, text, text, text, boolean, jsonb) to authenticated;
grant execute on function public.remove_organization_grant(uuid) to authenticated;
