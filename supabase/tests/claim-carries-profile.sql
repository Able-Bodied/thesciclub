-- ============================================================================
-- Does claiming actually carry the profile across?
-- ============================================================================
-- It did not. The client pre-fills five fields and the trigger deleted the
-- rest, so a claimed member arrived with a name, a level and a city, and no
-- photograph, bio, interests, topics, self-care or affiliations. The insert
-- succeeded, which is why nothing caught it.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/claim-carries-profile.sql
--
-- Steps 9 to 12 (20261002000000): "Start fresh" retires the seed and carries
-- none of it. Before that migration the insert in step 9 is refused, as the
-- column does not exist; the old behaviour, copying regardless, is what
-- steps 1 to 6 still show for an insert that does not say.
--
-- Rolls back. Runs as the superuser on purpose: this exercises a trigger and
-- a check constraint, not a policy, and the insert has to bypass the members
-- insert policy to happen at all without a real auth user behind it.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

-- NorCal SCI invites a number and says it belongs to Ajay.
insert into public.invites (phone_raw, invited_by_organization_id, seed_member_id)
select '4085551100', o.id, m.id
from public.organizations o, public.members m
where o.short_code = 'NCS' and m.display_name = 'Ajay' and m.is_seed;

\echo ''
\echo '== what the directory holds for Ajay, before anybody claims it =='
select photo_path is not null as has_photo, bio is not null as has_bio,
       array_length(topics, 1) as topics, array_length(interests, 1) as interests,
       array_length(affiliations, 1) as affiliations, injury_date, exact_level
  from public.members where display_name = 'Ajay' and is_seed;

-- Onboarding inserts what the wizard collected, which after a claim is the
-- five fields the client pre-fills plus the birthday. Everything else arrives
-- as the column default.
insert into public.members (id, phone, display_name, birth_date, level_range, exact_level,
                            completeness, city, state)
values ('77777777-0000-0000-0000-000000000007', '14085551100', 'Ajay', '1996-01-01',
        'C5–C8', 'C7', 'Incomplete', 'San Jose', 'CA');

\echo ''
\echo '== 1. the claimed member kept the photograph and the prose (expect t, t) =='
-- `bio`, not `detail`: the seed keeps the paragraph under the name in bio,
-- and a hand-written restore once put it in detail — see 20260913060000.
select photo_path = 'seed/c85c10bf-0226-394f-8c91-2a2ffc40a147.webp' as photo_carried,
       bio is not null as bio_carried
  from public.members where id = '77777777-0000-0000-0000-000000000007';

\echo ''
\echo '== 2. and the lists that make a profile worth claiming =='
\echo '   expect: 3 interests, 5 topics, 2 self-care, 1 affiliation, 1 language'
select array_length(interests, 1) as interests, array_length(topics, 1) as topics,
       array_length(self_care, 1) as self_care, array_length(affiliations, 1) as affiliations,
       array_length(languages, 1) as languages
  from public.members where id = '77777777-0000-0000-0000-000000000007';

\echo ''
\echo '== 3. the seeded row is still retired (expect 0) =='
select count(*) as seeded_ajay from public.members where display_name = 'Ajay' and is_seed;

\echo ''
\echo '== 4. the invite is consumed and attached (expect consumed, t) =='
select i.status, m.invite_id = i.id as linked
  from public.invites i
  join public.members m on m.id = '77777777-0000-0000-0000-000000000007'
 where i.phone = '14085551100';

rollback;

-- ---------------------------------------------------------------------------
begin;

insert into public.invites (phone_raw, invited_by_organization_id, seed_member_id)
select '4085551200', o.id, m.id
from public.organizations o, public.members m
where o.short_code = 'NCS' and m.display_name = 'Ajay' and m.is_seed;

-- The same claim, but this person corrected their city and gave their own
-- topics. Their answers have to survive.
insert into public.members (id, phone, display_name, birth_date, level_range, exact_level,
                            completeness, city, state, topics)
