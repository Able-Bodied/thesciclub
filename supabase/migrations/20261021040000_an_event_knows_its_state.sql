-- ============================================================================
-- An event knows its state
-- ============================================================================
-- The owner, 2026-10-20: with calendars from across the country, an event in
-- another state should say so, so a member sees at a glance that it is far
-- from home. The import fills it from the place, or from the map lookup; an
-- online event has none and is never marked. Hand-added events have none yet.
-- ============================================================================

alter table public.events add column if not exists state text
  check (state is null or state ~ '^[A-Z]{2}$');

comment on column public.events.state is
  'Two-letter US state of an in-person event, from its place; null online or unknown.';

grant select (state) on public.events to anon, authenticated;
