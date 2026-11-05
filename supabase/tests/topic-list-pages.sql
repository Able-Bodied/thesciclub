-- ============================================================================
-- A topic reads alone, and a room lists forty at a time (20261104212000)
-- ============================================================================
-- For each reader (an ordinary member, one who blocked her, one she blocked,
-- an administrator, a paused and a removed member), in an open and a closed
-- room of 95 topics with ties in activity:
--
--  - chat_topic_for(topic) is exactly that topic's row in chat_topics_for
--    (every column), and nothing where the room list has no row;
--  - chat_topics_page, followed page by page, is exactly chat_topics_for in
--    order, no gaps or duplicates, at 40, 7 and 1 a page;
--  - blocked authors' topics are in neither, both ways; a paused or removed
--    member reads nothing; a signed-out visitor is refused.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/topic-list-pages.sql
--
-- Every check prints PASS or stops the script with FAIL. Rolls back. Do not
-- point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

begin;

-- Ana reads; Blk blocked Ana; Ana blocked Bkd; Thd and Ord write; Adm is an
-- administrator; Sus is paused; Rem was removed.
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin) values
  ('a0000000-1104-0000-0000-000000000001', 'peer',   'active',    'Ana', '19991104001', '1980-01-01', 'T1–T6', 'CA', false),
  ('a0000000-1104-0000-0000-000000000002', 'peer',   'active',    'Blk', '19991104002', '1980-01-01', 'T1–T6', 'CA', false),
  ('a0000000-1104-0000-0000-000000000003', 'peer',   'active',    'Bkd', '19991104003', '1980-01-01', 'T1–T6', 'CA', false),
  ('a0000000-1104-0000-0000-000000000004', 'peer',   'active',    'Thd', '19991104004', '1980-01-01', 'T1–T6', 'CA', false),
  ('a0000000-1104-0000-0000-000000000005', 'peer',   'active',    'Ord', '19991104005', '1980-01-01', 'T1–T6', 'CA', false),
  ('a0000000-1104-0000-0000-000000000006', 'mentor', 'active',    'Adm', '19991104006', '1980-01-01', 'T1–T6', 'CA', true),
  ('a0000000-1104-0000-0000-000000000007', 'peer',   'suspended', 'Sus', '19991104007', '1980-01-01', 'T1–T6', 'CA', false),
  ('a0000000-1104-0000-0000-000000000008', 'peer',   'removed',   'Rem', '19991104008', '1980-01-01', 'T1–T6', 'CA', false);
insert into public.member_blocks (blocker_id, blocked_id) values
  ('a0000000-1104-0000-0000-000000000002', 'a0000000-1104-0000-0000-000000000001'),
  ('a0000000-1104-0000-0000-000000000001', 'a0000000-1104-0000-0000-000000000003');

insert into public.chat_rooms (id, name, description, category, sort_order, opened_at) values
  ('probe-1104-open',   'Probe 1104 open',   'For the probe.', 'Life', 9941, now()),
  ('probe-1104-closed', 'Probe 1104 closed', 'For the probe.', 'Life', 9942, null);

-- 95 topics: every tenth Blk's, every tenth Bkd's, the rest Thd's and Ord's.
create temp table probe_who (n int primary key, id uuid);
insert into probe_who values
  (0, 'a0000000-1104-0000-0000-000000000002'), (1, 'a0000000-1104-0000-0000-000000000003'),
  (2, 'a0000000-1104-0000-0000-000000000004'), (3, 'a0000000-1104-0000-0000-000000000005'),
  (4, 'a0000000-1104-0000-0000-000000000004'), (5, 'a0000000-1104-0000-0000-000000000005'),
  (6, 'a0000000-1104-0000-0000-000000000004'), (7, 'a0000000-1104-0000-0000-000000000005'),
  (8, 'a0000000-1104-0000-0000-000000000004'), (9, 'a0000000-1104-0000-0000-000000000006');
