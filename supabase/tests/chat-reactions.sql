-- Local only. docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine
-- psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f - < supabase/tests/chat-reactions.sql
-- Every assertion throws on failure, and all fixtures roll back.
\set ON_ERROR_STOP on
begin;
insert into public.members(id,type,status,display_name,phone,birth_date,level_range,state,show_in_browse,is_admin) values
('aa000000-8888-0000-0000-000000000001','peer','active','Reactor','19990008001','1980-01-01','T1–T6','CA',true,false),
('aa000000-8888-0000-0000-000000000002','peer','active','Writer','19990008002','1980-01-01','T1–T6','CA',true,false),
('aa000000-8888-0000-0000-000000000003','peer','suspended','Paused','19990008003','1980-01-01','T1–T6','CA',true,false),
('aa000000-8888-0000-0000-000000000004','peer','active','Outside admin','19990008004','1980-01-01','T1–T6','CA',true,true);
update public.chat_rooms set opened_at=now() where id='bowel';
update public.chat_rooms set opened_at=null where id='bladder';
insert into public.chat_topics(id,room_id,title,author_id) values
('88000000-0000-0000-0000-000000000001','bowel','Reaction question','aa000000-8888-0000-0000-000000000001'),
('88000000-0000-0000-0000-000000000002','bladder','Closed question','aa000000-8888-0000-0000-000000000002');
insert into public.chat_posts(id,topic_id,author_id,body,removed_at) values
('88000000-0000-0000-0000-000000000011','88000000-0000-0000-0000-000000000001','aa000000-8888-0000-0000-000000000001','Own question',null),
('88000000-0000-0000-0000-000000000012','88000000-0000-0000-0000-000000000001','aa000000-8888-0000-0000-000000000002','Reply',null),
('88000000-0000-0000-0000-000000000013','88000000-0000-0000-0000-000000000001','aa000000-8888-0000-0000-000000000002','',now()),
('88000000-0000-0000-0000-000000000014','88000000-0000-0000-0000-000000000002','aa000000-8888-0000-0000-000000000002','Closed',null);
insert into public.chat_threads(id,kind,name,created_by) values
('88000000-0000-0000-0000-000000000020','group','Reaction group','aa000000-8888-0000-0000-000000000001');
insert into public.chat_thread_members(thread_id,member_id) values
('88000000-0000-0000-0000-000000000020','aa000000-8888-0000-0000-000000000001'),
('88000000-0000-0000-0000-000000000020','aa000000-8888-0000-0000-000000000002'),
('88000000-0000-0000-0000-000000000020','aa000000-8888-0000-0000-000000000003');
insert into public.chat_messages(id,thread_id,author_id,body,removed_at,notice) values
('88000000-0000-0000-0000-000000000021','88000000-0000-0000-0000-000000000020','aa000000-8888-0000-0000-000000000001','Own message',null,null),
('88000000-0000-0000-0000-000000000022','88000000-0000-0000-0000-000000000020','aa000000-8888-0000-0000-000000000002','Other message',null,null),
('88000000-0000-0000-0000-000000000023','88000000-0000-0000-0000-000000000020','aa000000-8888-0000-0000-000000000002','',now(),null),
('88000000-0000-0000-0000-000000000024','88000000-0000-0000-0000-000000000020','aa000000-8888-0000-0000-000000000002','Renamed',null,'renamed');
insert into public.chat_post_reactions values ('88000000-0000-0000-0000-000000000012','aa000000-8888-0000-0000-000000000003','👍');
create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function pg_temp.refused(statement text, expected text default '42501') returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlstate=expected then raise notice 'PASS: refused %',statement; return; end if;
    raise;
  end;
  raise exception 'FAIL: accepted %',statement;
