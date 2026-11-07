-- Undo for 20261106070000_an_event_has_a_video_call_link.sql. Drops the links
-- organizers gave; the series templates keep a harmless meeting_url key.

drop trigger event_takes_its_series_meeting_link on public.events;
drop function private.event_takes_its_series_meeting_link();
drop function public.set_event_meeting_link(uuid, text);
alter table public.events drop column meeting_url;
