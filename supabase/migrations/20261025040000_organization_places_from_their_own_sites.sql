-- ============================================================================
-- Organizations' places, from their own sites
-- ============================================================================
-- The owner, 2026-10-25: each organization's places as its own website shows
-- them to a visitor, main place first. A published street address is kept
-- (and pinned once found); a P.O. box or a numbered mailbox is its city's
-- middle. Each row names the page it came from. The main place is copied to
-- the directory's city and state, as save_organization_places does.
--
-- No place, so off the map: SCAS, UNR, PCH, WWM, AWR, SPP, WRA, DN, IBF, PRJ, NWSA. Of these, SCAS, UNR
-- keep the state their own pages give.
-- ============================================================================

delete from public.organization_places op
 using public.organizations o
 where o.id = op.organization_id
   and o.short_code in ('CC', 'HF', 'NCS', 'BORP', 'SA', 'ACT', 'ACS', 'BAAD', 'CHN', 'TF', 'NT', 'LRO', 'NXS', 'WWA', 'WLAX', 'ARC', 'AFS', 'ACL', 'AMM', 'ACLA', 'ACSF', 'BWPV', 'BPF', 'BTB', 'CIL', 'CORE', 'CCAS', 'CHC', 'CSSD', 'ETC', 'KFRC', 'NCEF', 'OPS', 'POSS', 'PRC', 'PVAC', 'RLA', 'SVIL', 'SCAS', 'TRR', 'TPS', 'UNR', 'USRC', 'VAPA', 'RC', 'PCH', 'WWM', 'LHC', 'SC', 'AA', 'ABY', 'ASNW', 'AWR', 'BLNK', 'BLZ', 'BOC', 'BRPF', 'CDRF', 'CH', 'DH', 'FD', 'FFF', 'GBU', 'HHL', 'KBF', 'LKS', 'MU', 'NASC', 'NWBA', 'PSOC', 'PVA', 'SHC', 'SPP', 'SRA', 'TESF', 'UNSP', 'USH', 'USTA', 'WRA', 'DN', 'MTW', 'IBF', 'PRJ', 'NWSA');

