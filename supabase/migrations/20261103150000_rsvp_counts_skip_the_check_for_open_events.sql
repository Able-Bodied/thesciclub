-- Going and interested counts without can_see_event() for events every member
-- sees (speed report of 2026-11-03, Fix 1).
--
-- The view called can_see_event() for every RSVP's event, about 1.3 ms each,
-- even for public and club events: 98% of an events page's time. The events
-- read rule (20261022180000) already skips it for those; the view now does the
-- same. For a 'public' or 'club' event can_see_event() is is_member() and the
-- event existing, and the join gives the second. Other audiences still ask it.
--
-- Same name, columns and grants (create or replace keeps grants; the security
-- barrier is restated). Probe: supabase/tests/rsvp-counts-shortcut.sql.

create or replace view public.event_rsvp_counts
with (security_barrier = true) as
select
  r.event_id,
  count(*) filter (where r.status = 'going')::int as going_count,
  count(*) filter (where r.status = 'interested')::int as interested_count
from public.event_rsvps r
join public.events e on e.id = r.event_id
where (select public.is_member())
  and (e.audience in ('public', 'club') or public.can_see_event(r.event_id))
group by r.event_id;