insert into public.chat_topics (id, room_id, title, author_id, created_at, last_post_at)
select ('11040000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'probe-1104-open', 'Topic ' || i,
       w.id, now() - interval '1 day', now() - interval '1 day'
  from generate_series(1, 95) i join probe_who w on w.n = i % 10;
insert into public.chat_topics (id, room_id, title, author_id)
values ('11040000-0000-0000-0001-000000000001', 'probe-1104-closed', 'Closed one', 'a0000000-1104-0000-0000-000000000004');

-- Each opens with its author's post; some have replies by others (Blk, Bkd
-- and Thd among them, so the faces on a row are hidden too).
insert into public.chat_posts (id, topic_id, author_id, body, created_at)
select ('11040000-0000-0000-0002-' || lpad(i::text, 12, '0'))::uuid, t.id, t.author_id, 'Opening ' || i,
       now() - interval '1 hour' - i * interval '1 minute'
  from generate_series(1, 95) i
  join public.chat_topics t on t.id = ('11040000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
insert into public.chat_posts (id, topic_id, author_id, body, created_at)
select ('11040000-0000-0000-0003-' || lpad(i::text, 12, '0'))::uuid,
       ('11040000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, w.id, 'Reply ' || i,
       now() - interval '50 minutes' - i * interval '1 minute'
  from generate_series(1, 95, 3) i join probe_who w on w.n = (i + 3) % 10;
insert into public.chat_posts (id, topic_id, author_id, body)
values ('11040000-0000-0000-0002-100000000001', '11040000-0000-0000-0001-000000000001', 'a0000000-1104-0000-0000-000000000004', 'Closed');

-- Ties in activity, across the page boundaries at 7, 40 and 80.
update public.chat_topics set last_post_at = now() - interval '2 hours'
 where id in (select ('11040000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid
                from generate_series(36, 45) i union all
              select ('11040000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid
                from generate_series(5, 9) i);
update public.chat_topics set last_post_at = now() - interval '3 hours'
 where id in (select ('11040000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid
                from generate_series(78, 83) i);

-- Views four ways in, and Ana's own reads (for unread).
insert into public.chat_topic_reads (topic_id, member_id, last_read_at)
select ('11040000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, w.id, now() - interval '55 minutes'
  from generate_series(1, 95, 2) i join probe_who w on w.n = (i + 5) % 10;
insert into public.chat_topic_reads (topic_id, member_id, last_read_at)
select ('11040000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'a0000000-1104-0000-0000-000000000001',
       now() - interval '70 minutes'
  from generate_series(1, 95, 4) i
on conflict do nothing;
insert into public.chat_post_views (post_id, member_id)
select ('11040000-0000-0000-0002-' || lpad(i::text, 12, '0'))::uuid, w.id
  from generate_series(2, 95, 3) i join probe_who w on w.n = (i + 7) % 10;
insert into public.chat_post_likes (post_id, member_id)
select ('11040000-0000-0000-0002-' || lpad(i::text, 12, '0'))::uuid, w.id
  from generate_series(3, 95, 5) i join probe_who w on w.n = (i + 1) % 10
 where w.id <> (select author_id from public.chat_posts
                 where id = ('11040000-0000-0000-0002-' || lpad(i::text, 12, '0'))::uuid);
insert into public.chat_post_reactions (target_id, member_id, emoji)
select ('11040000-0000-0000-0002-' || lpad(i::text, 12, '0'))::uuid, w.id, '🎉'
  from generate_series(4, 95, 6) i join probe_who w on w.n = (i + 2) % 10
 where w.id <> (select author_id from public.chat_posts
                 where id = ('11040000-0000-0000-0002-' || lpad(i::text, 12, '0'))::uuid);

create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;

-- What one reader gets: today's list, the pages followed to the end, and the
-- one-topic read for every topic in both rooms.
create function pg_temp.reads(who uuid, room text, size int,
  out list jsonb, out paged jsonb, out pages int, out alone jsonb, out alone_list jsonb)
language plpgsql as $$
declare r record; n int; at timestamptz; after uuid; row_json jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.last_post_at desc, t.id desc), '[]')
    into list from public.chat_topics_for(room) t;

  paged := '[]'; pages := 0;
  loop
    n := 0;
    for r in select * from public.chat_topics_page(room, size, at, after) loop
      paged := paged || jsonb_build_array(to_jsonb(r));
      at := r.last_post_at; after := r.id; n := n + 1;
    end loop;
    pages := pages + 1;
    exit when n < size or pages > 200;
  end loop;

  -- Every topic in the room, readable or not, asked for alone.
  alone := '{}';
  reset role;
  for r in select t.id from public.chat_topics t where t.room_id = room loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select to_jsonb(x) into row_json from public.chat_topic_for(r.id) x;
    reset role;
    alone := alone || jsonb_build_object(r.id::text, coalesce(row_json, 'null'::jsonb));
  end loop;
  -- The same keys from the room list, for comparing.
  select jsonb_object_agg(t.id::text, coalesce(e, 'null'::jsonb)) into alone_list
    from public.chat_topics t
    left join lateral (select x from jsonb_array_elements(list) x where x ->> 'id' = t.id::text) l(e) on true
   where t.room_id = room;
  alone := coalesce(alone, '{}'); alone_list := coalesce(alone_list, '{}');
end $$;

do $$
declare
  who record; size int; room text; got record;
  blk_topics jsonb; bkd_topics jsonb;
begin
  for who in select * from (values
      ('a0000000-1104-0000-0000-000000000001'::uuid, 'Ana'),
      ('a0000000-1104-0000-0000-000000000002'::uuid, 'Blk'),
      ('a0000000-1104-0000-0000-000000000003'::uuid, 'Bkd'),
      ('a0000000-1104-0000-0000-000000000004'::uuid, 'Thd'),
      ('a0000000-1104-0000-0000-000000000006'::uuid, 'Adm'),
      ('a0000000-1104-0000-0000-000000000007'::uuid, 'Sus'),
      ('a0000000-1104-0000-0000-000000000008'::uuid, 'Rem')) v(id, label) loop
    foreach room in array array['probe-1104-open', 'probe-1104-closed'] loop
      foreach size in array array[40, 7, 1] loop
        got := pg_temp.reads(who.id, room, size);
        perform pg_temp.check_true(got.paged = got.list,
          format('%s, %s, %s a page: the pages are the list, in order (%s rows, %s pages)',
                 who.label, room, size, jsonb_array_length(got.list), got.pages));
        perform pg_temp.check_true(
          (select count(*) from jsonb_array_elements(got.paged) x)
            = (select count(distinct x ->> 'id') from jsonb_array_elements(got.paged) x),
          format('%s, %s, %s a page: no topic twice', who.label, room, size));
      end loop;
      perform pg_temp.check_true(got.alone = got.alone_list,
        format('%s, %s: each topic alone is its row in the list (%s topics)',
               who.label, room, (select count(*) from jsonb_object_keys(got.alone))));
    end loop;
  end loop;

  -- What the lists hold, said out loud.
  got := pg_temp.reads('a0000000-1104-0000-0000-000000000001', 'probe-1104-open', 40);
  perform pg_temp.check_true(jsonb_array_length(got.list) = 76 and got.pages = 2,
    'Ana: 76 topics (95 less Blk''s and Bkd''s), two pages of 40');
  perform pg_temp.check_true(not exists (select 1 from jsonb_array_elements(got.paged) x
      where x ->> 'author_id' in ('a0000000-1104-0000-0000-000000000002', 'a0000000-1104-0000-0000-000000000003')),
    'Ana: no topic by the member who blocked her or the one she blocked');
  perform pg_temp.check_true(not exists (select 1 from jsonb_array_elements(got.paged) x,
      jsonb_array_elements_text(x -> 'participant_ids') p
      where p in ('a0000000-1104-0000-0000-000000000002', 'a0000000-1104-0000-0000-000000000003')),
    'Ana: neither face on any row');
  perform pg_temp.check_true(
    got.alone -> '11040000-0000-0000-0000-000000000010' = 'null'::jsonb
    and got.alone -> '11040000-0000-0000-0000-000000000011' = 'null'::jsonb,
    'Ana: Blk''s topic and Bkd''s topic, asked for alone, are not there');
  perform pg_temp.check_true(
    exists (select 1 from jsonb_array_elements(got.paged) x where (x ->> 'unread')::boolean)
    and exists (select 1 from jsonb_array_elements(got.paged) x where not (x ->> 'unread')::boolean)
    and exists (select 1 from jsonb_array_elements(got.paged) x where (x ->> 'view_count')::int > 1),
    'Ana: unread and view counts vary, so the comparison means something');

  got := pg_temp.reads('a0000000-1104-0000-0000-000000000002', 'probe-1104-open', 40);
  perform pg_temp.check_true(jsonb_array_length(got.list) = 95 and got.pages = 3,
    'Blk: all 95, three pages (he blocked Ana, who started none)');

  got := pg_temp.reads('a0000000-1104-0000-0000-000000000006', 'probe-1104-closed', 40);
  perform pg_temp.check_true(jsonb_array_length(got.paged) = 1, 'Adm: the closed room''s topic');
  got := pg_temp.reads('a0000000-1104-0000-0000-000000000001', 'probe-1104-closed', 40);
  perform pg_temp.check_true(jsonb_array_length(got.paged) = 0
    and got.alone -> '11040000-0000-0000-0001-000000000001' = 'null'::jsonb, 'Ana: nothing of the closed room');

  foreach room in array array['probe-1104-open'] loop
    got := pg_temp.reads('a0000000-1104-0000-0000-000000000007', room, 40);
    perform pg_temp.check_true(jsonb_array_length(got.paged) = 0
      and not exists (select 1 from jsonb_each(got.alone) e where e.value <> 'null'::jsonb),
      'Sus, paused: reads nothing, as a list or alone');
    got := pg_temp.reads('a0000000-1104-0000-0000-000000000008', room, 40);
    perform pg_temp.check_true(jsonb_array_length(got.paged) = 0
      and not exists (select 1 from jsonb_each(got.alone) e where e.value <> 'null'::jsonb),
      'Rem, removed: reads nothing, as a list or alone');
  end loop;

  -- The page size is kept between 1 and 200.
  perform set_config('request.jwt.claims', json_build_object('sub', 'a0000000-1104-0000-0000-000000000002', 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform pg_temp.check_true((select count(*) from public.chat_topics_page('probe-1104-open')) = 40, 'no size: 40');
  perform pg_temp.check_true((select count(*) from public.chat_topics_page('probe-1104-open', 0)) = 1, 'size 0: 1');
  perform pg_temp.check_true((select count(*) from public.chat_topics_page('probe-1104-open', null)) = 40, 'size null: 40');
  reset role;
  perform pg_temp.check_true((select count(*) from public.chat_topics t where t.room_id = 'probe-1104-open') = 95, 'the room has 95 (fixture)');
end $$;

-- Signed out: refused, as chat_topics_for is.
do $$
begin
  set local role anon;
  begin
    perform public.chat_topic_for('11040000-0000-0000-0000-000000000002');
    raise exception 'FAIL: a signed-out visitor read a topic';
  exception when insufficient_privilege then
    raise notice 'PASS: a signed-out visitor cannot ask for a topic';
  end;
  begin
    perform public.chat_topics_page('probe-1104-open');
    raise exception 'FAIL: a signed-out visitor read a room';
  exception when insufficient_privilege then
    raise notice 'PASS: a signed-out visitor cannot ask for a page';
  end;
  reset role;
end $$;

rollback;
