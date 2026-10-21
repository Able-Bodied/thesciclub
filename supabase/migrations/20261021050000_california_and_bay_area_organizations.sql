-- ============================================================================
-- California and Bay Area organizations, their calendars and their grants
-- ============================================================================
-- The owner, 2026-10-20: Triumph Foundation's events, and the other
-- California and Bay Area organizations for people with spinal cord injury,
-- with their calendars where one can be read and their grants. Researched
-- 2026-10-20 from each organization's own site; descriptions are plain fact.
--
-- Left out: SCI Active Network (nothing since 2019), Far West Wheelchair
-- Athletic Association (site gone), Valley Children's adaptive sports (21 and
-- under), Golden State Road Warriors (site down). Not imported, and why:
-- Ability First Sports' clinics (only on a link page leading to sign-up
-- sheets), US Adaptive Recreation Center (lessons are booked by phone),
-- BAWPVA's calendar (stale since 2021; repeats from 2020 would invent dates).
--
-- Triumph's feed has no organization: its page lists partners' events beside
-- its own, and only its own are credited to it (triumph-events.js). BAADS'
-- feed keeps its Sailing category only; none is posted for this season yet.
-- Five organizations have no usable square mark and show their short code.
-- ============================================================================

alter table public.data_feeds drop constraint if exists data_feeds_feed_type_check;
alter table public.data_feeds add constraint data_feeds_feed_type_check check (feed_type in (
  'norcalsci-events', 'adaptiverechub-events', 'naturetrack-trax',
  'tribe-events', 'ics-events', 'usta-wheelchair', 'usahockey-sled',
  'uspsa-events', 'reeve-support-groups',
  'triumph-events', 'squarespace-events', 'activenet-events', 'unrecables-trips',
  'mycalendar-events'
));

insert into public.organizations
  (short_code, name, city, description, tags, can_invite, logo_path, aliases)
