-- ============================================================================
-- How the invites did: opened, link opened, going, joined
-- ============================================================================
-- The owner, 2026-11-14: "a page for the admin showing who opened the e-mail,
-- who viewed the event page, who RSVP'd, who also joined the club".
--
--   invites.opened_at       the email's picture was loaded (invite-opened, a
--                           1x1 image keyed by invites.open_key). A guess:
--                           some mail apps load every picture by themselves,
--                           some never do.
--   invites.link_opened_at  the link in it was used: the event's page read
--                           the invite (event_invite_page), or onboarding did
--                           (invite_details_for_token).
--   going                   the registration accepting made, or the member's
--                           RSVP once they joined.
--   joined                  invites.claimed_at, as before.
--
-- admin_invite_tracking: every emailed invite with those, newest first,
-- administrators only.
-- Nothing is renamed or dropped (the store app).
-- ============================================================================

alter table public.invites
  add column if not exists open_key uuid not null default gen_random_uuid(),
  add column if not exists opened_at timestamptz,
  add column if not exists link_opened_at timestamptz;
create unique index if not exists invites_open_key_idx on public.invites (open_key);
comment on column public.invites.open_key is
  'Names the invite in its email''s open picture, so the invite''s id is not in it. 20261114030000.';
comment on column public.invites.opened_at is
  'First time the email''s picture loaded: a guess at opened. 20261114030000.';
comment on column public.invites.link_opened_at is
  'First time the link in the email was used. 20261114030000.';

-- invite-opened (service role) marks it; nobody else may.
create function public.invite_opened(p_key uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.invites set opened_at = now()
   where open_key = p_key and opened_at is null and sent_at is not null;
$$;
revoke all on function public.invite_opened(uuid) from public, anon, authenticated;
grant execute on function public.invite_opened(uuid) to service_role;

-- ------------------------------------------- the link, as 20261114020000 --
-- Now notes the first time the link is used.
create or replace function public.invite_details_for_token(token text)
returns table (
  email text,
  name text,
  phone text,
  event_id uuid,
  status text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  hash text := encode(extensions.digest(btrim(coalesce(token, '')), 'sha256'), 'hex');
begin
  update public.invites i set link_opened_at = now()
   where i.token_hash = hash and i.link_opened_at is null and i.status = 'pending';
  return query
  select lower(i.email::text), coalesce(r.name, i.invitee_name), r.phone, r.event_id, r.status
    from public.invites i
    left join public.event_registrations r
      on r.id = i.event_registration_id
     and lower(r.email::text) = lower(i.email::text)
   where i.token_hash = hash
     and i.status = 'pending'
     and i.claimed_by is null
     and i.email is not null
     and not public.is_blocked_email(i.email::text)
   limit 1;
end;
$$;

create or replace function public.event_invite_page(p_token text)
returns table (
  id uuid,
  title text,
  description text,
  description_html text,
  start_time timestamptz,
  end_time timestamptz,
  all_day boolean,
  timezone text,
  location text,
  city text,
  state text,
  event_format text,
  url text,
  registration_url text,
  photo_path text,
  photo_alt text,
  more_photos jsonb,
  organization_id uuid,
  organization_name text,
  organization_short_code text,
  organization_logo_path text,
  takes_rsvps boolean,
  guest_email text,
  guest_name text,
  guest_phone text,
  inviter_name text,
  accepted boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  inv public.invites := private.event_invite_for_token(p_token);
begin
  if inv.id is null then
    return;
  end if;
  update public.invites set link_opened_at = now() where invites.id = inv.id and link_opened_at is null;
  return query
  select e.id, e.title, e.description, e.description_html, e.start_time, e.end_time,
         e.all_day, e.timezone, e.location, e.city, e.state, e.event_format, e.url,
         e.registration_url, e.photo_path, e.photo_alt, e.more_photos,
         o.id, o.name, o.short_code, o.logo_path,
         true,
         lower(inv.email::text), coalesce(r.name, inv.invitee_name), r.phone,
         im.display_name,
         r.id is not null
    from public.events e
    left join public.organizations o on o.id = e.organization_id and o.removed_at is null
    left join public.members im on im.id = inv.invited_by_member_id
    left join public.event_registrations r
      on r.id = inv.event_registration_id and lower(r.email::text) = lower(inv.email::text)
   where e.id = inv.event_id;
end;
$$;

-- -------------------------------------------------------- the admin's view --
create function public.admin_invite_tracking(p_limit integer default 500)
returns table (
  id uuid,
  email text,
  name text,
  status text,
  note text,
  inviter_name text,
  event_id uuid,
  event_title text,
  event_start timestamptz,
  created_at timestamptz,
  sent_at timestamptz,
  opened_at timestamptz,
  link_opened_at timestamptz,
  rsvp text,
  joined_at timestamptz,
  member_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not an administrator' using errcode = '42501';
  end if;
  return query
  select i.id,
         lower(i.email::text),
         coalesce(joined.display_name, r.name, i.invitee_name),
         i.status,
         i.note,
         coalesce(org.name, inviter.display_name),
         i.event_id,
         e.title,
         e.start_time,
         i.created_at,
         i.sent_at,
         i.opened_at,
         i.link_opened_at,
         coalesce(
           (select x.status from public.event_rsvps x
             where x.event_id = i.event_id and x.member_id = i.claimed_by),
           r.status),
         i.claimed_at,
         joined.display_name
    from public.invites i
    left join public.events e on e.id = i.event_id
    left join public.organizations org on org.id = i.invited_by_organization_id
    left join public.members inviter on inviter.id = i.invited_by_member_id
    left join public.members joined on joined.id = i.claimed_by
    left join public.event_registrations r
      on r.id = i.event_registration_id and lower(r.email::text) = lower(i.email::text)
   where i.sent_at is not null
     and i.email is not null
     and i.status <> 'revoked'
   order by i.created_at desc, i.id desc
   limit least(greatest(coalesce(p_limit, 500), 1), 1000);
end;
$$;
revoke all on function public.admin_invite_tracking(integer) from public, anon;
grant execute on function public.admin_invite_tracking(integer) to authenticated;
