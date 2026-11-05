-- ============================================================================
-- The cheaper bell gives the same numbers (20261105101000)
-- ============================================================================
-- my_badge_counts, my_unseen_notification_count() and
-- my_unseen_notification_count_outside_chat(), read as each member, against
-- the bell and Me's dot as 20261104205000 wrote them (copied below as
-- pg_temp.old_bell and pg_temp.old_outside, the reference), the Chat dot
-- (chat_unread_count, unchanged) and the push badge (notification_badge).
--
-- Named people with expected numbers, then 40 made at random with every
-- kind of notification, read again after each change: block, unblock,
-- mute, unmute, pause, reinstate, a message removed, a post removed, a
-- room closed, an administrator and an org admin stepping down, leaving
-- a group.
--
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f supabase/tests/badge-counts-cheaper.sql
--
-- Every check prints PASS or stops the script with FAIL. Rolls back. Do not
-- point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off
-- Rows out of the way: the checks speak in notices.
\o /dev/null

begin;

-- The reference: the bell and Me's dot before 20261105101000, word for word.
create function pg_temp.old_bell() returns integer language sql stable set search_path = '' as $ref$
  select count(*)::integer from (
    -- my_notifications(null, 100)'s rows: its joins that the WHERE reads.
    select n.seen_at
      from public.notifications n
      left join public.chat_messages m on m.id = n.message_id
      left join public.chat_topics tp on tp.id = n.topic_id
      left join public.chat_posts p on p.id = n.post_id
      left join public.introductions ix on ix.id = n.introduction_id
      left join public.members ox
        on ox.id = case when ix.first_id = n.member_id then ix.second_id else ix.first_id end
     where n.member_id = auth.uid()
     and public.is_member()
       and n.created_at > now() - interval '30 days'
       and case
         when n.kind in ('direct', 'group', 'group_add') then exists (
           select 1 from public.chat_thread_members x
            where x.thread_id = n.thread_id and x.member_id = auth.uid()
         )
         when n.kind in ('reply', 'reply_participant') then public.chat_room_is_readable(tp.room_id)
         when n.kind = 'like' then p.removed_at is null and public.chat_room_is_readable(tp.room_id)
         when n.kind = 'reaction' and n.thread_id is not null then m.removed_at is null and exists (
           select 1 from public.chat_thread_members x
            where x.thread_id = n.thread_id and x.member_id = auth.uid()
         )
         when n.kind = 'reaction' then p.removed_at is null and public.chat_room_is_readable(tp.room_id)
         when n.kind = 'mention' then p.removed_at is null and public.chat_room_is_readable(tp.room_id)
         when n.kind in ('report', 'blocks_weekly') then public.is_admin()
         when n.kind = 'invite_request' then public.speaks_for(n.organization_id)
         when n.kind = 'join_request' then public.speaks_for(n.organization_id) or public.is_admin()
         when n.kind = 'introduction' and n.detail = 'opened' then ix.introduced_by = auth.uid() or exists (
           select 1 from public.chat_thread_members x
            where x.thread_id = n.thread_id and x.member_id = auth.uid()
         )
         when n.kind = 'introduction' then ix.id is not null and ox.status = 'active'
         else true
       end
       and not exists (
         select 1 from public.member_blocks b
          where (b.blocker_id = auth.uid() and b.blocked_id in (n.actor_id, tp.author_id, ox.id))
           or (b.blocked_id = auth.uid() and b.blocker_id in (n.actor_id, tp.author_id, ox.id)
               and not public.is_admin())
       )
     order by n.created_at desc, n.id
     limit 100
  ) listed
  where listed.seen_at is null;
$ref$;

