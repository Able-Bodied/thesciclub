-- ============================================================================
-- National SCI organizations, their calendars and their grants
-- ============================================================================
-- The owner, 2026-10-20: the nationwide organizations from sci.help's Adaptive
-- Sports Finder that are about spinal cord injury and paralysis, or wheelchair
-- sport; each with a logo and a description; those with a calendar the import
-- can read, imported nightly; those with grants, each grant with its link and
-- when to apply (20261021010000).
--
-- Researched 2026-10-20 from each organization's own site. Left out: Travis
-- Roy Foundation (closed 2023), US Handcycling Federation (site gone),
-- Determined2Heal (site overrun by spam; SPINALpedia, its program, is in),
-- HeyPeers (the Reeve groups left it), Project Walk (the network's site is
-- gone), Wheels of Happiness (site down), and Life Rolls On's and USA
-- Boccia's events (hand-typed pages; nothing upcoming or too loose to read).
--
-- None can vouch for members. Descriptions are plain fact, as in
-- 20260911290000. Logos were looked at in the badge before being chosen
-- (scripts/logos.mjs); three organizations have no usable square mark and
-- show their short code until an administrator adds one.
--
-- A grant's dates are entered only where the organization publishes them.
-- Kelly Brush's Active Fund moves its dates every year, and 2027's are not
-- out, so its window is added when they are.
-- ============================================================================

insert into public.organizations
  (short_code, name, city, description, tags, can_invite, logo_path, aliases)
