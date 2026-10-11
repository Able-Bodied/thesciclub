-- Event pages became members-only on 2026-10-08 (CONTEXT.md), but the
-- original public-calendar policies still exposed their records through REST.
-- Gate the calendar and its related rows, including the definer count view.
-- Public organization descriptions/logos and the tag vocabulary still serve
-- the closed door. Ingest and scheduled series creation use the service role.

drop policy if exists "events are public" on public.events;
create policy "members read events"
  on public.events for select to authenticated
  using ((select public.is_member()));

drop policy if exists "event series are public" on public.event_series;
create policy "members read event series"
  on public.event_series for select to authenticated
  using ((select public.is_member()));

drop policy if exists "event tags are public" on public.event_tags;
create policy "members read event tags"
  on public.event_tags for select to authenticated
  using ((select public.is_member()));

-- The view deliberately counts everybody's RSVP, rather than only the
-- caller's own row. A definer view bypasses table RLS, so it needs its own gate.
create or replace view public.event_rsvp_counts
with (security_barrier = true) as
select
  event_id,
  count(*) filter (where status = 'going')::int as going_count,
  count(*) filter (where status = 'interested')::int as interested_count
from public.event_rsvps
where (select public.is_member())
group by event_id;

revoke all on public.event_rsvp_counts from public, anon, authenticated;
grant select on public.event_rsvp_counts to authenticated;