create function pg_temp.old_outside() returns integer language sql stable set search_path = '' as $ref$
  select count(*)::integer from (
    -- my_notifications(null, 100)'s rows: its joins that the WHERE reads.
    select n.seen_at
      from public.notifications n
      left join public.chat_messages m on m.id = n.message_id
      left join public.chat_topics tp on tp.id = n.topic_id
      left join public.chat_posts p on p.id = n.post_id
      left join public.introductions ix on ix.id = n.introduction_id
      left join public.members ox
        on ox.id = case when ix.first_id = n.member_id then ix.second_id else ix.first_id end
     where n.member_id = auth.uid()
     and public.is_member()
       and n.created_at > now() - interval '30 days'
       and n.kind not in ('direct', 'group', 'group_add')
       and not (n.kind = 'reaction' and n.thread_id is not null)
       and case
         when n.kind in ('direct', 'group', 'group_add') then exists (
           select 1 from public.chat_thread_members x
            where x.thread_id = n.thread_id and x.member_id = auth.uid()
         )
         when n.kind in ('reply', 'reply_participant') then public.chat_room_is_readable(tp.room_id)
         when n.kind = 'like' then p.removed_at is null and public.chat_room_is_readable(tp.room_id)
         when n.kind = 'reaction' and n.thread_id is not null then m.removed_at is null and exists (
           select 1 from public.chat_thread_members x
            where x.thread_id = n.thread_id and x.member_id = auth.uid()
         )
         when n.kind = 'reaction' then p.removed_at is null and public.chat_room_is_readable(tp.room_id)
         when n.kind = 'mention' then p.removed_at is null and public.chat_room_is_readable(tp.room_id)
         when n.kind in ('report', 'blocks_weekly') then public.is_admin()
         when n.kind = 'invite_request' then public.speaks_for(n.organization_id)
         when n.kind = 'join_request' then public.speaks_for(n.organization_id) or public.is_admin()
         when n.kind = 'introduction' and n.detail = 'opened' then ix.introduced_by = auth.uid() or exists (
           select 1 from public.chat_thread_members x
            where x.thread_id = n.thread_id and x.member_id = auth.uid()
         )
         when n.kind = 'introduction' then ix.id is not null and ox.status = 'active'
         else true
       end
       and not exists (
         select 1 from public.member_blocks b
          where (b.blocker_id = auth.uid() and b.blocked_id in (n.actor_id, tp.author_id, ox.id))
           or (b.blocked_id = auth.uid() and b.blocker_id in (n.actor_id, tp.author_id, ox.id)
               and not public.is_admin())
       )
     order by n.created_at desc, n.id
     limit 100
  ) listed
  where listed.seen_at is null;
$ref$;

create function pg_temp.id(n int) returns uuid language sql immutable as
$$ select ('ba5e0000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

-- Fixtures without triggers, so only the rows written here exist.
set local session_replication_role = replica;

-- ------------------------------------------------------------ named people
--  1 Ana   2 Bo   3 Cy (Ana blocked)   4 Dee (blocked Ana and Al)   5 Eve
--  6 Pia (paused)   7 Al (administrator)   8 Fay (Al blocked)   9 Ola (org admin)
-- 10 Max  11 Pat  12 Cam  13 Su (suspended)  14 Rex (removed)  15 Le
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin)
select pg_temp.id(i), case when i = 7 then 'mentor' else 'peer' end,
       case i when 6 then 'suspended' when 13 then 'suspended' when 14 then 'removed' else 'active' end,
       'Probe ' || i, '1997' || lpad(i::text, 7, '0'), '1980-01-01', 'T1–T6', 'CA', i = 7
  from generate_series(1, 15) i;

insert into public.member_blocks (blocker_id, blocked_id) values
  (pg_temp.id(1), pg_temp.id(3)), (pg_temp.id(4), pg_temp.id(1)),
  (pg_temp.id(4), pg_temp.id(7)), (pg_temp.id(7), pg_temp.id(8));

create temp table org (n int primary key, id uuid);
insert into org select row_number() over (order by id), id from public.organizations order by id limit 3;
update public.organizations set removed_at = now() where id = (select id from org where n = 3);
insert into public.organization_representatives (organization_id, member_id)
select id, pg_temp.id(9) from org where n in (1, 3);

-- Threads (t = 100 + n): 101 Ana-Bo, 102 G1, 103 G2 (Ana muted), 104 G3 (Ana and
-- Le left), 105 Ana-Eve, 106 Ana-Cy, 107 Ana-Dee, 108 G4 (Cam), 109 Su-Bo, 110 Rex-Bo.
insert into public.chat_threads (id, kind, name, direct_key)
select pg_temp.id(100 + t), case when t in (2, 3, 4, 8) then 'group' else 'direct' end,
       case when t in (2, 3, 4, 8) then 'Probe group ' || t end,
       case when t not in (2, 3, 4, 8) then 'probe-ba5e:' || t end
  from generate_series(1, 10) t;
