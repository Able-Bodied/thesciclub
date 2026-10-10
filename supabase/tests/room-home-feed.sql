-- Local only, transactional. Run with psql as postgres, then test authenticated roles.
-- docker exec -i supabase_db_thesciclub psql -U postgres -d postgres < supabase/tests/room-home-feed.sql
\set ON_ERROR_STOP on
begin;
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, show_in_browse, is_admin)
values
('aaaaaaaa-3333-0000-0000-000000000001','peer','active','Feed Member','19990003301','1980-01-01','T1–T6','CA',true,false),
('bbbbbbbb-3333-0000-0000-000000000002','mentor','active','Feed Admin','19990003302','1980-01-01','T1–T6','CA',true,true),
('cccccccc-3333-0000-0000-000000000003','peer','suspended','Suspended Admin','19990003303','1980-01-01','T1–T6','CA',true,true);
insert into public.chat_rooms (id,name,description,category,sort_order,opened_at)
values ('home-feed-probe','Home feed probe','Home visibility test','Other',9000,now());
insert into public.chat_topics(id,room_id,title,author_id)
values ('dddddddd-3333-0000-0000-000000000001','home-feed-probe','Feed probe topic','aaaaaaaa-3333-0000-0000-000000000001');
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000001","role":"authenticated"}';
do $$ begin
  if current_user <> 'authenticated' then raise exception 'Wrong test role'; end if;
  if not (select show_in_home from public.chat_rooms where id='home-feed-probe') then raise exception 'Default must preserve Home'; end if;
  begin
    perform public.admin_set_room_home('home-feed-probe',false);
    raise exception 'Ordinary member could curate Home';
  exception when insufficient_privilege then null; end;
  begin
    update public.chat_rooms set show_in_home=false where id='home-feed-probe';
  exception when insufficient_privilege then null; end;
  if not (select show_in_home from public.chat_rooms where id='home-feed-probe') then raise exception 'Direct member update bypassed admin gate'; end if;
end $$;
set local request.jwt.claims = '{"sub":"bbbbbbbb-3333-0000-0000-000000000002","role":"authenticated"}';
do $$ begin
  if public.admin_set_room_home('home-feed-probe',false) then raise exception 'Hide did not save'; end if;
  begin
    perform public.admin_set_room_home('missing-home-feed-probe',true);
    raise exception 'Missing room was treated as saved';
  exception when no_data_found then null; end;
  begin
    perform public.admin_set_room_home('home-feed-probe',null);
    raise exception 'Null accepted';
  exception when null_value_not_allowed then null; end;
end $$;
set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000001","role":"authenticated"}';
do $$ begin
  if not exists(select 1 from public.chat_rooms where id='home-feed-probe' and opened_at is not null and not show_in_home) then raise exception 'Hiding closed or removed the room'; end if;
  if not exists(select 1 from public.chat_topics where room_id='home-feed-probe') then raise exception 'Hidden room topic became unreadable'; end if;
  if exists(select 1 from public.chat_topics t join public.chat_rooms r on r.id=t.room_id where r.id='home-feed-probe' and r.show_in_home and r.opened_at is not null) then raise exception 'Hidden topics still qualify for Home'; end if;
end $$;
set local request.jwt.claims = '{"sub":"cccccccc-3333-0000-0000-000000000003","role":"authenticated"}';
do $$ begin
  begin
    perform public.admin_set_room_home('home-feed-probe',true);
    raise exception 'Suspended admin could curate Home';
  exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  begin
    perform public.admin_set_room_home('home-feed-probe',true);
    raise exception 'Anonymous visitor could curate Home';
  exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-3333-0000-0000-000000000002","role":"authenticated"}';
do $$ begin
  if not public.admin_set_room_home('home-feed-probe',true) then raise exception 'Show did not save'; end if;
  perform public.admin_set_room_open('home-feed-probe',false);
  if exists(select 1 from public.chat_topics t join public.chat_rooms r on r.id=t.room_id where r.id='home-feed-probe' and r.show_in_home and r.opened_at is not null) then raise exception 'Closed room qualified for Home'; end if;
end $$;
rollback;
\echo 'Room Home feed permissions and visibility passed; fixtures rolled back.'