values
  -- California, with calendars
  ('SCAS', 'SoCal Adaptive Sports', 'Palm Desert',
   'Adaptive sports for people with physical disabilities in Riverside County and nearby: wheelchair softball and football, boccia, archery and bowling.',
   array['Adaptive sport', 'Competition']::text[], false, 'organizations/scas.webp', '{}'::text[]),
  ('AMM', 'Access Mammoth', 'Mammoth Lakes',
   'Adaptive skiing, snowboarding, mountain biking, water sports and hiking lessons and camps in Mammoth Lakes. Free for injured veterans.',
   array['Winter sports', 'Outdoors', 'Veterans']::text[], false, 'organizations/amm.png', array['Disabled Sports Eastern Sierra']::text[]),
  ('CSSD', 'Challenged Sailors San Diego', 'San Diego',
   'Free adaptive sailing on San Diego Bay in Martin 16 boats every Friday and Saturday, with volunteer companion sailors. No experience needed.',
   array['Water sports']::text[], false, 'organizations/cssd.png', '{}'::text[]),
  ('POSS', 'PossAbilities', 'Loma Linda',
   'A free Loma Linda University Health program for people with permanent disabilities and veterans: peer mentoring, support groups including a spinal group, exercise classes and social events.',
   array['Peer support', 'Adaptive sport', 'Veterans']::text[], false, 'organizations/poss.png', '{}'::text[]),
  ('ACL', 'Access Leisure', 'Sacramento',
   'The City of Sacramento''s adaptive recreation for people with disabilities and veterans: adaptive cycling and swimming, wheelchair basketball, fitness and adult social events.',
   array['Adaptive sport', 'Peer support']::text[], false, 'organizations/acl.png', '{}'::text[]),
  ('UNR', 'The Unrecables', 'Los Angeles',
   'A volunteer club running monthly weekend ski and snowboard trips to Mammoth Mountain, December to June, with free instruction, adaptive gear and lift tickets.',
   array['Winter sports', 'Adaptive sport']::text[], false, 'organizations/unr.jpg', '{}'::text[]),
  -- California, without a calendar
  ('USRC', 'United States Adaptive Recreation Center', 'Big Bear Lake',
   'Private adaptive ski and snowboard lessons at Big Bear from December to March, and summer water-skiing, paddling, fishing and camping. Lessons are booked by phone.',
   array['Winter sports', 'Water sports', 'Outdoors']::text[], false, 'organizations/usrc.png', array['USARC']::text[]),
  ('PVAC', 'PVA California Chapter', 'Long Beach',
   'Paralyzed Veterans of America''s California chapter: benefits help, legal aid, employment support and adaptive sports for veterans with spinal cord injury or dysfunction.',
   array['Veterans', 'Adaptive sport', 'Resources']::text[], false, 'organizations/pvac.jpg', array['Paralyzed Veterans of America California Chapter']::text[]),
  ('RLA', 'Rancho Los Amigos Wheelchair Sports', 'Downey',
   'Wheelchair sports for Rancho Los Amigos patients, with adult wheelchair basketball teams in two NWBA divisions, a youth program and weekly practices.',
   array['Adaptive sport', 'Competition']::text[], false, 'organizations/rla.png', '{}'::text[]),
  ('BPF', 'Be Perfect Foundation', 'Pomona',
   'Helps people living with paralysis pay for activity-based therapy at The Perfect Step, wheelchairs, car adaptations, medical bills and outpatient therapy.',
   array['Grants', 'Recovery']::text[], false, 'organizations/bpf.webp', '{}'::text[]),
  ('CCAS', 'Central California Adaptive Sports Center', 'Shaver Lake',
   'Outdoor programs at Shaver Lake and China Peak: sit-skiing and snowshoeing in winter; mountain biking, kayaking, climbing and camping in summer. Free for people with SCI and disabled veterans.',
   array['Outdoors', 'Winter sports', 'Veterans']::text[], false, 'organizations/ccas.png', '{}'::text[]),
  ('AFS', 'Ability First Sports', 'Chico',
   'Free monthly adapted sports clinics in Chico, such as wheelchair rugby, basketball, archery and cycling, and a week-long summer camp at Chico State.',
   array['Adaptive sport', 'Water sports']::text[], false, 'organizations/afs.png', '{}'::text[]),
  ('OPS', 'Operation Surf', 'Avila Beach',
   'Free week-long adaptive surf programs for injured service members and veterans on the Central Coast and in Santa Cruz, with beach wheelchairs on request.',
   array['Veterans', 'Water sports']::text[], false, 'organizations/ops.png', '{}'::text[]),
  ('ACLA', 'Achilles Los Angeles', 'Santa Monica',
   'Free running, walking and rolling meetups with volunteer guides, twice a month on Sunday mornings at Dorothy Green Park, Santa Monica.',
   array['Adaptive sport']::text[], false, 'organizations/acla.webp', array['Achilles International Los Angeles']::text[]),
  ('BTB', 'Break the Barriers', 'Clovis',
   'Inclusive sports center in Clovis. Its HOPE program gives trainer-led exercise for people with SCI and other neurological conditions; also adaptive archery, aquatics and veterans programs.',
   array['Recovery', 'Adaptive sport', 'Veterans']::text[], false, 'organizations/btb.png', '{}'::text[]),
  ('PRC', 'Precision Rehabilitation', 'Long Beach',
   'Outpatient physical, occupational and speech therapy for neurological injuries, a wheelchair seating clinic, and weekly wellness classes including an adaptive gym class.',
   array['Recovery']::text[], false, 'organizations/prc.webp', '{}'::text[]),
  ('CORE', 'Center of Restorative Exercise', 'Northridge',
   'Membership adaptive gym: an evaluation and a phased exercise program led by restorative exercise specialists, for people with spinal cord injury and other conditions.',
   array['Recovery']::text[], false, 'organizations/core.jpg', array['C.O.R.E.']::text[]),
  ('ARC', 'Abilities Recovery Center', 'Van Nuys',
   'Exercise-based paralysis recovery center offering standing and gait training with body-weight support, for people paralyzed by injury or illness.',
   array['Recovery']::text[], false, 'organizations/arc.png', '{}'::text[]),
  ('TPS', 'The Perfect Step', 'Pomona',
   'Paralysis recovery center offering one-on-one exercise-based therapy, hybrid remote programs, FES cycling, open gym and group classes.',
   array['Recovery']::text[], false, 'organizations/tps.webp', '{}'::text[]),
  ('CHC', 'Challenge Center', 'San Diego',
   'Nonprofit offering extended physical therapy, assisted fitness and an accessible gym with FES bikes and standing frames, for people with severe physical disabilities.',
   array['Recovery', 'Grants']::text[], false, 'organizations/chc.webp', '{}'::text[]),
  -- Bay Area
  ('ETC', 'Environmental Traveling Companions', 'San Francisco',
   'Sea kayaking on San Francisco and Tomales Bays and whitewater rafting trips for people with disabilities, with adaptive equipment and trained guides. Based at Fort Mason.',
   array['Water sports', 'Outdoors']::text[], false, 'organizations/etc.png', '{}'::text[]),
  ('CIL', 'Center for Independent Living', 'Berkeley',
   'Disability-led independent living center at the Ed Roberts Campus: peer support groups, including one for acquired disability, assistive technology, wheelchair loans and repairs.',
   array['Peer support', 'Resources', 'Advocacy']::text[], false, 'organizations/cil.jpg', '{}'::text[]),
  ('SVIL', 'Silicon Valley Independent Living Center', 'San Jose',
   'Independent living center for Santa Clara County: housing search, emergency preparedness and self-advocacy workshops, and a weekly online peer support group.',
   array['Resources', 'Peer support']::text[], false, 'organizations/svil.jpg', array['SVILC']::text[]),
  ('NCEF', 'National Center for Equine Facilitated Therapy', 'Woodside',
   'Physical and occupational therapy using horse movement, and adaptive riding; spinal cord injury is among the conditions it treats. Free for veterans and first responders.',
   array['Recovery', 'Outdoors']::text[], false, 'organizations/ncef.png', array['NCEFT']::text[]),
  ('ACSF', 'Achilles SF Bay Area', 'San Francisco',
   'Free group workouts where athletes with disabilities walk, run or roll with volunteer guides, two or three times a month at Crissy Field, Ocean Beach and Lake Merritt.',
   array['Adaptive sport']::text[], false, null, '{}'::text[]),
  ('TRR', 'Team River Runner Palo Alto', 'Palo Alto',
   'Local chapter of a national adaptive paddling nonprofit for veterans and their families: weekly pool kayaking all year and outings on open water.',
   array['Water sports', 'Veterans']::text[], false, null, '{}'::text[]),
  ('BWPV', 'Bay Area and Western Chapter PVA', 'Palo Alto',
   'Paralyzed Veterans of America chapter based at the VA Palo Alto: peer support, adaptive sports and advocacy for veterans with spinal cord injury or disease.',
   array['Veterans', 'Peer support']::text[], false, null, array['BAWPVA']::text[]),
  ('VAPA', 'VA Palo Alto Spinal Cord Injury Center', 'Palo Alto',
   'The VA''s spinal cord injury and disorders center for veterans, giving lifelong coordinated specialty care at 3801 Miranda Ave.',
   array['Recovery', 'Veterans']::text[], false, null, '{}'::text[]),
  ('KFRC', 'Kaiser Foundation Rehabilitation Center', 'Vallejo',
   'Kaiser Permanente''s inpatient rehabilitation hospital for Northern California, by referral, with an accredited spinal cord specialty program.',
   array['Recovery']::text[], false, null, '{}'::text[])