end $$;
set local role authenticated;
set local request.jwt.claims='{"sub":"aa000000-8888-0000-0000-000000000001","role":"authenticated"}';
select pg_temp.check_true(current_user='authenticated','Authenticated, under RLS');
select public.chat_set_reaction('post','88000000-0000-0000-0000-000000000011','👍');
select public.chat_set_reaction('post','88000000-0000-0000-0000-000000000011','❤️');
select pg_temp.check_true((select count(*)=1 and bool_and(emoji='❤️') from public.chat_post_reactions where target_id='88000000-0000-0000-0000-000000000011'),'Own question, change replaces reaction');
select public.chat_set_reaction('post','88000000-0000-0000-0000-000000000012','🎉');
select pg_temp.check_true((select count(*)=2 from public.chat_post_reactions where target_id='88000000-0000-0000-0000-000000000012'),'Reply reactions include other readers');
select public.chat_set_reaction('message','88000000-0000-0000-0000-000000000021','💪');
select public.chat_set_reaction('message','88000000-0000-0000-0000-000000000022','😂');
select pg_temp.check_true((select count(*)=2 from public.chat_message_reactions),'Own and other messages');
select public.chat_set_reaction('message','88000000-0000-0000-0000-000000000021',null);
select pg_temp.check_true((select emoji is null from public.chat_message_reactions where target_id='88000000-0000-0000-0000-000000000021'),'Clear is a realtime-visible update');
select pg_temp.refused($q$select public.chat_set_reaction('post','88000000-0000-0000-0000-000000000013','👍')$q$);
select pg_temp.refused($q$select public.chat_set_reaction('post','88000000-0000-0000-0000-000000000014','👍')$q$);
select pg_temp.refused($q$select public.chat_set_reaction('message','88000000-0000-0000-0000-000000000023','👍')$q$);
select pg_temp.refused($q$select public.chat_set_reaction('message','88000000-0000-0000-0000-000000000024','👍')$q$);
select pg_temp.refused($q$select public.chat_set_reaction('post','88000000-0000-0000-0000-000000000099','👍')$q$);
select pg_temp.refused($q$select public.chat_set_reaction('post','88000000-0000-0000-0000-000000000011','not emoji')$q$,'22023');
select pg_temp.refused($q$select public.chat_set_reaction('other','88000000-0000-0000-0000-000000000011','👍')$q$,'22023');
select pg_temp.refused($q$insert into public.chat_post_reactions values ('88000000-0000-0000-0000-000000000011','aa000000-8888-0000-0000-000000000002','😢')$q$);
select pg_temp.refused($q$update public.chat_message_reactions set emoji='😢'$q$);
select pg_temp.refused($q$delete from public.chat_post_reactions$q$);
set local request.jwt.claims='{"sub":"aa000000-8888-0000-0000-000000000003","role":"authenticated"}';
select pg_temp.refused($q$select public.chat_set_reaction('post','88000000-0000-0000-0000-000000000012','❤️')$q$);
select public.chat_set_reaction('post','88000000-0000-0000-0000-000000000012',null);
select pg_temp.check_true((select emoji is null from public.chat_post_reactions where target_id='88000000-0000-0000-0000-000000000012' and member_id=auth.uid()),'Suspended can remove own reaction');
set local request.jwt.claims='{"sub":"aa000000-8888-0000-0000-000000000004","role":"authenticated"}';
select pg_temp.check_true((select count(*)=0 from public.chat_message_reactions),'Nonparticipant admin cannot read private reactions');
select pg_temp.refused($q$select public.chat_set_reaction('message','88000000-0000-0000-0000-000000000022','👍')$q$);
reset role;
update public.chat_posts set removed_at=now(),body='' where id='88000000-0000-0000-0000-000000000011';
update public.chat_messages set removed_at=now(),body='' where id='88000000-0000-0000-0000-000000000022';
update public.chat_rooms set opened_at=null where id='bowel';
set local role authenticated;
set local request.jwt.claims='{"sub":"aa000000-8888-0000-0000-000000000001","role":"authenticated"}';
select pg_temp.check_true((select count(*)=0 from public.chat_post_reactions),'Closed room hides reactions');
select pg_temp.check_true((select count(*)=0 from public.chat_message_reactions where emoji is not null),'Removed message hides reactions');
reset role;
select pg_temp.check_true((select count(*)=2 from pg_publication_tables where pubname='supabase_realtime' and tablename in ('chat_post_reactions','chat_message_reactions')),'Both tables published');
set local role anon;
select pg_temp.refused($q$select * from public.chat_post_reactions$q$);
select pg_temp.refused($q$select public.chat_set_reaction('post','88000000-0000-0000-0000-000000000012','👍')$q$);
reset role;
rollback;
