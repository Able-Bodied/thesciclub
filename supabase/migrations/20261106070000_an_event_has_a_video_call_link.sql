-- ============================================================================
-- An event has a video call link
-- ============================================================================
-- The owner, 2026-11-06: adding or changing an event, its organizer gives the
-- video call's link, and the event shows a Join button for it. Until now a
-- Zoom link only became one when it was typed into "More details at" or the
-- description.
--
-- events.meeting_url holds it, set by set_event_meeting_link after the event
-- is saved, as its cover is (20261011070000): on that date and, for a date of
-- a repeating event, every later one, and in the series' template, which a
-- trigger copies to each date the series makes later. save_event and
-- save_event_series are unchanged, so the store builds (1.0.5, 1.2.0) save as
-- before and keep the link they never see.
--
-- Undo: supabase/undo/20261106070000.sql.
-- ============================================================================

alter table public.events
  add column meeting_url text
  constraint events_meeting_url_shape
    check (meeting_url is null or (meeting_url ~ '^https://[^\s]+$' and char_length(meeting_url) <= 2000));

comment on column public.events.meeting_url is
  'The video call to join, https only. Written by set_event_meeting_link. See 20261106070000.';

grant select (meeting_url) on public.events to anon, authenticated;

create function public.set_event_meeting_link(event uuid, link text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.events%rowtype;
  clean text := nullif(btrim(coalesce(link, '')), '');
begin
  if auth.uid() is null then
    raise exception 'You are not signed in.' using errcode = '42501';
  end if;
  select * into existing from public.events e where e.id = event for update;
  if not found then
    raise exception 'That event is not on the calendar any more.' using errcode = 'P0002';
  end if;
  if not public.may_change_event(event) then
    raise exception 'You cannot change this event.' using errcode = '42501';
  end if;
  if clean is not null and (clean !~ '^https://[^\s]+$' or char_length(clean) > 2000) then
    raise exception 'The video call link has to start with https://.' using errcode = '22023';
  end if;

  update public.events e
     set meeting_url = clean,
         updated_at = now()
   where e.id = event
      or (
        existing.series_id is not null
        and e.series_id = existing.series_id
        and e.feed_id is null
        and e.start_time > existing.start_time
        and public.may_post_events_for(e.organization_id)
      );

  if existing.series_id is not null then
    update public.event_series s
       set template = s.template || jsonb_build_object('meeting_url', clean),
           updated_at = now()
     where s.id = existing.series_id and s.feed_id is null;
  end if;
end;
$$;
revoke all on function public.set_event_meeting_link(uuid, text) from public, anon;
grant execute on function public.set_event_meeting_link(uuid, text) to authenticated;

-- A date the series makes later takes the link its template has.
create function private.event_takes_its_series_meeting_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.series_id is not null and new.meeting_url is null and new.feed_id is null then
    select s.template ->> 'meeting_url' into new.meeting_url
      from public.event_series s
     where s.id = new.series_id and s.feed_id is null;
  end if;
  return new;
end;
$$;
revoke all on function private.event_takes_its_series_meeting_link() from public, anon, authenticated;

create trigger event_takes_its_series_meeting_link
  before insert on public.events
  for each row execute function private.event_takes_its_series_meeting_link();
