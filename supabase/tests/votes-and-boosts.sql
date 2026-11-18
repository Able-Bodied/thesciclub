-- ============================================================================
-- Votes up and down, an administrator's boost, a room best first (20261118180000)
-- ============================================================================
-- Ann upvotes Fresh and then downvotes it: the upvote goes, her vote is -1.
-- Cal cannot see Ann's downvote. Ann cannot boost, through the function or
-- the table; Sus, suspended, cannot downvote. Adm boosts Old twice and takes
-- one back: 10, which Adm sees as boost and Ann does not.
-- Ann's room, best first: Old (20 hours, unseen, +10 is ten days), Fresh (new,
-- unseen, -1), Down (newer, unseen, but -2), Seen (newest, but Ann has read it,
-- so a week behind). Skipping one, two at a time: Fresh, Down.
-- Run against the test project on 2026-11-18:
--   "flip: 0 likes/-1; cal sees 0; ann boost: refused/refused; sus: refused;
--    old: 10 adm 10 10 ann -; order: Old,Fresh,Down,Seen; page: Fresh,Down".
--
--   node --env-file=.env.local <runner> supabase/tests/votes-and-boosts.sql
--
-- Ends in an exception, so nothing is kept. Do not point it at the hosted project.
-- ============================================================================

do $$
declare
  adm constant uuid := 'a5500000-1118-0000-0000-000000000021';
  ann constant uuid := 'a5500000-1118-0000-0000-000000000022';
  cal constant uuid := 'a5500000-1118-0000-0000-000000000023';
  sus constant uuid := 'a5500000-1118-0000-0000-000000000024';
  bob constant uuid := 'a5500000-1118-0000-0000-000000000025';
  t_old constant uuid := 'a5500000-1118-0000-0001-000000000001';
  t_fresh constant uuid := 'a5500000-1118-0000-0001-000000000002';
  t_seen constant uuid := 'a5500000-1118-0000-0001-000000000003';
  t_down constant uuid := 'a5500000-1118-0000-0001-000000000004';
  p_old constant uuid := 'a5500000-1118-0000-0002-000000000001';
  p_fresh constant uuid := 'a5500000-1118-0000-0002-000000000002';
  p_seen constant uuid := 'a5500000-1118-0000-0002-000000000003';
  p_down constant uuid := 'a5500000-1118-0000-0002-000000000004';
  flip text;
  cal_sees int;
  ann_fn text := 'allowed';
  ann_table text := 'allowed';
  sus_down text := 'allowed';
  old_adm text;
  old_ann text;
  ord text;
  pg text;
begin
  insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin) values
    (adm, 'peer', 'active',    'Adm', '19991118121', '1980-01-01', 'T1–T6', 'CA', true),
    (ann, 'peer', 'active',    'Ann', '19991118122', '1980-01-01', 'T1–T6', 'CA', false),
    (cal, 'peer', 'active',    'Cal', '19991118123', '1980-01-01', 'T1–T6', 'CA', false),
    (sus, 'peer', 'suspended', 'Sus', '19991118124', '1980-01-01', 'T1–T6', 'CA', false),
    (bob, 'peer', 'active',    'Bob', '19991118125', '1980-01-01', 'T1–T6', 'CA', false);
  insert into public.chat_rooms (id, name, description, category, sort_order, opened_at)
    values ('probe-1118-votes', 'Probe 1118 votes', 'For the probe.', 'Life', 9951, now());
  insert into public.chat_topics (id, room_id, title, author_id) values
    (t_old, 'probe-1118-votes', 'Old', bob), (t_fresh, 'probe-1118-votes', 'Fresh', bob),
    (t_seen, 'probe-1118-votes', 'Seen', bob), (t_down, 'probe-1118-votes', 'Down', bob);
  insert into public.chat_posts (id, topic_id, author_id, body) values
    (p_old, t_old, bob, 'Old'), (p_fresh, t_fresh, bob, 'Fresh'),
    (p_seen, t_seen, bob, 'Seen'), (p_down, t_down, bob, 'Down');
  update public.chat_topics set last_post_at = now() - case id
      when t_old then interval '20 hours' when t_fresh then interval '60 minutes'
      when t_seen then interval '30 minutes' else interval '15 minutes' end
   where room_id = 'probe-1118-votes';
  insert into public.chat_topic_reads (topic_id, member_id) values (t_seen, ann);
  insert into public.chat_post_downvotes (post_id, member_id) values (p_down, cal), (p_down, adm);

  perform set_config('role', 'authenticated', true);

  -- Ann: up, then down.
  perform set_config('request.jwt.claims', json_build_object('sub', ann, 'role', 'authenticated')::text, true);
  insert into public.chat_post_likes (post_id, member_id) values (p_fresh, ann);
  insert into public.chat_post_downvotes (post_id, member_id) values (p_fresh, ann);
  select (select count(*) from public.chat_post_likes where post_id = p_fresh) || ' likes/'
         || (select my_vote from public.chat_post_scores(array[p_fresh]))
    into flip;
  begin
    perform public.admin_boost_post(p_old);
  exception when others then ann_fn := 'refused';
  end;
  begin
    insert into public.chat_post_boosts (post_id, admin_id) values (p_old, ann);
  exception when others then ann_table := 'refused';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', cal, 'role', 'authenticated')::text, true);
  select count(*) into cal_sees from public.chat_post_downvotes where post_id = p_fresh;

  perform set_config('request.jwt.claims', json_build_object('sub', sus, 'role', 'authenticated')::text, true);
  begin
    insert into public.chat_post_downvotes (post_id, member_id) values (p_old, sus);
  exception when others then sus_down := 'refused';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform public.admin_boost_post(p_old);
  perform public.admin_boost_post(p_old);
  perform public.admin_boost_post(p_old, false);
  select s.score || ' adm ' || s.boost into old_adm from public.chat_post_scores(array[p_old]) s;

  perform set_config('request.jwt.claims', json_build_object('sub', ann, 'role', 'authenticated')::text, true);
  select s.score || ' ann ' || coalesce(s.boost::text, '-') into old_ann from public.chat_post_scores(array[p_old]) s;
  select string_agg(r.title, ',') into ord from public.chat_topics_ranked('probe-1118-votes') r;
  select string_agg(r.title, ',') into pg from public.chat_topics_ranked('probe-1118-votes', 2, 1) r;

  raise exception 'RESULT flip: %; cal sees %; ann boost: %/%; sus: %; old: % %; order: %; page: %',
    flip, cal_sees, ann_fn, ann_table, sus_down, old_adm, old_ann, ord, pg;
end;
$$;