values
  ('UNSP', 'United Spinal Association', 'Fort Totten',
   'National membership organization for wheelchair users and people with spinal cord injuries and disorders. It runs local chapters, peer mentoring, and free online peer groups and social hours.',
   array['Peer support', 'Advocacy', 'Online']::text[], false, 'organizations/unsp.jpg', '{}'::text[]),

  ('PVA', 'Paralyzed Veterans of America', 'Washington',
   'Veterans service organization for veterans with spinal cord injury or disease: benefits help, healthcare advocacy, and adaptive sports events across the country.',
   array['Veterans', 'Adaptive sport', 'Advocacy']::text[], false, 'organizations/pva.png', '{}'::text[]),

  ('CHN', 'Craig H. Neilsen Foundation', 'Tarzana',
   'The largest private funder focused on spinal cord injury. It funds research and community programs; its scholarships for students with SCI are given through partner universities.',
   array['Research']::text[], false, 'organizations/chn.jpg', '{}'::text[]),

  ('BLNK', 'BLINK of an Eye', 'Baltimore',
   'Supports people newly injured with spinal cord injury, and their families, from the first hours through the first year.',
   array['Peer support']::text[], false, 'organizations/blnk.jpg', '{}'::text[]),

  ('MTW', 'More Than Walking', 'Stratford',
   'Peer mentors with spinal cord injury share their stories and everyday skills in short videos, and meet newly injured people one-to-one by video call.',
   array['Peer support', 'Online']::text[], false, 'organizations/mtw.jpg', '{}'::text[]),

  ('SPP', 'SPINALpedia', 'Bethesda',
   'Online video library and mentoring network where people with spinal cord injury share their experience, with learning portals and legal and employment resources.',
   array['Peer support', 'Online', 'Resources']::text[], false, 'organizations/spp.jpg', '{}'::text[]),

  ('FD', 'Facing Disability', 'Chicago',
   'Videos of people living with spinal cord injury and their families, with answers from medical experts, and a private moderated Facebook group.',
   array['Resources', 'Online']::text[], false, 'organizations/fd.webp', '{}'::text[]),

  ('WWA', 'Walking With Anthony', 'Los Angeles',
   'Gives grants to people with spinal cord injury for rehabilitation, caregiving, equipment and emergencies that insurance does not cover.',
   array['Grants', 'Recovery']::text[], false, 'organizations/wwa.png', '{}'::text[]),

  ('BRPF', 'Bryon Riesch Paralysis Foundation', 'Waukesha',
   'Funds spinal cord injury research, and gives people with spinal cord injuries or disorders grants for equipment and home or vehicle changes, and college scholarships.',
   array['Grants', 'Research']::text[], false, null, '{}'::text[]),

  ('IBF', 'Ian Burkhart Foundation', 'Columbus',
   'Helps people with spinal cord injury pay for equipment and home or vehicle changes insurance does not cover, and find other sources of funding.',
   array['Grants', 'Advocacy']::text[], false, 'organizations/ibf.webp', '{}'::text[]),

  ('PRJ', 'Project 34', 'Scottsdale',
   'Founded by Cory Hahn, a former college baseball player with a C5 injury. Gives people with spinal cord injury grants for equipment, medical supplies and therapy.',
   array['Grants']::text[], false, 'organizations/prj.webp', '{}'::text[]),

  ('GBU', 'Getting Back Up', 'Westlake',
   'Pays for people with spinal cord injury to take part in exercise-based recovery programs, and for adaptive products shown to help.',
   array['Grants', 'Recovery']::text[], false, null, '{}'::text[]),

  ('FFF', 'Falling Forward Foundation', 'Lawrence',
   'Pays for continued rehabilitation at its partner centers once insurance stops, for people referred by their doctor or therapist.',
   array['Grants', 'Recovery']::text[], false, 'organizations/fff.png', '{}'::text[]),

  ('TESF', 'Thomas E. Smith Foundation', 'Marblehead',
   'Gives grants to people paralyzed by spinal cord injury, of any age, for recovery and quality of life. The MW Fund became part of it in 2025.',
   array['Grants', 'Recovery']::text[], false, 'organizations/tesf.png', array['MW Fund']::text[]),

  ('DN', 'DRIVEN Neuro', 'Indianapolis',
   'Formerly Conquer Paralysis Now. Runs activity-based recovery centers for people with paralysis in Indianapolis and Las Vegas, with classes and social events.',
   array['Recovery', 'Peer support']::text[], false, 'organizations/dn.jpg', array['Conquer Paralysis Now']::text[]),

  ('HHL', 'Help Hope Live', 'Radnor',
   'Helps people with spinal cord injury and other catastrophic conditions raise money for medical and related costs through campaigns it manages, free to them. Also runs free online wheelchair fitness classes.',
   array['Resources', 'Online']::text[], false, 'organizations/hhl.jpg', '{}'::text[]),

  ('NASC', 'North American Spinal Cord Injury Consortium', 'Columbus',
   'Brings people with spinal cord injury into SCI research: a free research advocacy course, a database for joining studies, and webinars.',
   array['Research', 'Advocacy', 'Online']::text[], false, 'organizations/nasc.webp', array['NASCIC']::text[]),

  ('NXS', 'NextStep', 'Los Angeles',
   'Network of nonprofit paralysis recovery centers offering activity-based therapy, locomotor training and electrical stimulation, in several US cities and abroad.',
   array['Recovery']::text[], false, null, '{}'::text[]),

  ('NWBA', 'National Wheelchair Basketball Association', 'Colorado Springs',
   'Governing body for wheelchair basketball in the US, with adult, women''s, college and junior divisions. It sanctions tournaments, and lends sports chairs to new players through Chair Share.',
   array['Adaptive sport', 'Competition']::text[], false, 'organizations/nwba.png', array['NWBA']::text[]),

  ('AWR', 'USA Wheelchair Rugby', 'Birmingham',
   'The US national wheelchair rugby team program, run by Lakeshore Foundation: selection and training camps, the Paralympics and world championships.',
   array['Adaptive sport', 'Competition']::text[], false, 'organizations/awr.png', '{}'::text[]),

  ('WRA', 'United States Wheelchair Rugby Association', 'Birmingham',
   'Governing body for club wheelchair rugby in the US, with over 40 teams. A player joins through a team.',
   array['Adaptive sport', 'Competition']::text[], false, 'organizations/wra.png', array['USWRA']::text[]),

  ('LKS', 'Lakeshore Foundation', 'Birmingham',
   'Fitness and recreation center in Birmingham, Alabama, for people with physical disabilities: adapted sports, aquatics and fitness. A US Paralympic training site that hosts national tournaments.',
   array['Adaptive sport', 'Competition', 'Veterans']::text[], false, 'organizations/lks.png', '{}'::text[]),

  ('USH', 'USA Hockey Sled Hockey', 'Colorado Springs',
   'USA Hockey''s sled hockey program for players with lower-body disabilities: the national Sled Classic and championships, camps, and the US national sled teams.',
   array['Adaptive sport', 'Competition']::text[], false, 'organizations/ush.png', '{}'::text[]),

  ('USTA', 'USTA Wheelchair Tennis', 'Purchase',
   'The United States Tennis Association''s wheelchair tennis program: sanctioned tournaments and rankings, camps for new players, and grants through its regional sections.',
   array['Adaptive sport', 'Competition']::text[], false, 'organizations/usta.jpg', '{}'::text[]),

  ('NWSA', 'National Wheelchair Softball Association', 'Lakeville',
   'Governing body for wheelchair softball in the US, with over 40 adult and junior teams, and the yearly Wheelchair Softball World Series.',
   array['Adaptive sport', 'Competition']::text[], false, 'organizations/nwsa.png', array['USA Wheelchair Softball']::text[]),

  ('WLAX', 'Wheelchair Lacrosse USA', 'San Diego',
   'Organizes wheelchair lacrosse, helps new teams start, and holds the Wheelchair Lacrosse Nationals each August.',
   array['Adaptive sport', 'Competition']::text[], false, 'organizations/wlax.png', '{}'::text[]),

  ('PSOC', 'United States Power Soccer Association', 'Indianapolis',
   'Governing body for power soccer, a team sport for power wheelchair users: player and team registration, sanctioned tournaments, a camp and a veterans program.',
   array['Adaptive sport', 'Competition']::text[], false, 'organizations/psoc.png', array['USPSA']::text[]),

  ('BLZ', 'BlazeSports America', 'Atlanta',
   'Adaptive sport and recreation in the Atlanta area, such as wheelchair basketball, rowing, archery and fitness, for youth, adults and veterans with physical disabilities.',
   array['Adaptive sport', 'Veterans']::text[], false, 'organizations/blz.png', '{}'::text[]),

  ('DH', 'Diveheart', 'Downers Grove',
   'Adaptive scuba for children, veterans and adults with disabilities, including paraplegia and quadriplegia: pool try-dives and open dive trips.',
   array['Water sports', 'Adaptive sport']::text[], false, 'organizations/dh.png', '{}'::text[]),

  ('LRO', 'Life Rolls On', 'Los Angeles',
   'Founded by Jesse Billauer, a quadriplegic surfer. One-day adaptive surf, skate and fishing events for people with paralysis, with trained volunteers and adaptive equipment.',
   array['Water sports', 'Adaptive sport', 'Outdoors']::text[], false, 'organizations/lro.webp', '{}'::text[]),

  ('BOC', 'USA Boccia', 'Bay Shore',
   'Governing body for the Paralympic sport of boccia in the US: athlete membership and classification, regional tournaments, a national championship, and loaned equipment for new players.',
   array['Adaptive sport', 'Competition']::text[], false, 'organizations/boc.png', '{}'::text[])