insert into public.chat_thread_members (thread_id, member_id, last_read_at)
select pg_temp.id(100 + t), pg_temp.id(m), now() - interval '1 hour' from (values
  (1, 1), (1, 2), (2, 1), (2, 2), (3, 1), (3, 2), (4, 2), (5, 1), (5, 5),
  (6, 1), (6, 3), (7, 1), (7, 4), (8, 12), (8, 2), (9, 13), (9, 2), (10, 14), (10, 2)
) v(t, m);
insert into public.chat_thread_mutes (thread_id, member_id) values (pg_temp.id(103), pg_temp.id(1));
-- New since the hour, from Bo in 101, 102, 103, 109, 110; Cy in 106; Dee in 107.
insert into public.chat_messages (id, thread_id, author_id, body, created_at, removed_at) values
  (pg_temp.id(201), pg_temp.id(101), pg_temp.id(2), 'Probe', now() - interval '10 minutes', null),
  (pg_temp.id(202), pg_temp.id(102), pg_temp.id(2), 'Probe', now() - interval '10 minutes', null),
  (pg_temp.id(203), pg_temp.id(102), pg_temp.id(2), '',      now() - interval '9 minutes', now()),
  (pg_temp.id(204), pg_temp.id(103), pg_temp.id(2), 'Probe', now() - interval '10 minutes', null),
  (pg_temp.id(205), pg_temp.id(106), pg_temp.id(3), 'Probe', now() - interval '10 minutes', null),
  (pg_temp.id(206), pg_temp.id(107), pg_temp.id(4), 'Probe', now() - interval '10 minutes', null),
  (pg_temp.id(207), pg_temp.id(109), pg_temp.id(2), 'Probe', now() - interval '10 minutes', null),
  (pg_temp.id(208), pg_temp.id(110), pg_temp.id(2), 'Probe', now() - interval '10 minutes', null),
  (pg_temp.id(209), pg_temp.id(108), pg_temp.id(2), 'Probe', now() - interval '2 hours', null),
  -- For Bo: Ana, Cam, Su and Rex wrote since his hour.
  (pg_temp.id(210), pg_temp.id(101), pg_temp.id(1), 'Probe', now() - interval '5 minutes', null),
  (pg_temp.id(211), pg_temp.id(108), pg_temp.id(12), 'Probe', now() - interval '5 minutes', null),
  (pg_temp.id(212), pg_temp.id(109), pg_temp.id(13), 'Probe', now() - interval '5 minutes', null),
  (pg_temp.id(213), pg_temp.id(110), pg_temp.id(14), 'Probe', now() - interval '5 minutes', null);

insert into public.chat_rooms (id, name, description, category, sort_order, opened_at) values
  ('probe-ba5e-open',   'Probe ba5e open',   'For the probe.', 'Life', 9391, now()),
  ('probe-ba5e-closed', 'Probe ba5e closed', 'For the probe.', 'Life', 9392, null);
-- Topics 301 (open, Bo), 302 (closed, Bo), 303 (open, Cy).
insert into public.chat_topics (id, room_id, title, author_id) values
  (pg_temp.id(301), 'probe-ba5e-open',   'Bo asks', pg_temp.id(2)),
  (pg_temp.id(302), 'probe-ba5e-closed', 'Bo asks', pg_temp.id(2)),
  (pg_temp.id(303), 'probe-ba5e-open',   'Cy asks', pg_temp.id(3));
-- Posts 311 standing, 312 removed (in 301), 313 in 302.
insert into public.chat_posts (id, topic_id, author_id, body, removed_at) values
  (pg_temp.id(311), pg_temp.id(301), pg_temp.id(1), 'Standing', null),
  (pg_temp.id(312), pg_temp.id(301), pg_temp.id(1), 'Removed', now()),
  (pg_temp.id(313), pg_temp.id(302), pg_temp.id(7), 'Closed', null);

-- Introductions 401 Ana-Eve (by Ana), 402 Ana-Pia (paused), 403 Cy-Ana, 404 Ana-Eve (by Al).
insert into public.introductions (id, introduced_by, first_id, second_id, note) values
  (pg_temp.id(401), pg_temp.id(1), pg_temp.id(1), pg_temp.id(5), 'Probe'),
  (pg_temp.id(402), pg_temp.id(7), pg_temp.id(1), pg_temp.id(6), 'Probe'),
  (pg_temp.id(403), pg_temp.id(7), pg_temp.id(3), pg_temp.id(1), 'Probe'),
  (pg_temp.id(404), pg_temp.id(7), pg_temp.id(1), pg_temp.id(5), 'Probe');

