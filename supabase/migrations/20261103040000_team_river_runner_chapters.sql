-- ============================================================================
-- Team River Runner, with its chapters and who to contact at each
-- ============================================================================
-- The owner, 2026-11-03: Team River Runner works across the US, each chapter
-- with its own page saying who to reach and how. The club's Palo Alto chapter
-- becomes Team River Runner, keeping its members, with a place for each of
-- the 22 chapters whose page gives a city: its note is the page's own words
-- (read 2026-11-03), only plain typos in addresses fixed, and its link that
-- page. American River and Southeast PA name no city, so wait for the owner.
-- The description is from teamriverrunner.org's home and About pages.
-- ============================================================================

update public.organizations
   set name = 'Team River Runner',
       aliases = array(select distinct unnest(aliases || array['Team River Runner Palo Alto', 'TRR'])),
       city = 'Washington', state = 'DC',
       description = 'Team River Runner is an adaptive and veteran paddling nonprofit. A small group of kayakers started it in 2004 to help veterans at Walter Reed National Military Medical Center. Its mission is "To provide all veterans and their families an opportunity to find health, healing, community purpose, and new challenges through adventure and adaptive paddle sports!"

- Paddling for veterans and their family members in "more than 60 locations across the nation"
- Boats, outfitting, safety gear and instruction provided
- Regular pool or open water sessions, local trips and family days
- National trips to Colorado, Idaho and the Caribbean

Each chapter''s contact is under Locations and who to contact.

