-- ============================================================================
-- An event can have a short link of its organizers' choosing
-- ============================================================================
-- The owner, 2026-11-01: thesciclub.com/e/49ers, as well as the event's long
-- address, which keeps working. Whoever may change an event may set one. Lower
-- case letters, digits and hyphens, at most 32 characters, so it can never be
-- mistaken for an event's id. Set on its own rather than through save_event,
-- because it belongs to one date: a repeating event's other dates have none.
-- ============================================================================

alter table public.events
  add column short_link text unique
    check (short_link ~ '^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$');

comment on column public.events.short_link is
  'The event''s address after thesciclub.com/e/, chosen by its organizers. Null: only its id. See 20261101070000.';

grant select (short_link) on public.events to anon, authenticated;

-- The event a short link opens, for anybody with it, as public_event is. Its id
-- says nothing about the event.
create function public.event_by_short_link(p_link text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.id from public.events e where e.short_link = lower(btrim(p_link));
$$;

revoke all on function public.event_by_short_link(text) from public;
grant execute on function public.event_by_short_link(text) to anon, authenticated;

-- Empty takes it off, and frees it for another event. Who may is as save_event.
create function public.set_event_short_link(p_event uuid, p_link text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  link text := nullif(lower(btrim(coalesce(p_link, ''))), '');
  existing public.events%rowtype;
begin
  select * into existing from public.events e where e.id = p_event;
  if not found then
    raise exception 'That event is not on the calendar any more.' using errcode = 'P0002';
  end if;
  if not (
    public.is_admin()
    or (existing.feed_id is null and public.may_post_events_for(existing.organization_id))
  ) then
    raise exception 'You cannot change this event.' using errcode = '42501';
  end if;
  if link is not null and link !~ '^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$' then
    raise exception 'Use 2 to 32 letters, numbers or hyphens, starting and ending with a letter or number.'
      using errcode = '22023';
  end if;

  begin
    update public.events e set short_link = link where e.id = p_event;
  exception when unique_violation then
    raise exception 'That short link is taken. Try another.' using errcode = '23505';
  end;
  return link;
end;
$$;

revoke all on function public.set_event_short_link(uuid, text) from public, anon;
grant execute on function public.set_event_short_link(uuid, text) to authenticated;