create function pg_temp.notify(member int, n int, kind text, actor int default null, thread int default null,
  message int default null, topic int default null, post int default null, organization int default null,
  introduction int default null, detail text default null, age interval default '1 minute', seen boolean default false)
returns void language sql as $$
  insert into public.notifications (member_id, kind, tag, actor_id, thread_id, message_id, topic_id, post_id,
                                    organization_id, introduction_id, detail, created_at, seen_at)
  values (pg_temp.id(member), kind, 'probe-ba5e-' || member || '-' || n, pg_temp.id(actor), pg_temp.id(thread),
          pg_temp.id(message), pg_temp.id(topic), pg_temp.id(post), (select id from org where org.n = organization),
          pg_temp.id(introduction), detail, now() - age - make_interval(secs => n), case when seen then now() end);
$$;

-- Ana. Shown and unseen: 1 2 4 6 8 10 11 14 15 17 24 (chat: 1 2 4).
select pg_temp.notify(1,  1, 'direct',            2, 101);
select pg_temp.notify(1,  2, 'group',             2, 102);
select pg_temp.notify(1,  3, 'group',             2, 104);            -- left
select pg_temp.notify(1,  4, 'reaction',          2, 102, 202);
select pg_temp.notify(1,  5, 'reaction',          2, 102, 203);       -- removed message
select pg_temp.notify(1,  6, 'reply',             2, null, null, 301);
select pg_temp.notify(1,  7, 'reply_participant', 2, null, null, 302); -- closed room
select pg_temp.notify(1,  8, 'like',              2, null, null, 301, 311);
select pg_temp.notify(1,  9, 'like',              2, null, null, 301, 312); -- removed post
select pg_temp.notify(1, 10, 'mention',           2, null, null, 301, 311);
select pg_temp.notify(1, 11, 'reaction',          2, null, null, 301, 311);
select pg_temp.notify(1, 12, 'report');                                -- not an administrator
select pg_temp.notify(1, 13, 'invite_request',    null, null, null, null, null, 1); -- not its org admin
select pg_temp.notify(1, 14, 'introduction',      null, 105, null, null, null, null, 401, 'opened');
select pg_temp.notify(1, 15, 'introduction',      null, null, null, null, null, null, 401);
select pg_temp.notify(1, 16, 'introduction',      null, null, null, null, null, null, 402); -- other paused
select pg_temp.notify(1, 17, 'profile_reminder');
select pg_temp.notify(1, 18, 'reply',             2, null, null, 301, age => '31 days'); -- too old
select pg_temp.notify(1, 19, 'like',              3, null, null, 301, 311); -- Ana blocked Cy
select pg_temp.notify(1, 20, 'like',              4, null, null, 301, 311); -- Dee blocked Ana
select pg_temp.notify(1, 21, 'reply',             2, null, null, 303);      -- Cy's topic
select pg_temp.notify(1, 22, 'introduction',      null, null, null, null, null, null, 403); -- to Cy
select pg_temp.notify(1, 23, 'profile_reminder',  seen => true);
select pg_temp.notify(1, 24, 'introduction',      null, 105, null, null, null, null, 404, 'opened');
select pg_temp.notify(1, 25, 'introduction',      null, 104, null, null, null, null, 404, 'opened'); -- left

-- Al, an administrator. Shown: 1 2 3 4 5.
select pg_temp.notify(7, 1, 'report');
select pg_temp.notify(7, 2, 'blocks_weekly');
select pg_temp.notify(7, 3, 'reply_participant', 2, null, null, 302, 313); -- closed room, but an administrator
select pg_temp.notify(7, 4, 'like',              4, null, null, 301, 311); -- Dee blocked Al: still shown
select pg_temp.notify(7, 5, 'join_request',      null, null, null, null, null, 2);
select pg_temp.notify(7, 6, 'invite_request',    null, null, null, null, null, 2); -- not its org admin
select pg_temp.notify(7, 7, 'like',              8, null, null, 301, 311); -- Al blocked Fay

-- Ola, org admin of 1 and of 3 (removed). Shown: 1 2.
select pg_temp.notify(9, 1, 'invite_request', null, null, null, null, null, 1);
select pg_temp.notify(9, 2, 'join_request',   null, null, null, null, null, 1);
select pg_temp.notify(9, 3, 'invite_request', null, null, null, null, null, 2);
select pg_temp.notify(9, 4, 'invite_request', null, null, null, null, null, 3);
select pg_temp.notify(9, 5, 'join_request',   null, null, null, null, null, 2);

