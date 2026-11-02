-- ============================================================================
-- How a member is seeing the club
--
-- The owner, 2026-11-01: "are we tracking what the user is seeing? ... through
-- Chrome, the home screen button, or the app? And what version of Chrome, what
-- resolution, dark mode versus light mode? ... once every 24 hours if the user
-- comes back and takes an action". So that a report of something looking wrong
-- can be matched to what the member has, and an old copy of the app is seen.
--
-- The owner, 2026-11-02: per member, in Admin → Stats, "so we can help prompt
-- users to install on home". Whether each device has been allowed to notify is
-- kept with it.
--
-- At most a row a day for each way a member comes (their Safari and their Home
-- Screen app are two, or the second would never show), on their first press or
-- keystroke. Only the kind of browser and its version, the operating system's
-- name, the screen's size, the theme, the notification permission and when
-- their copy of the app was built: never the whole browser string, which is
-- close to a fingerprint, and no IP address. Kept 180 days, and gone with the
-- account. Only an administrator can read it, by name, through
-- admin_member_devices: no member, and no client, can read the table.
-- ============================================================================

create table public.member_device_checks (
  member_id uuid not null references public.members (id) on delete cascade,
  seen_at timestamptz not null default now(),
  surface text not null check (surface in ('browser', 'home_screen', 'app')),
  browser text check (char_length(browser) <= 40),
  browser_version text check (char_length(browser_version) <= 20),
  os text check (char_length(os) <= 40),
  screen_width integer check (screen_width between 1 and 20000),
  screen_height integer check (screen_height between 1 and 20000),
  pixel_ratio numeric(4, 2) check (pixel_ratio > 0 and pixel_ratio < 100),
  color_scheme text check (color_scheme in ('light', 'dark')),
  -- Null where nothing can be asked: an iPhone's browser, or the store app.
  notifications text check (notifications in ('allowed', 'refused', 'not_asked')),
  app_built text check (char_length(app_built) <= 20),
  primary key (member_id, seen_at)
);

comment on table public.member_device_checks is
  'How a member saw the club, at most daily for each way they come, for 180 days. See 20261102000000.';

alter table public.member_device_checks enable row level security;
revoke all on public.member_device_checks from public, anon, authenticated;

-- The device asks daily, and this says so too: a cleared browser does not add
-- a row. Answers whether it recorded one, which is all the device needs. Five
-- a day in all, or a made-up browser name each time would be a row each time.
create function public.note_device(
  p_surface text,
  p_browser text,
  p_browser_version text,
  p_os text,
  p_screen_width integer,
  p_screen_height integer,
  p_pixel_ratio numeric,
  p_color_scheme text,
  p_notifications text,
  p_app_built text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  member uuid := auth.uid();
begin
  if member is null or not exists (
    select 1 from public.members m where m.id = member and m.status = 'active'
  ) then
    return false;
  end if;
  if exists (
    select 1 from public.member_device_checks c
     where c.member_id = member
       and c.seen_at > now() - interval '24 hours'
       and c.surface = p_surface
       and c.os is not distinct from left(p_os, 40)
       and c.browser is not distinct from left(p_browser, 40)
  ) or (
    select count(*) from public.member_device_checks c
     where c.member_id = member and c.seen_at > now() - interval '24 hours'
  ) >= 5 then
    return false;
  end if;

  insert into public.member_device_checks (
    member_id, surface, browser, browser_version, os, screen_width, screen_height,
    pixel_ratio, color_scheme, notifications, app_built
  )
  values (
    member, p_surface, left(p_browser, 40), left(p_browser_version, 20), left(p_os, 40),
    p_screen_width, p_screen_height, round(p_pixel_ratio, 2), p_color_scheme,
    p_notifications, left(p_app_built, 20)
  );

  delete from public.member_device_checks c
   where c.member_id = member and c.seen_at < now() - interval '180 days';
  return true;
end;
$$;

revoke all on function public.note_device(text, text, text, text, integer, integer, numeric, text, text, text)
  from public, anon;
grant execute on function public.note_device(text, text, text, text, integer, integer, numeric, text, text, text)
  to authenticated;

-- Every current member, seen or not, with the latest row for each way they
-- have come, and how many devices can be notified now.
create function public.admin_member_devices()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not an administrator' using errcode = '42501';
  end if;

  with
  latest as (
    select distinct on (c.member_id, c.surface, c.os, c.browser) c.*
      from public.member_device_checks c
     order by c.member_id, c.surface, c.os, c.browser, c.seen_at desc
  ),
  devices as (
    select l.member_id,
           jsonb_agg(jsonb_build_object(
             'surface', l.surface,
             'browser', l.browser,
             'browserVersion', l.browser_version,
             'os', l.os,
             'screenWidth', l.screen_width,
             'screenHeight', l.screen_height,
             'pixelRatio', l.pixel_ratio,
             'colorScheme', l.color_scheme,
             'notifications', l.notifications,
             'seenAt', l.seen_at
           ) order by l.seen_at desc) as devices
      from latest l
     group by l.member_id
  ),
  notified as (
    select p.member_id, count(*) as devices
      from public.push_subscriptions p
     group by p.member_id
  )
  select jsonb_build_object(
    'asOf', now(),
    'recordedSince', (select min(c.seen_at) from public.member_device_checks c),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id,
               'name', m.display_name,
               'username', m.username::text,
               'notifiedDevices', coalesce(n.devices, 0),
               'devices', coalesce(d.devices, '[]'::jsonb)
             ) order by m.display_name)
        from public.members m
        left join devices d on d.member_id = m.id
        left join notified n on n.member_id = m.id
       where m.status = 'active'
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

comment on function public.admin_member_devices() is
  'Admin → Stats: what each member uses to reach the club. Names members. See 20261102000000.';

revoke all on function public.admin_member_devices() from public, anon;
grant execute on function public.admin_member_devices() to authenticated;