values ('88888888-0000-0000-0000-000000000008', '14085551200', 'AJ', '1996-01-01',
        'C5–C8', 'C7', 'Incomplete', 'Oakland', 'CA', array['Cycling']::text[]);

\echo ''
\echo '== 5. what the person said wins over what the directory said =='
\echo '   expect: AJ | Oakland | {Cycling}'
select display_name, city, topics from public.members
 where id = '88888888-0000-0000-0000-000000000008';

\echo ''
\echo '== 6. and the fields they said nothing about still come across (expect t) =='
select photo_path is not null as photo_carried,
       array_length(interests, 1) = 3 as interests_carried
  from public.members where id = '88888888-0000-0000-0000-000000000008';

rollback;

-- ---------------------------------------------------------------------------
begin;

-- An invite with no claim on it must carry nothing from anywhere.
insert into public.invites (phone_raw, invited_by_organization_id)
select '4085551300', id from public.organizations where short_code = 'NCS';

insert into public.members (id, phone, display_name, birth_date, level_range, state)
values ('99999999-0000-0000-0000-000000000009', '14085551300', 'Nobody', '1990-01-01',
        'Not sure yet', 'CA');

\echo ''
\echo '== 7. an ordinary signup gets nothing carried into it =='
\echo '   expect: f | 0 | Not sure yet'
select photo_path is not null as has_photo,
       coalesce(array_length(topics, 1), 0) as topics, level_range
  from public.members where id = '99999999-0000-0000-0000-000000000009';

\echo ''
\echo '== 8. and the directory is untouched (expect 23) =='
select count(*) as seeded from public.members where is_seed;

rollback;

-- ---------------------------------------------------------------------------
begin;

-- The same invite naming Ajay, and the person signing up says it is not
-- them: "Start fresh". Onboarding sends start_fresh and only what the
-- wizard collected after it — their own name, a birthday, a place.
insert into public.invites (phone_raw, invited_by_organization_id, seed_member_id)
select '4085551400', o.id, m.id
from public.organizations o, public.members m
where o.short_code = 'NCS' and m.display_name = 'Ajay' and m.is_seed;

insert into public.members (id, phone, display_name, birth_date, level_range, city, state,
                            start_fresh)
values ('aaaaaaaa-0000-0000-0000-00000000000a', '14085551400', 'Sam', '1992-05-05',
        'Not sure yet', 'Fresno', 'CA', true);

\echo ''
\echo '== 9. starting fresh carries nothing of the seed =='
\echo '   expect: Sam | Fresno | f | f | f | 0 | 0 | 0 | Not sure yet | (null) | (null)'
select display_name, city,
       photo_path is not null as has_photo, bio is not null as has_bio,
       detail is not null as has_detail,
       coalesce(array_length(interests, 1), 0) as interests,
       coalesce(array_length(topics, 1), 0) as topics,
       coalesce(array_length(affiliations, 1), 0) as affiliations,
       level_range, exact_level, injury_date
  from public.members where id = 'aaaaaaaa-0000-0000-0000-00000000000a';

\echo ''
\echo '== 10. the seed is retired and the invite consumed all the same =='
\echo '   expect: 0 | consumed | t'
select (select count(*) from public.members where display_name = 'Ajay' and is_seed) as seeded_ajay,
       i.status, m.invite_id = i.id as linked
  from public.invites i
  join public.members m on m.id = 'aaaaaaaa-0000-0000-0000-00000000000a'
 where i.phone = '14085551400';

\echo ''
\echo '== 11. the instruction is not stored (expect f) =='
select start_fresh from public.members where id = 'aaaaaaaa-0000-0000-0000-00000000000a';

\echo ''
\echo '== 12. nor can it be set afterwards =='
\echo '   expect: ERROR ... violates check constraint "members_start_fresh_not_stored"'
savepoint set_after;
update public.members set start_fresh = true
 where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
rollback to savepoint set_after;

rollback;
