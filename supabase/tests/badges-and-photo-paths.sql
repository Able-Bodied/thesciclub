-- ============================================================================
-- Can a member give themselves an organization's badge, or name a photograph
-- that is not theirs?
-- ============================================================================
-- 20261018000000 (security scan of 2026-10-17, F2, F13 and F10). Before it,
-- steps 2, 4, 5, 6, 9 and 10 succeeded from a member's own session: any badge
-- on their own card, and a photo_path naming another member's photograph or
-- a logo, which scripts/reprocess-photos then moved into their folder and
-- deleted. The allowances have to keep working, or the guard has broken Your
-- details, the photograph upload, joining, or the administrators' SQL editor.
--
-- Run as the signed-in member in each section, not as the superuser: postgres
-- is not `authenticated`, which is exactly the writer the guard lets through.
-- Every expected refusal has its own savepoint.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/badges-and-photo-paths.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

-- ------------------------------------------------------------------- set-up
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, photo_path)
values
  ('bbbbbbbb-1818-0000-0000-00000000000b', 'peer', 'active', 'Peer',  '19990001801', '1981-01-01', 'C5–C8', 'CA', null),
  ('cccccccc-1818-0000-0000-00000000000c', 'peer', 'active', 'Other', '19990001802', '1982-01-01', 'C5–C8', 'CA',
   'cccccccc-1818-0000-0000-00000000000c/profile.jpg');

insert into public.invites (email, invited_by_organization_id, note)
select 'joiner.badge@probe.test', id, 'probe' from public.organizations where short_code = 'NCS';

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
values ('dddddddd-1818-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'joiner.badge@probe.test', now());

-- ============================================================ as the peer
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-1818-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 1. Your details still saves (expect UPDATE 1) =='
update public.members set display_name = 'Peer renamed', city = 'Fresno'
 where id = 'bbbbbbbb-1818-0000-0000-00000000000b';

\echo ''
\echo '== 2. giving yourself an organization''s badge is refused =='
\echo '   expect: ERROR, an organization''s badge is given by the organization'
savepoint self_badge;
update public.members set affiliations = array['NorCal SCI']
 where id = 'bbbbbbbb-1818-0000-0000-00000000000b';
rollback to savepoint self_badge;

\echo ''
\echo '== 3. a photograph in your own folder, as Your details uploads it (expect UPDATE 1) =='
update public.members set photo_path = 'bbbbbbbb-1818-0000-0000-00000000000b/profile.webp', photo_alt = null
 where id = 'bbbbbbbb-1818-0000-0000-00000000000b';

\echo ''
\echo '== 4. naming another member''s photograph is refused =='
\echo '   expect: ERROR, that photograph is not in your own folder'
savepoint other_photo;
update public.members set photo_path = 'cccccccc-1818-0000-0000-00000000000c/profile.jpg'
 where id = 'bbbbbbbb-1818-0000-0000-00000000000b';
rollback to savepoint other_photo;

\echo ''
\echo '== 5. naming an organization''s logo is refused =='
\echo '   expect: ERROR, that photograph is not in your own folder'
savepoint logo_photo;
update public.members set photo_path = 'organizations/ncs.png'
 where id = 'bbbbbbbb-1818-0000-0000-00000000000b';
rollback to savepoint logo_photo;

\echo ''
\echo '== 6. climbing out of your folder is refused =='
\echo '   expect: ERROR, that photograph is not in your own folder'
savepoint climb_photo;
update public.members set photo_path = 'bbbbbbbb-1818-0000-0000-00000000000b/../cccccccc-1818-0000-0000-00000000000c/profile.jpg'
 where id = 'bbbbbbbb-1818-0000-0000-00000000000b';
rollback to savepoint climb_photo;

\echo ''
\echo '== 7. removing your photograph still works (expect UPDATE 1) =='
update public.members set photo_path = null, photo_alt = null
 where id = 'bbbbbbbb-1818-0000-0000-00000000000b';

reset role;

-- ========================================================== as the joiner
select set_config('request.jwt.claims',
  '{"sub":"dddddddd-1818-0000-0000-00000000000d","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 8. the joiner is invited (expect t) =='
select public.i_am_invited();

\echo ''
\echo '== 9. joining with a badge is refused =='
\echo '   expect: ERROR, an organization''s badge is given by the organization'
savepoint join_badge;
insert into public.members (id, display_name, username, birth_date, level_range, state, affiliations)
values ('dddddddd-1818-0000-0000-00000000000d', 'Joiner', 'joiner.badge', '1985-01-01', 'T1–T6', 'CA',
        array['NorCal SCI']);
rollback to savepoint join_badge;

\echo ''
\echo '== 10. joining with another member''s photograph is refused =='
\echo '   expect: ERROR, that photograph is not in your own folder'
savepoint join_photo;
insert into public.members (id, display_name, username, birth_date, level_range, state, photo_path)
values ('dddddddd-1818-0000-0000-00000000000d', 'Joiner', 'joiner.badge', '1985-01-01', 'T1–T6', 'CA',
        'cccccccc-1818-0000-0000-00000000000c/profile.jpg');
rollback to savepoint join_photo;

\echo ''
\echo '== 11. joining as onboarding does, with your own photograph, still works (expect INSERT 0 1) =='
insert into public.members (id, display_name, username, birth_date, level_range, state, photo_path)
values ('dddddddd-1818-0000-0000-00000000000d', 'Joiner', 'joiner.badge', '1985-01-01', 'T1–T6', 'CA',
        'dddddddd-1818-0000-0000-00000000000d/profile.webp');

reset role;

-- ==================================== as the SQL editor (an administrator)
\echo ''
\echo '== 12. the SQL editor still sets a badge (expect UPDATE 1) =='
update public.members set affiliations = array['NorCal SCI']
 where id = 'bbbbbbbb-1818-0000-0000-00000000000b';

\echo ''
\echo '== 13. where everyone ended up (expect Joiner | {} | dddd…/profile.webp;'
\echo '   Other | {} | cccc…/profile.jpg; Peer renamed | {"NorCal SCI"} | null) =='
select display_name, affiliations, photo_path
  from public.members where id::text like '%-1818-%' order by display_name;

rollback;
