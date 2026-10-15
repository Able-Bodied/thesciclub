-- ============================================================================
-- Admin → Stats: how the club is being used, from what it already keeps
-- ============================================================================
-- The owner, 2026-10-13, instead of Google Analytics: the privacy policy says
-- there is no analytics or tracking, and the page's Content-Security-Policy
-- keeps every script but the club's own (and Google sign-in) away from the
-- session in localStorage. So nothing new is collected and nothing is sent
-- anywhere. This only counts rows the club already has.
--
-- Counts only, never who: an administrator sees how many opened the app, not
-- which members did, and how many direct messages were sent, not between whom.
--
-- ---------------------------------------------------------------------------
-- A period (the owner, 2026-10-15)
-- ---------------------------------------------------------------------------
-- 'all' (the default), '24h', 'prev24h', '7d', 'prev7d', '30d', 'prev30d'.
-- A "previous" period is the one just before: prev7d is 14 to 7 days ago.
--
-- "Opened the app" is a session that was used: Supabase refreshes a session's
-- token about hourly while the app is open, and stamps refreshed_at or
-- updated_at when it does. A session keeps only when it was last used, so
-- this can say how many opened the app since a moment, never how many did
-- between two moments in the past: it is null for a previous period. For all
-- time it is the members who have ever signed in.
--
-- The way in is a cohort: of the accounts made in the period, how many signed
-- in (and so started onboarding), how many are members (onboarding makes the
-- member as its last step, just before Home), and how many members have
-- notifications on now, on at least one device. An account that never signed
-- in submitted the join form and never pressed the link in its confirmation
-- email; Google and Apple sign in as they make the account. Visitors who
-- opened the app and left without an account are not counted: the club keeps
-- nothing about them, and the owner chose not to start.
--
-- The eight weeks at the bottom do not follow the period. Weeks start on
-- Monday in California, where the owner is.
-- ============================================================================

create or replace function public.admin_club_stats(period text default 'all')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  zone constant text := 'America/Los_Angeles';
  this_week date := date_trunc('week', now() at time zone zone)::date;
  first_week date := this_week - 7 * 7;
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
  -- All time runs from the beginning, which no row predates.
  until := case when period like 'prev%' then now() - span else now() end;
  since := coalesce(until - span, '-infinity'::timestamptz);

  with
  current_members as (
    select m.id, m.created_at
      from public.members m
     where m.status = 'active'
  ),
  last_used as (
    -- refreshed_at is a timestamp without a zone, in UTC.
    select s.user_id,
           max(greatest(s.created_at, s.updated_at, s.refreshed_at at time zone 'UTC')) as at
      from auth.sessions s
      join current_members m on m.id = s.user_id
     group by s.user_id
  ),
  -- The opening post of each topic is the question, not a reply.
  posts as (
    select p.author_id, p.created_at,
           row_number() over (partition by p.topic_id order by p.created_at, p.id) = 1 as opening
      from public.chat_posts p
  ),
  activity as (
    select 'question' as kind, t.author_id as who, t.created_at as at from public.chat_topics t
    union all
    select 'reply', p.author_id, p.created_at from posts p where not p.opening
    union all
    select 'message', c.author_id, c.created_at from public.chat_messages c
    union all
    select 'rsvp', r.member_id, r.created_at from public.event_rsvps r
  ),
  in_period as (
    select * from activity a where a.at >= since and a.at < until
  ),
  weekly as (
    select date_trunc('week', a.at at time zone zone)::date as week,
           count(*) filter (where a.kind = 'question') as questions,
           count(*) filter (where a.kind = 'reply') as replies,
           count(*) filter (where a.kind = 'message') as messages,
           count(*) filter (where a.kind = 'rsvp') as rsvps,
           count(distinct a.who) as people
      from activity a
     where a.at at time zone zone >= first_week
     group by 1
  ),
  joined as (
    select date_trunc('week', m.created_at at time zone zone)::date as week, count(*) as joined
      from public.members m
     where m.created_at at time zone zone >= first_week
     group by 1
  ),
  weeks as (
    select w::date as week from generate_series(first_week, this_week, interval '1 week') w
  ),
  cohort as (
    select u.id,
           u.last_sign_in_at is not null as signed_in,
           exists (select 1 from public.members m where m.id = u.id) as member,
           exists (
             select 1 from public.push_subscriptions p
               join current_members m on m.id = p.member_id
              where p.member_id = u.id
           ) as notifications
      from auth.users u
     where u.created_at >= since and u.created_at < until
  )
  select jsonb_build_object(
    'asOf', now(),
    'period', period,
    'members', (select count(*) from current_members),
    'joined', (
      select count(*) from public.members m where m.created_at >= since and m.created_at < until
    ),
    'opened', case
      when period like 'prev%' then null
      when period = 'all' then (
        select count(*) from current_members m
          join auth.users u on u.id = m.id
         where u.last_sign_in_at is not null
      )
      else (select count(*) from last_used where at >= since)
    end,
    'accounts', (select count(*) from cohort),
    'signedIn', (select count(*) from cohort where signed_in),
    'reachedHome', (select count(*) from cohort where member),
    'notificationsOn', (select count(*) from cohort where notifications),
    'questions', (select count(*) from in_period where kind = 'question'),
    'replies', (select count(*) from in_period where kind = 'reply'),
    'messages', (select count(*) from in_period where kind = 'message'),
    'rsvps', (select count(*) from in_period where kind = 'rsvp'),
    'active', (select count(distinct who) from in_period),
    'weeks', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'week', w.week,
               'joined', coalesce(j.joined, 0),
               'questions', coalesce(a.questions, 0),
               'replies', coalesce(a.replies, 0),
               'messages', coalesce(a.messages, 0),
               'rsvps', coalesce(a.rsvps, 0),
               'people', coalesce(a.people, 0)
             ) order by w.week), '[]'::jsonb)
        from weeks w
        left join weekly a on a.week = w.week
        left join joined j on j.week = w.week
    )
  ) into result;

  return result;
end;
$$;

comment on function public.admin_club_stats(text) is
  'Admin → Stats: counts of members, use and activity for a period, never who. See 20261015020000.';

revoke all on function public.admin_club_stats(text) from public, anon;
grant execute on function public.admin_club_stats(text) to authenticated;
