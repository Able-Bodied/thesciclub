-- ============================================================================
-- An administrator sees how a member came to the club and how they use it
-- ============================================================================
-- The owner, 2026-11-18: on a member's page, for the club's administrators,
-- "a section at the bottom explaining how they came into the app ... What are
-- they using for the app? What devices have been detected? Do they have
-- notifications on, the last time they were active and how many days they
-- have logged in. Make this a special feature for Sci club admin."
--
-- Nothing new is recorded. This reads, for one member, what the club already
-- keeps for Admin → Stats and Admin → Members:
--   * how they came: their invite (members.invite_id), read as Admin → Stats
--     reads it (20261102010000, the same order: a QR code, joining while
--     open, an organization, a member), with the rest the invite knows: the
--     event it was for or registered at, a directory profile claimed, when it
--     was sent, opened and used, and its words; whether they asked for one;
--   * how they sign in: the way the account was made and every way linked to
--     it (auth.identities, as 20261102010000), and sign_ins (20261016000000):
--     how many, the first and the latest;
--   * their devices: the latest of each way they come (member_device_checks,
--     20261102000000, kept 180 days), and whether the club can notify them
--     (push_subscriptions; an apns: token is the iPhone app's);
--   * the iPhone app: seen open in it (private.app_seen, a device check from
--     it), as admin_members_with_the_app (20261116210000);
--   * last active and how many days: a device notes itself once a day on its
--     member's first press or keystroke, so the days with a note are the days
--     they were active (Pacific dates, as the club's other days).
--
-- Only the club's administrators (is_admin), not an organization's. Expand
-- only: a new function.
-- ============================================================================

create function public.admin_member_story(p_member uuid)
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
    'recordedSince', (select min(c.seen_at) from public.member_device_checks c)
  ) into result
  from m, identities, ins, days, app, push;

  return result;
end;
$$;

comment on function public.admin_member_story(uuid) is
  'For a member''s page, to the club''s administrators only: how they came to the club, how they sign in, their devices, notifications and days active. See 20261118150000.';

revoke all on function public.admin_member_story(uuid) from public, anon;
grant execute on function public.admin_member_story(uuid) to authenticated;