-- Max: 120, the newest 100 hold 60 unseen. Pat: exactly 100 (60 unseen), one older than 30 days.
select pg_temp.notify(10, i, 'profile_reminder', age => make_interval(mins => i), seen => i between 61 and 100)
  from generate_series(1, 120) i;
select pg_temp.notify(11, i, 'profile_reminder', age => make_interval(mins => i), seen => i between 61 and 100)
  from generate_series(1, 100) i;
select pg_temp.notify(11, 101, 'profile_reminder', age => '31 days');

-- Cam: the newest 100 are messages, then 20 reminders: the bell 100, Me 20.
select pg_temp.notify(12, i, 'group', 2, 108, age => make_interval(mins => i)) from generate_series(1, 100) i;
select pg_temp.notify(12, i, 'profile_reminder', age => make_interval(mins => i)) from generate_series(101, 120) i;

-- Su (suspended) and Rex (removed): a reminder and an unread conversation each. Le left G3.
select pg_temp.notify(13, 1, 'profile_reminder');
select pg_temp.notify(14, 1, 'profile_reminder');
select pg_temp.notify(15, 1, 'group', 2, 104);
select pg_temp.notify(15, 2, 'profile_reminder');

-- ------------------------------------------------------------ 40 at random
-- Members 1001..1040: 1003 and 1017 administrators, 1011 suspended, 1029 removed.
select setseed(0.5);
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin)
select pg_temp.id(i), case when i in (1003, 1017) then 'mentor' else 'peer' end, case i when 1011 then 'suspended' when 1029 then 'removed' else 'active' end,
       'Probe ' || i, '1997' || lpad(i::text, 7, '0'), '1980-01-01', 'T1–T6', 'CA', i in (1003, 1017)
  from generate_series(1001, 1040) i;
create temp table people (id int primary key);
insert into people select i from generate_series(1, 15) i union select i from generate_series(1001, 1040) i;

create function pg_temp.someone() returns int language sql volatile as
$$ select 1000 + 1 + floor(random() * 40)::int $$;

insert into public.member_blocks (blocker_id, blocked_id)
select distinct pg_temp.id(a), pg_temp.id(b) from (
  select pg_temp.someone() a, pg_temp.someone() b from generate_series(1, 40)
) x where a <> b on conflict do nothing;
insert into public.organization_representatives (organization_id, member_id)
select o.id, pg_temp.id(m) from org o, (values (1005), (1006), (1023)) v(m) where o.n = 1 + m % 3;

-- Threads 2001..2020 (odd direct, even group), 2 to 8 people each, random read positions and mutes.
insert into public.chat_threads (id, kind, name, direct_key)
select pg_temp.id(t), case when t % 2 = 0 then 'group' else 'direct' end,
       case when t % 2 = 0 then 'Probe ' || t end, case when t % 2 = 1 then 'probe-ba5e:' || t end
  from generate_series(2001, 2020) t;
insert into public.chat_thread_members (thread_id, member_id, last_read_at)
select distinct on (t, m) pg_temp.id(t), pg_temp.id(m), now() - make_interval(mins => floor(random() * 120)::int)
  from generate_series(2001, 2020) t,
       lateral (select pg_temp.someone() m, g from generate_series(1, case when t % 2 = 0 then 8 else 2 end) g) x
 order by t, m;
insert into public.chat_thread_mutes (thread_id, member_id)
select thread_id, member_id from public.chat_thread_members
 where thread_id between pg_temp.id(2001) and pg_temp.id(2020) and random() < 0.2;
-- Messages 3001..3200, a tenth removed; authors from the roster or nobody.
insert into public.chat_messages (id, thread_id, author_id, body, created_at, removed_at)
select pg_temp.id(3000 + g), r.thread_id, case when random() < 0.1 then null else r.member_id end,
       case when g % 10 = 0 then '' else 'Probe' end, now() - make_interval(mins => floor(random() * 180)::int),
       case when g % 10 = 0 then now() end
  from generate_series(1, 200) g,
       lateral (select thread_id, member_id from public.chat_thread_members
                 where thread_id = pg_temp.id(2001 + g % 20) order by member_id offset (g % 2) limit 1) r;
