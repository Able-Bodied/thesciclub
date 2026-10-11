-- ============================================================================
-- An administrator can give an imported event a cover picture
-- ============================================================================
-- The owner, 2026-10-11: on an imported event an administrator may now
-- change everything (20261012060000), and adding a cover picture was missing
-- from that. Covers (20261011070000) were allowed only on events added in the
-- club, through may_change_event; this restates it so an administrator also
-- may change an event that came from a calendar.
--
-- Nothing else moves. set_event_photo and the photos bucket's insert and
-- delete policies all ask may_change_event, so they follow. The ingest never
-- writes photo_path or photo_alt, so a cover added this way stays through
-- each night's import. On a scraped series a cover goes on that date only:
-- set_event_photo spreads to later dates and the template only within a
-- series made in the club.
-- ============================================================================

create or replace function public.may_change_event(event uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
     where e.id = event
       and (
         (e.feed_id is null and public.may_post_events_for(e.organization_id))
         or (e.feed_id is not null and public.is_admin())
       )
  );
$$;

comment on function public.may_change_event(uuid) is
  'An event the caller may change: one added in the club, by save_event''s rule; or, for an administrator, one from a calendar. For storage and set_event_photo.';