on conflict (short_code) do nothing;

-- ------------------------------------------------------------------ calendars
insert into public.data_feeds (name, feed_url, feed_type, organization_id, options)
select f.name, f.url, f.type, o.id, f.options::jsonb
  from (values
    ('Triumph Foundation events', 'https://triumph-foundation.org/events/', 'triumph-events', null, '{}'),
    ('SoCal Adaptive Sports events', 'https://socaladaptivesports.org/events', 'squarespace-events', 'SCAS', '{}'),
    ('Access Mammoth events', 'https://accessmammoth.org/events/?ical=1', 'ics-events', 'AMM',
     -- A fundraiser and a camp for intellectual disabilities.
     '{"days": 365, "exclude": "extravaganza|springtacular"}'),
    ('Challenged Sailors sailing', 'https://calendar.google.com/calendar/ical/c_62161d1bbdc8f0697e5513550f4335023ac7de6275670e772f2ebec2dbfcc192%40group.calendar.google.com/public/basic.ics', 'ics-events', 'CSSD',
     '{"days": 90, "include": "sailing", "exclude": "race only|no sailing|no rec|orientation|board|regatta|group sail"}'),
    ('PossAbilities programs', 'https://calendar.google.com/calendar/ical/nip2s8fg88p8eombbispjb2ge4%40group.calendar.google.com/public/basic.ics', 'ics-events', 'POSS',
     -- Its spinal, exercise and social groups; not its other conditions' groups.
     '{"days": 90, "include": "stretch|exercise|spinal|mixer|arts|wheelchair|adaptive|handcycl|kayak|climb|basketball", "exclude": "grant|scholarship|party"}'),
    ('Access Leisure programs', 'https://anc.apm.activecommunities.com/cityofsacparksandrec/rest/activities/list?locale=en-US', 'activenet-events', 'ACL',
     '{"category": 25, "title_prefix": "^ACL\\s*-\\s*", "exclude": "blind and low vision"}'),
    ('Unrecables trips', 'https://unrecables.org/trips/', 'unrecables-trips', 'UNR', '{}'),
    ('Center for Independent Living events', 'https://thecil.org', 'tribe-events', 'CIL', '{"days": 90}'),
    ('SVILC peer support', 'https://svilc.org', 'mycalendar-events', 'SVIL', '{"include": "peer support"}'),
    ('BAADS sailing', 'https://www.baads.org', 'mycalendar-events', 'BAAD', '{"category": "Sailing", "days": 365}')
  ) as f(name, url, type, code, options)
  left join public.organizations o on o.short_code = f.code