-- Topics 4001..4030 (every fifth in the closed room), posts 4101..4200 (a tenth removed).
insert into public.chat_topics (id, room_id, title, author_id)
select pg_temp.id(4000 + g), case when g % 5 = 0 then 'probe-ba5e-closed' else 'probe-ba5e-open' end,
       'Probe ' || g, pg_temp.id(pg_temp.someone())
  from generate_series(1, 30) g;
insert into public.chat_posts (id, topic_id, author_id, body, removed_at)
select pg_temp.id(4100 + g), pg_temp.id(4001 + g % 30), pg_temp.id(pg_temp.someone()),
       'Probe', case when g % 10 = 0 then now() end
  from generate_series(1, 100) g;
-- Introductions 5001..5010.
insert into public.introductions (id, introduced_by, first_id, second_id, note)
select pg_temp.id(5000 + g), pg_temp.id(1001 + g), pg_temp.id(1001 + (g * 3) % 40), pg_temp.id(1001 + (g * 7 + 1) % 40), 'Probe'
  from generate_series(1, 10) g where (g * 3) % 40 <> (g * 7 + 1) % 40;

-- 20 to 160 notifications each, every kind, ages 0 to 35 days, about half seen.
create temp table kinds (k int primary key, kind text);
insert into kinds select row_number() over (), k from unnest(array[
  'direct','group','reply','reply_participant','like','group_add','report','invite_joined','event_reminder',
  'org_events','grant_open','profile_reminder','blocks_weekly','reaction','event_starting','invite_request',
  'mention','introduction','join_request','check_in_reminder','event_followup','calendar_invite',
  'organization_request','event_notice']) k;
insert into public.notifications (member_id, kind, tag, actor_id, thread_id, message_id, topic_id, post_id,
                                  organization_id, introduction_id, detail, created_at, seen_at)
select pg_temp.id(p.id), k.kind, 'probe-ba5e-r-' || p.id || '-' || g,
       case when random() < 0.8 then pg_temp.id(pg_temp.someone()) end,
       case when k.kind in ('direct', 'group', 'group_add') or (k.kind in ('reaction', 'introduction') and random() < 0.5)
            then pg_temp.id(2001 + floor(random() * 20)::int) end,
       case when k.kind = 'reaction' then pg_temp.id(3001 + floor(random() * 200)::int) end,
       case when k.kind in ('reply', 'reply_participant', 'like', 'mention', 'reaction') then pg_temp.id(4001 + floor(random() * 30)::int) end,
       case when k.kind in ('like', 'mention', 'reaction') then pg_temp.id(4101 + floor(random() * 100)::int) end,
       case when k.kind in ('invite_request', 'join_request') then (select id from org where org.n = 1 + abs(hashtext(p.id || ':' || g || ':o')) % 3) end,
       case when k.kind = 'introduction' then pg_temp.id(5001 + floor(random() * 10)::int) end,
       case when k.kind = 'introduction' and random() < 0.5 then 'opened' end,
       now() - make_interval(mins => floor(random() * 35 * 24 * 60)::int), case when random() < 0.5 then now() end
  from people p
  cross join lateral generate_series(1, 20 + abs(hashtext('n' || p.id)) % 141) g
  join kinds k on k.k = 1 + (abs(hashtext(p.id || ':' || g)) % 24)
 where p.id > 1000;
-- A reaction's message and topic belong together only sometimes; both are read either way.
delete from public.notifications n where n.introduction_id is not null
   and not exists (select 1 from public.introductions i where i.id = n.introduction_id);

set local session_replication_role = origin;

-- ------------------------------------------------------------ the checks
create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;

-- chat/bell/Me/icon three ways: the one call, the four functions, and the reference.
create function pg_temp.numbers(member uuid, out one_call text, out four text, out reference text)
language plpgsql as $$
declare chat integer;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', member, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select format('%s/%s/%s/%s', b.chat_unread, b.unseen, b.unseen_outside_chat, b.icon_kinds)
    into one_call from public.my_badge_counts() b;
  chat := public.chat_unread_count();
  four := format('%s/%s/%s/%s', chat, public.my_unseen_notification_count(),
                 public.my_unseen_notification_count_outside_chat(), public.my_unseen_notification_kinds());
  reset role;
  reference := format('%s/%s/%s/%s', chat, pg_temp.old_bell(), pg_temp.old_outside(),
                      coalesce(public.notification_badge(member), 0));
end $$;

