-- Undo for 20261103150000_rsvp_counts_skip_the_check_for_open_events.sql: the
-- view as 20261022180000 left it, from the repo (2026-11-03). Compare with the
-- live definition before release.

create or replace view public.event_rsvp_counts
with (security_barrier = true) as
select
  event_id,
  count(*) filter (where status = 'going')::int as going_count,
  count(*) filter (where status = 'interested')::int as interested_count
from public.event_rsvps
where (select public.is_member())
  and public.can_see_event(event_id)
group by event_id;
