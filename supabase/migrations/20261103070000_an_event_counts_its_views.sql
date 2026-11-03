-- ============================================================================
-- An event counts its views
-- ============================================================================
-- The owner, 2026-11-02: "add view count stats on event pages for admins",
-- "maybe also view count of external page separately", "also lets add rsvp
-- clicks on public page".
--
-- Two counts, kept apart:
--   * in the app: which members opened the event, and how often. The member
--     who added it is not counted, as an author's own view of a post is not
--     (20261016020000).
--   * the public page (/e/...): a number per day and nothing else. No
--     address, device or anything that could say who; the club still keeps
--     nothing about a visitor. Taps on its RSVP and Interested buttons are
--     counted the same way, beside the opens.
--
-- record_event_view is called once per visit by the page; the public count
-- can be pushed up by somebody calling it on purpose, which costs nothing but
-- a wrong number. event_view_stats answers the club's administrators and the
-- org admins of the event's organization, in counts only.
-- ============================================================================

create table if not exists public.event_member_views (
  event_id uuid not null references public.events (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  opens integer not null default 1,
  primary key (event_id, member_id)
);

comment on table public.event_member_views is
  'Which members opened an event in the app, and how often. Counts only leave the database. See 20261103070000.';

alter table public.event_member_views enable row level security;
revoke all on public.event_member_views from public, anon, authenticated;

create table if not exists public.event_public_opens (
  event_id uuid not null references public.events (id) on delete cascade,
  day date not null default current_date,
  opens integer not null default 0,
  rsvp_clicks integer not null default 0,
  interested_clicks integer not null default 0,
  primary key (event_id, day)
);

comment on table public.event_public_opens is
  'How many times an event''s public page was opened, and its RSVP and Interested tapped, by day, with nothing about who. See 20261103070000.';

alter table public.event_public_opens enable row level security;
revoke all on public.event_public_opens from public, anon, authenticated;

create or replace function public.record_event_view(p_event uuid, p_public boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if not exists (select 1 from public.events e where e.id = p_event) then
    return;
  end if;

  if p_public then
    insert into public.event_public_opens as o (event_id, opens)
    values (p_event, 1)
    on conflict (event_id, day) do update set opens = o.opens + 1;
    return;
  end if;

  if me is null or not public.is_member() then
    return;
  end if;
  if exists (select 1 from public.events e where e.id = p_event and e.added_by = me) then
    return;
  end if;
  insert into public.event_member_views as v (event_id, member_id)
  values (p_event, me)
  on conflict (event_id, member_id) do update
    set opens = v.opens + 1, last_at = now();
end;
$$;

revoke all on function public.record_event_view(uuid, boolean) from public;
grant execute on function public.record_event_view(uuid, boolean) to anon, authenticated;

-- A tap on the public page's RSVP (p_going) or Interested, before the form.
create or replace function public.record_event_rsvp_click(p_event uuid, p_going boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.events e where e.id = p_event) then
    return;
  end if;
  insert into public.event_public_opens as o (event_id, rsvp_clicks, interested_clicks)
  values (p_event, case when p_going then 1 else 0 end, case when p_going then 0 else 1 end)
  on conflict (event_id, day) do update
    set rsvp_clicks = o.rsvp_clicks + excluded.rsvp_clicks,
        interested_clicks = o.interested_clicks + excluded.interested_clicks;
end;
$$;

revoke all on function public.record_event_rsvp_click(uuid, boolean) from public;
grant execute on function public.record_event_rsvp_click(uuid, boolean) to anon, authenticated;

create or replace function public.event_view_stats(p_event uuid)
returns table (
  members bigint,
  member_opens bigint,
  public_opens bigint,
  rsvp_clicks bigint,
  interested_clicks bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (
    public.is_admin()
    or exists (
      select 1 from public.events e
       where e.id = p_event and e.organization_id is not null and public.speaks_for(e.organization_id)
    )
  ) then
    raise exception 'Only administrators see how often an event was viewed.' using errcode = '42501';
  end if;

  return query
    select (select count(*) from public.event_member_views v where v.event_id = p_event),
           (select coalesce(sum(v.opens), 0)::bigint from public.event_member_views v where v.event_id = p_event),
           (select coalesce(sum(o.opens), 0)::bigint from public.event_public_opens o where o.event_id = p_event),
           (select coalesce(sum(o.rsvp_clicks), 0)::bigint from public.event_public_opens o where o.event_id = p_event),
           (select coalesce(sum(o.interested_clicks), 0)::bigint from public.event_public_opens o where o.event_id = p_event);
end;
$$;

revoke all on function public.event_view_stats(uuid) from public, anon;
grant execute on function public.event_view_stats(uuid) to authenticated;