insert into public.organization_places (organization_id, position, label, address, city, state)
select o.id, v.position, v.label, v.address, v.city, v.state
  from (values
  -- https://canine.org/locations/northwest/
  ('CC', 0, 'National headquarters and Northwest training center', '2965 Dutton Ave.', 'Santa Rosa', 'CA'),
  -- https://canine.org/locations/southwest/
  ('CC', 1, 'Southwest training center', '124 Rancho del Oro Drive', 'Oceanside', 'CA'),
  -- https://canine.org/locations/north-central/
  ('CC', 2, 'North Central training center', '7480 New Albany Condit Road', 'New Albany', 'OH'),
  -- https://canine.org/locations/northeast/
  ('CC', 3, 'Northeast training center', '286 Middle Island Road', 'Medford', 'NY'),
  -- https://canine.org/locations/south-central/
  ('CC', 4, 'South Central training center', '7710 Las Colinas Ridge', 'Irving', 'TX'),
  -- https://canine.org/locations/southeast/
  ('CC', 5, 'Southeast training center', '8150 Clarcona Ocoee Road', 'Orlando', 'FL'),
  -- https://highfivesfoundation.org/programs/cr-johnson-healing-center/
  ('HF', 0, 'Headquarters and CR Johnson Healing Center', '10775 Pioneer Trail, Suite 108', 'Truckee', 'CA'),
  -- https://norcalsci.org/contact-us
  ('NCS', 0, null, null, 'Concord', 'CA'),
  -- https://www.borp.org/about/contact-us/
  ('BORP', 0, 'Ed Roberts Campus', '3075 Adeline Street, Suite 200', 'Berkeley', 'CA'),
  -- https://sharedadventures.org/contact/
  ('SA', 0, null, null, 'Santa Cruz', 'CA'),
  -- https://www.achievetahoe.org/contact/
  ('ACT', 0, 'Program center at Alpine Meadows Resort', '2680 Alpine Meadows Road, B3686', 'Alpine Meadows', 'CA'),
  -- https://angelcitysports.org/about/
  ('ACS', 0, null, null, 'Los Angeles', 'CA'),
  -- https://www.baads.org/contact/
  ('BAAD', 0, 'Dock at South Beach Harbor', 'Pier 40, The Embarcadero', 'San Francisco', 'CA'),
  -- https://chnfoundation.org/
  ('CHN', 0, null, null, 'Tarzana', 'CA'),
  -- https://triumph-foundation.org/contact-us/
  ('TF', 0, 'Headquarters', '27811 Avenue Hopkins Unit 5', 'Valencia', 'CA'),
  -- https://naturetrack.org/contact/
  ('NT', 0, null, null, 'Los Olivos', 'CA'),
  -- https://liferollson.org/connect
  ('LRO', 0, null, null, 'Los Angeles', 'CA'),
  -- https://www.nextstepfitness.org/contact
  ('NXS', 0, 'NextStep Los Angeles (HQ)', '4447 Redondo Beach Blvd', 'Lawndale', 'CA'),
  -- https://www.nextstepfitness.org/contact
  ('NXS', 1, 'NextStep Kansas City', '6600 College Blvd. STE 315', 'Overland Park', 'KS'),
  -- https://www.nextstepfitness.org/contact
  ('NXS', 2, 'NextStep Atlanta', '1755 Grassland Pkwy STE B', 'Alpharetta', 'GA'),
  -- https://www.nextstepfitness.org/contact
  ('NXS', 3, 'NextStep Orlando', '8701 Maitland Summit Blvd', 'Orlando', 'FL'),
  -- https://www.nextstepfitness.org/contact
  ('NXS', 4, 'NextStep Raleigh', '6601 Hillsborough Street, Suite 113', 'Raleigh', 'NC'),
  -- https://www.nextstepfitness.org/contact
  ('NXS', 5, 'NextStep Las Vegas (at DRIVEN)', '701 E Bridger Avenue, Ste 150', 'Las Vegas', 'NV'),
  -- https://walkingwithanthony.org/
  ('WWA', 0, null, null, 'Los Angeles', 'CA'),
  -- https://www.wheelchairlacrosse.com/
  ('WLAX', 0, null, '3333 Camino Del Rio South, Suite 330', 'San Diego', 'CA'),
  -- https://www.arc-la.com/contact
  ('ARC', 0, 'Recovery center', '16152 Saticoy St.', 'Van Nuys', 'CA'),
  -- https://abilityfirstsports.org/contact/
  ('AFS', 0, null, null, 'Chico', 'CA'),
  -- https://www.cityofsacramento.gov/ypce/access-leisure/contact-access-leisure
  ('ACL', 0, 'Office at Belle Cooledge Community Center', '5699 S Land Park Dr', 'Sacramento', 'CA'),
  -- https://accessmammoth.org/contact-us/
  ('AMM', 0, 'Main office', '1 Minaret Rd', 'Mammoth Lakes', 'CA'),
  -- https://accessmammoth.org/about-access-mammoth/our-locations/second-chance-thrift-shop/
  ('AMM', 1, 'Second Chance Thrift Shop', '501 Old Mammoth Rd', 'Mammoth Lakes', 'CA'),
  -- https://accessmammoth.org/about-access-mammoth/our-locations/the-jack-kathy-copeland-center/
  ('AMM', 2, 'Jack & Kathy Copeland Center', null, 'June Lake', 'CA'),
  -- https://www.achillesinternational.org/los-angeles
  ('ACLA', 0, 'Meetup spot, Dorothy Green Park', '2484 Ocean Front Walk', 'Santa Monica', 'CA'),
  -- https://www.achillesinternational.org/san-francisco-bay-area
  ('ACSF', 0, 'Crissy Field and Ocean Beach meetups', null, 'San Francisco', 'CA'),
  -- https://www.achillesinternational.org/san-francisco-bay-area
  ('ACSF', 1, 'Lake Merritt meetup', null, 'Oakland', 'CA'),
  -- https://bawpva.org/contact/
  ('BWPV', 0, 'Chapter office, VA Palo Alto', '3801 Miranda Ave. Bldg. 7 Rm. E-118', 'Palo Alto', 'CA'),
  -- https://beperfectfoundation.org/contact
  ('BPF', 0, null, '720 Indigo Court', 'Pomona', 'CA'),
  -- https://breakthebarriers.org/contact/
  ('BTB', 0, 'Sports center', '8555 North Cedar Avenue', 'Fresno', 'CA'),
  -- https://thecil.org/
  ('CIL', 0, 'Ed Roberts Campus (programs & admin)', '3075 Adeline Street, Suite 100', 'Berkeley', 'CA'),
  -- https://thecil.org/
  ('CIL', 1, 'Fruitvale', '1470 Fruitvale Avenue', 'Oakland', 'CA'),
  -- https://thecil.org/
  ('CIL', 2, 'Wheelhouse', null, 'Oakland', 'CA'),
  -- https://www.centerofrestorativeexercise.com/contact
  ('CORE', 0, 'Gym', '9631 Reseda Blvd', 'Northridge', 'CA'),
  -- https://www.centralcaladaptive.org/contact
  ('CCAS', 0, 'Shaver Lake office', '40885 Shaver Forest Road', 'Shaver Lake', 'CA'),
  -- https://www.centralcaladaptive.org/contact
  ('CCAS', 1, 'Adaptive Sports Center at China Peak', '59265 CA-168', 'Lakeshore', 'CA'),
  -- https://challengecenter.org/new-kearny-mesa-location-opening/
  ('CHC', 0, 'Kearny Mesa center', '9596 Chesapeake Dr. Unit A', 'San Diego', 'CA'),
  -- https://www.challengedsailors.org/location
  ('CSSD', 0, 'Dock D, Sunroad Marina', '955 Harbor Island Drive', 'San Diego', 'CA'),
  -- https://etctrips.org/
  ('ETC', 0, 'Office, Fort Mason Center', '2 Marina Boulevard, Fort Mason Center, Suite C385', 'San Francisco', 'CA'),
  -- https://healthy.kaiserpermanente.org/northern-california/facilities/kaiser-foundation-rehabilitation-center-kfrc-100298
  ('KFRC', 0, 'Rehabilitation hospital', '975 Sereno Dr', 'Vallejo', 'CA'),
  -- https://nceft.org/contact/
  ('NCEF', 0, 'Therapy center', '880 Runnymede Road', 'Woodside', 'CA'),
  -- https://operationsurf.org/contact/
  ('OPS', 0, 'Storefront', '80 San Francisco Street', 'Avila Beach', 'CA'),
  -- https://teampossabilities.org/contact-us/
  ('POSS', 0, 'Professional Plaza Building A', '25455 Barton Rd., Suite 109A', 'Loma Linda', 'CA'),
  -- https://www.precisionrehabilitation.com/about-us
  ('PRC', 0, 'Clinic', '3294 East Spring Street', 'Long Beach', 'CA'),
  -- https://pvacc.org/contact-us/
  ('PVAC', 0, 'Chapter office, VA Long Beach', '5901 E. 7th Street Bldg. 150 Rm. R-204', 'Long Beach', 'CA'),
  -- https://dhs.lacounty.gov/rancho/our-services/specialty-care/specialty-care-locations/
  ('RLA', 0, 'Rancho Los Amigos National Rehabilitation Center', '7601 E. Imperial Hwy', 'Downey', 'CA'),
  -- https://svilc.org/contact-us/
  ('SVIL', 0, 'San Jose main office', '25 N. 14th St., Ste. 1000', 'San Jose', 'CA'),
  -- https://svilc.org/contact-us/
  ('SVIL', 1, 'South County branch office', '7881 Church St., Ste.C', 'Gilroy', 'CA'),
  -- https://www.teamriverrunner.org/get-involved/chapters/california-palo-alto/
  ('TRR', 0, 'Palo Alto chapter', null, 'Palo Alto', 'CA'),
  -- https://theperfectstep.com/contact-us
  ('TPS', 0, 'Headquarters', '764 Indigo Court, Unit A', 'Pomona', 'CA'),
  -- Own site usarc.org/contact-us (quoted 2026-10-25); matched by CA State Parks listing 2026-10-26; re-check own site.
  -- https://www.usarc.org/contact-us/
  ('USRC', 0, null, '43101 Goldmine Drive', 'Big Bear Lake', 'CA'),
  -- https://www.sci.va.gov/SCICenters/Palo_alto.asp
  ('VAPA', 0, 'SCI/D Center, VA Palo Alto', '3801 Miranda Ave.', 'Palo Alto', 'CA'),
  -- https://www.recares.org/locations
  ('RC', 0, 'Oakland', '2619 Broadway', 'Oakland', 'CA'),
  -- https://www.recares.org/locations
  ('RC', 1, 'San Francisco', '63 Dorland Street', 'San Francisco', 'CA'),
  -- https://www.recares.org/locations
  ('RC', 2, 'Marin', '3100 Kerner Blvd', 'San Rafael', 'CA'),
  -- https://www.thelionheart.community/contact/
  ('LHC', 0, 'Mailing address', null, 'Sacramento', 'CA'),
  -- Confirmed by the owner in a browser, 2026-10-26.
  -- https://scvmc.scvh.org/healthcare-services/rehabilitation-center/services/peer-support
  ('SC', 0, 'Santa Clara Valley Medical Center', '751 S. Bascom Ave.', 'San Jose', 'CA'),
  -- https://adaptiveadventures.org/contact-us/
  ('AA', 0, 'National headquarters', '9053 Harlan Street', 'Westminster', 'CO'),
  -- https://ability360.org/contact/
  ('ABY', 0, 'Main office', '5025 E. Washington St.', 'Phoenix', 'AZ'),
  -- https://ability360.org/contact/
  ('ABY', 1, 'Sports & Fitness Center', '5031 E. Washington St.', 'Phoenix', 'AZ'),
  -- https://ability360.org/contact/
  ('ABY', 2, 'Home care office (Gilbert / Mesa)', '205 E. Southern Ave.', 'Mesa', 'AZ'),
  -- https://ability360.org/contact/
  ('ABY', 3, 'Home care office (Pinal-Gila County)', '501 N Florence St', 'Casa Grande', 'AZ'),
  -- https://ability360.org/contact/
  ('ABY', 4, 'Home care office (Glendale)', '6829 N. 57th Ave.', 'Glendale', 'AZ'),
  -- https://ability360.org/contact/
  ('ABY', 5, 'Home care office (Pima County)', '1001 N. Alvernon Way', 'Tucson', 'AZ'),
  -- https://adaptivesportsnw.org/contact/
  ('ASNW', 0, 'Office', '10541 SE Cherry Blossom Drive', 'Portland', 'OR'),
  -- https://blinkofaneye.org/contact-us/
  ('BLNK', 0, 'Office', '728 Deepdene Rd', 'Baltimore', 'MD'),
  -- https://blazesports.org/
  ('BLZ', 0, 'Mailing address', null, 'Atlanta', 'GA'),
  -- https://usaboccia.org/contact/
  ('BOC', 0, 'Mailing address', '1398 Penataquit Avenue', 'Bay Shore', 'NY'),
  -- https://brpf.org/contact/
  ('BRPF', 0, 'Office', 'N14 W23900 Stone Ridge Dr', 'Waukesha', 'WI'),
  -- https://www.christopherreeve.org/community/about-us/contact-us/
  ('CDRF', 0, 'Headquarters', '636 Morris Turnpike', 'Short Hills', 'NJ'),
  -- https://craighospital.org/contact
  ('CH', 0, 'Hospital', '3425 S. Clarkson St.', 'Englewood', 'CO'),
  -- https://diveheart.org/contact-us/
  ('DH', 0, 'Office', '5147 Main St', 'Downers Grove', 'IL'),
  -- https://facingdisability.com/about-us#contact
  ('FD', 0, 'Hill Foundation office', '737 N. Michigan Ave.', 'Chicago', 'IL'),
  -- https://fallingforward.org/
  ('FFF', 0, 'Mailing address', '4513 Goldfield', 'Lawrence', 'KS'),
  -- https://www.gettingbackup.org/donate/
  ('GBU', 0, 'Mailing address', '2720 Horseshoe Blvd.', 'Westlake', 'OH'),
  -- https://helphopelive.org/contact/
  ('HHL', 0, 'Office', '100 Matsonford Road', 'Radnor', 'PA'),
  -- https://kbf.org/contact-us/
  ('KBF', 0, 'Office', '3 Main Street', 'Burlington', 'VT'),
  -- https://www.lakeshore.org/
  ('LKS', 0, 'Lakeshore campus', '4000 Ridgeway Drive', 'Birmingham', 'AL'),
  -- https://moveunitedsport.org/contact-us/
  ('MU', 0, 'Office', '451 Hungerford Drive', 'Rockville', 'MD'),
  -- https://nascic.org/
  ('NASC', 0, 'Mailing address', null, 'Columbus', 'OH'),
  -- https://www.nwba.org/contactus
  ('NWBA', 0, 'National office', '1130 Elkton St.', 'Colorado Springs', 'CO'),
  -- https://www.powersoccerusa.org/contact
  ('PSOC', 0, 'Mailing address', '1239 Hoover Ln', 'Indianapolis', 'IN'),
  -- https://pva.org/contact-us/
  ('PVA', 0, 'National headquarters', '1875 Eye St NW', 'Washington', 'DC'),
  -- https://shepherd.org/about/locations/
  ('SHC', 0, 'Main campus', '2020 Peachtree Road NW', 'Atlanta', 'GA'),
  -- https://shepherd.org/about/locations/
  ('SHC', 1, 'Shepherd Peachtree Park', '80 Peachtree Park Drive NE', 'Atlanta', 'GA'),
  -- https://shepherd.org/about/locations/
  ('SHC', 2, 'Shepherd Pathways', '1942 Clairmont Road NW', 'Decatur', 'GA'),
  -- https://www.sralab.org/locations
  ('SRA', 0, 'Shirley Ryan AbilityLab', '355 East Erie Street', 'Chicago', 'IL'),
  -- https://www.sralab.org/locations
  ('SRA', 1, 'Adaptive Sports & Fitness Center', '541 North Fairbanks Court', 'Chicago', 'IL'),
  -- https://www.sralab.org/locations
  ('SRA', 2, 'Arlington Heights DayRehab Center', '3215 N Wilke Rd', 'Arlington Heights', 'IL'),
  -- https://www.sralab.org/locations
  ('SRA', 3, 'Burr Ridge Outpatient & DayRehab Center', '7600 County Line Road', 'Burr Ridge', 'IL'),
  -- https://www.sralab.org/locations
  ('SRA', 4, 'Glenview Pediatric & DayRehab Center', '2591 Compass Road', 'Glenview', 'IL'),
  -- https://www.sralab.org/locations
  ('SRA', 5, 'Homewood DayRehab Center', '19260 S. Halsted Street', 'Homewood', 'IL'),
  -- https://www.sralab.org/locations
  ('SRA', 6, 'Northbrook Outpatient Center', '900 Skokie Boulevard', 'Northbrook', 'IL'),
  -- https://thomasesmithfoundation.org/contact-us/
  ('TESF', 0, 'Mailing address', null, 'Marblehead', 'MA'),
  -- https://unitedspinal.org/contact-us/
  ('UNSP', 0, 'Headquarters', '102 Duane Rd.', 'Fort Totten', 'NY'),
  -- https://www.usahockey.com/staffdirectory
  ('USH', 0, 'USA Hockey headquarters', '1775 Bob Johnson Dr.', 'Colorado Springs', 'CO'),
  -- https://www.usta.com/en/home/about-usta/who-we-are/national/usta-contact-us.html
  ('USTA', 0, 'Headquarters', '2500 Westchester Avenue', 'Purchase', 'NY'),
  -- https://www.usta.com/en/home/about-usta/who-we-are/national/usta-contact-us.html
  ('USTA', 1, 'USTA National Campus', '10000 USTA Boulevard', 'Orlando', 'FL'),
  -- https://www.usta.com/en/home/about-usta/who-we-are/national/usta-contact-us.html
  ('USTA', 2, 'USTA Billie Jean King National Tennis Center', null, 'Flushing', 'NY'),
  -- https://www.usta.com/en/home/about-usta/who-we-are/national/usta-contact-us.html
  ('USTA', 3, 'USTA Training Center - West', '18400 Avalon Blvd.', 'Carson', 'CA'),
  -- https://www.usta.com/en/home/about-usta/who-we-are/national/usta-contact-us.html
  ('USTA', 4, 'New York City office', '640 8th Avenue', 'New York', 'NY'),
  -- https://www.morethanwalking.com/donate.html
  ('MTW', 0, 'Mailing address', '155 Peace Acre Ln.', 'Stratford', 'CT')
  ) as v(short_code, position, label, address, city, state)
  join public.organizations o on o.short_code = v.short_code;