-- Everyone in `people` the same three ways; prints how many differ from zero.
create function pg_temp.check_everyone(label text) returns void language plpgsql as $$
declare r record; x record; lit integer := 0; total integer := 0; seen text[] := '{}';
begin
  for r in select id from people order by id loop
    select * into x from pg_temp.numbers(pg_temp.id(r.id));
    seen := array_append(seen, x.reference);
    if x.one_call is distinct from x.reference or x.four is distinct from x.reference then
      raise exception 'FAIL: %: member % one call %, four %, reference %', label, r.id, x.one_call, x.four, x.reference;
    end if;
    total := total + 1;
    if x.reference <> '0/0/0/0' then lit := lit + 1; end if;
  end loop;
  raise notice 'PASS: %: % people the same three ways (% with a number, % different answers)', label, total, lit,
    (select count(distinct v) from unnest(seen) v);
end $$;

create function pg_temp.check_member(member int, expected text, label text) returns void language plpgsql as $$
declare x record;
begin
  select * into x from pg_temp.numbers(pg_temp.id(member));
  raise notice '% got: one call %, four %, reference %', label, x.one_call, x.four, x.reference;
  perform pg_temp.check_true(x.one_call = x.reference and x.four = x.reference, label || ': same as the reference');
  perform pg_temp.check_true(x.one_call = expected, label || ': ' || expected);
end $$;

\echo ''
\echo '== numbers are chat unread / bell / Me (outside chat) / icon kinds =='
\echo 'expect: Ana 2/11/8/8, Al 0/5/5/5, Ola 0/2/2/2, Max 0/60/60/1, Pat 0/60/60/1, Cam 0/100/20/2, Su 0/0/0/0, Rex 0/0/0/0, Le 0/1/1/1, Bo 4/0/0/0'
select pg_temp.check_member(1,  '2/11/8/8',  'Ana: muted, left, blocked both ways, closed room, removed, introductions');
select pg_temp.check_member(7,  '0/5/5/5',   'Al, administrator: reports, closed room, blocked by Dee');
select pg_temp.check_member(9,  '0/2/2/2',   'Ola, org admin of one live and one removed organization');
select pg_temp.check_member(10, '0/60/60/1', 'Max, 120: the newest 100');
select pg_temp.check_member(11, '0/60/60/1', 'Pat, exactly 100 and one older');
select pg_temp.check_member(12, '0/100/20/2', 'Cam, 100 messages then 20 reminders');
select pg_temp.check_member(13, '0/0/0/0',   'Su, suspended');
select pg_temp.check_member(14, '0/0/0/0',   'Rex, removed');
select pg_temp.check_member(15, '0/1/1/1',   'Le, left a group');
select pg_temp.check_member(2,  '4/0/0/0',   'Bo: four conversations with something new');

\echo ''
\echo '== the 40 at random =='
\echo 'expect: some over 100 in the 30 days, every kind present'
do $$
begin
  raise notice 'the 40: % over 100 in 30 days, % kinds, % rows',
    (select count(*) from (select member_id from public.notifications
       where member_id between pg_temp.id(1001) and pg_temp.id(1040) and created_at > now() - interval '30 days'
       group by member_id having count(*) > 100) x),
    (select count(distinct kind) from public.notifications where member_id between pg_temp.id(1001) and pg_temp.id(1040)),
    (select count(*) from public.notifications where member_id between pg_temp.id(1001) and pg_temp.id(1040));
end $$;

\echo ''
\echo '== everyone, then after each change =='
\echo 'expect: PASS on every line, 55 people each time'
select pg_temp.check_everyone('as made');

insert into public.member_blocks (blocker_id, blocked_id) values (pg_temp.id(1), pg_temp.id(2));
insert into public.member_blocks (blocker_id, blocked_id)
select pg_temp.id(a), pg_temp.id(b) from (values (1002, 1004), (1004, 1002), (1009, 1017), (1017, 1030)) v(a, b)
on conflict do nothing;
select pg_temp.check_everyone('after blocks (Ana blocks Bo, two ways among the 40, around an administrator)');
\echo 'expect: Ana 0/4/4/3 (Bo''s words and his topic gone, his messages hidden in G1)'
select pg_temp.check_member(1, '0/4/4/3', 'Ana, after blocking Bo');

delete from public.member_blocks where blocker_id = pg_temp.id(1) and blocked_id = pg_temp.id(2);
delete from public.member_blocks where (blocker_id, blocked_id) in ((pg_temp.id(1004), pg_temp.id(1002)), (pg_temp.id(1017), pg_temp.id(1030)));
select pg_temp.check_everyone('after unblocking');
select pg_temp.check_member(1, '2/11/8/8', 'Ana, after unblocking Bo');