on conflict (feed_url) do nothing;

-- --------------------------------------------------------------------- grants
insert into public.organization_grants (organization_id, name, url, summary, apply_any_time, sort)
select o.id, g.name, g.url, g.summary, g.any_time, g.sort
  from (values
    ('AMM', 'Lesson scholarships', 'https://accessmammoth.org/our-programs/winter-programs/',
     'Help with lesson fees ($205 for a 2.5-hour lesson), on request.', true, 1),
    ('AMM', 'Free lessons for injured veterans', 'https://accessmammoth.org/our-programs/military-veteran-programs/',
     'A VA adaptive sports grant pays all lesson and camp fees for injured, ill or wounded veterans and service members.', true, 2),
    ('POSS', 'Grants and scholarships', 'https://teampossabilities.org/about-us/',
     'For PossAbilities members with permanent disabilities, and veterans. Ask them for details; their calendar has marked June to August for applications.', false, 1),
    ('PVAC', 'Sports and recreation grant', 'https://pvacc.org/sports/',
     'For chapter members: up to $1,000 a year toward travel, lodging and entry costs for sports and recreation events.', false, 1),
    ('BPF', 'Be Perfect scholarship', 'https://beperfectfoundation.org/online-sponsorship-app',
     'Activity-based therapy at The Perfect Step, and help with wheelchairs, car adaptations, medical bills and outpatient therapy, for people with paralysis who qualify.', false, 1),
    ('CCAS', 'Financial aid', 'https://www.centralcaladaptive.org/financial-aid',
     'For participants in need, by online form. Programs are already free for people with SCI and disabled veterans.', true, 1),
    ('UNR', 'Adaptive athlete scholarship', 'https://forms.gle/AtNpvajTy4AE8FvS8',
     '$250 toward a member athlete''s trip to Mammoth. Apply at least four days before the board meeting on the first Tuesday before the trip.', true, 1),
    ('AFS', 'Camp scholarships', 'https://abilityfirstsports.org/scholarships-sponsorship-opportunities/',
     'Memorial scholarships toward the summer sports camp; ask on the attendance form. Year-round clinics are free.', false, 1),
    ('ACL', 'Fun Pass', 'https://www.cityofsacramento.gov/content/dam/portal/ypce/access-leisure/acl_fun_pass_2026.pdf',
     'Income-based: a $150 credit each calendar year toward Access Leisure programs for eligible Sacramento residents. An answer in 7 to 10 days.', true, 1),
    ('ACLA', 'Cordani Family Grant', 'https://www.achillesinternational.org/grant-program',
     'Achilles'' national grant toward race entry, travel and lodging for active Achilles athletes: up to $1,000, or $1,500 with a guide. The 2026 round has closed.', false, 1),
    ('ACSF', 'Cordani Family Grant', 'https://www.achillesinternational.org/grant-program',
     'Achilles'' national grant toward race entry, travel and lodging for active Achilles athletes: up to $1,000, or $1,500 with a guide. The 2026 round has closed.', false, 1),
    ('BTB', 'Secret Pocket Scholarship', 'https://breakthebarriers.org/outreach/secret-pocket-scholarships/',
     'Need-based help, about $372, toward Break the Barriers classes. Apply in person at the office with proof of income.', false, 1),
    ('CHC', 'Scholarship fund', 'https://challengecenter.org/support-us/',
     'Up to 75% of service fees for people with severe disabilities and low-income seniors, including when insurance has run out.', false, 1),
    ('ETC', 'Sliding-scale scholarships', 'https://etctrips.org/adventures/shared-adventure/',
     'Need-based help for people with disabilities on open trips; ask the program manager.', false, 1),
    ('NCEF', 'Financial assistance', 'https://nceft.org/services/financialassistance/',
     'Income-based help with 25% to 100% of session fees; veterans and first responders are covered in full. Reviewed once a year.', false, 1)
  ) as g(code, name, url, summary, any_time, sort)
  join public.organizations o on o.short_code = g.code
on conflict (organization_id, name) do nothing;
