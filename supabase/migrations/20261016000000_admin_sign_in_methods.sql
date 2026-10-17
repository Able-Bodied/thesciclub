-- ============================================================================
-- Admin → Stats: how each member signs up and signs in
-- ============================================================================
-- The owner, 2026-10-16: which member signed up with email, Google or Apple,
-- and which they sign in with. This one names people, unlike the rest of
-- Stats (20261015020000): the owner chose to, and the privacy policy says so.
--
-- ---------------------------------------------------------------------------
-- The way an account was made
-- ---------------------------------------------------------------------------
-- Its first identity. Supabase keeps one for each way in (email, google,
-- apple; phone on accounts from before 2026-10-10), so an account that joined
-- by email and linked Google from Me later was still made with email.
--
-- ---------------------------------------------------------------------------
-- Each sign-in: sign_ins, kept by the club
-- ---------------------------------------------------------------------------
-- Not Supabase's own log, auth.audit_log_entries: the hosted project does not
-- write it to the database (checked by the owner, 2026-10-16), and turning
-- that on would keep every member's email and IP address with each token
-- refresh, for ever. Nor auth.identities.last_sign_in_at: a password sign-in
-- does not touch it (seen on the local stack).
--
-- So the app reports each new session once (src/lib/sign-in-record.ts), and
-- the database decides what it was. A session's token says how the session
-- began (its amr): password, oauth, otp... record_sign_in reads that, never
-- the app's word, and keeps one row a session, at the time the session began,
-- so a report sent again, or late after a failed first try, changes nothing.
-- What the app adds is only what the token cannot say:
--
--   provider_hint     google or apple, for an oauth session. Believed only if
--                     the account has it linked; without it, the one linked,
--                     or the one Supabase updated last.
--   via_home_screen   the iPhone Home Screen app took a sign-in over from
--                     Safari or Chrome (home-screen-handoff, and Google by way
--                     of the browser). That signs in with a one-time email
--                     code whatever the member used, so it is recorded as the
--                     member's latest sign-in that was not a link, marked as
--                     the Home Screen app's.
--
-- A one-time link otherwise ('link') is a password reset or an emailed link.
-- A member can only report their own current session, so the worst a false
-- hint does is call their own Google sign-in Apple when both are linked.
--
-- Kept with no email address and no IP address: who, which way, whether in
-- the Home Screen app, and when. Goes with the account.
--
-- ---------------------------------------------------------------------------
-- admin_sign_in_methods(period)
-- ---------------------------------------------------------------------------
-- Period: as admin_club_stats. Sign-ins are kept from this release on, which
-- recordedSince says. The list is every account made or signed in to in the
-- period, newest sign-in first; its last sign-in is the latest ever. An email
-- address is listed only for an account that is not a member yet, which has
-- no name to go by.
-- ============================================================================

create table public.sign_ins (
  session_id  uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  method      text not null check (method ~ '^[a-z/_]{1,24}$'),
  home_screen boolean not null default false,
  at          timestamptz not null
);

create index sign_ins_user_at_idx on public.sign_ins (user_id, at desc);
create index sign_ins_at_idx on public.sign_ins (at);

comment on table public.sign_ins is
  'One row a sign-in session: who, which way, whether in the Home Screen app, and when. Written by record_sign_in, read by admin_sign_in_methods. See 20261016000000.';

alter table public.sign_ins enable row level security;
revoke all on public.sign_ins from public, anon, authenticated;

create or replace function public.record_sign_in(
  provider_hint text default null,
  via_home_screen boolean default false
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  claims jsonb := auth.jwt();
  sid uuid;
  began timestamptz;
  amr text;
  way text;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  -- The session must still be this account's: a token outlives a sign-out.
  sid := nullif(claims ->> 'session_id', '')::uuid;
  select s.created_at into began
    from auth.sessions s
   where s.id = sid and s.user_id = me;
  if began is null then
    return null;
  end if;

  -- How the session began; with a second factor, the first of them.
  select e ->> 'method' into amr
    from jsonb_array_elements(coalesce(claims -> 'amr', '[]'::jsonb)) e
   order by (e ->> 'timestamp')::bigint
   limit 1;

  way := case
    when amr in ('password', 'email/signup') then 'email'
    when amr = 'oauth' then coalesce(
      (select i.provider from auth.identities i
        where i.user_id = me and i.provider in ('google', 'apple') and i.provider = provider_hint
        limit 1),
      (select i.provider from auth.identities i
        where i.user_id = me and i.provider in ('google', 'apple')
        order by i.updated_at desc nulls last
        limit 1),
      'oauth')
    when amr in ('otp', 'magiclink', 'recovery', 'invite', 'email_change') then 'link'
    else coalesce(amr, 'unknown')
  end;

  if via_home_screen and way = 'link' then
    way := coalesce(
      (select r.method from public.sign_ins r
        where r.user_id = me and r.method <> 'link' and r.at <= began
        order by r.at desc
        limit 1),
      'link');
  end if;

  insert into public.sign_ins (session_id, user_id, method, home_screen, at)
  values (sid, me, way, coalesce(via_home_screen, false), began)
  on conflict (session_id) do nothing;

  -- What is kept, which a session reported before keeps.
  return (select r.method from public.sign_ins r where r.session_id = sid);
end;
$$;

comment on function public.record_sign_in(text, boolean) is
  'Records the caller''s current session once, the way it began read from its token, and returns the way kept. See 20261016000000.';

revoke all on function public.record_sign_in(text, boolean) from public, anon;
grant execute on function public.record_sign_in(text, boolean) to authenticated;

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
     order by i.user_id, i.created_at, i.id
  ),
  linked as (
    select i.user_id, jsonb_agg(distinct i.provider order by i.provider) as methods
      from auth.identities i
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
           coalesce(f.provider, u.raw_app_meta_data ->> 'provider') as signed_up_with,
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
        from (select coalesce(signed_up_with, 'unknown') as method, count(*) as n
                from made group by 1) g
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
  'Admin → Stats: how each account was made and is signed in to, for a period. Names members. See 20261016000000.';

revoke all on function public.admin_sign_in_methods(text) from public, anon;
grant execute on function public.admin_sign_in_methods(text) to authenticated;