insert into public.chat_thread_mutes (thread_id, member_id) values (pg_temp.id(102), pg_temp.id(1));
insert into public.chat_thread_mutes (thread_id, member_id)
select thread_id, member_id from public.chat_thread_members
 where thread_id between pg_temp.id(2001) and pg_temp.id(2020) and member_id = pg_temp.id(1007)
on conflict do nothing;
select pg_temp.check_everyone('after mutes');
select pg_temp.check_member(1, '1/11/8/8', 'Ana, G1 muted: no Chat dot for it, the bell the same');

delete from public.chat_thread_mutes
 where (member_id = pg_temp.id(1) and thread_id = pg_temp.id(102)) or member_id = pg_temp.id(1007);
select pg_temp.check_everyone('after unmuting');

update public.members set status = 'suspended' where id in (pg_temp.id(1), pg_temp.id(7), pg_temp.id(1003), pg_temp.id(1005));
select pg_temp.check_everyone('after pausing Ana, Al, an administrator and an org admin');
select pg_temp.check_member(1, '0/0/0/0', 'Ana, paused');
select pg_temp.check_member(7, '0/0/0/0', 'Al, paused');

update public.members set status = 'active' where id in (pg_temp.id(1), pg_temp.id(7), pg_temp.id(1003), pg_temp.id(1005), pg_temp.id(1011));
select pg_temp.check_everyone('after reinstating them (and 1011)');
select pg_temp.check_member(1, '2/11/8/8', 'Ana, reinstated');

update public.chat_messages set removed_at = now(), body = '' where id in (pg_temp.id(202), pg_temp.id(3001), pg_temp.id(3002), pg_temp.id(3003));
-- An administrator removes them (a member cannot once someone has replied).
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(7), 'role', 'authenticated')::text, true);
update public.chat_posts set removed_at = now() where id in (pg_temp.id(311), pg_temp.id(4101), pg_temp.id(4102));
select pg_temp.check_everyone('after messages and posts removed');
\echo 'expect: Ana 2/7/5/5 (the reaction on 202, and the like, mention and reaction on 311, gone), Al 0/4/4/4 (the like on 311 gone)'
select pg_temp.check_member(1, '2/7/5/5', 'Ana, after removals');
select pg_temp.check_member(7, '0/4/4/4', 'Al, after removals');

update public.chat_rooms set opened_at = null where id = 'probe-ba5e-open';
select pg_temp.check_everyone('after closing the open room');
\echo 'expect: Al 0/4/4/4 (an administrator still reads a closed room), Ana 2/6/4/4 (the reply gone)'
select pg_temp.check_member(7, '0/4/4/4', 'Al, room closed');
select pg_temp.check_member(1, '2/6/4/4', 'Ana, room closed');

update public.members set is_admin = false where id in (pg_temp.id(7), pg_temp.id(1003));
delete from public.organization_representatives where member_id in (pg_temp.id(9), pg_temp.id(1005));
select pg_temp.check_everyone('after an administrator and org admins step down');
\echo 'expect: Al 0/0/0/2 (reports, closed room and join request gone; the icon keeps its own rules), Ola 0/0/0/2'
select pg_temp.check_member(7, '0/0/0/2', 'Al, no longer an administrator');
select pg_temp.check_member(9, '0/0/0/2', 'Ola, no longer an org admin');

delete from public.chat_thread_members where member_id = pg_temp.id(1) and thread_id = pg_temp.id(102);
delete from public.chat_thread_members where member_id = pg_temp.id(1010);
select pg_temp.check_everyone('after leaving groups');

\echo ''
\echo '== signed out =='
\echo 'expect: PASS refused, twice'
do $$
begin
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin
    perform * from public.my_badge_counts();
    raise exception 'FAIL: a signed-out visitor was answered';
  exception when insufficient_privilege then
    raise notice 'PASS: a signed-out visitor is refused my_badge_counts';
  end;
  begin
    perform * from private.my_unseen_counts();
    raise exception 'FAIL: a signed-out visitor was answered';
  exception when insufficient_privilege then
    raise notice 'PASS: a signed-out visitor is refused private.my_unseen_counts';
  end;
  reset role;
end $$;

\echo ''
\echo 'PASS: badge counts cheaper, same numbers'
rollback;
\o