update public.organizations o
   set city = coalesce(m.city, o.city), state = m.state
  from (select o2.id,
               (select op.city from public.organization_places op
                 where op.organization_id = o2.id and op.position = 0) as city,
               (select op.state from public.organization_places op
                 where op.organization_id = o2.id and op.position = 0) as state
          from public.organizations o2
         where o2.short_code in ('CC', 'HF', 'NCS', 'BORP', 'SA', 'ACT', 'ACS', 'BAAD', 'CHN', 'TF', 'NT', 'LRO', 'NXS', 'WWA', 'WLAX', 'ARC', 'AFS', 'ACL', 'AMM', 'ACLA', 'ACSF', 'BWPV', 'BPF', 'BTB', 'CIL', 'CORE', 'CCAS', 'CHC', 'CSSD', 'ETC', 'KFRC', 'NCEF', 'OPS', 'POSS', 'PRC', 'PVAC', 'RLA', 'SVIL', 'SCAS', 'TRR', 'TPS', 'UNR', 'USRC', 'VAPA', 'RC', 'PCH', 'WWM', 'LHC', 'SC', 'AA', 'ABY', 'ASNW', 'AWR', 'BLNK', 'BLZ', 'BOC', 'BRPF', 'CDRF', 'CH', 'DH', 'FD', 'FFF', 'GBU', 'HHL', 'KBF', 'LKS', 'MU', 'NASC', 'NWBA', 'PSOC', 'PVA', 'SHC', 'SPP', 'SRA', 'TESF', 'UNSP', 'USH', 'USTA', 'WRA', 'DN', 'MTW', 'IBF', 'PRJ', 'NWSA')) m
 where o.id = m.id;

-- No place, so no pin, but their own pages give the state.
-- SCAS: socaladaptivesports.org: "Riverside County and other Southern California communities"
update public.organizations set state = 'CA' where short_code = 'SCAS';
-- UNR: unrecables.org: "California State Charity"
update public.organizations set state = 'CA' where short_code = 'UNR';
