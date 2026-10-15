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
-- "Opened the app" is a session that was used: Supabase refreshes a session's
-- token about hourly while the app is open, and stamps refreshed_at or
-- updated_at when it does. A session ends at sign-out, so this is a count of
-- the recent past and has no history; the weekly rows below are from content,
-- which does.
--
-- Weeks start on Monday in California, where the owner is.
-- ============================================================================

create or replace function public.admin_club_stats()
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
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not an administrator' using errcode = '42501';
  end if;

  with
  current_members as (
    select m.id, m.created_at, m.bio
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
  invited as (
    select i.status,
           exists (select 1 from auth.users u where lower(u.email) = lower(i.email::text)) as has_account
      from public.invites i
     where i.status <> 'revoked'
  )
  select jsonb_build_object(
    'asOf', now(),
    'members', (select count(*) from current_members),
    'joined7', (select count(*) from current_members where created_at >= now() - interval '7 days'),
    'joined30', (select count(*) from current_members where created_at >= now() - interval '30 days'),
    'withBio', (select count(*) from current_members where coalesce(btrim(bio), '') <> ''),
    'opened1', (select count(*) from last_used where at >= now() - interval '1 day'),
    'opened7', (select count(*) from last_used where at >= now() - interval '7 days'),
    'opened30', (select count(*) from last_used where at >= now() - interval '30 days'),
    'invited', (select count(*) from invited),
    'invitedWithAccount', (select count(*) from invited where has_account),
    'invitedJoined', (select count(*) from invited where status = 'consumed'),
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

comment on function public.admin_club_stats() is
  'Admin → Stats: counts of members, use and activity, never who. See 20261015020000.';

revoke all on function public.admin_club_stats() from public, anon;
grant execute on function public.admin_club_stats() to authenticated;
