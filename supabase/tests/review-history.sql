-- ============================================================================
-- A review keeps its edit history; new stars give it a new date (20261116100000)
-- ============================================================================
-- Every check raises on failure. Rolls back.
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

begin;

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAIL: %', what; end if;
  raise notice 'ok: %', what;
end $$;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state)
values
  ('aaaaaaaa-1612-0000-0000-00000000000a', 'peer', 'active', 'Probe Author', '15105551621', '1980-01-01', 'C5–C8', 'CA'),
  ('bbbbbbbb-1612-0000-0000-00000000000b', 'peer', 'active', 'Probe Reader', '15105551622', '1981-01-01', 'C5–C8', 'CA'),
  ('cccccccc-1612-0000-0000-00000000000c', 'peer', 'active', 'Probe Rep',    '15105551623', '1982-01-01', 'C5–C8', 'CA');
insert into public.organizations (id, short_code, name, city, state)
values ('11111111-1612-0000-0000-000000000001', 'PRHI', 'Probe History', 'Oakland', 'CA');
insert into public.organization_representatives (organization_id, member_id)
values ('11111111-1612-0000-0000-000000000001', 'cccccccc-1612-0000-0000-00000000000c');
insert into public.events (id, title, host_name, start_time, organization_id)
values ('eeeeeeee-1612-0000-0000-000000000001', 'Probe evening', 'Probe', now() - interval '2 days',
        '11111111-1612-0000-0000-000000000001');
insert into public.event_check_ins (event_id, member_id)
values ('eeeeeeee-1612-0000-0000-000000000001', 'aaaaaaaa-1612-0000-0000-00000000000a');

-- What each of them reads of the review.
create function pg_temp.seen(who uuid) returns record language plpgsql as $$
declare
  got record;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
  select r.rating, r.rated_at, r.edited_at, r.history::text as history into got
    from public.reviews_for('eeeeeeee-1612-0000-0000-000000000001', null) r;
  return got;
end $$;
grant execute on function pg_temp.seen(uuid) to authenticated;

create function pg_temp.save(rating int, words text, anon boolean, only_org boolean)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-1612-0000-0000-00000000000a","role":"authenticated"}', true);
  perform public.save_review('eeeeeeee-1612-0000-0000-000000000001', null, rating, words, anon, only_org, '[]');
end $$;
grant execute on function pg_temp.save(int, text, boolean, boolean) to authenticated;

set local role authenticated;
select pg_temp.save(3, 'Fine', false, false);

-- Posted two days ago.
reset role;
update public.reviews set created_at = now() - interval '2 days', rated_at = now() - interval '2 days'
 where event_id = 'eeeeeeee-1612-0000-0000-000000000001';
set local role authenticated;

select pg_temp.check((select history = '[]' and edited_at is null
                        from pg_temp.seen('bbbbbbbb-1612-0000-0000-00000000000b')
                          as (rating smallint, rated_at timestamptz, edited_at timestamptz, history text)),
  'a review never changed has no history');

select pg_temp.save(3, 'Fine, really', false, false);
select pg_temp.check((select history like '%"Fine"%' and edited_at is not null
                             and rated_at < now() - interval '1 day'
                        from pg_temp.seen('bbbbbbbb-1612-0000-0000-00000000000b')
                          as (rating smallint, rated_at timestamptz, edited_at timestamptz, history text)),
  'new words keep the old ones, and the date stays');

select pg_temp.save(5, 'Fine, really', false, false);
select pg_temp.check((select rating = 5 and rated_at > now() - interval '1 minute'
                        from pg_temp.seen('bbbbbbbb-1612-0000-0000-00000000000b')
                          as (rating smallint, rated_at timestamptz, edited_at timestamptz, history text)),
  'new stars give the review a new date');

select pg_temp.save(5, 'Fine, really', true, false);
reset role;
select pg_temp.check((select count(*) = 2 from public.review_edits h
                        join public.reviews r on r.id = h.review_id
                       where r.event_id = 'eeeeeeee-1612-0000-0000-000000000001'),
  'a save that changes neither stars nor words adds no version');
set local role authenticated;

-- Said only to the organization, then to everybody.
select pg_temp.save(2, 'Only for the organization', false, true);
select pg_temp.save(2, 'For everybody', false, false);
select pg_temp.check((select history not like '%Only for the organization%'
                        from pg_temp.seen('bbbbbbbb-1612-0000-0000-00000000000b')
                          as (rating smallint, rated_at timestamptz, edited_at timestamptz, history text)),
  'words said only to the organization stay out of everybody else''s history');
select pg_temp.check((select history like '%Only for the organization%'
                        from pg_temp.seen('cccccccc-1612-0000-0000-00000000000c')
                          as (rating smallint, rated_at timestamptz, edited_at timestamptz, history text)),
  'the organization still reads them');

-- Said anonymously, then with the name on.
select pg_temp.save(2, 'Said without a name', true, false);
select pg_temp.save(2, 'Said with a name', false, false);
select pg_temp.check((select history not like '%Said without a name%'
                        from pg_temp.seen('bbbbbbbb-1612-0000-0000-00000000000b')
                          as (rating smallint, rated_at timestamptz, edited_at timestamptz, history text)),
  'words said anonymously do not take on the name later');
select pg_temp.check((select history like '%Said without a name%' and history like '%Only for the organization%'
                        from pg_temp.seen('aaaaaaaa-1612-0000-0000-00000000000a')
                          as (rating smallint, rated_at timestamptz, edited_at timestamptz, history text)),
  'the author reads all of their own');

select pg_temp.save(2, 'Said with a name', true, false);
select pg_temp.check((select history like '%Said without a name%'
                        from pg_temp.seen('bbbbbbbb-1612-0000-0000-00000000000b')
                          as (rating smallint, rated_at timestamptz, edited_at timestamptz, history text)),
  'and anonymous again, those words show with no name on them');

rollback;