on conflict (short_code) do nothing;

-- ------------------------------------------------------------------ calendars
insert into public.data_feeds (name, feed_url, feed_type, organization_id, options)
select f.name, f.url, f.type, o.id, f.options::jsonb
  from (values
    ('United Spinal events', 'https://unitedspinal.org/?mec-ical-feed=1', 'ics-events', 'UNSP',
     -- A one-hour group set to repeat daily, which looks like a slip; it
     -- would be 60 events a month.
     '{"days": 60, "exclude": "^rolling through parenthood$"}'),
    ('NWBA tournaments', 'https://www.nwba.org/ical_feed?tags=6057781', 'ics-events', 'NWBA',
     '{"days": 200, "group_days": true, "description": "A wheelchair basketball tournament or games sanctioned by the NWBA. Teams, times and the venue are on its NWBA page."}'),
    ('Reeve virtual support groups', 'https://www.christopherreeve.org/todays-care/get-support/reeve-foundation-virtual-support-group/', 'reeve-support-groups', 'CDRF', '{}'),
    ('DRIVEN Neuro events', 'https://drivenneuro.org', 'tribe-events', 'DN',
     -- Every event so far is at its Las Vegas center, and names no venue.
     '{"location": "DRIVEN NeuroRecovery Center, 701 E Bridger Ave, Suite 150, Las Vegas, NV 89101"}'),
    ('Help Hope Live fitness classes', 'https://helphopelive.org', 'tribe-events', 'HHL',
     '{"include": "wheelchair fitness"}'),
    ('BlazeSports programs', 'https://blazesports.org', 'tribe-events', 'BLZ',
     -- Its site clock says UTC; its times are Atlanta's.
     '{"timezone": "America/New_York", "exclude": "triumph of the human spirit|gala"}'),
    ('Diveheart events', 'https://diveheart.org', 'tribe-events', 'DH',
     '{"days": 365, "exclude": "dema|dive show|presents"}'),
    ('USTA wheelchair tournaments', 'https://prd-usta-kube.clubspark.pro/unified-search-api/api/Search/tournaments/Query?indexSchema=tournament', 'usta-wheelchair', 'USTA', '{}'),
    ('USA Hockey sled events', 'https://www.usahockey.com/disabledhockeyevents', 'usahockey-sled', 'USH', '{}'),
    ('Power soccer tournaments', 'https://www.powersoccerusa.org/event/calendar', 'uspsa-events', 'PSOC', '{}')
  ) as f(name, url, type, code, options)
  join public.organizations o on o.short_code = f.code
on conflict (feed_url) do nothing;

