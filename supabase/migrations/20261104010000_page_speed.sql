-- ============================================================================
-- How fast the app is for the people using it
-- ============================================================================
-- The owner, 2026-11-04: "add logging that measures page load speeds for
-- people". Each app load sends how long it took (first byte, first paint,
-- largest paint, page ready), and how long each request to the club took,
-- named by what was asked (rpc:map_events, table:members), never with its
-- arguments.
--
-- Not tied to anybody: no member id, no address, no IP. A screen is its
-- pattern (/events/:id), never which event or person. A random id per page
-- load groups one visit's samples. Kept 30 days. Administrators read
-- summaries through admin_page_speed.
-- ============================================================================

create table public.page_speed_samples (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  visit      text not null check (char_length(visit) between 8 and 40),
  kind       text not null check (kind in ('load', 'request')),
  screen     text not null check (char_length(screen) between 1 and 80),
  metric     text not null check (char_length(metric) between 1 and 80),
  ms         integer not null check (ms between 0 and 600000),
  ok         boolean not null default true,
  signed_in  boolean not null default false,
  installed  boolean not null default false,
  mobile     boolean not null default false,
  connection text check (connection is null or char_length(connection) <= 12)
);

create index page_speed_samples_created_idx on public.page_speed_samples (created_at);

alter table public.page_speed_samples enable row level security;
revoke all on public.page_speed_samples from public, anon, authenticated;

comment on table public.page_speed_samples is
  'Anonymous load and request timings from the app. Written by log_page_speed, read by admin_page_speed, kept 30 days. See 20261104010000.';

-- ------------------------------------------------------------ writing --
-- For anybody, signed in or not. At most 50 samples a call, and nothing at
-- all once the table has taken 20,000 in the last ten minutes, so a script
-- cannot fill it. Bad samples are skipped, not refused: this is never worth
-- an error on somebody's screen.
create function public.log_page_speed(samples jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(samples) <> 'array' or jsonb_array_length(samples) = 0 then
    return;
  end if;
  if (select count(*) from public.page_speed_samples
       where created_at > now() - interval '10 minutes') > 20000 then
    return;
  end if;

  insert into public.page_speed_samples
    (visit, kind, screen, metric, ms, ok, signed_in, installed, mobile, connection)
  select left(s->>'visit', 40),
         s->>'kind',
         left(s->>'screen', 80),
         left(s->>'metric', 80),
         least(greatest(round((s->>'ms')::numeric), 0), 600000)::integer,
         coalesce((s->>'ok')::boolean, true),
         (select auth.uid()) is not null,
         coalesce((s->>'installed')::boolean, false),
         coalesce((s->>'mobile')::boolean, false),
         nullif(left(s->>'connection', 12), '')
    from (select value as s from jsonb_array_elements(samples) limit 50) x
   where s->>'kind' in ('load', 'request')
     and char_length(coalesce(s->>'visit', '')) between 8 and 40
     and char_length(coalesce(s->>'screen', '')) >= 1
     and char_length(coalesce(s->>'metric', '')) >= 1
     and jsonb_typeof(s->'ms') = 'number';
end;
$$;

revoke all on function public.log_page_speed(jsonb) from public;
grant execute on function public.log_page_speed(jsonb) to anon, authenticated;

-- ------------------------------------------------------------ reading --
-- For administrators: the middle (p50) and slow end (p90) of each metric, by
-- screen for loads and by what was asked for requests, over the last `days`.
create function public.admin_page_speed(days integer default 7)
returns table (
  kind text,
  screen text,
  metric text,
  samples bigint,
  visits bigint,
  p50_ms integer,
  p90_ms integer,
  max_ms integer,
  failed bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only administrators see page speed.' using errcode = '42501';
  end if;

  return query
    select s.kind,
           case when s.kind = 'load' then s.screen else '' end,
           s.metric,
           count(*),
           count(distinct s.visit),
           (percentile_cont(0.5) within group (order by s.ms))::integer,
           (percentile_cont(0.9) within group (order by s.ms))::integer,
           max(s.ms),
           count(*) filter (where not s.ok)
      from public.page_speed_samples s
     where s.created_at > now() - make_interval(days => least(greatest(coalesce(days, 7), 1), 30))
     group by 1, 2, 3
     order by 1, 7 desc;
end;
$$;

revoke all on function public.admin_page_speed(integer) from public, anon;
grant execute on function public.admin_page_speed(integer) to authenticated;

-- For the chart (the owner, 2026-11-04): how long the app took to be ready,
-- typical and slow end, by hour over a day, else by day. Only buckets with
-- samples are returned.
create function public.admin_page_speed_trend(days integer default 7)
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
     where s.kind = 'load' and s.metric = 'ready'
       and s.created_at > now() - make_interval(days => span)
     group by 1
     order by 1;
end;
$$;

revoke all on function public.admin_page_speed_trend(integer) from public, anon;
grant execute on function public.admin_page_speed_trend(integer) to authenticated;

-- ------------------------------------------------------------ keeping --
do $$
begin
  perform cron.schedule(
    'page-speed-expire',
    '25 9 * * *',
    $job$delete from public.page_speed_samples where created_at < now() - interval '30 days'$job$
  );
end;
$$;
