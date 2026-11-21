-- ============================================================================
-- One "finish your profile" reminder series (20261113010000)
-- ============================================================================
--   docker exec -i supabase_db_thesciclub psql -U postgres -d postgres -At \
--     < supabase/tests/profile-reminders-one-series.sql
--
-- Rolls back. Do not point it at the hosted project. Expect:
-- two unfinished members|2, a carries on|4|profile, b has had five|5,
-- same day again|4.
-- ============================================================================

\set ON_ERROR_STOP on
begin;
create temp table pick as
  select m.id, row_number() over (order by m.created_at) as n from public.members m
   where m.status = 'active' and not m.is_seed and m.type <> 'organization'
     and m.created_at <= now() - interval '2 days'
     and not (public.member_details_done(m) and public.member_profile_done(m))
   order by m.created_at limit 2;
select 'two unfinished members', count(*) from pick;
delete from public.profile_reminders;
delete from public.push_muted_kinds where kind = 'profile_reminder';
-- a: three from the old details series; b: five already, both series.
insert into public.profile_reminders (member_id, step, sent_on)
  select id, 'details', current_date - (10 + g) from pick, generate_series(0, 2) g where n = 1;
insert into public.profile_reminders (member_id, step, sent_on)
  select id, case when g < 3 then 'details' else 'profile' end, current_date - (10 + g)
    from pick, generate_series(0, 4) g where n = 2;
select public.profile_reminders_notify();
select 'a carries on',
       (select count(*) from public.profile_reminders r join pick on pick.id = r.member_id and pick.n = 1),
       (select step from public.profile_reminders r join pick on pick.id = r.member_id and pick.n = 1
         order by sent_on desc limit 1);
select 'b has had five',
       (select count(*) from public.profile_reminders r join pick on pick.id = r.member_id and pick.n = 2);
select public.profile_reminders_notify();
select 'same day again',
       (select count(*) from public.profile_reminders r join pick on pick.id = r.member_id and pick.n = 1);
rollback;
