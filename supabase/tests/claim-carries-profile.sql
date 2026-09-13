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
