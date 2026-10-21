-- ============================================================================
-- Organizations described in their own words
-- ============================================================================
-- The owner, 2026-10-20: richer descriptions, from each organization's own
-- website, About and mission pages, or its own social media, and nothing
-- else. Written in the small Markdown events use (lib/markdown.ts): a short
-- paragraph, a few bullets, a link. Claims their own pages do not make were
-- dropped. SCVMC SCI Peer Support keeps its own: its site would not load.
--
-- Three cities corrected from the organizations' own pages.
-- ============================================================================

-- Abilities Recovery Center: https://www.arc-la.com/, https://www.arc-la.com/clients, https://www.arc-la.com/story
update public.organizations set description = $bio$Abilities Recovery Center is a paralysis recovery center in Van Nuys that works with people with paralysis, including spinal cord injuries. Its mission: "To give people the opportunity to move, stand, and walk again."

- Adaptive exercise therapy for people with paralysis, one on one with a trainer
- **MÁS:** a machine for standing and walking, with no harnesses or robotics
- A 9,000 sq. ft. gym with open space for over-ground walking
- Community events where clients connect with others living with paralysis

[arc-la.com](https://www.arc-la.com/)$bio$ where short_code = 'ARC';

-- Ability First Sports: https://abilityfirstsports.org/, https://abilityfirstsports.org/about/, https://abilityfirstsports.org/year-round-activities/
update public.organizations set description = $bio$Ability First Sports offers sports, recreation and leisure for youth and adults with physical disabilities. Its mission is "To empower youth and adults with physical disabilities to engage in a healthy and active lifestyle."

- Free year-round sports clinics across Chico and surrounding areas
- Monthly in-person activities and workshops, plus monthly virtual sessions
- A week-long adapted sports summer camp at Chico State University
- Sports include basketball, rugby, tennis, hand-cycling, swimming, water skiing, kayaking and archery

Began in 1985 at California State University, Chico.

[abilityfirstsports.org](https://abilityfirstsports.org/)$bio$ where short_code = 'AFS';

-- Ability360: https://ability360.org/, https://ability360.org/about-us/, https://ability360.org/sports-fitness/
update public.organizations set description = $bio$Ability360 is a Phoenix nonprofit and Center for Independent Living. It offers programs that empower people with disabilities to take personal responsibility so they may live independently in the community.

- Independent living services: information and referral, advocacy, peer support and skills training
- Home care, including for people who need long-term care
- **Sports & Fitness:** adaptive sports, fitness, aquatics and outdoor recreation
- Employment services and work incentives planning

Its roots go back to 1977; it took the name Ability360 in 2015.

[ability360.org](https://ability360.org/)$bio$ where short_code = 'ABY';

-- Able Bodied: https://ablebodied.org/
update public.organizations set description = $bio$Able Bodied is a California nonprofit whose mission is to "Help people with disabilities around the world connect and experience “able bodied” adventures." Its main offering is electric assist handcycling.

- Free one-on-one e-assist handcycling lessons in San Jose and Sebastopol
- Free online video consultations about e-assist handcycling
- **Get 1 Help 2:** help choosing a handcycle, applying for grants and fundraising
- Open-source wiki, map and travel guides for handcycling around the world

Founded in May 2024, headquartered in San Jose.

[ablebodied.org](https://ablebodied.org/)$bio$ where short_code = 'AB';

-- Access Leisure: https://www.cityofsacramento.gov/ypce/access-leisure, https://www.cityofsacramento.gov/ypce/access-leisure/about-access-leisure, https://www.cityofsacramento.gov/ypce/access-leisure/sports
update public.organizations set description = $bio$Access Leisure is the City of Sacramento's adaptive and inclusive recreation program for youth, teens and adults with physical and/or intellectual disabilities, and veterans. It aims to improve quality of life through accessible recreation programs and services.

- Adaptive cycling with handcycles and tandems, adaptive swim and aqua aerobics
- Goalball, power soccer and wheelchair softball
- Accessible baseball at River Cats Independence Field, with loaner sport wheelchairs
- Adult social programs, youth and teen programs, and camps

[cityofsacramento.gov](https://www.cityofsacramento.gov/ypce/access-leisure)$bio$ where short_code = 'ACL';

-- Access Mammoth: https://accessmammoth.org/, https://accessmammoth.org/about-access-mammoth/, https://accessmammoth.org/about-access-mammoth/our-mission-vision-values/
update public.organizations set description = $bio$Access Mammoth, formerly Disabled Sports Eastern Sierra, "facilitates fun, inclusive mountain sports experiences for people of every age and ability." It serves people with physical, sensory or cognitive disabilities, and veterans.

- Winter lessons in adaptive skiing, snowboarding and Nordic skiing
- Summer kayaking, paddleboarding, mountain biking, handcycling and hiking
- Free lessons and camps for injured, ill or wounded veterans and service members
- Multi-day camps, group programs and scholarships

Founded in 2003, based in Mammoth Lakes.

[accessmammoth.org](https://accessmammoth.org/)$bio$ where short_code = 'AMM';

-- Achieve Tahoe: https://www.achievetahoe.org/, https://www.achievetahoe.org/about/mission-vision-history/
update public.organizations set description = $bio$Achieve Tahoe offers adaptive outdoor recreation and says it can serve just about anyone with any disability. Its mission is "To provide affordable, inclusive physical and recreational activities that build health, confidence, and independence in children and adults with disabilities."

- **Snowsports:** adaptive winter lessons with specialized equipment
- Summer sailing, paddle sports, water skiing, climbing, archery and hiking
- Adaptive horsemanship and a summer adventure camp
- Military programs

Founded in 1967, based at Alpine Meadows Resort.

[achievetahoe.org](https://www.achievetahoe.org/)$bio$ where short_code = 'ACT';

-- Achilles Los Angeles: https://www.achillesinternational.org/los-angeles, https://www.achillesinternational.org/join
update public.organizations set description = $bio$The Los Angeles chapter of Achilles International "transforms the lives of people with disabilities through athletic programs and social connection." It welcomes people of all ages with a disability, including spinal cord injuries, and military veterans.

- Group workouts twice a month on Sunday mornings at Dorothy Green Park, Santa Monica
- Walk, run or ride with volunteer guides, or go at your own pace
- Support for goals from a first mile to a world marathon major
- Membership is free

[achillesinternational.org](https://www.achillesinternational.org/los-angeles)$bio$ where short_code = 'ACLA';

-- Achilles SF Bay Area: https://www.achillesinternational.org/san-francisco-bay-area, https://www.achillesinternational.org/join
update public.organizations set description = $bio$The San Francisco Bay Area chapter of Achilles International "transforms the lives of people with disabilities through athletic programs and social connection." It welcomes people of all ages with a disability, including spinal cord injuries, and military veterans.

- Two or three guided workouts a month, Saturday or Sunday mornings
- Rotates between Crissy Field and Ocean Beach in San Francisco, and Lake Merritt in Oakland
- Walk, run or roll with a volunteer guide, or go at your own pace
- Membership is free

[achillesinternational.org](https://www.achillesinternational.org/san-francisco-bay-area)$bio$ where short_code = 'ACSF';

-- Adaptive Adventures: https://adaptiveadventures.org/, https://adaptiveadventures.org/about/, https://adaptiveadventures.org/about/who-we-serve/
update public.organizations set description = $bio$Adaptive Adventures is a national nonprofit headquartered in Colorado. It "brings progressive outdoor adventures to individuals with physical disabilities and their families, regardless of location, equipment needs or economic status."

- Skiing, snowboarding, cycling, kayaking and paddleboarding
- Rock climbing, waterskiing, wakeboarding, whitewater rafting and dragon boat racing
- **ASK program:** Stars of Tomorrow camps for youth with physical disabilities
- Programs for adults, injured veterans and active duty military

Headquartered in Westminster, Colorado.

[adaptiveadventures.org](https://adaptiveadventures.org/)$bio$ where short_code = 'AA';

-- Adaptive Sports Northwest: https://adaptivesportsnw.org/, https://adaptivesportsnw.org/about/, https://adaptivesportsnw.org/sports/
update public.organizations set description = $bio$Adaptive Sports Northwest provides adaptive sports and recreation in Oregon and SW Washington. Its mission is "To provide fitness, recreation, and competitive sport to anyone with physical and visual disabilities."

- Wheelchair basketball, wheelchair rugby, power soccer and goalball
- Swimming, track and field, sitting volleyball and archery
- Practices, annual clinics and tournaments, from recreation to Paralympic training
- Loaner adaptive equipment and small grant opportunities for members

Serving since 1982, based in Portland.

[adaptivesportsnw.org](https://adaptivesportsnw.org/)$bio$ where short_code = 'ASNW';

-- Angel City Sports: https://angelcitysports.org/, https://angelcitysports.org/about/
update public.organizations set description = $bio$Angel City Sports is a Los Angeles-based nonprofit that provides free year-round adaptive sports for kids, adults and veterans with physical disabilities or visual impairments. It aims to build "a community focused on belonging and connection."

- Free equipment loaner program, coaching and competitive opportunities
- **Angel City Games:** its flagship event, with Paralympic-style competition
- Youth Weekend for athletes 18 and under, and a Junior Adaptive Sports Camp
- **Courage Weekend:** an annual event for veterans

Began in 2013, based in Los Angeles.

[angelcitysports.org](https://angelcitysports.org/)$bio$ where short_code = 'ACS';

-- Bay Area and Western Chapter PVA: https://bawpva.org/, https://bawpva.org/about/, https://bawpva.org/programs/
update public.organizations set description = $bio$The Bay Area and Western Chapter of Paralyzed Veterans of America is a veterans service organization in Palo Alto. It is "dedicated to the task of improving the quality of life of Veterans with paralysis due to spinal cord dysfunction."

- Monthly SCI peer mentoring lunch at VA Palo Alto, in person or on Zoom
- Sponsors adaptive sports, including a local quad rugby team and national events
- Advocacy for VA health care access and disability rights
- Help with veterans' benefits through national service officers

Serves Northern California, Northern Nevada and the Pacific Islands.

[bawpva.org](https://bawpva.org/)$bio$ where short_code = 'BWPV';

-- Bay Area Association of Disabled Sailors: https://www.baads.org/, https://www.baads.org/about/, https://www.baads.org/sailing/
update public.organizations set description = $bio$The Bay Area Association of Disabled Sailors (BAADS) is an all-volunteer San Francisco nonprofit that "seeks to make all aspects of sailing accessible." It welcomes people with all forms of disability, and no sailing experience is needed.

- Saturday small boat sailing in accessible Hansa dinghies near Oracle Park
- Sunday keelboat sailing on San Francisco Bay as part of a crew
- Joystick-controlled boats for sailors with limited upper body strength
- Regattas and informal races, locally and internationally

Sails year-round from South Beach Harbor, Pier 40.

[baads.org](https://www.baads.org/)$bio$ where short_code = 'BAAD';

-- Be Perfect Foundation: https://beperfectfoundation.org/, https://beperfectfoundation.org/about
update public.organizations set description = $bio$The Be Perfect Foundation is a volunteer-run nonprofit "with a mission to provide direct financial and emotional aid to individuals living with paralysis." It promotes a holistic, exercise-based approach to recovery.

- Scholarships for activity-based therapy at The Perfect Step
- Funds for wheelchairs, car adaptations and high medical bills
- Help paying for outpatient therapy and daily medical necessities
- Guidance and emotional support for people living with paralysis

Founded in 2007, based in Pomona.

[beperfectfoundation.org](https://beperfectfoundation.org/)$bio$ where short_code = 'BPF';

-- BlazeSports America: https://www.blazesports.org/about/
update public.organizations set description = $bio$BlazeSports America is an Atlanta nonprofit formed as the legacy organization of the 1996 Paralympic Games. Its mission is to "change the lives of individuals with physical disabilities through adaptive sport and recreation."

- Youth programs, including BlazeTOTS, plus adult and veteran programs
- Sports such as wheelchair basketball, swimming, track and field, tennis, archery and rowing
- **Training and Education:** adaptive sports coach and adaptive swim certifications
- Community events such as the Peachtree Paragames and Run, Roll & Row 5K

[blazesports.org](https://www.blazesports.org/)$bio$ where short_code = 'BLZ';

-- BLINK of an Eye: https://blinkofaneye.org/, https://blinkofaneye.org/sci-navigator-program/
update public.organizations set description = $bio$BLINK of an Eye is a Baltimore nonprofit that supports the families of people newly injured with spinal cord injury. Its mission is to transform the spinal cord injury experience for families and medical teams in "the first days and months of injury."

- **HEAL Team:** rapid-response support at the ICU bedside in the first hours and days
- **SCI Navigator:** 1:1 support, 24/7, in the first 90 days, from navigators with lived experience
- Ongoing tips and resource connections through the first year, which it calls the Miracle Year
- **BLINK of an Eye Podcast:** stories and expert interviews on life after spinal cord injury

[blinkofaneye.org](https://blinkofaneye.org/)$bio$ where short_code = 'BLNK';

-- BORP Adaptive Sports: https://www.borp.org/about/, https://www.borp.org/
update public.organizations set description = $bio$BORP (Bay Area Outreach and Recreation Program) offers adaptive sports, fitness and recreation for people with physical disabilities. It "empowers youth and adults with mobility and vision disabilities through sports, fitness, and recreational programs."

- Sports including wheelchair basketball, power soccer, goalball, wheelchair rugby and pickleball
- Cycling, kayaking, climbing, and adventures and outings
- In-person fitness, plus a virtual fitness program open to people anywhere
- Some programs for veterans and people with spinal cord injuries; a youth program for families

Founded in 1976 by people with disabilities, based in Berkeley.

[borp.org](https://www.borp.org/)$bio$ where short_code = 'BORP';

-- Break the Barriers: https://breakthebarriers.org/, https://breakthebarriers.org/about/, https://breakthebarriers.org/programs/
update public.organizations set description = $bio$Break the Barriers is an inclusive sports, fitness and arts center for people of all abilities. Its mission is "Celebrating awareness and victories of all abilities, ethnicities, and ages."

- **HOPE (Helping Open Possibilities with Exercise):** trainer-led exercise for spinal cord injury and other neurological conditions
- Inclusive archery, aquatics, gymnastics, martial arts and group fitness classes
- Free programs for veterans and active-duty military
- Performing teams, dance and literacy outreach

A nonprofit since 1984, based in Fresno.

[breakthebarriers.org](https://breakthebarriers.org/)$bio$ where short_code = 'BTB';

-- Bryon Riesch Paralysis Foundation: https://brpf.org/, https://brpf.org/about/, http://brpf.org/charitable-grants/
update public.organizations set description = $bio$The Bryon Riesch Paralysis Foundation was formed by friends and family of Bryon Riesch after his injury. It aims to "find a cure for paralysis through funding the latest in medical research" and to help people with spinal cord disorders.

- **Research Grants:** fund spinal cord injury research at universities and medical schools
- **Charitable Grants:** help people with paralysis live a more independent life
- **Scholarships:** for people with paralysis, or their children, pursuing higher education
- Fundraising events such as a golf outing and a run/walk/roll

Founded in 2001, based in Waukesha, Wisconsin.

[brpf.org](https://brpf.org/)$bio$ where short_code = 'BRPF';

-- Canine Companions: https://canine.org/, https://canine.org/about-us/
update public.organizations set description = $bio$Canine Companions provides expertly trained service and facility dogs to "enhance the lives of people with disabilities." Its dogs and follow-up services are free to the people it serves.

- Service dogs for children, adults and veterans with disabilities
- Hearing dogs, and facility dogs for professionals in healthcare, criminal justice and education
- Ongoing training, guidance and support for each team after placement, at no cost
- Training centers and volunteer chapters across the country

Founded in 1975 in Santa Rosa, California.

[canine.org](https://canine.org/)$bio$ where short_code = 'CC';

-- Center for Independent Living: https://www.thecil.org/about, https://www.thecil.org/, https://thecil.org/assistive-technology/at-loaners-and-repairs/
update public.organizations set description = $bio$The Center for Independent Living calls itself "the first independent living center in the country." It "empowers, supports, and unites individuals with diverse disabilities" and works for their rights, independence and inclusion.

- Peer support, including an Acquired Disability peer group
- Assistive technology loans, and non-emergency repairs of wheelchairs and scooters
- Information and referral, housing assistance and benefits counseling
- Personal attendant services

Founded in 1972, based at the Ed Roberts Campus in Berkeley.

[thecil.org](https://thecil.org/)$bio$ where short_code = 'CIL';

-- Center of Restorative Exercise: https://www.centerofrestorativeexercise.com/, https://www.centerofrestorativeexercise.com/about, https://www.centerofrestorativeexercise.com/services
update public.organizations set description = $bio$C.O.R.E. (Center of Restorative Exercise) is an inclusive fitness facility in Northridge that "bridges the gap between rehabilitation & regular fitness." It works with people with disabling conditions, including spinal cord injury, and with able-bodied people.

- A two-hour initial evaluation and a custom program design
- One-on-one sessions with certified Restorative Exercise Specialists
- Programs that progress in phases, reassessed every few weeks
- Adapted, mostly wheelchair-accessible fitness equipment

[centerofrestorativeexercise.com](https://www.centerofrestorativeexercise.com/)$bio$ where short_code = 'CORE';

-- Central California Adaptive Sports Center: https://centralcaladaptive.org/, https://www.centralcaladaptive.org/aboutus, https://www.centralcaladaptive.org/summer
update public.organizations set description = $bio$The Central California Adaptive Sports Center is a nonprofit in the Central Sierra Nevada for people with cognitive and/or physical disabilities. Its mission is "to provide quality, year-round mountain adventures to persons with disabilities."

- **Winter, at China Peak:** sit-skiing, stand-up skiing, snowshoeing and cross-country skiing
- **Summer, at Shaver Lake:** mountain biking, paddleboarding, fishing, rock climbing and hiking
- Day programs and weekend campouts, with family welcome when space allows
- Free for people with spinal cord injuries and veterans with disabilities

[centralcaladaptive.org](https://www.centralcaladaptive.org/)$bio$ where short_code = 'CCAS';

-- Challenge Center: https://www.challengecenter.org/, https://www.challengecenter.org/about/, https://www.challengecenter.org/services-programs/
update public.organizations set description = $bio$Challenge Center is a San Diego nonprofit offering physical therapy, specialized fitness and wellness programs for seniors and people with severe physical disabilities. It serves people with neurological impairments and gives financial help to people with low income.

- One-on-one physical therapy without insurance session limits
- Assisted fitness with trainers, following a plan set by a physical therapist
- An accessible gym with FES bikes, standing frames and a Litegait system
- Caregiver training, wheelchair seating evaluations, and adaptive yoga and aquatics classes

[challengecenter.org](https://challengecenter.org/)$bio$ where short_code = 'CHC';

-- Challenged Sailors San Diego: https://www.challengedsailors.org/, https://www.challengedsailors.org/about, https://www.challengedsailors.org/faq
update public.organizations set description = $bio$Challenged Sailors San Diego is an all-volunteer nonprofit offering free adaptive sailing on San Diego Bay. It provides "therapeutic, recreational and competitive adaptive sailing opportunities for people with disabilities."

- Sailing every Friday and Saturday from Harbor Island, with no experience needed
- Ten Martin 16 sailboats made for adaptive sailing
- The adaptive sailor steers, with a volunteer companion sailor seated behind
- Open to sailors age 8 and up

[challengedsailors.org](https://www.challengedsailors.org/)$bio$ where short_code = 'CSSD';

-- Christopher & Dana Reeve Foundation: https://www.christopherreeve.org/, https://www.christopherreeve.org/community/about-us/, https://www.christopherreeve.org/todays-care/paralysis-help-overview/about-the-paralysis-resource-center/
update public.organizations set description = $bio$The Christopher & Dana Reeve Foundation is "dedicated to curing spinal cord injury by advancing innovative research and improving the quality of life" for people and families affected by paralysis.

- Funds spinal cord injury research and research partnerships
- **National Paralysis Resource Center:** free information for people with paralysis and caregivers
- Information Specialists answer questions by phone, in many languages
- Free peer mentoring, plus Quality of Life grants for nonprofits

Based in Short Hills, New Jersey.

[christopherreeve.org](https://www.christopherreeve.org/)$bio$ where short_code = 'CDRF';

-- Craig H. Neilsen Foundation: https://chnfoundation.org/, https://chnfoundation.org/programs/scholarship-program/, https://chnfoundation.org/programs/creating-opportunity-independence/
update public.organizations set description = $bio$The Craig H. Neilsen Foundation calls itself "the largest private funder of spinal cord injury research, rehabilitation, clinical training, and programmatic support in the U.S. and Canada." It funds both scientific research and community programs.

- Spinal cord injury research grants, including psychosocial research
- **Creating Opportunity & Independence:** grants to nonprofits serving people with SCI
- **Neilsen Scholarship Program:** for students with SCI, through partner colleges and universities
- Spinal cord injury medicine fellowships

Founded in 2002, based in Tarzana, California.

[chnfoundation.org](https://chnfoundation.org/)$bio$ where short_code = 'CHN';

-- Craig Hospital: https://www.linkedin.com/company/craig-hospital
update public.organizations set description = $bio$Craig Hospital is a private, not-for-profit rehabilitation hospital and research center. It specializes in care for people with spinal cord and/or brain injuries.

- Inpatient and outpatient medical care and rehabilitation
- Rehabilitative neurosurgery
- Long-term follow-up services after injury
- Spinal cord injury and brain injury research

Founded in 1907, based in Englewood, Colorado.

[craighospital.org](https://craighospital.org/)$bio$ where short_code = 'CH';

-- Diveheart: https://www.linkedin.com/company/diveheart, https://diveheart.org/adaptive-divers/, https://diveheart.org/diveheart-courses/
update public.organizations set description = $bio$Diveheart uses scuba diving and scuba therapy to "build confidence, independence and self-esteem in the lives of children, adults and veterans with disabilities." Most people with physical, cognitive or developmental disabilities can take part.

- Pool sessions with trained adaptive dive buddies, a first step for new divers
- Adaptive diver training, with a standard certification or a tailored Diveheart program
- Open-water dives supported by trained buddies and adaptive equipment
- Training for volunteers, from surface support to adaptive dive buddy

Founded in 2001, based in Downers Grove, Illinois.

[diveheart.org](https://www.diveheart.org/)$bio$ where short_code = 'DH';

-- DRIVEN Neuro: https://drivenneuro.org/, https://drivenneuro.org/about-us/
update public.organizations set description = $bio$DRIVEN Neuro, formerly Conquer Paralysis Now, "drives independence for individuals with paralysis and neurological conditions." It runs recovery centers in Las Vegas and Indianapolis and works toward a cure for paralysis.

- Activity-based training, adaptive fitness and peer connection at its recovery centers
- Aquatic rehabilitation and advanced clinical therapies in Indianapolis, run with NeuroHope
- Education and support for families
- Funds neurological research and advocates for a cure

Founded in 2000 as the Sam Schmidt Paralysis Foundation, based in Carmel, Indiana.

[drivenneuro.org](https://drivenneuro.org/)$bio$ where short_code = 'DN';

-- Environmental Traveling Companions: https://etctrips.org/, https://etctrips.org/about/, https://etctrips.org/adventures/sea-kayaking/
update public.organizations set description = $bio$Environmental Traveling Companions (ETC) "makes the joy and challenge of outdoor adventures accessible to people with disabilities." It also serves youth from under-resourced backgrounds.

- **Sea kayaking:** day and overnight trips on San Francisco Bay and Tomales Bay
- **Whitewater rafting:** South Fork American River trips; its river camp has wheelchair-accessible campsites
- **Shared Adventures:** trips open to all, with sliding-scale scholarships for people with disabilities
- **Youth LEAD:** leadership and environmental justice for young people

Founded in 1972, based at Fort Mason Center in San Francisco.

[etctrips.org](https://etctrips.org/)$bio$ where short_code = 'ETC';

-- Facing Disability: https://facingdisability.com/, https://facingdisability.com/about-us
update public.organizations set description = $bio$FacingDisability.com is "an informational and support website for families facing spinal cord injuries." It connects families dealing with paralysis with people who have lived through it, and is funded by the Hill Foundation, a Chicago nonprofit.

- Personal video interviews with people living with paralysis
- Medical interviews with spinal cord injury experts
- **Voices of Experience:** a video series
- **I Was a Wheelchair Kid:** a podcast

[facingdisability.com](https://facingdisability.com/)$bio$ where short_code = 'FD';

-- Falling Forward Foundation: https://fallingforward.org/, https://fallingforward.org/who-we-help/
update public.organizations set description = $bio$The Falling Forward Foundation pays for rehabilitation after insurance benefits run out, because "everyone deserves the opportunity to recover to their full potential."

- Grants for outpatient physical, occupational and speech therapy after insurance ends
- Helps people recovering from strokes, traumatic brain injuries and spinal cord injuries
- Works through partner rehab centers; a doctor or therapist makes the referral
- Advocates to eliminate insurance therapy caps

Founded in 2013, based in Lawrence, Kansas.

[fallingforward.org](https://fallingforward.org/)$bio$ where short_code = 'FFF';

-- Getting Back Up: https://www.gettingbackup.org/about/, https://www.gettingbackup.org/initiatives/, https://www.gettingbackup.org/contact/
update public.organizations set description = $bio$Getting Back Up helps people living with a spinal cord injury improve their quality of life now, with goods and services that meet their immediate situation. Scott Fedor founded it in 2011, after a diving accident.

- Pays for qualified people to join exercise-based recovery programs
- Helps buy adaptive products that make daily tasks easier
- **The Quad:** a proposed housing facility designed for people with spinal cord injuries

[gettingbackup.org](https://www.gettingbackup.org/)$bio$ where short_code = 'GBU';

-- Help Hope Live: https://helphopelive.org/, https://helphopelive.org/about/mission-values/, https://helphopelive.org/fundraising/how-it-works/
update public.organizations set description = $bio$Help Hope Live's mission is "to ease the financial burden for people facing serious medical challenges." It serves people with transplants, end-stage heart disease, catastrophic illness and catastrophic injuries such as spinal cord injury.

- Community-led medical fundraising campaigns, free for clients, with one-on-one help
- Pays providers directly or reimburses eligible costs such as equipment and home care
- Donations to campaigns are tax deductible
- Free virtual wheelchair fitness classes with W.O.W. Wonders on Wheels

Founded in 1983, based in Radnor, Pennsylvania.

[helphopelive.org](https://helphopelive.org/)$bio$ where short_code = 'HHL';

-- High Fives Foundation: https://highfivesfoundation.org/, https://highfivesfoundation.org/about/, https://highfivesfoundation.org/programs/
update public.organizations set description = $bio$High Fives Foundation "focuses on preventing life-changing injuries and provides resources and hope if they happen." It helps athletes with life-altering injuries get back to outdoor sports such as skiing, surfing and mountain biking.

- **Empowerment Fund:** helps athletes get adaptive sports equipment
- **CR Johnson Healing Center:** resources for athletes recovering from life-changing injuries
- **Military to the Mountains:** skiing and snowboarding for veterans and first responders
- **B.A.S.I.C.S.:** a snow safety awareness program

Founded in 2009, based in Truckee, California.

[highfivesfoundation.org](https://highfivesfoundation.org/)$bio$ where short_code = 'HF';

-- Ian Burkhart Foundation: https://ianburkhartfoundation.org/, https://ianburkhartfoundation.org/aboutus, https://ianburkhartfoundation.org/programs
update public.organizations set description = $bio$The Ian Burkhart Foundation is devoted to "restoring lives and providing hope to individuals with spinal cord injuries." It supports people with spinal cord injuries and their families, from the initial injury through the return home and daily life.

- **Financial grants:** for items insurance usually does not cover
- Helps people find widely accessible funding sources
- **Advocacy:** Ian Burkhart speaks publicly to raise awareness of spinal cord injuries
- **Research:** works with the North American Spinal Cord Injury Consortium so lived experience shapes research

[ianburkhartfoundation.org](https://ianburkhartfoundation.org/)$bio$ where short_code = 'IBF';

-- Kaiser Foundation Rehabilitation Center: https://healthy.kaiserpermanente.org/northern-california/facilities/kaiser-foundation-rehabilitation-center-kfrc-100298, https://lookinside.kaiserpermanente.org/vallejo-rehabilitation-center-tops-the-nation/
update public.organizations set description = $bio$The Kaiser Foundation Rehabilitation Center is Kaiser Permanente's inpatient rehabilitation center in Vallejo. It helps Kaiser Permanente members aged 14 and older from across Northern California recover from stroke, brain or spinal cord injury, and other conditions affecting movement, speech or thinking.

- Physical, occupational, speech and recreation therapies
- A team including rehabilitation nurses, neuropsychologists, dietitians and adaptive sports consultants
- Admission by referral from a member's hospital care team

[healthy.kaiserpermanente.org](https://healthy.kaiserpermanente.org/northern-california/facilities/kaiser-foundation-rehabilitation-center-kfrc-100298)$bio$ where short_code = 'KFRC';

-- Kelly Brush Foundation: https://kbf.org/, https://kbf.org/about-us/
update public.organizations set description = $bio$The Kelly Brush Foundation, based in Burlington, Vermont, works to inspire and empower people with spinal cord injuries to lead active and engaged lives. Kelly Brush and her family founded it after she was injured at an NCAA alpine ski race in 2006.

- **Active Fund:** grants for adaptive sports equipment that is otherwise hard to afford
- **Scholarships:** support for first-time sports experiences or trying new equipment
- **Ski Racing Safety:** education, advocacy and safety equipment grants for ski clubs
- Camps that build community and skills

[kbf.org](https://kbf.org/)$bio$ where short_code = 'KBF';

-- Lakeshore Foundation: https://lakeshore.org/, https://www.lakeshore.org/about/
update public.organizations set description = $bio$Lakeshore Foundation works "to provide opportunity for individuals with disability to live a healthy lifestyle through physical activity." It also does research, advocacy and health promotion.

- Aquatics, fitness, athletics and recreation programs
- A U.S. Olympic and Paralympic Training Site
- Research studies people can join, and disability advocacy
- Free membership for Alabama veterans and their families

Founded in 1984, based in Birmingham, Alabama.

[lakeshore.org](https://www.lakeshore.org/)$bio$ where short_code = 'LKS';

-- Life Rolls On: https://liferollson.org/, https://liferollson.org/mission, https://liferollson.org/info
update public.organizations set description = $bio$Life Rolls On is "dedicated to improving the quality of life for people living with various disabilities." It runs adaptive surf, skate and fishing events for people with physical disabilities and paralysis, and was founded by Jesse Billauer, a world champion quadriplegic surfer.

- **They Will Surf Again:** surfing with trained volunteers helping with transfers and in-water support
- **They Will Skate Again:** a day of skating, with volunteers and protective gear provided
- **They Will Fish Again:** adaptive fishing events

[liferollson.org](https://liferollson.org/)$bio$ where short_code = 'LRO';

-- More Than Walking: https://www.morethanwalking.com/, https://www.morethanwalking.com/mission--vision.html, https://www.morethanwalking.com/story.html
update public.organizations set description = $bio$More Than Walking works to "promote independent living after spinal cord injury worldwide" by sharing the experiences of peer mentors and rehabilitation professionals. Jonathan Sigworth and Jessica Bello Capote founded it in 2017.

- **Peer mentor interviews:** filmed stories of spinal cord injury survivors, published online
- **Independence skill demonstrations:** videos showing how volunteers adapted to live independently
- **Mentor and resource matching:** connects people with local support, with SPINALpedia
- A monthly podcast with community members with and without disabilities

[morethanwalking.com](https://www.morethanwalking.com/)$bio$ where short_code = 'MTW';

-- Move United: https://moveunitedsport.org/, https://moveunitedsport.org/about-us/our-mission-impact/
update public.organizations set description = $bio$Move United uses "the power of sport to push what's possible for people with disabilities." It provides national leadership and opportunities for people with disabilities to build independence, confidence and fitness through community sports.

- A national network of member organizations offering adaptive sports year-round
- An official Affiliate of the U.S. Olympic & Paralympic Committee
- Competitions including The Hartford Nationals and The Hartford Ski Spectacular
- Grants, insurance and education resources for member organizations

Founded in 1956, based in Rockville, Maryland.

[moveunitedsport.org](https://moveunitedsport.org/)$bio$ where short_code = 'MU';

-- National Center for Equine Facilitated Therapy: https://nceft.org/, https://nceft.org/about/, https://nceft.org/services/
update public.organizations set description = $bio$The National Center for Equine Facilitated Therapy (NCEFT) is "dedicated to helping children, adults, and military Veterans with special needs reach beyond their boundaries" through equine-assisted therapies. Spinal cord injury and paralysis are among the conditions it serves.

- Physical and occupational therapy, which may use horse movement
- Adaptive riding and horsemanship lessons
- Mental health and resilience programs
- Services free of charge for U.S. military veterans and first responders

Founded in 1971, based in Woodside, California.

[nceft.org](https://nceft.org/)$bio$ where short_code = 'NCEF';

-- National Wheelchair Basketball Association: https://www.nwba.org/about, https://www.nwba.org/
update public.organizations set description = $bio$The National Wheelchair Basketball Association governs wheelchair basketball in the United States. It aims to grow the sport "through increased participation and representation" and to build a lifelong community for members and their families.

- Adult, women's, collegiate, junior and prep divisions
- Sanctions competitions each season, ending in a National Tournament
- Selects and trains the U.S. Paralympic and Parapan Am teams
- Helps players find a team and become members

Founded in 1949, based in Colorado Springs.

[nwba.org](https://www.nwba.org/)$bio$ where short_code = 'NWBA';

-- National Wheelchair Softball Association: https://www.wheelchairsoftball.org/
update public.organizations set description = $bio$USA Wheelchair Softball, also known as the National Wheelchair Softball Association, is the "official governing body for competitive wheelchair softball in the United States and worldwide."

- More than 40 adult and junior teams for men, women, boys and girls
- Holds the NWSA World Series tournament, with all-tournament teams and awards
- Helps develop new teams, athletes and competitions
- Assists teams in other countries, including Japan, Ghana and Korea

[wheelchairsoftball.org](https://www.wheelchairsoftball.org/)$bio$ where short_code = 'NWSA';

-- NatureTrack: https://naturetrack.org/, https://naturetrack.org/naturetrack-freedom-trax/, https://naturetrack.org/our-story/
update public.organizations set description = $bio$NatureTrack, based in Los Olivos, California, takes K-12 students outdoors and opens beaches and trails to wheelchair users. Its tagline is "Fostering a lifelong fascination with nature."

- **Freedom Trax:** an all-terrain mobility device for sand, hiking trails and snow, free to use
- [Borrow a Freedom Trax](https://naturetrack.org/borrow-a-freedom-trax/) for up to three weeks, with a manual wheelchair if needed
- Guided beach outings and day hikes from San Luis Obispo to Ventura
- **Seniors' Trax:** no-cost guided outdoor outings for older adults

[naturetrack.org](https://naturetrack.org/)$bio$ where short_code = 'NT';

-- NextStep: https://www.nextstepfitness.org/, https://www.nextstepfitness.org/laabout
update public.organizations set description = $bio$NextStep is a nonprofit network of paralysis recovery and fitness centers that makes "life-changing rehab accessible and affordable" for people with spinal cord injury, stroke, brain injury, MS and other neurological conditions.

- Activity-based therapy with NeuroRecovery Network Certified Trainers
- Locomotor training, plus neuromuscular and functional electrical stimulation
- Strength, cardio and vibration training on accessible equipment
- Free peer support groups and educational classes at its Los Angeles center

Centers in Los Angeles, Atlanta, Orlando, Kansas City, Raleigh, Las Vegas, Ukraine and New Zealand.

[nextstepfitness.org](https://www.nextstepfitness.org/)$bio$ where short_code = 'NXS';

-- NorCal SCI: https://www.norcalsci.org/, https://norcalsci.org/programs-main, https://norcalsci.org/peer-mentors
update public.organizations set description = $bio$NorCal SCI (NorCal Spinal Cord Injury Foundation) is a nonprofit in Concord that provides information, resources and programs for people affected by spinal cord injury in Northern California.

- **Peer Mentor Program:** trained mentors, matched by injury level, age, interests and family life
- In-person and virtual support groups, including for women, caregivers and Spanish speakers
- **Newly Injured Grant:** paid exercise therapy at an accessible gym, with a peer mentor
- Virtual fitness classes, donated medical equipment, webinars and a newly injured resource kit

[norcalsci.org](https://norcalsci.org/)$bio$ where short_code = 'NCS';

-- North American Spinal Cord Injury Consortium: https://nascic.org/, https://nascic.org/history/
update public.organizations set description = $bio$The North American Spinal Cord Injury Consortium brings together people, nonprofits and companies that serve the spinal cord injury community. Its mission is "to bring about unified achievements in research, care, cure, and policy."

- **SCI Research Advocacy Course:** a free 12-module course
- **SCI Trials:** a searchable listing of current and past SCI clinical trials
- **Project Engagement Database:** lets people with SCI and caregivers join SCI projects
- Webinars, events and recruitment support for SCI researchers

Launched in 2017, with a mailing address in Columbus, Ohio.

[nascic.org](https://nascic.org/)$bio$ where short_code = 'NASC';

-- Operation Surf: https://operationsurf.org/, https://operationsurf.org/programs/week-long/
update public.organizations set description = $bio$Operation Surf runs adaptive surf programs that "inspire injured military and veterans to seek wellness." Its mission is "to channel the healing powers of the ocean to restore hope, renew purpose, and revitalize community."

- **Week-long program:** free, all-inclusive adaptive surfing for eligible post-9/11 veterans
- Week-long sessions in Santa Cruz and on the Central Coast
- Beach wheelchairs available; ADA rooms and shower benches on request
- **OS3:** a three-month program, plus alumni events and a monthly surf day

Based in Avila Beach, California.

[operationsurf.org](https://operationsurf.org/)$bio$ where short_code = 'OPS';

-- ParaCliffHangers: https://paracliffhangers.org/, https://paracliffhangers.org/indoor
update public.organizations set description = $bio$ParaCliffHangers is a nonprofit, led by paraclimbers, that "expands the rock climbing community to include people with disabilities." Two paraclimbers started it in 2019.

- Indoor climbing meetups in Berkeley, Concord, Oakland, San Francisco and Sunnyvale
- Chapters in Southern California, New York, New Jersey, Florida and other states
- Outdoor climbing trips
- Competitive climbing for paraclimbers

[paracliffhangers.org](https://paracliffhangers.org/)$bio$ where short_code = 'PCH';

-- Paralyzed Veterans of America: https://pva.org/about-us/
update public.organizations set description = $bio$Paralyzed Veterans of America is a veterans service organization for veterans with spinal cord injuries and disorders, and conditions such as MS and ALS. Its mission is to help every veteran regain "their freedom and independence."

- Help with veterans benefits through national service officers
- Healthcare resources, caregiver support and accessible home design
- Sports and recreation programs
- Career program, advocacy, research and scholarships

Founded in 1946, based in Washington, D.C.

[pva.org](https://pva.org/)$bio$ where short_code = 'PVA';

-- PossAbilities: https://teampossabilities.org/about-us/
update public.organizations set description = $bio$PossAbilities is a free community outreach program of Loma Linda University Health for people with permanent physical or intellectual disabilities, and veterans. Its mission is "To further the healing ministry of Jesus Christ by helping the disabled community be fully integrated into society."

- Peer mentoring
- Support groups, including the Head Injury & Trauma Spinal Support Group
- Exercise classes, such as Stretching and Exercise
- Adaptive sports and social events, such as a monthly mixer

Founded in 2000, based in Loma Linda.

[teampossabilities.org](https://teampossabilities.org/)$bio$ where short_code = 'POSS';

-- Precision Rehabilitation: https://www.precisionrehabilitation.com/, https://www.precisionrehabilitation.com/wheelchair-clinic, https://www.precisionrehabilitation.com/services/wellness-classes
update public.organizations set description = $bio$Precision Rehabilitation is an outpatient physical, occupational and speech therapy clinic in Long Beach, specializing in neurological and orthopedic rehabilitation.

- Treats spinal cord injury, stroke, MS, ALS, brain injury and other conditions
- **Wheelchair Clinic:** seating evaluations, custom cushions and backrests, power assist demos
- Wellness classes, including an Adaptive Gym resistance training class
- Balance and stretch classes, a gym pass and massages

[precisionrehabilitation.com](https://www.precisionrehabilitation.com/)$bio$ where short_code = 'PRC';

-- Project 34: https://www.projectthirtyfour.com/, https://projectthirtyfour.com/about/
update public.organizations set description = $bio$Project 34 funds medical equipment, adaptive devices and therapy for people living with spinal cord injuries, "so they and their families can focus on recovery." It was founded by former ASU baseball teammates Cory Hahn and Trevor Williams after Cory's C-5 injury during a game.

- Grants for medical equipment, supplies and adaptive devices
- Help paying for ongoing therapy and rehabilitation
- Support for home modifications

[projectthirtyfour.com](https://projectthirtyfour.com/)$bio$ where short_code = 'PRJ';

-- PVA California Chapter: https://pvacc.org/
update public.organizations set description = $bio$The California Chapter of Paralyzed Veterans of America (PVACC) serves veterans with spinal cord injury or dysfunction, and their families. Based in Long Beach, it offers all of its services free of charge.

- Help understanding and securing veterans benefits
- Legal help with benefits claims and civil rights
- Job training, placement and ongoing support
- Adaptive sports, recreation and community events

[pvacc.org](https://pvacc.org/)$bio$ where short_code = 'PVAC';

-- Rancho Los Amigos Wheelchair Sports: https://dhs.lacounty.gov/rancho/patient-programs-and-services/wheelchair-sports-program/, https://dhs.lacounty.gov/rancho/wheelchair-sports/, https://dhs.lacounty.gov/rancho/rancho-los-amigos-learn-more/
update public.organizations set description = $bio$Rancho Los Amigos Wheelchair Sports is the wheelchair sports program of Rancho Los Amigos National Rehabilitation Center. It gives Rancho patients "success-oriented, competitive wheelchair sports activities" and helps build lifelong fitness habits.

- **Youth Sport and Fun Section:** basic skills and fun for young children
- **Juniors:** a competitive wheelchair basketball team for teens
- Two adult teams, in NWBA Division I and Division III
- Weekly practices throughout the year

Developed in 1987, based in Downey.

[dhs.lacounty.gov/rancho](https://dhs.lacounty.gov/rancho/patient-programs-and-services/wheelchair-sports-program/)$bio$ where short_code = 'RLA';

-- ReCARES: https://www.recares.org/, https://www.recares.org/about
update public.organizations set description = $bio$Since 1996, ReCARES has collected used durable medical equipment and home health care supplies and given them away free to Bay Area residents. It aims "to decrease environmental waste and increase access to medical equipment and supplies in the community."

- Free items from wheelchairs to incontinence and personal care supplies
- Accepts donated equipment, assistive devices and surplus home care supplies
- Distribution sites in Oakland, San Francisco and Marin County
- Keeps reusable medical items out of landfills

[recares.org](https://www.recares.org/)$bio$ where short_code = 'RC';

-- Shared Adventures: https://www.sharedadventures.org/, https://www.sharedadventures.org/about, https://www.sharedadventures.org/day-on-the-beach
update public.organizations set description = $bio$Shared Adventures is a Santa Cruz nonprofit that gets people with disabilities "outdoors and moving beyond limitation." It runs a year-round, fully inclusive recreation calendar open to people of all ages and disabilities, and to veterans.

- **Day on the Beach:** free annual kayaking, outrigger canoeing, SCUBA and beach wheelchair rides
- Activities such as water sports, arts, sailing, rock climbing, horseback riding and archery
- **Camp Adventures:** camp-based recreation outings
- Beach wheelchairs to reserve and a Santa Cruz County Access Guide

Founded in 1994 by Foster Andersen, based in Santa Cruz.

[sharedadventures.org](https://www.sharedadventures.org/)$bio$ where short_code = 'SA';

-- Shepherd Center: https://www.shepherd.org/about, https://www.shepherd.org/, https://shepherd.org/patient-programs/
update public.organizations set description = $bio$Shepherd Center is a rehabilitation hospital in Atlanta for people with spinal cord injury, brain injury, stroke, multiple sclerosis and other complex neurological conditions. Its mission is "to rebuild lives with hope and dignity."

- Inpatient rehabilitation, day programs and outpatient services
- **Adaptive Wellness & Sports:** programs that keep people active and connected
- **Center for Assistive Technologies:** a driving program and a seating and mobility clinic
- Research in spinal cord injury, brain injury, multiple sclerosis and assistive technology

[shepherd.org](https://www.shepherd.org/)$bio$ where short_code = 'SHC';

-- Shirley Ryan AbilityLab: https://www.sralab.org/, https://www.sralab.org/research, https://www.sralab.org/services/adaptive-sports-fitness-program
update public.organizations set description = $bio$Shirley Ryan AbilityLab is a rehabilitation hospital and research center in Chicago that cares for people with stroke, spinal cord injury, brain injury and many other conditions. Its clinicians, scientists, technologists and patients work side by side in translational research labs.

- Inpatient care, DayRehab and outpatient care
- **Adaptive Sports & Fitness:** sports for athletes of all levels, from beginners to elite
- Teams including Blackhawks sled hockey, Chicago Bears wheelchair rugby and youth wheelchair basketball
- Physical, occupational and speech therapy, plus prosthetics and orthotics

[sralab.org](https://www.sralab.org/)$bio$ where short_code = 'SRA';

-- Silicon Valley Independent Living Center: https://www.svilc.org/, https://svilc.org/our-mission/, https://svilc.org/programs/
update public.organizations set description = $bio$Silicon Valley Independent Living Center is a "cross-disability, intergenerational, multicultural disability justice organization" in Santa Clara County. It offers free services to people with disabilities of all ages who want to live more independently.

- Housing services, with weekly workshops and one-on-one appointments
- A weekly peer support group
- Independent living skills, benefits help and self-advocacy support
- A free assistive technology lending library

Offices in San Jose and Gilroy.

[svilc.org](https://svilc.org/)$bio$ where short_code = 'SVIL';

-- SoCal Adaptive Sports: https://www.socaladaptivesports.org/, https://www.socaladaptivesports.org/our-vision, https://www.socaladaptivesports.org/contact-us
update public.organizations set description = $bio$SoCal Adaptive Sports is a regional organization for people with physical disabilities in Riverside County and other Southern California communities. It "empowers athletes with disabilities by breaking down barriers, building inclusive programs."

- Sports including boccia, handcycling, archery, basketball, pickleball, sailing, golf and hockey
- Wheelchair softball, wheelchair football and bowling events
- **Sports for EveryBODY:** a school-based educational and hands-on program
- Meets athletes on the playing field, in rehab facilities, hospitals and homes

[socaladaptivesports.org](https://www.socaladaptivesports.org/)$bio$ where short_code = 'SCAS';

-- SPINALpedia: https://www.spinalpedia.com/, https://spinalpedia.com/about-us/
update public.organizations set description = $bio$SPINALpedia is a social mentoring network and video archive for the spinal cord injury community, sharing information made "by the paralysis community for the paralysis community." It is run by the Determined2Heal Foundation.

- A searchable library of videos and images shared by members
- **Peer Mentoring:** matches mentees with mentors, with a coordinator for the newly injured
- Learning portals for newly injured people on topics such as sexual health and driving
- Legal support, employment resources and benefits counseling referrals

Serving the paralysis community since 2007, based in Bethesda, Maryland.

[spinalpedia.com](https://spinalpedia.com/)$bio$ where short_code = 'SPP';

-- Team River Runner Palo Alto: https://teamriverrunner.org/, https://www.teamriverrunner.org/get-involved/chapters/, http://www.teamriverrunner.org/get-involved/chapters/california-palo-alto/
update public.organizations set description = $bio$Team River Runner Palo Alto is a local chapter of Team River Runner, a national adaptive and veteran paddling nonprofit based in Rockville, Maryland. Its mission is to give "all veterans and their families an opportunity to find health, healing, community purpose, and new challenges."

- A weekly, year-round, pool-based kayak instruction program
- Outings and activities "from the sea to the Sierras"
- Part of a national network of chapters across the United States

[teamriverrunner.org](https://www.teamriverrunner.org/get-involved/chapters/california-palo-alto/)$bio$ where short_code = 'TRR';

-- The Lionheart Community: https://thelionheart.community/, https://thelionheart.community/about/
update public.organizations set description = $bio$The Lionheart Community is a nonprofit of adults living with paralysis, from high quad to low para, wheelchair users to people who walk. It offers peer connection, recreation, recovery help and resources.

- **TLC Weekly Wednesdays:** an online meetup on Zoom, open to people across the U.S.
- Monthly in-person meetups, including a women's meetup and a UC Davis SCI meetup
- In-patient hospital visits and one-on-one peer mentors
- Friday nights out, bowling, hiking and recreational equipment rentals

Started in 2020, based in the Greater Sacramento Area.

[thelionheart.community](https://www.thelionheart.community/)$bio$ where short_code = 'LHC';

-- The Perfect Step: https://www.theperfectstep.com/, https://www.theperfectstep.com/history
update public.organizations set description = $bio$The Perfect Step is an exercise-based therapy center that helps "people with paralysis and neurological conditions push beyond the status quo." Its headquarters and flagship facility are in Pomona, California.

- One-on-one training with certified specialists
- **Hybrid program:** one to eight weeks in person, followed by remote support
- Open gym membership, group classes and an RTI bike program
- A workout app with videos and community chat, plus a podcast

[theperfectstep.com](https://www.theperfectstep.com/)$bio$ where short_code = 'TPS';

-- The Unrecables: https://www.unrecables.org/, https://www.unrecables.org/mission-and-vision, https://www.unrecables.org/trips
update public.organizations set description = $bio$The Unrecables is an adaptive snowsports club that helps people with disabilities "participate in snowsports, enjoy outdoor activities, and be more physically and socially active." It serves athletes with physical, intellectual, hearing and visual disabilities.

- Free monthly weekend ski and snowboard trips to Mammoth Mountain
- Each athlete is paired with an adaptive instructor and assistants as needed
- No cost to members for instruction, equipment rentals or lift tickets
- Bi-skis, mono-skis and outriggers, plus scholarships for members in need

[unrecables.org](https://www.unrecables.org/)$bio$ where short_code = 'UNR';

-- Thomas E. Smith Foundation: https://www.thomasesmithfoundation.org/, https://www.thomasesmithfoundation.org/apply-for-a-grant, https://www.thomasesmithfoundation.org/grant-recipients
update public.organizations set description = $bio$The Thomas E. Smith Foundation is a nonprofit whose mission is "to better the lives of those affected by and living with spinal cord injury (SCI) and paralysis." It gives financial and emotional support and backs innovations that lower the risk of spinal cord injury.

- Grants for people with paralysis, for therapy, equipment, mobility and home modifications
- **Stronger Together Grant Program:** funds rehab and equipment for individual recipients
- **Look-Up Line:** an ice hockey warning track to reduce injuries along the boards
- Support for research and new approaches to care

Based in Marblehead, Massachusetts.

[thomasesmithfoundation.org](https://www.thomasesmithfoundation.org/)$bio$ where short_code = 'TESF';

-- Triumph Foundation: https://triumph-foundation.org/, https://triumph-foundation.org/about-us/
update public.organizations set description = $bio$Triumph Foundation helps "children, adults, and Veterans with Spinal Cord Injury/Disorder (SCI) to triumph over obstacles they face." Most of its outreach is in Southern California, and it also serves people across the United States.

- Care Packs for newly injured people, through Ambassadors at partner hospitals
- Grants for equipment and accessible home modifications
- Adaptive recreation events, held more than 20 times a year
- Support groups and employment assistance

Founded in 2008 by Andrew and Kirsten Skinner, based in Santa Clarita.

[triumph-foundation.org](https://triumph-foundation.org/)$bio$ where short_code = 'TF';

-- United Spinal Association: https://unitedspinal.org/, https://unitedspinal.org/about-us/
update public.organizations set description = $bio$United Spinal Association is a national membership organization for wheelchair users and people with spinal cord injuries and disorders. Membership is free for members and their families.

- One-on-one peer mentoring, in person or virtual
- Local chapters with support, community events and adaptive sports
- Social hours, including one for partners and spouses
- A Resource Center for healthcare, benefits, equipment and accessibility questions

Serving the wheelchair community since 1946, based in Fort Totten, New York.

[unitedspinal.org](https://unitedspinal.org/)$bio$ where short_code = 'UNSP';

-- United States Adaptive Recreation Center: https://www.usarc.org/, https://www.usarc.org/winter/, https://www.usarc.org/summer/
update public.organizations set description = $bio$The United States Adaptive Recreation Center is "committed to guiding people with disabilities toward the creation and affirmation of rewarding lifestyles." It teaches winter and summer outdoor sports to people with physical and cognitive limitations.

- Winter ski and snowboard lessons, including sit-skiing on bi-skis and mono-skis
- Summer water-skiing, paddle sports, fishing and sailing on Big Bear Lake
- Two-day overnight sessions with accessible camping
- Winter lessons are booked by phone only

Based in Big Bear Lake, California.

[usarc.org](https://www.usarc.org/)$bio$ where short_code = 'USRC';

-- United States Power Soccer Association: https://www.powersoccerusa.org/, https://www.powersoccerusa.org/veterans-program, https://www.powersoccerusa.org/contact
update public.organizations set description = $bio$The United States Power Soccer Association (USPSA) is "the governing body for power soccer, the first competitive team sport for power wheelchair users." Power soccer lets athletes with diverse disabilities compete independently at all skill levels.

- Helps players find a team and register, from recreational to conference level
- Tournaments in several states and a US National Team
- **Veterans Program:** connects veterans to local teams, equipment and funding information
- Power Soccer Camp, referee certification, and scholarships and awards

Founded in 2006, with a mailing address in Indianapolis.

[powersoccerusa.org](https://www.powersoccerusa.org/)$bio$ where short_code = 'PSOC';

-- United States Wheelchair Rugby Association: https://www.uswra.org/, https://www.uswra.org/role-of-uswra
update public.organizations set description = $bio$The United States Wheelchair Rugby Association (USWRA) is a nonprofit that oversees, develops and runs the sport of wheelchair rugby across the United States. Since 1988 it has worked "to provide competitive athletic opportunities to eligible people with disabilities."

- Over 40 teams with more than 500 athletes across the country
- Helps players join a team or start a new one
- Holds the USWRA National Championship
- Registers athletes, referees, team staff and classifiers

[uswra.org](https://www.uswra.org/)$bio$ where short_code = 'WRA';

-- USA Boccia: https://usaboccia.org/, https://usaboccia.org/usa-boccia/
update public.organizations set description = $bio$USA Boccia is the nonprofit national organization for boccia in the US. It "provides athletes with physical disabilities the opportunity to participate and compete in the sport of Boccia" at the local, regional, national and international level.

- Athlete memberships with access to programs and benefits
- Classification into sport divisions BC1 to BC6
- Domestic tournaments, national rankings and a yearly national championship
- **Equipment Loan Bank:** balls, ramps and pointers, first priority for SCI and veteran athletes

[usaboccia.org](https://usaboccia.org/)$bio$ where short_code = 'BOC';

-- USA Hockey Sled Hockey: https://www.usahockey.com/sledhockey, https://www.usahockey.com/disabledhockey
update public.organizations set description = $bio$USA Hockey runs sled hockey as one of the six disciplines of its disabled hockey program. Players sit in sleds on two skate blades and push with two sticks, and the sport offers "opportunities for many types of disabilities" from local play to the national team.

- **USA Hockey Sled Classic:** a fall tournament between NHL-affiliated sled teams
- Sled National Championships each spring, including youth levels
- National and regional Player Development Camps each year
- The National Sled Team plays in World Championships and the Paralympics

[usahockey.com](https://www.usahockey.com/sledhockey)$bio$ where short_code = 'USH';

-- USA Wheelchair Rugby: https://usawr.org/, https://usawr.org/about/
update public.organizations set description = $bio$USA Wheelchair Rugby develops the athletes, staff and teams who represent the United States in wheelchair rugby. It operates with the Lakeshore National Adapted Sports Organization (LNASO) as its national governing body and is overseen by the U.S. Olympic and Paralympic Committee.

- Training camps, selection camps and training squads for the national team
- Competes internationally, including the Paralympics and world championships
- Publishes selection procedures, a code of conduct and safeguarding policies

[usawr.org](https://usawr.org/)$bio$ where short_code = 'AWR';

-- USTA Wheelchair Tennis: https://www.usta.com/en/home/play/programs-for-everyone/national/about-wheelchair-tennis.html
update public.organizations set description = $bio$The United States Tennis Association (USTA) runs a wheelchair tennis program that aims to give "top-flight programming and developmental opportunities to wheelchair athletes of all ages and backgrounds." Its main goal is for athletes to learn tennis and have fun.

- Sanctions wheelchair tennis tournaments across the country for all skill levels
- National rankings that match players of similar skill
- Grants to organizations that grow wheelchair tennis
- Chances to represent the US at the Paralympics and Parapan Am Games

[usta.com](https://www.usta.com/en/home/play/programs-for-everyone/national/about-wheelchair-tennis.html)$bio$ where short_code = 'USTA';

-- VA Palo Alto Spinal Cord Injury Center: https://www.sci.va.gov/SCICenters/Palo_alto.asp
update public.organizations set description = $bio$The VA Palo Alto Spinal Cord Injuries and Disorders (SCI/D) Center serves eligible Active-Duty Members and Veterans with traumatic and non-traumatic spinal cord injuries and disorders, including multiple sclerosis. Its mission is "to enhance the quality of life of persons with SCI/D."

- Lifelong care, from acute injury and rehabilitation to primary care
- Ventilator management, wound care, respite and peer mentoring
- Assistive technology lab, driving simulator, wellness center and aquatic therapy
- Hub for spoke sites in Fresno, Honolulu, Sacramento, San Francisco and Reno

Opened in 1974 at the Palo Alto VA Medical Center, 3801 Miranda Ave.

[sci.va.gov](https://www.sci.va.gov/SCICenters/Palo_alto.asp)$bio$ where short_code = 'VAPA';

-- Walking With Anthony: https://walkingwithanthony.org/, https://walkingwithanthony.org/about/
update public.organizations set description = $bio$Walking With Anthony is a Los Angeles nonprofit focused on recovery through spinal cord injury rehab. Its mission is "to redefine recovery from spinal cord injury: every day a farther reach, a stronger push, a higher stand."

- **Grants:** rehab, caregiving, special equipment and emergency funds
- Helps bridge the gap between what insurance covers and what recovery requires
- Works to expand SCI rehab centers and raise awareness of SCI
- Events such as Stand Up For a Cause

[walkingwithanthony.org](https://walkingwithanthony.org/)$bio$ where short_code = 'WWA';

-- Wheel with Me Foundation: https://wheelwithmefoundation.org/, https://wheelwithmefoundation.org/about, https://wheelwithmefoundation.org/sci/grants
update public.organizations set description = $bio$Wheel With Me Foundation is a nonprofit that "offers connection and support both locally and online" for wheelchair users, with a focus on people affected by spinal cord injury. Its mission is "to support and grow the independence of wheelchair users."

- Peer education, community meet-ups and online empowerment events
- Help requests through its grants form, drawing on sponsors and community resources
- **Wheel Together Retreat:** a yearly retreat for adults in Carrabassett Valley, Maine
- Long-term goal: a transitional home between inpatient rehab and independent living

[wheelwithmefoundation.org](https://wheelwithmefoundation.org/)$bio$ where short_code = 'WWM';

-- Wheelchair Lacrosse USA: https://www.wheelchairlacrosse.com/, https://www.wheelchairlacrosse.com/about/mission/72477, https://www.wheelchairlacrosse.com/about/history/72817
update public.organizations set description = $bio$Wheelchair Lacrosse USA (WLUSA) "organizes, develops, and promotes the sport of wheelchair lacrosse and provides opportunities for people with disabilities to live active lifestyles." It calls itself the world's first wheelchair lacrosse league.

- Over a dozen teams, growing the sport at the grassroots level
- Guidance and referrals for anyone starting a new team
- Hosts the Wheelchair Lacrosse Nationals each August
- Registration for players, coaches and staff

Founded in 2010, based in San Diego.

[wheelchairlacrosse.com](https://www.wheelchairlacrosse.com/)$bio$ where short_code = 'WLAX';


update public.organizations set city = 'Fresno' where short_code = 'BTB';
update public.organizations set city = 'Carmel' where short_code = 'DN';
update public.organizations set city = 'Concord' where short_code = 'NCS';
