-- ============================================================================
-- Admin → Stats: phone is not a way in
-- ============================================================================
-- The owner, 2026-10-16: phone sign-in is gone (2026-10-10) and nobody will
-- use it again, so Signing in no longer shows it. admin_sign_in_methods
-- (20261016000000) as it was, but a phone identity is not counted:
--
--   - An account made by phone that has since added email, Google or Apple
--     reads as made with the first of those, which is how it gets in now.
--   - An account with nothing but a phone (it cannot sign in at all) is in no
--     count of the way accounts were made, and is listed with none.
--
-- The identities themselves are left alone: only what Stats reads changes.
-- The phone number members add for event hosts is a different thing and
-- stays.
-- ============================================================================

create or replace function public.admin_sign_in_methods(period text default 'all')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  span interval;
  since timestamptz;
  until timestamptz;
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not an administrator' using errcode = '42501';
  end if;

  span := case period
    when '24h' then interval '1 day' when 'prev24h' then interval '1 day'
    when '7d' then interval '7 days' when 'prev7d' then interval '7 days'
    when '30d' then interval '30 days' when 'prev30d' then interval '30 days'
    when 'all' then null
  end;
  if period is null or (span is null and period <> 'all') then
    raise exception 'Unknown period: %', period using errcode = '22023';
  end if;
  until := case when period like 'prev%' then now() - span else now() end;
  since := coalesce(until - span, '-infinity'::timestamptz);

  with
  first_identity as (
    select distinct on (i.user_id) i.user_id, i.provider
      from auth.identities i
     where i.provider <> 'phone'
     order by i.user_id, i.created_at, i.id
  ),
  linked as (
    select i.user_id, jsonb_agg(distinct i.provider order by i.provider) as methods
      from auth.identities i
     where i.provider <> 'phone'
     group by i.user_id
  ),
  in_period as (
    select * from public.sign_ins s where s.at >= since and s.at < until
  ),
  latest as (
    select distinct on (s.user_id) s.user_id, s.at, s.method, s.home_screen
      from public.sign_ins s
     order by s.user_id, s.at desc
  ),
  per_account as (
    select p.user_id, count(*) as sign_ins,
           jsonb_agg(distinct p.method order by p.method) as methods
      from in_period p
     group by p.user_id
  ),
  accounts as (
    select u.id, u.email, u.created_at,
           f.provider as signed_up_with,
           coalesce(l.methods, '[]'::jsonb) as methods,
           m.id is not null as member, m.display_name, m.username::text as username, m.status,
           la.at as last_at, la.method as last_method, coalesce(la.home_screen, false) as last_home_screen,
           coalesce(pa.sign_ins, 0) as sign_ins,
           coalesce(pa.methods, '[]'::jsonb) as period_methods
      from auth.users u
      left join first_identity f on f.user_id = u.id
      left join linked l on l.user_id = u.id
      left join public.members m on m.id = u.id
      left join latest la on la.user_id = u.id
      left join per_account pa on pa.user_id = u.id
  ),
  made as (
    select * from accounts a where a.created_at >= since and a.created_at < until
  )
  select jsonb_build_object(
    'asOf', now(),
    'period', period,
    'recordedSince', (select min(s.at) from public.sign_ins s),
    'signUps', coalesce((
      select jsonb_object_agg(g.method, g.n)
        from (select signed_up_with as method, count(*) as n
                from made where signed_up_with is not null group by 1) g
    ), '{}'::jsonb),
    'signIns', coalesce((
      select jsonb_object_agg(g.method, jsonb_build_object('signIns', g.n, 'people', g.people))
        from (select p.method, count(*) as n, count(distinct p.user_id) as people
                from in_period p group by 1) g
    ), '{}'::jsonb),
    'homeScreen', (
      select jsonb_build_object('signIns', count(*), 'people', count(distinct p.user_id))
        from in_period p where p.home_screen
    ),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id,
               'name', a.display_name,
               'username', a.username,
               'email', case when a.member then null else a.email end,
               'member', a.member,
               'status', a.status,
               'createdAt', a.created_at,
               'signedUpWith', a.signed_up_with,
               'methods', a.methods,
               'lastSignInAt', a.last_at,
               'lastSignInMethod', a.last_method,
               'lastSignInHomeScreen', a.last_home_screen,
               'signIns', a.sign_ins,
               'signInMethods', a.period_methods
             ) order by a.last_at desc nulls last, a.created_at desc)
        from accounts a
       where (a.created_at >= since and a.created_at < until) or a.sign_ins > 0
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

comment on function public.admin_sign_in_methods(text) is
  'Admin → Stats: how each account was made and is signed in to, for a period. Names members. See 20261016000000 and 20261016010000.';

revoke all on function public.admin_sign_in_methods(text) from public, anon;
grant execute on function public.admin_sign_in_methods(text) to authenticated;
