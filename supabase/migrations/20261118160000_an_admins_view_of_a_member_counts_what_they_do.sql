-- ============================================================================
-- An administrator's view of a member counts what they have done
-- ============================================================================
-- The owner, 2026-11-18, on the administrators' section of a member's page
-- (20261118150000): "add a few more stats. How many posts they viewed. How
-- many questions asked and answered. Number of messages sent. How many events
-- viewed. How many events RSVPd. How many reviews submitted."
--
-- admin_member_story as it was, adding `did`, counts only, all from what the
-- club already keeps:
--   * postsViewed: posts they have seen on Home (chat_post_views);
--   * questionsAsked: topics they opened as a question;
--   * questionsAnswered: other members' questions they replied to, each once,
--     not counting replies they have since removed;
--   * messagesSent: their messages in conversations still standing, not the
--     "added to the group" kind of line (notice);
--   * eventsViewed: events they opened in the app (event_member_views). A
--     number, never which: that table promised counts only (20261103070000);
--   * eventsGoing: events they said Going to;
--   * reviewsWritten: reviews under their own name, still standing. Anonymous
--     ones are not counted: their authors are hidden from administrators too,
--     except on a reported review (20261031080000).
--
-- Only the club's administrators, as before. Expand only: the same function,
-- with more in what it answers.
-- ============================================================================

create or replace function public.admin_member_story(p_member uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not an administrator' using errcode = '42501';
  end if;

  with
  m as (
    select * from public.members where id = p_member
  ),
  inv as (
    select i.* from public.invites i join m on m.invite_id = i.id
  ),
  came as (
    select jsonb_build_object(
      'way', case
        when inv.qr_code_id is not null then 'qr'
        when inv.joined_while_open then 'open'
        when coalesce(inv.invited_by_organization_id, inv.for_organization_id) is not null then 'organization'
        else 'member'
      end,
      'claimedProfile', inv.seed_member_id is not null,
      'registered', inv.event_registration_id is not null,
      'invitedAt', inv.created_at,
      'sentAt', inv.sent_at,
      'emailOpenedAt', inv.opened_at,
      'linkOpenedAt', inv.link_opened_at,
      'acceptedAt', coalesce(inv.claimed_at, inv.consumed_at),
      'by', case when inv.invited_by_member_id is null then null else jsonb_build_object(
              'id', inv.invited_by_member_id,
              'name', (select b.display_name from public.members b where b.id = inv.invited_by_member_id)) end,
      'organization', (select o.name from public.organizations o
                        where o.id = coalesce(inv.invited_by_organization_id, inv.for_organization_id)),
      'qrCode', (select jsonb_build_object('event', q.event_name, 'organization', qo.name)
                   from public.qr_codes q
                   left join public.organizations qo on qo.id = q.organization_id
                  where q.id = inv.qr_code_id),
      'event', (select jsonb_build_object('id', e.id, 'title', e.title)
                  from public.events e
                 where e.id = coalesce(inv.event_id,
                         (select r.event_id from public.event_registrations r where r.id = inv.event_registration_id))),
      'note', inv.note,
      'message', inv.message
    ) as came
    from inv
  ),
  identities as (
    select (array_agg(i.provider order by i.created_at, i.id))[1] as first,
           coalesce(jsonb_agg(distinct i.provider), '[]'::jsonb) as linked
      from auth.identities i
     where i.user_id = p_member and i.provider <> 'phone'
  ),
  ins as (
    select count(*) as n,
           min(s.at) as first_at,
           max(s.at) as last_at
      from public.sign_ins s
     where s.user_id = p_member
  ),
  latest as (
    select distinct on (c.surface, c.os, c.browser) c.*
      from public.member_device_checks c
     where c.member_id = p_member
     order by c.surface, c.os, c.browser, c.seen_at desc
  ),
  days as (
    select count(distinct (c.seen_at at time zone 'America/Los_Angeles')::date) as n,
           max(c.seen_at) as last_at
      from public.member_device_checks c
     where c.member_id = p_member
  ),
  app as (
    select max(x.at) as last_at
      from (
        select s.at from private.app_seen s where s.user_id = p_member
        union all
        select d.seen_at from public.member_device_checks d
         where d.member_id = p_member and d.surface = 'app'
      ) x
  ),
  push as (
    select count(*) filter (where p.endpoint like 'apns:%') as app,
           count(*) filter (where p.endpoint not like 'apns:%') as web
      from public.push_subscriptions p
     where p.member_id = p_member
  ),
  did as (
    select jsonb_build_object(
      'postsViewed', (select count(*) from public.chat_post_views v where v.member_id = p_member),
      'questionsAsked', (select count(*) from public.chat_topics t
                          where t.author_id = p_member and t.is_question),
      'questionsAnswered', (select count(distinct t.id)
                              from public.chat_topics t
                              join public.chat_posts p on p.topic_id = t.id
                             where t.is_question and t.author_id is distinct from p_member
                               and p.author_id = p_member and p.removed_at is null),
      'messagesSent', (select count(*) from public.chat_messages c
                        where c.author_id = p_member and c.notice is null and c.removed_at is null),
      'eventsViewed', (select count(*) from public.event_member_views e where e.member_id = p_member),
      'eventsGoing', (select count(*) from public.event_rsvps r
                       where r.member_id = p_member and r.status = 'going'),
      'reviewsWritten', (select count(*) from public.reviews r
                          where r.author_id = p_member and not r.anonymous and r.removed_at is null)
    ) as counts
  )
  select jsonb_build_object(
    'joinedAt', m.created_at,
    'came', (select came from came),
    'askedForInvite', exists (
      select 1 from public.invite_requests r join auth.users u on u.id = p_member
       where r.email::text = lower(u.email::text)),
    'signIns', jsonb_build_object(
      'signedUpWith', identities.first,
      'linked', identities.linked,
      'count', ins.n,
      'firstAt', ins.first_at,
      'lastAt', ins.last_at
    ),
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object(
               'surface', l.surface,
               'browser', l.browser,
               'browserVersion', l.browser_version,
               'os', l.os,
               'screenWidth', l.screen_width,
               'screenHeight', l.screen_height,
               'colorScheme', l.color_scheme,
               'notifications', l.notifications,
               'appBuilt', l.app_built,
               'seenAt', l.seen_at
             ) order by l.seen_at desc)
        from latest l
    ), '[]'::jsonb),
    'appLastSeen', app.last_at,
    'notify', jsonb_build_object('app', push.app, 'web', push.web),
    'activeDays', days.n,
    'lastActive', greatest(days.last_at, ins.last_at, app.last_at),
    'recordedSince', (select min(c.seen_at) from public.member_device_checks c),
    'did', (select counts from did)
  ) into result
  from m, identities, ins, days, app, push;

  return result;
end;
$$;

comment on function public.admin_member_story(uuid) is
  'For a member''s page, to the club''s administrators only: how they came to the club, how they sign in, their devices, notifications, days active, and what they have done. See 20261118150000 and 20261118160000.';

revoke all on function public.admin_member_story(uuid) from public, anon;
grant execute on function public.admin_member_story(uuid) to authenticated;
