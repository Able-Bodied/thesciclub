-- Undo for 20261106090000_an_event_becomes_a_series.sql. Series already made
-- this way stay, as any series does.

drop function public.make_event_repeat(uuid, text, integer, date, integer);
