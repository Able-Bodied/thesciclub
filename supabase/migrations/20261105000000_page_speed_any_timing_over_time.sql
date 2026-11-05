-- ============================================================================
-- Page speed over time, for any load timing
-- ============================================================================
-- The owner, 2026-11-04: time until the cards on Events and Peers are shown
-- with their data (cards-after-open, cards-after-tap; src/lib/page-speed.ts).
-- The samples need nothing new; the chart's function, which only read
-- 'ready', now takes the timing to chart. 'ready' turned out to be before
-- anything is drawn, so the opening chart reads first-paint instead.
-- ============================================================================

drop function public.admin_page_speed_trend(integer);

create function public.admin_page_speed_trend(
  days integer default 7,
  timing text default 'first-paint'
)
returns table (
  bucket timestamptz,
  loads bigint,
  p50_ms integer,
  p90_ms integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  span integer := least(greatest(coalesce(days, 7), 1), 30);
  unit text := case when least(greatest(coalesce(days, 7), 1), 30) = 1 then 'hour' else 'day' end;
begin
  if not public.is_admin() then
    raise exception 'Only administrators see page speed.' using errcode = '42501';
  end if;

  return query
    select date_trunc(unit, s.created_at, 'America/Los_Angeles'),
           count(*),
           (percentile_cont(0.5) within group (order by s.ms))::integer,
           (percentile_cont(0.9) within group (order by s.ms))::integer
      from public.page_speed_samples s
     where s.kind = 'load' and s.metric = coalesce(timing, 'first-paint')
       and s.created_at > now() - make_interval(days => span)
     group by 1
     order by 1;
end;
$$;

revoke all on function public.admin_page_speed_trend(integer, text) from public, anon;
grant execute on function public.admin_page_speed_trend(integer, text) to authenticated;