-- --------------------------------------------------------------------- grants
insert into public.organization_grants (organization_id, name, url, summary, apply_any_time, sort)
select o.id, g.name, g.url, g.summary, g.any_time, g.sort
  from (values
    ('KBF', 'Active Fund', 'https://kbf.org/theactivefund/',
     'For US residents paralyzed by a spinal cord injury: adaptive sports and recreation equipment such as handcycles, monoskis and sport chairs, about $3,500 on average. Two rounds a year, usually opening in February and July; the 2027 dates are not out yet.',
     false, 1),
    ('KBF', 'KBF Scholarships', 'https://kbf.org/scholarships/',
     'Up to $500 toward adaptive sports camps, clinics and programs, equipment rental, or travel to try a new sport, for US residents paralyzed by a spinal cord injury. An answer in about two weeks.',
     true, 2),
    ('PVA', 'Educational Scholarship', 'https://pva.org/find-support/scholarship-program/',
     'For PVA members and their spouses and children: $2,500 a year for full-time study, $1,000 for part-time.',
     false, 1),
    ('UNSP', 'Ready to Roll disaster relief', 'https://unitedspinal.org/disaster-relief-grant/',
     'Help for people with spinal cord injuries or disorders hit by a natural disaster.',
     false, 1),
    ('WWA', 'Grant program', 'https://walkingwithanthony.org/apply-for-a-grant/',
     'For people with spinal cord injury, especially the recently injured, or their family: rehabilitation, caregiving, equipment and emergencies insurance does not cover. The form is open, with no deadline given.',
     false, 1),
    ('BRPF', 'Charitable grants', 'https://brpf.org/charitable-grant-application/',
     'For people with a spinal cord injury or disorder and financial need (Wisconsin first): one specific item, paid to the vendor, such as wheelchair repairs, hand controls, lifts, ramps or small home changes. Reviewed in January, March, June and September.',
     true, 1),
    ('BRPF', 'Scholarships', 'https://brpf.org/scholarship-application/',
     '$1,000 to $4,000 toward college for people with a spinal cord injury or disorder, or their children, with a 2.5 GPA or more. Once a year; the 2026 deadline was June 12.',
     false, 2),
    ('IBF', 'Grants', 'https://www.ianburkhartfoundation.org/request-help',
     'For people with spinal cord injury and financial need: equipment and home or vehicle changes, about $3,500 on average and up to $20,000. Two rounds a year, in spring and fall.',
     false, 1),
    ('PRJ', 'Project 34 grant', 'https://projectthirtyfour.com/grant-application/',
     'Equipment, medical supplies, bills and therapy for people with spinal cord injury. Reviewed every quarter.',
     true, 1),
    ('GBU', 'Application for assistance', 'https://www.gettingbackup.org/apply/',
     'Pays for exercise-based recovery programs and adaptive products for people with spinal cord injury. Apply by emailing their form.',
     true, 1),
    ('FFF', 'Rehabilitation funding', 'https://fallingforward.org/who-we-help/',
     'Pays for therapy at its partner centers after insurance stops. You are referred by your doctor or therapist, not by applying yourself.',
     false, 1),
    ('TESF', 'Stronger Together grant', 'https://thomasesmithfoundation.org/grant-application/',
     'For people of any age in the US paralyzed by a spinal cord injury, with financial need: recovery and quality of life.',
     true, 1),
    ('LKS', 'Athlete Services Scholarship', 'https://www.lakeshore.org/sports-science-performance-center/athlete-services-scholarship/',
     'For athletes 14 and older with a Paralympic-eligible disability, training to compete: travel and services at Lakeshore''s sports science center, worth up to about $10,000. The 2026 deadline was September 30.',
     false, 1),
    ('USTA', 'Northern California wheelchair player grant', 'https://www.ustanorcal.com/?p=3208',
     '$500 for wheelchair tennis players of any age in USTA Northern California, possibly based on need. Awarded monthly; one application a year.',
     true, 1),
    ('NWBA', 'Wayne Kunishige Memorial Scholarship', 'https://www.nwba.org/applications',
     '$1,000 for an NWBA player in their last year of high school with a 3.0 GPA or more. Announced between late November and early January; usually due late February or March.',
     false, 1)
  ) as g(code, name, url, summary, any_time, sort)
  join public.organizations o on o.short_code = g.code
on conflict (organization_id, name) do nothing;

-- PVA's scholarship: March 1 to May 15 each year, from its own page's dates.
insert into public.organization_grant_windows (grant_id, opens_on, closes_on, yearly)
select g.id, date '2000-03-01', date '2000-05-15', true
  from public.organization_grants g
  join public.organizations o on o.id = g.organization_id
 where o.short_code = 'PVA' and g.name = 'Educational Scholarship'
   and not exists (select 1 from public.organization_grant_windows w where w.grant_id = g.id);