[teamriverrunner.org](https://www.teamriverrunner.org/get-involved/chapters/)'
 where short_code = 'TRR' and name in ('Team River Runner Palo Alto', 'Team River Runner');

-- The Palo Alto place stays, so whoever saved it keeps it; the rest are new.
update public.organization_places op
   set position = 1, label = 'Palo Alto chapter', note = 'TRR Palo Alto has a comprehensive, weekly, year around, pool based instructional program that is supplemented by outings and other activities that range from the sea to the Sierras and all bodies of water in between.
Please contact the chapter coordinator below to get involved with the chapter!
Chapter Coordinator
Carlisle
carlisle.landel@teamriverrunner.org
(207) 266-3544', url = 'https://www.teamriverrunner.org/get-involved/chapters/california-palo-alto/'
  from public.organizations o
 where op.organization_id = o.id and o.short_code = 'TRR' and op.city = 'Palo Alto';
insert into public.organization_places
  (organization_id, position, label, address, city, state, postal_code, note, url)
select o.id, 0, 'Washington, DC VA Medical Center', '50 Irving St. NW', 'Washington', 'DC', '20422',
       'The TRR Chapter at the Washington DC Veterans Affairs Medical Center holds weekly pool sessions. Participation at this location is open only to Veterans involved with the hospital’s Poly-Trauma Program.
LOCATION:
Washington, DC VA Medical Center
50 Irving St. NW, Basement
Washington, DC 20422
Chapter Coordinator:
Lisa Weed
lisa.weed@teamriverrunner.org',
       'https://www.teamriverrunner.org/get-involved/chapters/district-of-columbia/'
  from public.organizations o
 where o.short_code = 'TRR'
   and not exists (select 1 from public.organization_places x where x.organization_id = o.id and x.url = 'https://www.teamriverrunner.org/get-involved/chapters/district-of-columbia/');
insert into public.organization_places
  (organization_id, position, label, address, city, state, postal_code, note, url)
select o.id, 2, 'San Diego chapter', null, 'San Diego', 'CA', null,
       'Join Veterans, active duty personnel, their friends and families on our monthly paddles. Taking advantage of San Diego’s great year-round weather we explore Mission Bay and sometimes the Pacific out of La Jolla Shores, encountering a variety of sea life and bird species.
Adaptive kayaks and paddles are available for flat water events when requested in advance.
If you or you know of a veteran that might be interested in volunteering and/or participating with TRR San Diego, please contact the chapter coordinator with your below and get involved!
Chapter Coordinators:
Jonathan Garibay, jon.garibay@teamriverrunner.org
Craig Winters, craig.winters@teamriverrunner.org',
       'https://www.teamriverrunner.org/get-involved/chapters/california-san-diego/'
  from public.organizations o
 where o.short_code = 'TRR'
   and not exists (select 1 from public.organization_places x where x.organization_id = o.id and x.url = 'https://www.teamriverrunner.org/get-involved/chapters/california-san-diego/');
insert into public.organization_places
  (organization_id, position, label, address, city, state, postal_code, note, url)
select o.id, 3, 'Colorado Springs / Fort Carson chapter', null, 'Colorado Springs', 'CO', null,
       'If you or you know of a veteran that might be interested in volunteering and/or participating with TRR Colorado Springs/Ft Carson, please contact the chapter coordinator(s) below and get involved!
Chapter Coordinator:
Rich Pastorious
rich.pastorious@teamriverrunner.org',
       'https://www.teamriverrunner.org/get-involved/chapters/colorado-ft-carsoncolorado-springs/'
  from public.organizations o
 where o.short_code = 'TRR'
   and not exists (select 1 from public.organization_places x where x.organization_id = o.id and x.url = 'https://www.teamriverrunner.org/get-involved/chapters/colorado-ft-carsoncolorado-springs/');
insert into public.organization_places
  (organization_id, position, label, address, city, state, postal_code, note, url)
select o.id, 4, 'Denver chapter, Carmody Recreation Center', '2200 South Kipling Street', 'Denver', 'CO', '80227',
       'Welcome to Team River Runner Denver. ALL veterans, family members/caregivers and volunteers are invited to help get Butts in Boats (flat and moving water). If you have a disability (not required), we have the experience and adaptive equipment to support your goals.
We look forward to meeting you:
June -September: Weekly open water adventures
Oct – May: Pool Training
Carmody Recreation Center
2200 South Kipling Street
Denver, CO 80227
Wednesdays (most) from 6:30 to 8:30 PM
(Gear is available. RSVP for gear is greatly appreciated)
Chapter Coordinator:
Lorraine Bruteig
lorraine@teamriverrunner.org
Chapter assistant
Jeanne Murtagh
jeannie.murtagh@teamriverrunner.org
Chapter Outreach Coordinator:
Angela Dougherty
Angela.Dougherty@teamriverrunner.org',
       'https://www.teamriverrunner.org/get-involved/chapters/colorado-denver/'
  from public.organizations o
 where o.short_code = 'TRR'
   and not exists (select 1 from public.organization_places x where x.organization_id = o.id and x.url = 'https://www.teamriverrunner.org/get-involved/chapters/colorado-denver/');
insert into public.organization_places
  (organization_id, position, label, address, city, state, postal_code, note, url)
select o.id, 5, 'Grand Junction chapter', null, 'Grand Junction', 'CO', null,
       'If you or you know of a veteran that might be interested in volunteering and/or participating with TRR Grand Junction, CO, please contact the chapter coordinator(s) below and get involved!
Chapter Coordinator:
Amber Martin
amber.martin@teamriverrunner.org
Co-Coordinator/Secretary
Tina Bruce
tina.bruce@teamriverrunner.org',
       'https://www.teamriverrunner.org/get-involved/chapters/colorado-grand-junction/'
  from public.organizations o
 where o.short_code = 'TRR'
   and not exists (select 1 from public.organization_places x where x.organization_id = o.id and x.url = 'https://www.teamriverrunner.org/get-involved/chapters/colorado-grand-junction/');
insert into public.organization_places
  (organization_id, position, label, address, city, state, postal_code, note, url)
select o.id, 6, 'Atlanta chapter', null, 'Atlanta', 'GA', null,
       'If you or you know of a veteran that might be interested in volunteering and/or participating with TRR Atlanta, please contact the chapter coordinator below and get involved!
Chapter Coordinator:
David Sapp
trratlanta@teamriverrunner.org',
       'https://www.teamriverrunner.org/get-involved/chapters/georgia-atlanta/'
  from public.organizations o
 where o.short_code = 'TRR'
   and not exists (select 1 from public.organization_places x where x.organization_id = o.id and x.url = 'https://www.teamriverrunner.org/get-involved/chapters/georgia-atlanta/');
insert into public.organization_places
  (organization_id, position, label, address, city, state, postal_code, note, url)
select o.id, 7, 'Columbus chapter', null, 'Columbus', 'GA', null,
       'If you are interested in paddling or volunteering with TRR, or if you know a Veteran that might be interested in participating with TRR Columbus, please contact the chapter coordinator below and get involved!
Chapter Coordinator:
Melissa Hargrove
melissa.hargrove@teamriverrunner.org',
       'https://www.teamriverrunner.org/get-involved/chapters/columbus'
  from public.organizations o
 where o.short_code = 'TRR'
   and not exists (select 1 from public.organization_places x where x.organization_id = o.id and x.url = 'https://www.teamriverrunner.org/get-involved/chapters/columbus');
insert into public.organization_places
  (organization_id, position, label, address, city, state, postal_code, note, url)
select o.id, 8, 'Walter Reed National Military Medical Center', '8901 Wisconsin Ave.', 'Bethesda', 'MD', '20889',
       'Walter Reed National Military Medical Center
8901 Wisconsin Ave. Bldg. 17 (Pool in New MWR Building)
Bethesda, MD 20889
If you or you know of a veteran that might be interested in volunteering and/or participating with TRR Walter Reed, please contact the chapter coordinator below and get involved!
Chapter Coordinator:
Lisa Weed
lisa.weed@teamriverrunner.org or
walter.reed@teamriverrunner.org',
       'https://www.teamriverrunner.org/get-involved/chapters/maryland-walter-reed-national-military-medical-center-wrnmmc/'
  from public.organizations o
 where o.short_code = 'TRR'
   and not exists (select 1 from public.organization_places x where x.organization_id = o.id and x.url = 'https://www.teamriverrunner.org/get-involved/chapters/maryland-walter-reed-national-military-medical-center-wrnmmc/');
insert into public.organization_places
  (organization_id, position, label, address, city, state, postal_code, note, url)
select o.id, 9, 'Perry Point VA / Northern Chesapeake chapter', null, 'Perry Point', 'MD', null,
       'Location: Perry Point VA, MD
If you or you know of a veteran that might be interested in volunteering and/or participating with TRR Perry Point area, please contact the chapter coordinator below and get involved!
Chapter Coordinator:
Joe Mornini
joe@teamriverrunner.org',
       'https://www.teamriverrunner.org/get-involved/chapters/maryland-perry-point-va-northern-chesapeake/'
  from public.organizations o
 where o.short_code = 'TRR'
   and not exists (select 1 from public.organization_places x where x.organization_id = o.id and x.url = 'https://www.teamriverrunner.org/get-involved/chapters/maryland-perry-point-va-northern-chesapeake/');
insert into public.organization_places
  (organization_id, position, label, address, city, state, postal_code, note, url)
select o.id, 10, 'St Louis VA Medical Center – Jefferson Barracks Division', '1 Jefferson Barracks', 'St. Louis', 'MO', '63125',
       'If you’d like to see upcoming event details, please go to: Team River Runner – St. Louis Events and click “MO” on the left (to filter for just Missouri); or go to our Facebook Group: Team River Runner – St Louis
You can also contact the Chapter Coordinator for more information about the chapter.
LOCATION :
St Louis VA Medical Center – Jefferson Barracks Division
1 Jefferson Barracks
St. Louis, MO 63125
Chapter Coordinators:
Phone: 314-329-7475
Email: stltrr@teamriverrunner.org
Sally Haywood sally.haywood@teamriverrunner.org
John Lawrence John.lawrence@teamriverrunner.org
Participants in TRR events need to electronically sign a waiver, WaiverSign.',
       'https://www.teamriverrunner.org/get-involved/chapters/missouri-st-louis/'
  from public.organizations o
 where o.short_code = 'TRR'
   and not exists (select 1 from public.organization_places x where x.organization_id = o.id and x.url = 'https://www.teamriverrunner.org/get-involved/chapters/missouri-st-louis/');
insert into public.organization_places
  (organization_id, position, label, address, city, state, postal_code, note, url)
select o.id, 11, 'Charlotte chapter', null, 'Charlotte', 'NC', null,
       'If you or you know of a veteran that might be interested in volunteering and/or participating with TRR Charlotte, NC, please contact the chapter coordinator below and get involved!
Chapter Coordinator:
Jason Miller
jason.miller@teamriverrunner.org
803-839-4373',
       'https://www.teamriverrunner.org/get-involved/chapters/north-carolina-charlotte/'
  from public.organizations o
 where o.short_code = 'TRR'
   and not exists (select 1 from public.organization_places x where x.organization_id = o.id and x.url = 'https://www.teamriverrunner.org/get-involved/chapters/north-carolina-charlotte/');
insert into public.organization_places
  (organization_id, position, label, address, city, state, postal_code, note, url)
select o.id, 12, 'NEHSA (Newbury)', null, 'Newbury', 'NH', null,
       'The New England Healing Sports Association (NEHSA) is the local sponsor of Team River Runner in Newbury, New Hampshire.
LOCATION :
Newbury, NH
Chapter Coordinator:
Carly Bascom
carly.bascom@nehsa.org',
       'https://www.teamriverrunner.org/get-involved/chapters/new-hampshire-nehsa/'
  from public.organizations o
 where o.short_code = 'TRR'
   and not exists (select 1 from public.organization_places x where x.organization_id = o.id and x.url = 'https://www.teamriverrunner.org/get-involved/chapters/new-hampshire-nehsa/');
insert into public.organization_places
  (organization_id, position, label, address, city, state, postal_code, note, url)
select o.id, 13, 'Oklahoma City chapter', null, 'Oklahoma City', 'OK', null,
       'If you or you know of a veteran that might be interested in volunteering and/or participating with TRR Oklahoma City, OK, please contact the chapter coordinator(s) below and get involved!
Chapter Coordinator(s):
Mason Sovereign
mason.sovereign@teamriverrunner.org
Matt Croslin
matt.croslin@teamriverrunner.org',
       'https://www.teamriverrunner.org/get-involved/chapters/oklahoma-oklahoma-city/'
  from public.organizations o
 where o.short_code = 'TRR'
   and not exists (select 1 from public.organization_places x where x.organization_id = o.id and x.url = 'https://www.teamriverrunner.org/get-involved/chapters/oklahoma-oklahoma-city/');
insert into public.organization_places
  (organization_id, position, label, address, city, state, postal_code, note, url)
select o.id, 14, 'Portland chapter', null, 'Portland', 'OR', null,
       'Interested in learning more?
Volunteering and/or participating with TRR Portland, OR is easy!
just contact the chapter coordinator below and get involved.
Chapter Coordinator (s):
David Pauli
david.pauli@teamriverrunner.org
503-407-4032
Val Shaul
val.shaull@teamriverrunner.org
503-805-8991',
       'https://www.teamriverrunner.org/get-involved/chapters/oregon-portland/'
  from public.organizations o
 where o.short_code = 'TRR'
   and not exists (select 1 from public.organization_places x where x.organization_id = o.id and x.url = 'https://www.teamriverrunner.org/get-involved/chapters/oregon-portland/');
insert into public.organization_places
  (organization_id, position, label, address, city, state, postal_code, note, url)
select o.id, 15, 'Columbia chapter', null, 'Columbia', 'SC', null,
       'We welcome all veterans and encourage you to come out and join us on the river. Whether you are looking for the adrenaline rush of running whitewater or like to take a boat out to enjoy some birdwatching, we are happy to accommodate your interests and goals.
If you or you know of a veteran that might be interested in volunteering and/or participating with TRR Columbia, SC, please contact the chapter coordinator below and get involved!
Chapter Coordinator(s):
Michael Levine
michael.levine@teamriverrunner.org
Khalid Kure
khalid.kure@teamriverrunner.org
Linda Johnson
linda.johnson@teamriverrunner.org',
       'https://www.teamriverrunner.org/get-involved/chapters/south-carolina-columbia/'
  from public.organizations o
 where o.short_code = 'TRR'
   and not exists (select 1 from public.organization_places x where x.organization_id = o.id and x.url = 'https://www.teamriverrunner.org/get-involved/chapters/south-carolina-columbia/');
insert into public.organization_places
  (organization_id, position, label, address, city, state, postal_code, note, url)
select o.id, 16, 'Chattanooga chapter', null, 'Chattanooga', 'TN', null,
       'Team River Runner Chattanooga welcomes all Veterans, Active Duty and their family members to join us on the water. Looking for an outdoor hobby, adventure and a sense of community? A way to reconnect with other Veterans or your family? We got your six.
We have it all from Flatwater to Class IV Whitewater. We provide the equipment, instructors, safety boaters, all you need to go is show up!!
We start you off at the lake, get you comfortable in the appropriate boat, work on basic skills and figure out what direction you want to take your paddling in.
Our priorities are 1. Safety, 2. Having FUN and developing skills, 3. Veterans getting a chance to hang out with other Veterans.
We are active pretty much year round…..come check us out!!!
CONTACT :
Laura Dillon,
TRR Chattanooga Chapter Coordinator
laura@teamriverrunner.org, 678-662-0685',
       'https://www.teamriverrunner.org/get-involved/chapters/tennessee-chattanooga/'
  from public.organizations o
 where o.short_code = 'TRR'
   and not exists (select 1 from public.organization_places x where x.organization_id = o.id and x.url = 'https://www.teamriverrunner.org/get-involved/chapters/tennessee-chattanooga/');
insert into public.organization_places
  (organization_id, position, label, address, city, state, postal_code, note, url)
select o.id, 17, 'Johnson City chapter', null, 'Johnson City', 'TN', null,
       'The Johnson City chapter of TRR is active and growing. We would love to have you and your family join our organization! We have pool sessions weekly in the cooler months and river training during the warm summer days. We look forward to meeting you and seeing you on the river!
Our organization is for Veterans and their families. Please email the chapter coordinator, David Shields at david.shields@teamriverrunner.org .
We also have a Facebook group page – click here . All our activities are posted there. Please request to join and someone will contact you about the organization.
POOL SESSIONS: Pool sessions are held at the Center for Physical Activities at East Tennessee State University during the cooler months. Check the Facebook page for the schedule. If you haven’t filled out a paddler/staff info sheet, please let a volunteer know. Same goes for release forms (DSUSA, VA, and media)
RIVER SESSIONS: During the summer, we go to the Nolichucky River for park and play sessions or downriver trips. Paper work MUST be completed and brought with you if you haven’t already completed it at a pool session. River trips are planned throughout the spring, summer and fall. These trips are typically announced on Facebook. Please join TRR Johnson City Facebook for last minute updates on pool sessions, river trips, and more!',
       'https://www.teamriverrunner.org/get-involved/chapters/tennessee-johnson-citytricities-northern-tn/'
  from public.organizations o
 where o.short_code = 'TRR'
   and not exists (select 1 from public.organization_places x where x.organization_id = o.id and x.url = 'https://www.teamriverrunner.org/get-involved/chapters/tennessee-johnson-citytricities-northern-tn/');
insert into public.organization_places
  (organization_id, position, label, address, city, state, postal_code, note, url)
select o.id, 18, 'Fort Belvoir chapter', null, 'Fort Belvoir', 'VA', null,
       'The Ft Belvoir Chapter is a whitewater focused chapter located just outside of Washington DC, paddling throughout Virginia, Maryland, Pennsylvania and West Virginia.
TRR Ft Belvoir hosts Wednesday evening Lock 6 Sessions on the Potomac every Wednesday from May through September and pool sessions a Benyaurd Pool at Ft Belvoir through the winter months. For bigger events, we host an annual Memorial Sunday James River Paddle and Cookout, several Yough Weekends, trips out New River Gorge, and day trips to beautiful rivers in the area.
We would love to get on the river with you. Please see our website at www.trrftbelvoir.org for more information and to get in touch.
Chapter Coordinators:
William Duffy william.duffy@teamriverrunner.org
Vince girolami vince.girolami@teamriverrunner.org',
       'https://www.teamriverrunner.org/get-involved/chapters/virginia-fort-belvoir/'
  from public.organizations o
 where o.short_code = 'TRR'
   and not exists (select 1 from public.organization_places x where x.organization_id = o.id and x.url = 'https://www.teamriverrunner.org/get-involved/chapters/virginia-fort-belvoir/');
insert into public.organization_places
  (organization_id, position, label, address, city, state, postal_code, note, url)
select o.id, 19, 'VA Puget Sound Health Care, Seattle Div', '1660 South Columbian Way', 'Seattle', 'WA', '98108',
       'What kind of boating do you like to do? White water, sea kayaking, and surf kayaking are all available just a short jaunt from Seattle!
Maybe you don’t know what you might like but are curious about what this sport involves. The Seattle Chapter would love to introduce you to the sport in a fun and comfortable environment. Please consider joining us at one of our weekly pool sessions.
We are excited to announce the VA Pool is now available for pool sessions! Please contact Nicole to attend a pool session.
LOCATION:
VA Puget Sound Health Care, Seattle Div
1660 South Columbian Way, Seattle, WA 98108
If you or you know of a veteran that might be interested in volunteering and/or participating with TRR Seattle, WA, please contact the chapter coordinator below and get involved!
Chapter Coordinator:
Nicole LeBlanc
nleblanc6429@gmail.com',
       'https://www.teamriverrunner.org/get-involved/chapters/washington-seattle/'
  from public.organizations o
 where o.short_code = 'TRR'
   and not exists (select 1 from public.organization_places x where x.organization_id = o.id and x.url = 'https://www.teamriverrunner.org/get-involved/chapters/washington-seattle/');
insert into public.organization_places
  (organization_id, position, label, address, city, state, postal_code, note, url)
select o.id, 20, 'Spokane chapter', null, 'Spokane', 'WA', null,
       'If you or you know of a veteran that might be interested in volunteering and/or participating with TRR Spokane, WA, please contact the chapter coordinator below and get involved!
Chapter Coordinator (s):
Stan Mrzygod
stan.mrz@teamriverrunner.org
Michael Lanning
michael.lanning@teamriverrunner.org',
       'https://www.teamriverrunner.org/get-involved/chapters/washington-spokane/'
  from public.organizations o
 where o.short_code = 'TRR'
   and not exists (select 1 from public.organization_places x where x.organization_id = o.id and x.url = 'https://www.teamriverrunner.org/get-involved/chapters/washington-spokane/');
insert into public.organization_places
  (organization_id, position, label, address, city, state, postal_code, note, url)
select o.id, 21, 'Milwaukee chapter, Lower Genesee Lake', '37023 Genesee Lake Rd', 'Oconomowoc', 'WI', '53066',
       'LOCATION:
Lake sessions Wednesday nights at Lower Genesee Lake Public Boat Launch, 37023 Genesee Lake Rd, Oconomowoc, WI 53066
If you or you know of a veteran that might be interested in volunteering and/or participating with TRR Milwaukee, WI, please contact the chapter coordinator below and get involved!
Chapter Coordinator:
Craig Esposito
craig_esposito@yahoo.com
Linda Tomsevics
LTadaptive@hotmail.com',
       'https://www.teamriverrunner.org/get-involved/chapters/wisconsin-milwaukee/'
  from public.organizations o
 where o.short_code = 'TRR'
   and not exists (select 1 from public.organization_places x where x.organization_id = o.id and x.url = 'https://www.teamriverrunner.org/get-involved/chapters/wisconsin-milwaukee/');
