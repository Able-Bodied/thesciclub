-- ============================================================================
-- Descriptions and card lines for the organizations from Adaptive Rec Hub
-- ============================================================================
-- The owner, 2026-11-03: in the style of the others, from each organization's
-- own site only, summarized and never added to. Read 2026-11-03 (its home page
-- and up to two of its About or Programs pages); every quote and number was
-- checked against that text. Twelve whose sites would not open here were read
-- in the owner's browser, one of them (Connecticut Spokebenders) from its own
-- Facebook and Instagram. 202 of the 203: UCO Center of Adaptive Sports has
-- no page of its own and keeps its link. Only where the description is still
-- the import's link and there is no card line, so an org admin's own words
-- are never replaced.
-- ============================================================================

update public.organizations o
   set description = v.description,
       summary = v.summary
  from (values
  ('Paradragon USA',
   '[paradragonsusa.org](https://www.paradragonsusa.org/)',
   'Inclusive dragon boat racing for para-athletes across the country',
   'Paradragons USA (PDUSA) is a nonprofit grassroots organization growing inclusive dragon boat racing across the country. It welcomes para-athletes of every skill level, from complete beginners to experienced paddlers competing internationally, along with support paddlers, drummers, steerspersons, coaches and volunteers.

- Outreach, education and practical resources for paddlers and teams
- Training camps, including camps held before events
- Coaching clinics led around the country
- **GRIT Paradragons Racing Team:** a racing team open to any para and support paddlers, racing throughout the US and Puerto Rico

[pdusa.org](https://www.pdusa.org/)'),
  ('Able Bodied Inc.',
   '[ablebodied.org](https://ablebodied.org)',
   'Electric assist handcycling, with free one-on-one lessons',
   'Able Bodied Inc. is a California nonprofit helping people with disabilities get into electric assist handcycling. Its mission is to help people with disabilities around the world connect and experience able bodied adventures.

- Free one-on-one electric assist handcycling lessons in San Jose and Sebastopol, CA, plus online consultations
- A wheelchair attachable handcycle in San Jose that is optimized for quadriplegics
- **Get 1 Help 2:** mentorship and help applying for grants and fundraisers to buy your own handcycle
- An open source wiki, map and travel guides for finding places to handcycle around the world
- Advanced long-distance electric assist group rides with BORP in San Jose

Founded in May 2024 as a California nonprofit.

[ablebodied.org](https://ablebodied.org)'),
  ('Bay Area Wheelchair Tennis',
   '[bayareawheelchairtennis.wordpress.com](https://bayareawheelchairtennis.wordpress.com/)',
   'Wheelchair tennis practice on Saturday mornings in San Jose',
   'Bay Area Wheelchair Tennis''s mission "is to promote wheelchair tennis by providing integrated play opportunities, increasing public awareness, and supporting wheelchair athletes and the community."

- Practice on Saturdays from 10AM to 12 Noon at the Independence High School tennis courts in San Jose

[bayareawheelchairtennis.wordpress.com](https://bayareawheelchairtennis.wordpress.com/)'),
  ('United States Driving for the Disabled',
   '[usdfd.org](https://usdfd.org/)',
   'Therapeutic carriage driving and support for para-equestrian drivers',
   'United States Driving for the Disabled (USDFD) is a 501(c)(3) nonprofit that "seeks to improve the lives of physically challenged individuals throughout the United States and Canada by providing the experience of driving horses in a safe and challenging environment."

- Clinics for para-equestrian drivers, such as those held at Sargent Equestrian Center in Lodi, CA
- Guides to adaptive driving equipment like five point harnesses, loop reins and whip holders
- **Sybil Dukehart Endowment Fund:** scholarships to equip and train drivers with disabilities
- Training and financial support for Team USA para drivers at international competitions
- Listings of active therapeutic driving programs

[usdfd.org](https://usdfd.org/)'),
  ('Valley Children’s Adaptive Sports Program',
   '[valleychildrens.org](https://www.valleychildrens.org/adaptive-sports/adaptive-sports-home/)',
   'Free adaptive sports and recreation for youth up to 21 in Central California',
   'Valley Children''s Healthcare runs the Adaptive Sports Program, which provides free recreational and athletic experiences for children and young adults up to age 21 with physical disabilities or mobility impairments, including spinal cord injuries. It is "The only program of its kind in Central California," with activities such as water skiing and rock climbing.

[valleychildrens.org](https://www.valleychildrens.org/adaptive-sports/adaptive-sports-home/)'),
  ('No Limits',
   '[nolimitstahoe.com](https://www.nolimitstahoe.com/index.htm)',
   'Mark Wellman''s motivational speaking, videos and adaptive climbing equipment',
   'No Limits is the business of Mark Wellman, a two-time Paralympian, author, filmmaker and motivational speaker who was paralyzed in a mountain climbing accident. He made the first paraplegic ascents of El Capitan and Half Dome in Yosemite.

- Motivational speaking presentations and seminars
- Adaptive rock climbing equipment designed by Mark
- Outdoor adventure videos, including No Barriers, Beyond the Barriers and Wheels of Fire, featuring people with physical disabilities climbing, skiing, kayaking and more
- His autobiography, Climbing Back

Based in Northern California.

[nolimitstahoe.com](https://www.nolimitstahoe.com/index.htm)'),
  ('Rollettes Foundation',
   '[rollettesexperience.com](https://www.rollettesexperience.com)',
   'Community, dance and wellness events for women and girls with disabilities',
   'The Rollettes Foundation supports "the mental, physical and emotional wellness of women and girls with disabilities through community events, education and support programs." It serves women, girls and non-binary people with disabilities.

- **Rollettes Experience:** an annual event with educational workshops, independence tools, dance classes and community building
- Be Boundless Seminars on working out, stretching and dance
- Panels on relationships, health and wellness, and business
- Dance tutorials and masterclasses to make dance more accessible

Serving since 2012, based in Los Angeles.

[rollettesexperience.com](https://www.rollettesexperience.com)'),
  ('World WCMX Federation',
   '[worldwcmx.org](https://www.worldwcmx.org/)',
   'World federation for WCMX, wheelchair tricks on skatepark ramps',
   'The World WCMX Federation, founded by Action Park Alliance, works to advance WCMX (wheelchair motocross) worldwide. In WCMX, wheelchair users ride skatepark ramps doing spins, flips and grinds, much like skateboarding or BMX.

- The World Championships and the World WCMX Series each year
- **World WCMX Online Series:** online competition events
- **North American Adaptive Skateboarding Championship:** held at La Quinta X Park in California in 2026, with adaptive skateboarding and WCMX divisions for pros, amateurs and youth
- A rulebook, judging standards and athlete classification
- Membership, global ambassadors and regional representatives

Based in Culver City, California.

[worldwcmx.org](https://www.worldwcmx.org/)'),
  ('USTA Southern California',
   '[ustasocal.com](https://ustasocal.com/adaptive/)',
   'Adapted tennis programs and partner providers across Southern California',
   'USTA Southern California, one of 17 sections of the United States Tennis Association, partners with providers to offer inclusive instructional, social and competitive adapted tennis programs across Southern California, using modified rules and specialized equipment.

- A directory of Southern California adapted programs, keyed by the disabilities each serves, including spinal cord injury
- Partner programs such as the San Diego Wounded Warrior Tennis Program and SoCal Adaptive Sports in Palm Desert
- Support for groups including ACEing Autism, Special Olympics and Angel City Games
- Blind and visually impaired tennis clinics with the United States Blind Tennis Association

[ustasocal.com](https://ustasocal.com/adaptive/)'),
  ('Rim of the World Special Athletes Foundation',
   '[rimspecialathletes.org](https://rimspecialathletes.org/)',
   'Free year-round adaptive snow and water sports around Lake Arrowhead',
   'Rim of the World Special Athletes Foundation is a nonprofit that provides "at no cost year-round activities for adaptive athletes, serving veterans and individuals from our mountain communities and beyond." Its athletes include people with spinal cord injuries, amputations, visual and hearing impairments, traumatic brain injuries and other disabilities.

- Snow-based activities in winter, including skiing
- **A Day at the Lake:** a summer water sports program with kayaking, aqua biking, stand up paddle boarding, boating and fishing
- Activities on and around Lake Arrowhead with trained adaptive volunteers

Based in Lake Arrowhead, California.

[rimspecialathletes.org](https://rimspecialathletes.org/)'),
  ('T3 Adaptive Racquet Sports',
   '[t3adaptive.org](https://www.t3adaptive.org/)',
   'Wheelchair tennis, para pickleball and other racquet sports in Orange County',
   'T3 Adaptive Racquet Sports is "dedicated to transforming lives by empowering individuals with physical disabilities through inclusive racquet-sports training, competition, and community." It serves children and adults across Southern California and began as the only regularly scheduled wheelchair tennis program in Orange County.

- Wheelchair tennis, para pickleball, para-standing tennis and para badminton
- Private lessons
- Youth development and competitive pathways, from high school teams to national tournaments
- University partnerships

Launched in 2022 in Orange County.

[t3adaptive.org](https://www.t3adaptive.org/)'),
  ('Right Hand Angels',
   '[righthandangels.org](https://www.righthandangels.org/)',
   'Support, education and inclusive events for people with disabilities and families',
   'Right Hand Angels is a national nonprofit that supports people with disabilities and their families. Its mission is "to inspire hope in our disabled community through educational support, advocacy, and informative research, while contributing to the health and well-being of families."

- Up-to-date resources, plus education for families through programs, webinars and training
- Advocacy that gives families a voice for change
- Physical, mental and financial assistance for families in need
- Social events where Friendship Leaders build friendships with Angels, people of all ages living with disabilities

Started in 2007 in Jacksonville, North Carolina; a national nonprofit since 2022.

[righthandangels.org](https://www.righthandangels.org/)'),
  ('Las Vegas Raiders Wheelchair Football Team',
   '[lasvegasnevada.gov](https://www.lasvegasnevada.gov/Government/Departments/Parks-Recreation/Adaptive-Recreation)',
   'The City of Las Vegas''s wheelchair football team, with wheelchairs provided',
   'The Las Vegas Raiders are the City of Las Vegas''s 14-member competitive team in the USA Wheelchair Football League, part of its Adaptive Recreation program, which "provides opportunities for youth and adults of all abilities."

- Wheelchair football tryouts, practices, camps and clinics
- Practices on Mondays and Wednesdays, 6 to 8 p.m., at Dula Community Center
- Appropriate wheelchairs are provided
- Military veterans on the team and in the wider program

[lasvegasnevada.gov](https://www.lasvegasnevada.gov/Government/Departments/Parks-Recreation/Adaptive-Recreation)'),
  ('Trail Access Project',
   '[trailaccessproject.org](https://www.trailaccessproject.org)',
   'Adaptive hiking, trail wheelchairs and handcycling in Southern Nevada',
   'Trail Access Project works "To create more meaningful access to nature for people with disabilities" in the Las Vegas area and Southern Nevada. Many participants have paraplegia, partial quadriplegia or traumatic brain injuries.

- Group adaptive hiking events on Southern Nevada trails using a fleet of specialty trail wheelchairs
- Small group adaptive mountain biking rides on e-assist handcycles outside the Las Vegas valley
- Trail access assessments and advocacy with local, state and federal land managers
- Outings in places such as Red Rock Canyon, Lake Mead and the Spring Mountains

Founded in 2015, serving the Las Vegas area.

[trailaccessproject.org](https://www.trailaccessproject.org)'),
  ('Stand Up and Play Foundation',
   '[standupandplayfoundation.org](https://standupandplayfoundation.org/)',
   'Standing wheelchairs and adaptive golf clinics for wheelchair users',
   'Stand Up and Play Foundation is a volunteer-based nonprofit that gives wheelchair users and others with impaired mobility the chance to stand up and take part in sports and everyday activities using the VertaCat/Paramobile standing wheelchair.

- Clinics and demonstrations introducing the VertaCat/Paramobile and other adaptive equipment
- **HERO Program:** free golf therapy clinics for veterans, emergency responders and their families, run by the Lowcountry Chapter in South Carolina
- **Everyday HEROES:** a free community adaptive golf clinic for anyone in the Lowcountry with an injury, illness or challenge
- Grants for veterans, first responders, children, golf therapy clinics and rehab organizations
- Help forming adaptive sports chapters in communities

Founded in 2010 by Anthony Netto, co-inventor of the VertaCat/Paramobile.

[standupandplayfoundation.org](https://standupandplayfoundation.org/)'),
  ('The Adaptive Impact',
   '[theadaptiveimpact.com](https://theadaptiveimpact.com/)',
   'Adaptive paragliding and skydiving for people with mobility challenges in San Diego',
   'The Adaptive Impact offers adaptive paragliding and skydiving for people with mobility challenges in San Diego, California, with flights above the Pacific coastline. Its tagline: "When You Can No Longer Walk, Learn to Fly"

[theadaptiveimpact.com](https://theadaptiveimpact.com/)'),
  ('Challenged Athletes Foundation',
   '[challengedathletes.org](https://www.challengedathletes.org/)',
   'Grants, programs and adaptive sports events for athletes with physical disabilities',
   'The Challenged Athletes Foundation (CAF) "empowers athletes with physical disabilities by breaking down barriers—providing funding for adaptive sports equipment, training, and community support so they can thrive through fitness and competitive athletics."

- Grants for adaptive equipment, gym access, training and competition
- Adaptive sports events and clinics, such as sled hockey, swimming, rock climbing and winter sports weekends
- **Operation Rebound:** grants and programs for U.S. veterans, active military and first responders with permanent physical injuries
- Youth programs
- Adaptive sports resources, guides and directories

[challengedathletes.org](https://www.challengedathletes.org/)'),
  ('VIP NeuroRehab Center',
   '[vipneurorehab.org](https://www.vipneurorehab.org/)',
   'Nonprofit outpatient neurorehabilitation in San Diego, run by and for patients',
   'VIP NeuroRehabilitation Center is a nonprofit "run by and for patients" that provides outpatient neurorehabilitation for adults and children ages 4 and up. It helps people with movement challenges related to spinal cord injury, stroke, brain injury, MS, Parkinson''s disease and other conditions.

- Outpatient physical therapy and neurorehabilitation with personalized care plans
- Care for disabled military personnel, veterans, the elderly, children and anyone in need
- Education for patients and families on neurological conditions, nutrition, stress reduction and exercise
- State-of-the-art equipment and the latest rehabilitation technologies

Founded in 2011, based in San Diego.

[vipneurorehab.org](https://www.vipneurorehab.org/)'),
  ('Idaho Sled Hockey Association',
   '[idahosledhockeyassociation.org](https://www.idahosledhockeyassociation.org/)',
   'Sled hockey for people with physical disabilities in Idaho',
   'Idaho Sled Hockey Association is a nonprofit that teaches and encourages people with physical disabilities to play ice hockey in sleds. Founder Sean Sexton started it after sled hockey helped him find community following his own injury.

- Sled hockey for players with physical disabilities, with player sign up
- Try-it events and demonstrations where anyone can hop in a sled, such as at the Caldwell Ice Ribbon
- Play alongside people without disabilities to build awareness and teamwork
- Education for the public about disability sports

Founded in 2022.

[idahosledhockeyassociation.org](https://www.idahosledhockeyassociation.org/)'),
  ('Idaho Outdoor Field House',
   '[idahofieldhouse.org](https://www.idahofieldhouse.org/fh-programs)',
   'Boise fieldhouse with adaptive fitness and training for Idaho outdoor sports',
   'The Idaho Outdoor Fieldhouse is the headquarters for Mission43 and Challenged Athletes Foundation-Idaho programming, and prepares members to get out into Idaho''s outdoors. Its vision is "to make Idaho a world-class destination for accessible recreation and life after the military."

- **Adaptive Fitness:** small-group workouts tailored for athletes with physical disabilities
- **Fieldhouse Fitness:** inclusive functional fitness for activities like hunting, hiking and mountain biking
- **Forged Together:** cohort-based training for Idaho sports leading up to an outdoor immersion, by application
- **Fieldhouse Yoga:** sessions for mobility and recovery
- **Forged Challenge Series:** quarterly physical and mental challenges

Based in Boise.

[idahofieldhouse.org](https://www.idahofieldhouse.org/fh-programs)'),
  ('Boise Parks and Recreation',
   '[parks.cityofboise.org](https://parks.cityofboise.org/activities,-classes-and-sports/adaptive-recreation/)',
   'City of Boise adaptive recreation, outings and wheelchair sports',
   'The City of Boise''s Adaptive Recreation program, part of Boise Parks and Recreation, offers recreational, social and educational programs for people with disabilities. Its AdVenture program provides recreation, wilderness excursions, fitness, sports and social activities for people with disabilities, their families and friends.

- **AdVenture Seeker Program:** wheelchair sports and outdoor recreation for people with physical disabilities
- Weekly adaptive classes in art, cooking, fitness, dance and yoga, plus social clubs
- Adaptive cycling, whitewater rafting, snowshoeing, camping and fishing trips
- Inclusion services that provide modifications so people with disabilities can join any Boise Parks and Recreation program
- Scholarships for youth, seniors and adults with disabilities

Based in Boise, Idaho.

[cityofboise.org](https://www.cityofboise.org/departments/parks-and-recreation/adaptive-recreation/)'),
  ('Oregon SCI',
   '[oregonsci.org](https://www.oregonsci.org/)',
   'Peer support, resources and community for people with spinal cord injury in Oregon',
   'Oregon Spinal Cord Injury Connection (OSCI) offers resources, peer support and advocacy for people after a spinal cord injury. Its mission is "to ensure everyone living with a spinal cord injury in Oregon has the care, community, and resources they need to thrive."

- **Community Health Workers:** people with lived experience who offer guidance and emotional support after an injury
- Wheelchair maintenance workshops and a wheelchair repair shop
- SCI educational forums and a Guidance & Resources guide on medical care, secondary conditions and caregiving
- Casual community meet-ups
- Adaptive camping and hiking in the Pacific Northwest

Based in Portland.

[oregonsci.org](https://www.oregonsci.org/)'),
  ('Neuroworx',
   '[neuroworx.org](https://neuroworx.org/)',
   'Nonprofit outpatient paralysis rehabilitation in Sandy, Utah',
   'Neuroworx is a nonprofit outpatient facility providing physical, occupational and speech therapy for adults and children with paralysis from spinal cord injuries, brain injuries, stroke, cerebral palsy and similar conditions. It is designed to optimize outcomes while "eliminating as many financial barriers to care as possible."

- Adult and pediatric therapy using activity-based, neuroplastic principles
- Wellness programs, clinical research and internships
- **Adaptive Dance Program:** classes blending creative movement with functional goals, standing or seated
- Wheelchair basketball
- Accepts most insurance including Medicare and Medicaid, with a self-pay schedule and financial aid where possible

Founded in 2004 by Jan Black and Dale Hull, based in Sandy, Utah.

[neuroworx.org](https://neuroworx.org/)'),
  ('Salt Lake County – Parks and Recreation',
   '[saltlakecounty.gov](https://www.saltlakecounty.gov/parks-recreation/adaptive/)',
   'Salt Lake County adaptive sports, fitness, aquatics and social events',
   'Salt Lake County Parks and Recreation''s Adaptive Recreation offers inclusive and adaptive sports, physical activities, socials and programs for people with physical, developmental or intellectual disabilities.

- Adaptive fitness for people with disabilities who want to increase their fitness
- Adaptive aquatics with swim lessons, clubs and water polo
- Adaptive and wheelchair sports camps held throughout the year
- **Adaptive Miracle League:** adaptive baseball for all levels and abilities
- Social events such as cooking classes, Saturday night dances and theater, plus a Disability/Plus One Fitness Pass for a person with a disability and an assistant

Based in Midvale, Utah.

[saltlakecounty.gov](https://www.saltlakecounty.gov/parks-recreation/adaptive/)'),
  ('The Front Adaptive Climbing',
   '[thefrontclimbingclub.com](https://thefrontclimbingclub.com/adaptive/)',
   'Adaptive climbing meetups and a paraclimbing team along Utah''s Wasatch Front',
   'Adaptive Climbing at The Front, the adaptive program of The Front Climbing Club gyms in Utah, aims "to empower, support and advance the adaptive climbing community along Utah’s Wasatch Front."

- Monthly adaptive meetups with trained staff and volunteer belayers in Salt Lake City, Ogden and South Main
- Weekly paraclimbing team practices in Salt Lake City for adaptive athletes 16 and up, including those aiming for Paraclimbing Nationals
- Intro to Adaptive Climbing classes in Salt Lake City
- Partner sessions with Ogden Valley Adaptive Sports, the National Ability Center''s Rock On! program and Up Ending Parkinsons
- Free or discounted gym memberships and scholarships for paraclimbing athletes

[thefrontclimbingclub.com](https://thefrontclimbingclub.com/adaptive/)'),
  ('Chairbound Sportsman',
   '[chairboundsportsman.org](https://chairboundsportsman.org/)',
   'Hunting, fishing and outdoor trips for wheelchair users in Utah',
   'Chairbound Sportsman is an all-volunteer nonprofit in Utah that helps wheelchair users and people with disabilities go hunting, fishing and enjoy other outdoor opportunities. It was founded in 2009 by Kenneth Vaughn Sr, starting as a Utah chapter of Chairbound Hunters.

[chairboundsportsman.org](https://chairboundsportsman.org/)'),
  ('Ultimate Access',
   '[ultimateaccessequipment.com](https://www.ultimateaccessequipment.com/book-online)',
   'Rentals of all-terrain track chairs and outdoor mobility gear in Utah and Alaska',
   'Ultimate Access is a nonprofit that rents adaptive outdoor mobility equipment so people with disabilities can explore the outdoors. Its mission is "to make adaptive outdoor mobility equipment accessible and affordable for people with disabilities through rentals and community partnerships."

- Action Trackchair rentals in Utah and Alaska
- Extreme Motus and standard wheelchair rentals in Utah, plus The Rig in Alaska
- Short excursions, daily, multi-day and long-term rentals, by reservation
- Trackchairs come with a hitch carrier with a fold-down ramp for transport

Established in 2025, based in Roy, Utah.

[ultimateaccessequipment.com](https://www.ultimateaccessequipment.com/book-online)'),
  ('TRAILS',
   '[utrails.us](https://www.utrails.us/program-calendar)',
   'Free adaptive sports, wellness and support from University of Utah Health',
   'TRAILS (Technology Recreation Access Independence Lifestyle Sports) is University of Utah Health''s adaptive program at Craig H. Neilsen Rehabilitation Hospital, serving people with complex physical injury or disease. Activities are free and run five to six days a week in the Greater Salt Lake area.

- Alpine and Nordic skiing, watersports, cycling, mountain biking, wheelchair tennis and race teams
- TetraSki and Tetra watercraft training
- **Fit Clinic:** matching participants with the best-fitting adaptive sports equipment
- **Loaner Program:** adaptive equipment on loan
- Support groups, wellness sessions, and education and outreach events

Founded in 2001, based in Salt Lake City.

[utrails.us](https://www.utrails.us/program-calendar)'),
  ('High Country Adaptive Sports',
   '[highcountryadaptive.org](https://highcountryadaptive.org)',
   'Year-round adaptive skiing, kayaking, biking and climbing in Northern Arizona',
   'High Country Adaptive Sports (HCAS) is a nonprofit offering year-round adaptive sports and recreation in Arizona''s High Country. It serves youth and adults with physical, cognitive and sensory disabilities, plus veterans, with specialized equipment and trained instructors.

- Adaptive skiing and snowboarding at Arizona Snowbowl, including bi-ski, mono-ski and tetra ski
- Kayaking at Lake Mary, adaptive mountain biking and hiking in summer
- Adaptive climbing, including indoor sessions with Flagstaff Climbing
- Need-based scholarships may be available

Founded in 2015, based in Flagstaff.

[highcountryadaptive.org](https://highcountryadaptive.org)'),
  ('National Ability Center',
   '[discovernac.org](https://discovernac.org/)',
   'Adaptive recreation and adventure in Park City, Utah, with 20+ programs',
   'The National Ability Center (NAC) offers more than 20 adaptive recreation programs for people with disabilities. It has "empowered individuals with disabilities through adaptive recreation and adventure" since 1985.

- Adaptive ski and snowboard lessons, Nordic skiing, snowshoeing and fat tire biking
- Sled hockey, pickleball, archery, climbing and a challenge course with a zip line
- Cycling, equestrian programs, paddle sports and day or overnight rafting trips
- **Alpine Ski Team:** elite adaptive alpine racing and training for athletes 16 and up
- Camps, with scholarships available

Based in Park City, Utah.

[nationalabilitycenter.org](https://nationalabilitycenter.org/)'),
  ('Common Ground Outdoor Adventures',
   '[cgadventures.org](https://www.cgadventures.org)',
   'Adaptive outdoor recreation for youth and adults with disabilities in Logan, Utah',
   'Common Ground Outdoor Adventures (CGOA) is a nonprofit whose mission is "to provide life-enhancing outdoor recreation for youths and adults with disabilities." It provides adaptive equipment and support and serves over 3,600 people with disabilities each year.

- Adaptive skiing at its Beaver Mountain Programming and Adaptive Center
- Summer and winter activities, adventure base camps and destination trips
- Youth programs including Junior Adventures and the Youth Adventure Leadership Program (YALP)
- Programs for veterans and for people with multiple sclerosis
- Group and custom programs for schools and agencies

Founded in 1993, based in Logan, Utah.

[cgadventures.org](https://www.cgadventures.org)'),
  ('Camp Patrick',
   '[camppatrick.com](https://camppatrick.com)',
   'Volunteer-run summer camp for kids with spina bifida, ages 6 to 18',
   'Camp Patrick is a volunteer-run camp for kids with spina bifida, ages 6-18, where they can strengthen their independence, try new things and make lifelong friends. It also builds a support system for the families who send their kids to camp.

- A six-day, five-night camp with wheelchair accessible cabins
- Experienced medical staff
- An adult Camp Patrick session
- Volunteer staff roles, a week-long commitment

[camppatrick.com](https://camppatrick.com)'),
  ('USA Pickleball',
   '[usapickleball.org](https://usapickleball.org/)',
   'National governing body for pickleball, with wheelchair rules and adaptive programs',
   'USA Pickleball is the national governing body for pickleball in the United States. It is committed to facilitating "a national network of inclusive, accessible pickleball programs that empower and unite players of all abilities."

- Official wheelchair pickleball rules, including a two-bounce rule, and court specifications
- **Numotion Wheelchair National Championships** and tournaments with wheelchair divisions
- A searchable directory of adaptive pickleball programs by city and state
- Adaptive standing pickleball resources, made with Sportable
- Sanctioned tournaments, rankings and memberships

[usapickleball.org](https://usapickleball.org/)'),
  ('Rio Salado Rowing Club',
   '[rowrio.org](https://rowrio.org/row/adaptive-rowing/)',
   'Adaptive rowing with the Can Do Crew on Tempe Town Lake, Arizona',
   'Rio Salado Rowing Club is an all-volunteer nonprofit rowing club in Arizona that welcomes adult rowers of all levels, including adaptive rowers. In its words, "we adapt the equipment — not the sport— so anyone regardless of functional limitations can enjoy the water."

- **Can Do Crew:** an adaptive rowing program providing equipment, coaches and training for recreational and competitive rowing
- Can Do Crew rowers compete at local, national and international events, including indoor rowing championships
- Adaptive training clinics with U.S. team Paralympic rowers and coaches
- Designated a U.S. Paralympic Sport Club in 2012

Rowing since 1991, with adaptive rowing since 2010.

[rowrio.org](https://rowrio.org/row/adaptive-rowing/)'),
  ('Arizona Disabled Sports',
   '[arizonadisabledsports.com](https://www.arizonadisabledsports.com/)',
   'Adaptive sports and recreation for people with disabilities in Mesa and across Arizona',
   'Arizona Disabled Sports (AzDS), also known as the Mesa Association of Sports for the Disabled, is a nonprofit providing sports and recreation for people with all types of disabilities. Participants come from across the Phoenix area and the state of Arizona.

- **Arizona Heat:** sports programs for athletes ages 6 and up with physical disabilities, including spinal cord injury
- **Team Mesa:** year-round sports, classes, social activities and summer camp for people with intellectual or developmental disabilities
- Events such as the Desert Challenge Games
- Programs run with the City of Mesa and Mesa Public Schools, often hosted in Phoenix, Tempe and Scottsdale

Based in Mesa, Arizona; doing business as Arizona Disabled Sports since 2007.

[arizonadisabledsports.com](https://www.arizonadisabledsports.com/)'),
  ('Gye Di',
   '[gyedi.org](https://gyedi.org/)',
   'Intensive therapy, powered mobility and adapted events for kids in Queen Creek, Arizona',
   'Gye Di is a nonprofit founded by occupational therapists, offering therapy and adapted play for children with physical disabilities. Its name means "Believe" in Ghanaian, and its mission is to build an indoor recreation and trampoline park for children with complex physical disabilities.

- Intensive therapy blocks of three hours a day, five days a week, for three to four weeks
- Powered wheelchair training for children, often very young
- TheraSuit and SpiderCage, sensory and reflex integration, and speech therapy
- Mostly free adapted events such as adapted baseball, hiking, FarmYard Friends and the Adapted Fall Festival

Based in Queen Creek, Arizona.

[gyedi.org](https://gyedi.org/)'),
  ('Seattle Slam',
   '[seattleslam.org](https://seattleslam.org/)',
   'Washington''s only wheelchair rugby club, practicing weekly in West Seattle',
   'Seattle Slam is Washington''s only wheelchair rugby club, playing a full contact team sport, and is all about "bringing people with disabilities together through sport." Players range from elite athletes to recreational players.

- Weekly Wednesday practices in West Seattle, open to people of all abilities
- Competes in the Pacific Conference of the United States Wheelchair Rugby Association (USWRA), with tournaments from September to April
- Hosts Slam on the Sound, a tournament in Renton that is free to the public
- Coaching clinics, with physical and occupational therapists on hand at practice

Based in Seattle.

[seattleslam.org](https://seattleslam.org/)'),
  ('Seattle Adaptive Sports',
   '[seattleadaptivesports.org](https://www.seattleadaptivesports.org/)',
   'Wheelchair basketball, sled hockey, power soccer and goalball in Western Washington',
   'Seattle Adaptive Sports (SAS) is a nonprofit Paralympic Sports Club whose mission is "to enable people with physical disabilities to push beyond their limits and reach their full potential." It builds and supports teams for people with permanent physical disabilities, including spinal cord injury.

- Recreational and nationally competitive teams in wheelchair basketball, sled hockey, power soccer and goalball
- Competitive league sports and recreational team sports
- Instructional camps and sports clinics, such as a blind soccer clinic
- Adaptive awareness events

Based in Seattle.

[seattleadaptivesports.org](https://www.seattleadaptivesports.org/)'),
  ('City of Bellevue',
   '[bellevuewa.gov](https://bellevuewa.gov/city-government/departments/parks/community-centers/highland/adaptive-recreation)',
   'Bellevue adaptive recreation, including wheelchair basketball and exercise classes',
   'The City of Bellevue''s Adaptive Recreation Program at Highland Community Center offers recreation, socialization and learning for people with physical and intellectual disabilities in Bellevue, Washington.

- Instructor-led exercise and strength training for adults with physical disabilities
- Drop-in wheelchair basketball
- A fitness room open for drop-in use
- Art, fitness, social events, dances and sports such as basketball, softball and boccia for adults with intellectual disabilities
- New participants meet with a coordinator before registering

[bellevuewa.gov](https://bellevuewa.gov/city-government/departments/parks/community-centers/highland/adaptive-recreation)'),
  ('Valley Adaptive Sports',
   '[valleyadaptivesports.org](https://valleyadaptivesports.org)',
   'Adaptive skiing, sled hockey, cycling and more in Teton Valley, Idaho',
   'Valley Adaptive Sports (VAS) is a nonprofit whose mission is "to support and develop recreation opportunities for people with disabilities in Teton Valley, Idaho and surrounding areas." It provides training, equipment and scholarships, working with partner organizations.

- Adaptive skiing support at Grand Targhee Resort, with scholarships for local school kids
- Sled hockey and adaptive skating with Teton Valley Foundation at Kotler Ice Arena
- Adaptive mountain and road bike rentals, and the Wydaho Adaptive Mountain Bike Festival
- Adaptive Nordic and sit ski cross country, snowshoeing, swimming lessons, rafting and wake surfing
- Training for outfitters and businesses to work with people with disabilities

Founded in 2022, based in Driggs, Idaho.

[valleyadaptivesports.org](https://valleyadaptivesports.org)'),
  ('Teton Adaptive Sports, Inc.',
   '[tetonadaptivesports.com](https://www.tetonadaptivesports.com)',
   'Adaptive recreation in Jackson Hole and the Greater Teton Area',
   'Teton Adaptive is a nonprofit whose mission is "To create recreational opportunities for people with disabilities living in and visiting the Greater Teton Area." It serves people with physical, developmental or cognitive disabilities.

- Alpine and Nordic skiing and snowboarding, starting at Jackson Hole Mountain Resort
- Paragliding, mountain biking, road cycling, paddling and hiking
- Sled hockey and rock climbing
- Scholarships, training and accessible equipment

Founded in 2005, based in Teton Village, Wyoming.

[tetonadaptive.org](https://tetonadaptive.org/)'),
  ('University of Arizona Adaptive Athletics',
   '[drc.arizona.edu](https://drc.arizona.edu/athletics)',
   'Competitive wheelchair and adaptive sports teams at the University of Arizona',
   'Arizona Adaptive Athletics is the University of Arizona''s wheelchair and adaptive sports program for student athletes. It describes itself as "a dynamic and growing leader in wheelchair and adaptive sports, built on a foundation of competitive excellence, inclusion, and opportunity."

- Men''s and women''s wheelchair basketball
- Wheelchair track and road racing
- Tennis and para swimming
- Adaptive golf team
- Home games and tournaments on an events calendar

[adaptiveathletics.arizona.edu](https://adaptiveathletics.arizona.edu/)'),
  ('ParaSport Spokane',
   '[parasportspokane.org](https://www.parasportspokane.org/)',
   'Free adaptive and Paralympic sports club for youth and adults in Spokane',
   'ParaSport Spokane is Spokane''s adaptive and Paralympic sports club for youth and adults with physical disabilities and visual impairments, with no fee to take part. Its mission is to "provide training, recreational, and competitive opportunities for youth and adults with physical disabilities and visual impairments that promote success, self-worth and independence."

- Basketball, track and field, road racing, sled hockey and swimming
- Goalball, parafencing, boccia, and strength and conditioning
- Youth prep programs for athletes as young as 5
- Coaching and equipment from first practice up to Team USA
- Events including the Spokane Showdown and Pine Cone Classic

Founded in 2013 by Teresa Skinner, based in Spokane.

[parasportspokane.org](https://www.parasportspokane.org/)'),
  ('Southern Arizona Adaptive Sports',
   '[soazadaptivesports.org](https://www.soazadaptivesports.org)',
   'Wheelchair sports, adaptive cycling and outreach in Southern Arizona',
   'Southern Arizona Adaptive Sports (SAAS) is a volunteer-driven nonprofit creating recreational and competitive sports opportunities for adults and youth with disabilities. Its vision is "sports and recreation for all as a part of a more accessible Tucson."

- Wheelchair basketball, wheelchair tennis and wheelchair softball
- Adaptive cycling, adaptive golf and shooting para sports
- **Adaptive Sports in Schools (ASIS):** outreach, plus demo roadshows and clinics
- **SAAS Cares:** equipment redistribution, wheelchair donations, peer mentoring and referrals

Formed in 2017.

[soazadaptivesports.org](https://www.soazadaptivesports.org)'),
  ('MonTech',
   '[montech.ruralinstitute.umt.edu](https://montech.ruralinstitute.umt.edu/equipment-loans-reuse/)',
   'Free assistive technology and adaptive equipment loans across Montana',
   'MonTECH is Montana''s statewide assistive technology program, part of the University of Montana''s Rural Institute for Inclusive Communities. Its mission: "MonTECH provides technology, support, and services that improve the quality of life for Montanans with disabilities."

- Free device and equipment loans, with free shipping elsewhere in Montana for many items
- Wheelchairs, standers, gait trainers, ramps, transfer aids and smart home gear to borrow
- Adaptive recreation gear, including off-road chairs, sleds, and hunting, fishing and boating equipment
- **Wheels Across Montana (WAM):** adaptive trike loans in Missoula, Helena, Billings, Poplar and Dillon
- Free, confidential information on assistive technology, plus demonstrations, evaluations and training

Based in Missoula, with an office in Billings.

[montech.ruralinstitute.umt.edu](https://montech.ruralinstitute.umt.edu/equipment-loans-reuse/)'),
  ('Adaptive Sports Association',
   '[asadurango.com](https://www.asadurango.com)',
   'Adaptive skiing, rafting, cycling and camping in Durango, Colorado',
   'The Adaptive Sports Association (ASA) is a nonprofit in Durango, Colorado, offering year-round sports and recreation for people with cognitive and physical disabilities. Its mission is "to provide outdoor, sport and recreational experiences for people with disabilities."

- Winter adaptive skiing, snowboarding and sit-ski lessons, typically one-on-one
- Summer cycling on adapted trikes, tandem trikes and bikes
- Canoeing, kayaking, rafting on the Animas and indoor rock climbing
- Overnight camping trips, and adaptive bike and watercraft rentals
- Specialty programs including Veterans Outdoors and Learn to Ski Scholarship Weeks, plus financial assistance

[asadurango.com](https://www.asadurango.com)'),
  ('Telluride Adaptive Sports Program',
   '[tellurideadaptivesports.org](https://www.tellurideadaptivesports.org)',
   'Year-round adaptive skiing, biking, climbing and more in Telluride',
   'Telluride Adaptive Sports Program (TASP) is a nonprofit "dedicated to enriching the lives of people living with permanent disabilities through year-round recreational opportunities." Programs are open to people over 4 years old of all ability and experience levels, in the San Juan Mountains.

- Winter adaptive skiing and snowboarding
- Summer hiking, biking, rock climbing and lake sports
- Horseback riding, tennis and racquet sports, and fishing
- Multi-day programs and camps, such as Moab Mania and a handcycle camp

Independent nonprofit since 1996, based in Telluride.

[tellurideadaptivesports.org](https://www.tellurideadaptivesports.org)'),
  ('Adaptive Golf Program',
   '[agpdurango.org](https://agpdurango.org/)',
   'Free adaptive golf lessons and mobility equipment in Durango, Colorado',
   'The Adaptive Golf Program (AGP) brings golf to people with all types and levels of disabilities in the Durango area, including spinal cord injury. Its goal is "to take away barriers and make golf accessible to all."

- Free individual and group lessons from volunteers and a PGA Tour pro at Hillcrest Golf Club
- **SoloRider, ParaGolfer and VertaCat:** mobility equipment, free to use, including outside programming
- Golf clubs, training aids and range balls provided
- Practice on the driving range, chipping area, putting green and a 100 yard practice hole

Founded in 2013 by Andy Asmuth, based in Durango.

[agpdurango.org](https://agpdurango.org/)'),
  ('Wyoming Disabled Hunters',
   '[wyomingdisabledhunters.org](https://wyomingdisabledhunters.org/)',
   'Affordable antelope, deer and elk hunts for disabled hunters in Wyoming',
   'Wyoming Disabled Hunters (WDH) is a nonprofit founded by Wyoming residents who have a personal connection with physically challenged hunters. "Our Goal is to Provide an Affordable Hunt for Disabled Hunters."

- Antelope, deer and elk hunts, including archery deer hunts
- For holders of a Wyoming Game & Fish Disabled Hunter Permit, including wheelchair users
- Game tags donated for civilians in wheelchairs and veterans with a 50% or higher service-related disability
- Volunteers help run hunts, and landowners can donate the use of land

Hunts since 2009, based in Cody.

[wyomingdisabledhunters.org](https://wyomingdisabledhunters.org/)'),
  ('Steamboat Adaptive Recreational Sports-STARS',
   '[steamboatstars.com](https://www.steamboatstars.com)',
   'Year-round adaptive skiing, cycling, riding and water sports in Steamboat Springs',
   'Steamboat Adaptive Recreational Sports (STARS) offers year-round adaptive outdoor programs in Steamboat Springs, Colorado, for people with cognitive and physical disabilities and their families. "STARS mission is to empower and enrich lives through adaptive recreational activities."

- Winter alpine skiing, nordic, snowboarding and snowshoeing, with adaptive equipment supplied
- Summer cycling, hiking, horseback riding and water sports
- Private lessons, an adaptive guide program and a VI guide program
- Locals programs and veterans programs, with scholarships
- **STARS Ranch:** lodging for participants and groups

[steamboatstars.com](https://www.steamboatstars.com)'),
  ('Adaptive Action Sports',
   '[adacs.org](https://www.adacs.org)',
   'Adaptive snowboarding, skateboarding and e-sports at Copper Mountain, Colorado',
   'Adaptive Action Sports (AAS) provides action sports recreation and high-level snowboard training for youth, young adults and wounded veterans living with permanent physical disabilities. Its headquarters at Copper Mountain, Colorado, includes a ski and snowboard mountain and an indoor skate bowl.

- Winter recreational and high-performance snowboarding, with a competition pipeline
- Summer skateboarding, surfing and other action sport camps
- **Adaptive E-Sports:** free gaming stations with the Logitech Adaptive Gaming kit
- **Logitech Adaptive E Sports Tournaments (AET):** online tournaments for gamers with disabilities

Founded in 2005 by Amy Purdy and Daniel Gale, based in Copper Mountain, Colorado.

[adacs.org](https://www.adacs.org)'),
  ('Loving Thunder',
   '[lovingthunder.com](https://lovingthunder.com/)',
   'Therapeutic horseback riding for people of all abilities in Rio Rancho, New Mexico',
   'Loving Thunder Therapeutic Riding offers equine-assisted services in Corrales and Rio Rancho, New Mexico. Its mission is "to empower and improve the quality of life for people with mental and physical challenges through therapeutic horsemanship, therapies, and educational outreach."

- Therapeutic riding: horsemanship lessons for children and adults of all abilities
- Programs for veterans and foster children
- **Equine Facilitated Learning (EFL):** programs, including for youth in detention
- A PATH Intl. Premier Accredited Center, with volunteers helping keep riders safe

Founded in 2008 by Mike and Twuana Raupp, based in Rio Rancho.

[lovingthunder.org](https://lovingthunder.org/)'),
  ('Breckenridge Outdoor Education Center',
   '[boec.org](https://www.boec.org)',
   'Adaptive skiing, rafting and wilderness camps in Breckenridge, Colorado',
   'Breckenridge Outdoor Education Center (BOEC) offers adaptive outdoor programs for adults and children with physical and cognitive disabilities, sensory differences, and veterans and their families. Its mission is "to expand the potential of people with disabilities and special needs through meaningful, educational, and inspiring outdoor experiences."

- **Adaptive Ski and Snowboard Program:** downhill and cross-country skiing and snowboarding at Breckenridge, Keystone and Copper Mountain
- **Wilderness Program:** rafting, canoeing, camping, backpacking, climbing and ropes course, at a 39-acre Breckenridge campus and on trips in Colorado and Utah
- Camps and retreats for individuals, and custom multi-day group programs
- Adaptive cycling, including a new adaptive mountain bike program
- Scholarships for participants in financial need, plus an internship program

Founded in 1976, based in Breckenridge.

[boec.org](https://www.boec.org)'),
  ('GO Unlimited',
   '[gounlimited.org](https://www.gounlimited.org/)',
   'Adaptive outdoor recreation, SCI support groups and peer mentoring in New Mexico',
   'GO Unlimited (Global Opportunities Unlimited) creates adaptive outdoor recreation and adventure opportunities for children and adults with mobility limitations in New Mexico. Its mission is "to help people with compromised mobility participate in outdoor adaptive sports and recreation activities."

- Monthly SCI support groups and peer mentoring in Albuquerque
- Drift boat fly fishing, pontoon boating, cycling and guided big game hunts
- **Exchange:** connects people who need adaptive equipment with those who have items to repurpose
- Travel help for visitors to New Mexico, and an adaptive map of accessible places
- ADA coordinator services and accessible outdoor construction projects

Founded in 2005 by Dustin Berg, based in Albuquerque.

[gounlimited.org](https://www.gounlimited.org/)'),
  ('Adaptive Sports Program New Mexico',
   '[adaptivesportsprogram.org](https://www.adaptivesportsprogram.org)',
   'Year-round adaptive skiing, rafting, climbing and more across New Mexico',
   'Adaptive Sports Program New Mexico (ASPNM) offers adaptive sports and therapeutic recreation for children and adults with disabilities at locations throughout New Mexico. Its mission is "to enhance the lives of children and adults with disabilities through recreation."

- Adaptive skiing and snowboarding, with Sandia Peak and Ski Santa Fe as primary sponsors
- Watersports, river rafting, archery and rock climbing
- Some programs open to family members and caregivers
- Veteran-specific programs offered periodically through the year
- Athlete scholarships and adaptive gear funded by donations

Offering programs since 1985, based in Santa Fe.

[adaptivesportsprogram.org](https://www.adaptivesportsprogram.org)'),
  ('Camp Always Choose Adventures',
   '[alwayschooseadventures.org](https://www.alwayschooseadventures.org/)',
   'Off-grid outdoor education campground and clinics in Idaho Springs, Colorado',
   'Always Choose Adventures (ACA) is a nonprofit in Gilpin County, Colorado, that runs Camp ACA, an off-grid outdoor education campground. Its aim is "Breaking Barriers to Bring the Outdoors to Everyone", offering outdoor experiences to people without the background, expertise or equipment.

- **Allies in the Outdoors:** adaptive athletes demonstrate the tools they use to access the outdoors
- Intro to camping with tent service and a gear library, plus an intro to backpacking clinic
- Intro to mountaineering on Mount Pisgah, and intro to fly fishing
- Leave No Trace clinic for Gilpin County youth

[alwayschooseadventures.org](https://www.alwayschooseadventures.org/)'),
  ('Ignite Adaptive Sports',
   '[igniteadaptivesports.org](https://www.igniteadaptivesports.org)',
   'Adaptive snowsports lessons at Eldora Mountain Resort on Colorado''s Front Range',
   'Ignite Adaptive Sports provides snowsport opportunities to people with disabilities in the Front Range of Colorado, at Eldora Mountain Resort. It works with "Athletes of all ages, disabilities, and financial circumstances."

- Downhill skiing, cross country skiing, snowboarding, snowshoeing, sit-skiing and ski biking lessons
- Its own ski and snowboard shop of adaptive equipment, included in the lesson fee
- Volunteer-led lessons, with an affordable option whatever your finances
- Free for veterans with disabilities under Move United''s Warfighter Sports Program
- Group outings on request

[igniteadaptivesports.org](https://www.igniteadaptivesports.org)'),
  ('Feel the Beat',
   '[feelthebeat.dance](https://www.feelthebeat.dance/)',
   'Adaptive dance classes on a vibrating floor, at Colorado studios and in New York',
   'Feel the Beat is a Colorado-based nonprofit dance studio for Deaf, Hard of Hearing, disabled and nondisabled dancers of all ages. Its bone-conduction floor lets dancers feel music as vibration, and it welcomes dancers "in socks, shoes, or wheelchairs."

- Classes for kids and adults at studios in Lakewood, Westminster and Centennial, plus programming in New York
- ASL and verbal description, with adaptable movements
- Private group classes for organizations such as respite care and physical therapy groups
- School programs, after-school camps and field trips
- A mobile vibrating floor to make events accessible

Founded in 2016 by Jari and Julia, based in Colorado.

[feelthebeat.dance](https://www.feelthebeat.dance/)'),
  ('Denver Fencing Center Parafencing',
   '[denverfencingcenter.com](https://denverfencingcenter.com/parafencing)',
   'Parafencing classes for adults and youth at the Denver Fencing Center',
   'The Denver Fencing Center''s parafencing program teaches the competitive version of fencing for athletes whose conditions affect fencing on two feet, including spinal injuries. Participants do not have to be full-time wheelchair users.

- Instruction in foil, epee and sabre, for current athletes and complete beginners
- First week free, with all equipment provided for beginners
- **Youth Parafencing Program:** classes for ages 7-13 with children-sized wheelchair fencing equipment
- Need-based scholarships through the Denver Fencing Foundation
- Coached by Haley Guida, a certified parafencing coach since 2005

The center has run since 2004, near downtown Denver.

[denverfencingcenter.com](https://denverfencingcenter.com/parafencing)'),
  ('Denver Adaptive Divers',
   '[denverdivers.com](https://www.denverdivers.com/denver-adaptive-divers.htm)',
   'Adaptive scuba training and dive travel for people with physical disabilities in Denver',
   'Denver Adaptive Divers is the adaptive scuba program of Denver Divers, a Denver dive shop and swim school. It provides "support, education, specialized training in adaptive scuba diving, and dive travel to qualified individuals with physical disabilities."

- Adaptive dive training on the Scuba Schools International (SSI) curriculum, with an adaptive buddy
- Open to divers with conditions including spinal cord injury, after a physician''s release
- Dive gear configured for each diver''s disability, such as modified wetsuits
- Scholarships covering training, materials, gear and part of a dedicated dive trip
- Self-funded custom courses for a diver and their buddies

Denver Divers was founded in 1961, based in Denver.

[denverdivers.com](https://www.denverdivers.com/denver-adaptive-divers.htm)'),
  ('Dive Pirates',
   '[divepirates.org](https://divepirates.org)',
   'Adaptive scuba training, gear and dive trips for people with physical disabilities',
   'Dive Pirates Foundation "provides adaptive scuba training, equipment, dedicated buddies, and lifelong community for people with physical disabilities." It is open to medically qualified people, including people with spinal cord injuries, with a focus on injured military, law enforcement and first responder veterans.

- Adaptive scuba training for each diver and their adaptive buddy, such as a spouse, sibling or friend
- Personal dive gear for divers
- Dive trips and accessible adventures
- Local dive chapters around the country for training and community
- Support to keep diving as part of lifestyle and rehabilitation

Began in 2003 as a social club for divers, based in Wellington, Colorado.

[divepirates.org](https://divepirates.org)'),
  ('City of Colorado Springs Parks and Recreation',
   '[coloradosprings.gov](https://coloradosprings.gov/parks/page/therapeutic-recreation-program-trp)',
   'Therapeutic recreation and inclusion support from the City of Colorado Springs',
   'The City of Colorado Springs Parks and Recreation runs the Therapeutic Recreation Program (TRP) for youth and adults with disabilities. It offers specialized therapeutic programs, plus advocacy and inclusion support so people can join general recreation activities.

- Arts and culture, and social enrichment
- Sports, fitness and aquatics, including aquatic rehabilitation and adaptive water skiing
- Community integration, leisure education and outdoor adventures
- An Inclusion Coordinator who arranges accommodations in general city recreation programs
- A partner of the National Inclusion Project

[coloradosprings.gov](https://coloradosprings.gov/parks/page/therapeutic-recreation-program-trp)'),
  ('The Lockwood Foundation',
   '[thelockwoodfoundation.org](https://www.thelockwoodfoundation.org)',
   'Adaptive hiking with TrailRider chairs and volunteers on Colorado trails and peaks',
   'The Lockwood Foundation is a Colorado nonprofit that makes it possible for people with limited mobility to hike Colorado''s mountain trails. Its mission is "to create life-changing opportunities for people with limited mobility to explore trails and mountains once thought impossible."

- Adaptive hikes in TrailRider chairs, single-wheel and human-powered, from a fleet of four
- Volunteer teams who guide each rider
- Summits of peaks including Mt. Elbert and Quandary
- Hikes across Colorado, from Denver and Boulder to Colorado Springs and Pueblo
- Community hikes and social events

Founded in 2018 by Jeffrey Lockwood, based in Golden.

[thelockwoodfoundation.org](https://www.thelockwoodfoundation.org)'),
  ('One Chair at a Time',
   '[onechairatatime.org](https://www.onechairatatime.org/)',
   'Sports wheelchairs for athletes in need, based in Amarillo, Texas',
   'One Chair at a Time provides sports wheelchairs and wheelchair activities to those in need. It was started by Joe Chris Rodriguez, a veteran paralyzed at the T7/T8 level, "to give others the same chance."

- Sports wheelchairs, such as racing wheelchairs, for young athletes
- Athletes in sports including wheelchair basketball and track and field
- Wheelchair events and activities
- An official U.S. Paralympic Sports Club

Based in Amarillo, Texas.

[onechairatatime.org](https://www.onechairatatime.org/)'),
  ('Dreams in Motion, Inc',
   '[dreamsinmotioninc.com](https://www.dreamsinmotioninc.com)',
   'Adaptive sports for youth and adults in Bismarck-Mandan and western North Dakota',
   'Dreams in Motion provides competitive and recreational adaptive sports for youth and adults with mobility challenges or visual impairments, in Central and Western North Dakota.

- Curling, sled hockey, downhill skiing and tennis
- Wheelchair basketball, wheelchair soccer and wheelchair dance
- Track and field
- Help with travel to regional and national events, competitions and training camps

Started in 2011, based in Bismarck-Mandan.

[dreamsinmotioninc.com](https://www.dreamsinmotioninc.com)'),
  ('Prairie Grit Adaptive Sports',
   '[prairiegritsports.com](https://www.prairiegritsports.com/)',
   'Nearly 50 adaptive sports and activities for people with disabilities, age 3 and up',
   'Prairie Grit Adaptive Sports is a volunteer-run nonprofit "providing sports opportunities for youth and adults living with physical and mental disabilities to enhance their quality of life." Participants include people with spinal cord injuries, cerebral palsy, spina bifida, stroke and amputations.

- Nearly 50 activities, including sled hockey, wheelchair basketball, hunting, tennis and gymnastics
- Open to people with a disability from 3 years old through adult
- Activities and events year-round for participants and their families
- No need to attend therapy at Prairie Grit Therapy to take part

[prairiegritsports.com](https://www.prairiegritsports.com/)'),
  ('Southeast Alaska Independent Living (SAIL)',
   '[sailinc.org](https://www.sailinc.org/)',
   'Independent living services and adaptive recreation across Southeast Alaska',
   'Southeast Alaska Independent Living (SAIL) is "dedicated to empowering seniors and people with disabilities to live independently and fully participate in their communities across Southeast Alaska." It serves people of all ages with physical, cognitive, neurological and mental health disabilities.

- **ORCA:** adaptive recreation, including adaptive snowsports and the SAIL Challenge Course
- Peer support and independent living services
- Equipment loan and demonstration, and home accessibility
- Employment services and veteran services
- Aging & Disability Resource Center, brain injury supports and a developmental disability resource connection

Serving the region for more than 30 years, based in Juneau.

[sailinc.org](https://www.sailinc.org/)'),
  ('Oklahoma Adaptive Sports Association',
   '[okasa.org](https://okasa.org/)',
   'Free wheelchair basketball, track, swimming and water sports in Oklahoma',
   'Oklahoma Adaptive Sports Association (OKASA) offers adaptive sports programs for children and adults with physical disabilities, age 2 and up. It does not charge athletes to take part.

- Wheelchair basketball, with two adult and two junior teams
- Track and field for ambulatory athletes and wheelchair users
- Recreational swimming, to learn to swim or practice strokes
- **Waterfest:** yearly adaptive water skiing, kayaking, tubing and boat rides at Lake Thunderbird
- Some equipment to borrow, and help applying for grants for tournament travel

[okasa.org](https://okasa.org/)'),
  ('University of Central Oklahoma Endeavor Games',
   '[endeavorgames.org](https://www.endeavorgames.org)',
   'Multi-sport competitions for athletes with physical disabilities, from Edmond, Oklahoma',
   'The Endeavor Games is a series of multi-sport competitions for children, adults and military service members with physical disabilities, run from the University of Central Oklahoma. It "exists to create equitable access to sport competitions for individuals with physical disabilities."

- **UCO Endeavor Games:** a yearly competition in Edmond, Oklahoma
- Paralympic, emerging and novice athletes compete together in the same venue
- Sport clinics, a welcoming party and an athlete banquet
- **Turnstone Endeavor Games:** held in Fort Wayne, Indiana
- Communities can ask to host an Endeavor Games of their own

First held in 2000, headquartered at the University of Central Oklahoma in Edmond.

[endeavorgames.org](https://www.endeavorgames.org)'),
  ('Madonna Rehabilitation Hospitals',
   '[madonna.org](https://www.madonna.org/)',
   'Rehabilitation hospitals for spinal cord injury, brain injury and stroke in Nebraska',
   'Madonna Rehabilitation Hospitals provides post-acute rehabilitation for adults and children with severe brain trauma, spinal cord injury, stroke, major multiple traumas and neurological conditions, at campuses in Lincoln and Omaha, Nebraska.

- A full continuum of post-acute rehabilitative care, with specialized rehabilitation technology
- Two campuses in Lincoln and Omaha, plus several outpatient therapy locations
- A medically-based wellness club in Lincoln
- Nurse liaisons guide admissions, with onsite assessments and facility tours

Founded in 1958, based in Lincoln and Omaha.

[madonna.org](https://www.madonna.org/)'),
  ('Wheelchair Adventures',
   '[wheelchairadventures.org](https://wheelchairadventures.org/)',
   'Outdoor projects, adaptive equipment and activities to make the outdoors accessible',
   'Wheelchair Adventures is a nonprofit for the outdoors, with a goal "to make the outdoors more accessible to ALL" through outdoor projects, adaptive equipment and activities. Its site lists adaptive equipment makers and adaptive hunting and outdoor programs.

[wheelchairadventures.org](https://wheelchairadventures.org/)'),
  ('Nebraska Adaptive Sport',
   '[nebraskaadaptivesports.org](https://nebraskaadaptivesports.org/)',
   'Volunteer-run wheelchair sports in Eastern Nebraska and Western Iowa',
   'Nebraska Adaptive Sports (NAS), formerly ENWAA, is an all-volunteer wheelchair sports organization for children and adults with disabilities in Eastern Nebraska and Western Iowa. It covers instruction, practice facilities, equipment, registration fees, uniforms and travel.

- Wheelchair softball for adults and youth, including the Nebraska Barons
- Youth wheelchair basketball with the Nebraska Red Dawgs
- Sitting volleyball, quad rugby and sled hockey
- Wheelchair tennis, goalball and bocce ball
- **Junior Wheelchair Sports and Recreation Camp**, plus youth track and field

Founded in 1975.

[nebraskaadaptivesports.org](https://nebraskaadaptivesports.org/)'),
  ('Paralyzed Veterans of America Great Plains Chapter',
   '[greatplainspva.org](https://www.greatplainspva.org/site/)',
   'Advocacy, benefits help and sports for paralyzed veterans in Nebraska and western Iowa',
   'Paralyzed Veterans of America Great Plains Chapter is a congressionally-chartered veteran service organization helping veterans with spinal cord injury/disease and other people with disabilities across Nebraska and Western Iowa. Its mission: "To improve the quality of life of paralyzed veterans and other individuals living with disabilities."

- Advocacy and legislation work, and help with veteran benefits
- Spinal cord injury and multiple sclerosis information and education
- Sports and recreation, including the Omaha Power Soccer Club
- A fitness center
- The Wheeled Herald newsletter

More than 50 years of service, based in Omaha.

[greatplainspva.org](https://www.greatplainspva.org/site/)'),
  ('HOPE Inc.',
   '[hopeinc.org](https://www.hopeinc.org)',
   'Family-centered adaptive sports and recreation in Fargo-Moorhead and Grand Forks',
   'HOPE Inc. provides sport and recreation for children and adults with mobility challenges and their families, serving the Fargo-Moorhead and Grand Forks communities. Family members can use extra adaptive equipment to play alongside their child or sibling.

- Sled hockey, curling, wheelchair tennis, wheelchair soccer and basketball
- Adaptive skiing, swimming, rock climbing, golf, archery and fishing
- Adaptive CrossFit, yoga, dance, cheer, music and theatre
- Track meets and a track club, plus an art club and a fashion show
- Adaptive sport equipment rental

Started by five families in December 2005.

[hopeinc.org](https://www.hopeinc.org)'),
  ('The Center for Individuals with Physical Challenges',
   '[tulsacenter.org](https://www.tulsacenter.org/)',
   'Adaptive fitness, sports and recreation for people with physical challenges in Tulsa',
   'The Center for Individuals with Physical Challenges is a member-based center in Tulsa. Its tagline: "Dedicated to providing opportunities for individuals with physical challenges to enhance their quality of life." Members have a primary mobility, dexterity or sensory challenge, including spinal cord injury.

- An adaptive fitness center, indoor track, therapy pool and classes such as seated aerobics and yoga
- Adaptive sports including cycling, climbing, air rifle, boccia, goalball, power soccer, and wheelchair softball, basketball and racing
- **Transition Services:** help for people with a newly-acquired challenge to build the skills to function independently
- Youth programming and adaptive recreation, including arts, crafts, horticulture and computers
- Deaf and hard of hearing services, including sign language interpreters

Established in 1957, based in Tulsa.

[tulsacenter.org](https://www.tulsacenter.org/)'),
  ('University of Texas at Arlington',
   '[uta.edu](https://www.uta.edu/student-affairs/movin-mavs/recreation/adaptive-athletics)',
   'Adapted sports and recreation for students with disabilities at UT Arlington',
   'The University of Texas at Arlington''s Adapted Athletics program, part of Movin'' Mavs, is open to any student with a disability who wants to train for or compete in an adapted sport. Students without disabilities can join as allies.

- **Adapted Athletic Sport Club:** members currently in adapted track and field
- The Mavericks With Disabilities Student Organization
- Past student athletes in swimming, wheelchair rugby, sled hockey, hand cycling and wheelchair tennis
- Movin'' Mavs and Lady Movin'' Mavs teams, plus adapted recreation, camps and clinics

Based in Arlington, Texas.

[uta.edu](https://www.uta.edu/student-affairs/movin-mavs/recreation/adaptive-athletics)'),
  ('North Texas Fully Charged Power Soccer',
   '[ntfullycharged.org](https://ntfullycharged.org/about-us/)',
   'Power soccer for power wheelchair users in the Dallas-Fort Worth area',
   'North Texas Fully Charged (NTFC) is the power soccer team of the Dallas / Fort Worth metroplex. Its mission is "to enhance the lives of people with physical disabilities through sport, recreation and competition."

- Power soccer for youth and adult power wheelchair users
- Aims to field recreational, non-sanctioned and sanctioned teams, the three levels recognized by USPSA
- Regular practice at the physical education building of UT Arlington
- A support community for youth and adult athletes

Founded by Kristin and Joseph Villegas, based in the Dallas / Fort Worth area.

[ntfullycharged.org](https://ntfullycharged.org/about-us/)'),
  ('RISE Adaptive Sports',
   '[riseadaptivesports.org](https://www.riseadaptivesports.org/)',
   'Free adaptive water sports, wheelchair rugby and camping in Dallas-Fort Worth',
   'RISE Adaptive Sports offers free adaptive recreation for people with disabilities and their families across Dallas–Fort Worth, at Lake Grapevine and in Irving. "Adaptive recreation for people with disabilities and their families — on the water, in the gym, and around the campfire."

- Boating, tubing, water skiing, wakeboarding, wakesurfing, kayaking and fishing on Lake Grapevine
- Five accessible campsites at Meadowmere Park, plus handcycling
- Wheelchair rugby with the Irving Outlaws, with loaner rugby chairs for beginners
- **Irving Outlaws Wheelchair Football Club:** plays in Move United''s USA Wheelchair Football League
- Adaptive open gym with pickleball and sit volleyball

Established in 2007.

[riseadaptivesports.org](https://www.riseadaptivesports.org/)'),
  ('Fencing Institute of Texas',
   '[fenceintexas.org](https://fenceintexas.org/)',
   'Fencing school with parafencing for wheelchair users in the Dallas-Fort Worth area',
   'The Fencing Institute of Texas (FIT) is a nonprofit fencing school for the DFW area, teaching foil and epee from recreational to Olympic level, with parafencing for wheelchair athletes. It is a designated Paralympic Sport Club for fencing.

- **Blind and Parafencing:** adaptive sport and wheelchair fencing
- Reduced-fee introductory lessons for first-time fencers
- Youth, adult fitness and competitive team classes
- Victorian (historical) fencing, home school and off-campus PE programs
- Camps, seminars and club tournaments

[fenceintexas.org](https://fenceintexas.org/)'),
  ('San Antonio Sled Hockey Association',
   '[sanantoniosledhockey.org](https://www.sanantoniosledhockey.org/)',
   'Sled hockey programs near San Antonio, Texas',
   'San Antonio Sled Hockey Association is a public charity that establishes and maintains sled hockey programs near San Antonio, Texas. Players sit in specially designed sleds on two skate blades and use two sticks to propel themselves.

- Ice time for practice
- Sled hockey equipment
- Travel to tournaments and games
- Plans to begin hosting tournaments in 2027

[sanantoniosledhockey.org](https://www.sanantoniosledhockey.org/)'),
  ('Dallas Jr. Wheelchair Mavericks Basketball',
   '[dallasjuniorwheelchairmavericks.org](https://www.dallasjuniorwheelchairmavericks.org/)',
   'Wheelchair basketball for children with physical disabilities in Dallas',
   'The Dallas Junior Wheelchair Mavericks run a wheelchair basketball program for children with physical disabilities. Its mission is "to offer a competitive and recreational atmosphere in which children with physical disabilities can have a happy and healthier lifestyle."

- **Futures:** for first-time players, with more one-on-one instruction
- **Prep** and two **Varsity** teams, up to age 18
- Practices in Irving and Dallas
- Sports chairs, equipment, travel and athlete scholarships funded by donations

Junior wheelchair basketball here since 1979, under the Mavericks name since 2006.

[dallasjuniorwheelchairmavericks.org](https://www.dallasjuniorwheelchairmavericks.org/)'),
  ('Irving (Dallas) Outlaws Wheelchair Football Team',
   '[sites.google.com](https://sites.google.com/riseadaptivesports.org/cowboys-wheelchair-football/dallas-cowboys-wheelchair-football-club)',
   'Competitive wheelchair football team in the USA Wheelchair Football League',
   'The Irving Outlaws Wheelchair Football Club is a program of RISE Adaptive Sports, "providing a platform for competitive wheelchair football within the USA Wheelchair Football League." The league, supported by Move United, is for adults with physical disabilities.

- Competitive wheelchair football for adults with physical disabilities
- Tournament play in the USA Wheelchair Football League
- 2023 USA Wheelchair Football League champions

[sites.google.com](https://sites.google.com/riseadaptivesports.org/cowboys-wheelchair-football/dallas-cowboys-wheelchair-football-club)'),
  ('Texas Parasport Games',
   '[texasparasportgames.com](https://www.texasparasportgames.com/)',
   'Statewide multi-sport adaptive competition run by Texas Parasport',
   'The Texas Parasport Games (formerly the Texas Regional Games) are a multi-sport adaptive competition organized by Texas Parasport, a nonprofit serving athletes with disabilities across Texas. The Games are part of the Move United Hartford Competition Series.

- Track and field, including WPA-approved events
- Swimming, powerlifting and rowing
- Wheelchair and para standing tennis, with adult and junior divisions
- Airguns, archery and boccia, with novice, advanced and youth divisions

Organized by Texas Parasport since 2011.

[texasparasportgames.com](https://www.texasparasportgames.com/)'),
  ('Morgan’s Wonderland',
   '[morganswonderland.org](https://morganswonderland.org/)',
   'Nonprofit theme park and water park in San Antonio built for everyone',
   'Morgan''s Wonderland is a nonprofit theme park in San Antonio, Texas, "Where EVERYONE Comes To Play!" It is designed with ages 2 to 12 in mind, with fun for the whole family.

- More than 25 attractions and shaded playgrounds
- A water park
- Events and field trips
- Season passes with unlimited visits

[morganswonderland.org](https://morganswonderland.org/)'),
  ('Texas Parasport',
   '[texasparasport.org](https://www.texasparasport.org/)',
   'Statewide adaptive sports network connecting Texans with disabilities to sport',
   'Texas Parasport is a statewide network that connects athletes with disabilities to adaptive sports programs, equipment, coaching, competitions, grants and partners across Texas. Its mission: "Empower individuals with disabilities through the power of parasports."

- Events including All Can Ski, Metal and Muscle, the Texas Parasport Games and a track and field clinic
- Military programs and weekly programs in San Antonio
- UIL school sports support, including a racing chair loan
- A directory of more than 40 adaptive sports programs across Texas
- Equipment loans and a national competition grant

Working since 2010.

[texasparasport.org](https://www.texasparasport.org/)'),
  ('Texas Rowing for All',
   '[texasrowingforall.org](https://www.texasrowingforall.org)',
   'Inclusive rowing and paddling for people with disabilities in Austin',
   'Texas Rowing for All offers rowing and paddling for people with physical, sensory and intellectual disabilities, based at the Texas Rowing Center in Austin. Its programs "build self-esteem, confidence, fitness and lasting friendships" through inclusive rowing and paddling.

- Individual and group rowing and paddling lessons for people with physical disabilities
- Lessons for people with sensory or intellectual disabilities
- **Dangerous Athletes:** a recreational and competitive crew for people with intellectual disabilities
- Adaptive rowing for veterans and active military members
- Summer and spring break day camps

Co-founded in 2009, based in Austin.

[texasrowingforall.org](https://www.texasrowingforall.org)'),
  ('Midwest Adaptive Sports',
   '[midwestadaptivesports.org](https://midwestadaptivesports.org/)',
   'Adaptive recreational and competitive sports in the Kansas City area',
   'Midwest Adaptive Sports is Kansas City''s adaptive sports organization, a nonprofit serving people with physical, cognitive, emotional or behavioral challenges through recreational and competitive sports. It serves the Greater Kansas City area and beyond.

- Wheelchair basketball, football, rugby, softball and tennis
- Youth wheelchair basketball and youth wheelchair softball
- Snow sports, water sports and adaptive pickleball
- **Athletes on Wheels Camps** and **Educate the Educators**

Active since 2011, based in Kansas City, Missouri.

[midwestadaptivesports.org](https://midwestadaptivesports.org/)'),
  ('The Whole Person',
   '[thewholeperson.org](https://thewholeperson.org/)',
   'Kansas City disability resource center for independence and in-home support',
   'The Whole Person connects people with disabilities to resources, supports their independence and works for positive change in the Kansas City community, with offices in Kansas City, Missouri, Kansas City, Kansas and St. Joseph.

- **Show-Me Home:** helps Missourians with physical disabilities move from nursing homes to independent community living
- **Missouri Consumer Directed Services:** people with disabilities hire, train and supervise their own caregiver
- Youth transition programs and virtual classes for students with disabilities
- Peer support groups, including mental health, brain injury and Getting Social groups

[thewholeperson.org](https://thewholeperson.org/)'),
  ('Adaptive Sports Iowa',
   '[adaptivesportsiowa.org](https://www.adaptivesportsiowa.org/)',
   'Free adaptive sports for people with physical or visual disabilities in Iowa',
   'Adaptive Sports Iowa offers competitive and recreational activities for people with physical or visual disabilities across Iowa, from beginners to seasoned pros, with no programming or equipment fees.

- Wheelchair basketball, wheelchair tennis, youth sled hockey and track and field
- A cycling team that rides RAGBRAI, plus beep baseball
- A veteran airgun program and adaptive fitness
- Outdoor recreation days with adaptive bikes, kayaks, fishing gear and beach wheelchairs
- The Iowa Games

[adaptivesportsiowa.org](https://www.adaptivesportsiowa.org/)'),
  ('Ozark Adaptive Sports Association',
   '[ozasa.org](https://www.ozasa.org)',
   'Adaptive sports and recreation for people with physical disabilities in Northwest Arkansas',
   'Ozark Adaptive Sports Association (OZASA) is a nonprofit for people with physical disabilities in the Greater Northwest Arkansas area. Its mission is "to provide opportunities for individuals to stay active, engaged, and involved in adaptive sports, fostering a strong and inclusive community."

- Adaptive cycling and adaptive mountain biking
- Wheelchair basketball, tennis and pickleball
- Archery, fishing and bowling
- Equipment available if needed

Founded in 2019, based in Rogers, Arkansas.

[ozasa.org](https://www.ozasa.org)'),
  ('US Electric Wheelchair Hockey Association',
   '[powerhockey.com](https://www.powerhockey.com)',
   'National power wheelchair hockey association and leagues',
   'The U.S. Electric Wheelchair Hockey Association (PowerHockey USA) is a nonprofit and Move United member for people who use a power wheelchair in daily life. Its mission: "To provide a quality hockey program for persons who require the use of an electric (power) wheelchair in daily life."

- **PowerHockey:** hockey with adapted rules so anyone in a power wheelchair can play
- A competitive sport for people without the upper body strength for other wheelchair sports
- Existing leagues to join as a player or volunteer
- Support for people and organizations starting new teams or leagues
- The PowerHockey Cup

[powerhockey.com](https://www.powerhockey.com)'),
  ('Rowing for All in the Twin Cities Minnesota',
   '[nscrmn.org](https://www.nscrmn.org/)',
   'Year-round adaptive rowing for people with physical disabilities in the Twin Cities',
   'North Star Community Rowing expands access to rowing in the Twin Cities, Minnesota, including for adults and adolescents with physical disabilities. Its mission: it "empowers individuals, transforms lives and builds community through the sport of rowing."

- An adaptive program for rowers with spinal cord injury, stroke, amputation, degenerative diseases and visual impairment
- Boats customized for accessibility based on individual need
- Indoor rowing for adaptive athletes, with no experience needed
- Indoor and on-the-water rowing for veterans as a Freedom Rows organization
- Learn to Row sessions for community members of all ages

Based in Minneapolis.

[nscrmn.org](https://www.nscrmn.org/)'),
  ('Houston Apollos Wheelchair Lacrosse',
   '[houstonadaptedsportsclub.org](https://houstonadaptedsportsclub.org/)',
   'Houston adapted sports club with the Apollos wheelchair lacrosse team',
   'The Houston Adapted Sports Club runs the Houston Apollos wheelchair lacrosse team, a wheelchair sports camp and the Metal and Muscle Expo. Its mission "is to enhance the opportunities for Adaptive Sports in the Houston area." The nonprofit launched in 2018.

[houstonadaptedsportsclub.org](https://houstonadaptedsportsclub.org/)'),
  ('TIRR Memorial Hermann Rehabilitation and Research',
   '[tirr.memorialhermann.org](https://tirr.memorialhermann.org/patient-resources/adaptive-sports/)',
   'Hospital adapted sports and recreation for youth and adults with physical disabilities',
   'TIRR Memorial Hermann''s Adapted Sports and Recreation program gives youth and adults with physical disabilities ways to play sports competitively and recreationally, and aims to bridge the gap from rehabilitation to community activity. Its core value is "to support independence and inclusion."

- Wheelchair basketball, wheelchair rugby, wheelchair softball and wheelchair racing
- Handcycling, seated throw and field events, powerlifting, tennis and fitness programs
- **Junior Hotwheels:** competitive youth wheelchair basketball for ages 6 to 19
- Two adult wheelchair rugby teams in the US Wheelchair Rugby Association league, traditional and low point
- An adaptive recreation, leisure, sports and arts guide

[memorialhermann.org](https://memorialhermann.org/services/specialties/tirr/patients-visitors/adapted-sports)'),
  ('Bee Abled',
   '[beeabled.org](https://www.beeabled.org/)',
   'Volunteer-run adaptive fitness and sports community for people with disabilities',
   'Bee Abled is a volunteer-run nonprofit for athletes with disabilities, veterans, and their families, friends and caregivers, supporting mental and physical health through sports and social connection. Its mission is "to create and advocate for an adaptive community where the differently abled work towards achieving their fitness goals." It was founded in 2022 by Gloria Suarez, who has lived with paralysis after a spinal cord injury.

[beeabled.org](https://www.beeabled.org/)'),
  ('Star Center',
   '[starcenterlacrosse.org](https://starcenterlacrosse.org/)',
   'Adaptive exercise, para sports and inclusive recreation center in La Crosse',
   'The STAR (Sports, Therapeutic and Adaptive Recreation) Center in La Crosse, Wisconsin, welcomes anyone who finds being active difficult, whether from a physical disability, a neurologic condition or deconditioning. No diagnosis, wheelchair or referral is needed to join.

- Specialized exercise programs using adaptive equipment and machines
- An adaptive strength and conditioning center
- Para sports with adaptive sport wheelchairs, race chairs, sleds and frame runners supplied
- Over 50 hours of classes and programs each week, with free trial classes
- Clinical experiences, internships and preceptorships for university students

Center opened in February 2025, based in La Crosse.

[starcenterlacrosse.org](https://starcenterlacrosse.org/)'),
  ('North American Squirrel Association',
   '[nasasquirrel.org](https://www.nasasquirrel.org/)',
   'Free outdoor recreation for seniors and people with disabilities',
   'The North American Squirrel Association (n.a.s.a.) helps seniors and people with physical disabilities enjoy the outdoors at no cost, through accessible recreation, adaptive equipment and volunteers. As its site puts it, "It''s Really Not About Squirrels".

- Adaptive biking, golfing and track chair outings
- Free adaptive kayaking on Lake Neshonoc, with equipment provided
- Fishing, hunting and pontoon rides
- Sled hockey, snow skiing and water skiing

Running for more than 30 years.

[nasasquirrel.org](https://www.nasasquirrel.org/)'),
  ('Disabled Athlete Sports Association (DASA)',
   '[dasasports.org](https://www.dasasports.org)',
   'Adaptive sports and fitness for children and adults in the St. Louis area',
   'The Disabled Athlete Sports Association (DASA) helps children and adults with physical and visual disabilities through adaptive sports, fitness and community, serving the Greater St. Louis area, Mid-Missouri and the Midwest. It aims to help athletes "find their inner athlete."

- Recreation programs in air rifle, archery, boccia, golf, para powerlifting and rock climbing
- Power soccer, sled hockey, swimming, wheelchair and standing tennis, and track and field
- Competition programs, from first-timers to Paralympic hopefuls
- Camps and clinics, and Ability Gym adaptive training

Founded in 1997 by physical therapist Kelly Behlmann.

[dasasports.org](https://www.dasasports.org)'),
  ('Dairyland Sports',
   '[dairylandsports.org](https://www.dairylandsports.org/ourstory)',
   'Adaptive sports advocacy, programs and events across Wisconsin and the Midwest',
   'Dairyland Sports supports adaptive athletes across Wisconsin and the Midwest by advocating for inclusion, providing education and resources, and supporting athletic development. It aims to be a "one-stop-shop" for adaptive sports in Wisconsin.

- Fitness Foundations, track and field, and swim programs
- Wheelchair and adaptive tennis
- **Dairyland Games:** an annual adaptive sports event, held since 2016
- The Mad City Invitational and Team Dairyland membership
- A resource finder for adaptive sports opportunities

[dairylandsports.org](https://www.dairylandsports.org/ourstory)'),
  ('Central Cross Country Ski Association',
   '[cxcskiing.org](https://www.cxcskiing.org/index.html)',
   'Central Region cross-country ski body with an adaptive skiing program',
   'Central Cross Country Skiing (CXC) is the governing body for cross-country skiing in the 10-state Central Region of the United States and a Paralympic Sport Club. Its CXC Adaptive Program provides skiing for military veterans and people with physical or visual impairments.

- **CXC Adaptive Program:** skiing for veterans and people with physical or visual impairments
- Adaptive air rifle clinics for disabled veterans in Tomah, Wisconsin, with Paralyzed Veterans of America
- Pathways to the U.S. Paralympic Nordic Ski Team
- Races and youth programs across the Midwest

Based in Madison, Wisconsin.

[cxcskiing.org](https://www.cxcskiing.org/index.html)'),
  ('Wisconsin Adaptive Sports Association (WASA)',
   '[wasa.org](https://www.wasa.org/)',
   'Wisconsin''s largest adaptive sports group, from first tries to Paralympic teams',
   'The Wisconsin Adaptive Sports Association (WASA) serves people with physical disabilities or visual impairments through adaptive sport, recreation, fitness and education. It calls itself "Wisconsin''s Biggest Adaptive Sports Organization".

- 11 adaptive sports and fitness programs for children and adults, recreational to highly competitive
- TryIt events where anyone can try adaptive sports, with equipment and instructors provided
- Free registration for veterans, plus **HeroFit: Operation Deep Health** for veterans with disabilities
- School programs, including PE Takeovers, PE TryIts and mini mobility sessions

Based in Brookfield, Wisconsin.

[wasa.org](https://www.wasa.org/)'),
  ('Southeast Association for Special Parks and Recreation (SEASPAR)',
   '[seaspar.org](https://www.seaspar.org/adapted-sports/)',
   'Adapted sports for people with physical disabilities around Downers Grove, Illinois',
   'SEASPAR (Southeast Association for Special Parks and Recreation) is an Illinois special recreation association serving 13 member communities with therapeutic recreation for all ages and disabilities. Its adapted sports program is a Paralympics Club for youth and adults with physical disabilities.

- Seasonal training in power soccer, sled hockey and wheelchair softball
- Wheelchair table tennis, adapted boccia and goalball
- Revelation Golf
- Clinics and competitions hosted with other agencies

Based in Downers Grove, Illinois.

[seaspar.org](https://www.seaspar.org/adapted-sports/)'),
  ('Baton Rouge Wheelchair Tennis Association',
   '[brwta.org](https://brwta.org/)',
   'All-volunteer group promoting wheelchair tennis around Baton Rouge',
   'The Baton Rouge Wheelchair Tennis Association is "a non-profit, all-volunteer 501c3 organization dedicated to promoting the sport of wheelchair tennis" in the Greater Baton Rouge Area.

- **Cajun Classic:** one of the largest ITF wheelchair tennis tournaments in the world
- **Hallowheel:** fundraising tournaments in tennis and pickleball for the Cajun Classic
- Beginner''s adapted tennis carnivals

It began in 1983 in Natchez, MS, and is based in the Greater Baton Rouge Area.

[brwta.org](https://brwta.org/)'),
  ('Great Lakes Adaptive Sports Association (GLASA)',
   '[glasa.org](https://www.glasa.org/)',
   'More than 20 adaptive sports for ages 3 to 75+ with physical or visual disabilities',
   'The Great Lakes Adaptive Sports Association (GLASA) supports youth, adults and injured military with physical or visual disabilities, including spinal cord injury, through inclusive adaptive sports. It "strives to ensure no one sits on the sidelines", and no one is turned away for inability to pay.

- More than 20 sports, including wheelchair basketball, wheelchair football, sled hockey, power soccer and track and field
- Programs for manual and power wheelchair users and people with ambulatory disabilities, plus injured military veterans
- Equipment lending, including sport and racing wheelchairs and handcycles
- **Great Lakes Games:** a multi-day competition from developmental to elite Paralympic athletes
- **Ability Awareness Program:** school and community outreach on adaptive sports

Founded in 1999 by Cindy Housner, based in Lake Forest, Illinois.

[glasa.org](https://www.glasa.org/)'),
  ('Dare2Tri',
   '[dare2tri.org](https://www.dare2tri.org)',
   'Adaptive swimming, cycling, running and paratriathlon, based in Chicago',
   'Dare2tri is a Chicago-based nonprofit for people with physical disabilities and visual impairments. Its mission: "To enhance the lives of individuals with physical disabilities and visual impairments by building confidence, community, health, and wellness through swimming, biking, and running".

- Free weekly practices and mobile cycling clinics
- **Learn2Tri** and **Train2Race** camps
- **Veterans2Victory:** hybrid training built by veterans for veterans
- **Ron Weinert Ability Fund:** equipment such as racing wheelchairs and handcycles
- Elite, development and club teams

Founded in 2011 by Keri Serota, Dan Tun and Paralympian Melissa Stockwell, based in Chicago.

[dare2tri.org](https://www.dare2tri.org)'),
  ('Chicago Park District',
   '[chicagoparkdistrict.com](https://www.chicagoparkdistrict.com/special-recreation-programs)',
   'City park district wheelchair sports and adaptive recreation across Chicago',
   'The Chicago Park District''s Special Recreation programs serve Chicagoans with disabilities. Its adaptive sports and recreation programs are for people with a primary physical disability or who are blind or visually impaired.

- Wheelchair sports and other adaptive sports and recreation
- Programs for people who are blind or visually impaired, or deaf or hard of hearing
- Veteran and military programs
- Inclusion services, after an assessment, for people with disabilities in other programs
- Sports, recreation and Special Olympics training for people with intellectual disabilities

[chicagoparkdistrict.com](https://www.chicagoparkdistrict.com/special-recreation-programs)'),
  ('Catalyst Sports',
   '[catalystsports.org](https://www.catalystsports.org/)',
   'Adaptive climbing, cycling, kayaking and more in 14 Southeast locations',
   'Catalyst Sports is a nonprofit giving people with physical disabilities "access to the life-changing impact of adventure within a supportive and inclusive community", through local chapters in 14 locations across the Southeast.

- Climbing, cycling and mountain biking
- Kayaking, hiking and adaptive skiing
- Veterans programs
- An adaptive bike shop for custom adaptive bikes
- **Adaptive Ski Week:** a learn to ski and snowboard event at Beech Mountain Resort, North Carolina

Based in Atlanta.

[catalystsports.org](https://www.catalystsports.org/)'),
  ('SMCL Foundation & Associates Inc.',
   '[smclf.org](https://smclf.org/)',
   'Adaptive sports, including wheelchair football and tennis, in Greater New Orleans',
   'The SMCL Foundation & Associates is a New Orleans nonprofit that runs adaptive and Paralympic sports and community services for military veterans, people with disabilities and those who are economically challenged. It works with Paralympic Sport Club New Orleans and the Greater New Orleans Wheelchair Athletic Association.

- **New Orleans Saints Wheelchair Football** team
- Inclusive adaptive basketball and tennis programs
- Adaptive sports clinics, including air rifle, bowling and adaptive skate
- **Field of Hope:** adaptive physical education for students in Jefferson Parish
- Community health fairs and a Toys for Tots giveaway

Established in 2006, based in New Orleans.

[smclf.org](https://smclf.org/)'),
  ('Rehabilitation Hospital of Indiana',
   '[rhirehab.com](https://www.rhirehab.com/our-programs/community-reintegration/adaptive-sports-program/)',
   'Hospital adaptive sports program for people with physical disabilities in central Indiana',
   'The Adaptive Sports Program at Rehabilitation Hospital of Indiana (RHI) is the primary provider of adaptive sports for people with disabilities in central Indiana, in Indianapolis and surrounding areas. It serves youth and adults with spinal cord injury, amputation, brain injury, visual impairment and other physical disabilities, both competitive and non-competitive.

- Team sports including wheelchair basketball, wheelchair tennis, power soccer, quad rugby, sled hockey and wheelchair lacrosse
- Elite and Paralympic athletes in fencing, archery, water skiing, paratriathlon, racing and para-powerlifting
- Recreational clinics nearly twice a month, including adaptive yoga, boxing for veterans and adaptive golf
- Two annual adaptive water ski clinics
- Grants information for athletes

Began in 1996, based in Indianapolis.

[rhirehab.com](https://www.rhirehab.com/our-programs/community-reintegration/adaptive-sports-program/)'),
  ('Mary Free Bed Wheelchair and Adaptive Sports',
   '[maryfreebed.com](https://www.maryfreebed.com/services/wheelchair-adaptive-sports/)',
   'Hospital wheelchair and adaptive sports program for all ages',
   'The Mary Free Bed Wheelchair and Adaptive Sports program is "one of the largest programs of its kind in the United States", offering recreation every year to hundreds of people with disabilities of all ages.

- Wheelchair basketball, rugby, tennis, lacrosse and softball
- Sled hockey and goalball
- **Overdrive:** a power soccer team for power wheelchair users
- A handcycling team that rides weekly, with race options
- Classes, clinics and adaptive sports grant information

[maryfreebed.com](https://www.maryfreebed.com/services/wheelchair-adaptive-sports/)'),
  ('Indiana Disabled Hockey',
   '[indysledhockey.org](https://indysledhockey.org/)',
   'Free sled hockey and blind hockey for kids and adults in Indianapolis',
   'Indiana Disabled Hockey brings sled hockey and blind hockey to Indianapolis. It is a nonprofit registered with USA Hockey, with the motto "On Ice There Are No Disabilities."

- **Indy Steel:** a sled hockey program for children 5 to 18 and adults
- **Indiana Blind Hockey**
- Free try-hockey sessions, with equipment provided
- Free recreational and competitive play, including tournament registration

[indysledhockey.org](https://indysledhockey.org/)'),
  ('Bowling Green Parks & Recreation-Special Populations Adaptive Sports',
   '[bgky.org](https://www.bgky.org/bgpr/special-populations)',
   'City adaptive sports, including wheelchair basketball, in Bowling Green, Kentucky',
   'Bowling Green Parks and Recreation''s Adaptive Recreation division runs Adaptive Sports of South Central Kentucky, a competitive and recreational adapted sports program for people with eligible disabilities in Bowling Green, Kentucky.

- Wheelchair basketball
- Wheelchair tennis
- Goalball
- Year-round Special Olympics sports for children and adults with intellectual disabilities

[bgky.org](https://www.bgky.org/bgpr/special-populations)'),
  ('Gathering Strength',
   '[gatheringstrength.org](https://gatheringstrength.org/)',
   'Disability-led health, fitness and access group in Louisville',
   'Gathering Strength is a disability-led nonprofit in Louisville, Kentucky. Its mission is to "Empower People With Disabilities To Achieve Better Health, Increase Self-Sufficiency, And Become More Engaged In The Community."

- Seated health and wellness classes, including strength and endurance, mindful movement, and cardio and core
- **Adaptive Recreation Showcase:** a free event to try wheelchair basketball, rugby, fencing, handcycling and more
- Financial workshops and social gatherings
- An accessible places map and advocacy for accessible housing, parking and paratransit
- Fitness and wellness resources for people living with spinal cord injury or stroke

Founded in 2018 by Elizabeth Fust, based in Louisville.

[gatheringstrength.org](https://gatheringstrength.org/)'),
  ('Louisville Lightning',
   '[sites.google.com](https://sites.google.com/jefferson.kyschools.us/athletic-directors/adapted-sports-program)',
   'School adapted sports for K-12 students with physical disabilities in Louisville',
   'Louisville Lightning is the JCPS district-wide adapted sports program for students in kindergarten through 12th grade with physical disabilities, such as spinal cord injury, amputation, spina bifida or cerebral palsy. Athletes do not have to be wheelchair users.

- Wheelchair basketball, archery and boccia
- Seated and ambulatory track and field
- All sports equipment, including sport wheelchairs, provided at no cost
- No experience needed

[sites.google.com](https://sites.google.com/jefferson.kyschools.us/athletic-directors/adapted-sports-program)'),
  ('Turnstone Center',
   '[turnstone.org](https://turnstone.org/sports)',
   'Adaptive sports from first try to Paralympic level in Fort Wayne, Indiana',
   'Turnstone offers adaptive sports for youth from age 5, adults and veterans with physical, visual, intellectual or developmental disabilities, from first-time athletes to Paralympic competitors. An athlete does not need to be a daily wheelchair user to play wheelchair sports.

- Competitive wheelchair basketball, wheelchair rugby, power soccer, sled hockey and track and field
- A USOPC training site and the Endeavor Games
- Recreation including open gym, air rifle, boccia and cycling
- Camps with the YMCA, plus veterans'' socials
- Equipment loans, support groups, fitness and aquatics

Based in Fort Wayne.

[turnstone.org](https://turnstone.org/sports)'),
  ('The Bridge Adaptive Sports & Recreation',
   '[thebridgeadaptive.org](https://www.thebridgeadaptive.org/)',
   'Adaptive sports, Try-It days and equipment loans in Greater Cincinnati',
   'The Bridge Adaptive Sports & Recreation connects people with disabilities in Greater Cincinnati to over 20 adaptive sports and recreation opportunities. Its mission is "to increase awareness and promote opportunities for individuals with disabilities to participate in adaptive sports and recreation, thereby improving their quality of life."

- Regular programs from soccer to handcycling to kayaking
- Try-It days to test new sports
- An equipment loan program
- Partner programs on the court, trail and water

[thebridgeadaptive.org](https://www.thebridgeadaptive.org/)'),
  ('Cincinnati Dragons',
   '[cincinnatidragons.com](https://cincinnatidragons.com)',
   'Youth wheelchair basketball team in Greater Cincinnati',
   'The Cincinnati Dragons are a youth wheelchair basketball team in Greater Cincinnati, run by the volunteer-powered Greater Cincinnati Adapted Sports Club. Players from elementary to high school age compete in the National Wheelchair Basketball Association''s Junior Division.

- A 14 and under team in the NWBA Prep Division
- A high school and under team in the NWBA Varsity Division
- Travel to tournaments throughout the Midwest and beyond
- Sports wheelchairs and travel funded so money is not an obstacle for players

Founded in 2014 by Paralympian Jacob Counts.

[cincinnatidragons.com](https://cincinnatidragons.com)'),
  ('Michigan Sports Unlimited',
   '[michigansportsunlimited.com](https://michigansportsunlimited.com/)',
   'Adaptive sports clinics, equipment loans and the Thunder in the Valley Games',
   'Michigan Sports Unlimited (MSU) is a nonprofit working to make sports and recreation accessible and inclusive for people with disabilities, welcoming children, adults, veterans and beginners. It is "committed to educating, instructing, and providing unlimited access to a wide range of recreational activities."

- **Thunder in the Valley Games:** a competition for people with physical disabilities, of all ages and abilities
- Sports clinics and events
- An equipment loan closet with handcycles, basketball and tennis chairs, skis and anti-tip kayaks
- A resource and referral program for adaptive sports across Michigan
- Peer mentoring

Since 2002, based in Essexville, Michigan.

[michigansportsunlimited.com](https://michigansportsunlimited.com/)'),
  ('University of Michigan Adaptive Sport and Fitness',
   '[umadaptivesports.com](https://www.umadaptivesports.com/)',
   'University of Michigan competitive adaptive sports teams in Ann Arbor',
   'University of Michigan Adaptive Sports & Fitness works to increase awareness of, access to and participation in adaptive sports and fitness among people with and without disabilities at the university and in the greater Ann Arbor community.

- Competitive wheelchair basketball and wheelchair rugby teams
- Competitive wheelchair tennis and adaptive track and field teams
- Two community initiatives to grow adaptive sports in Ann Arbor and beyond

Established in 2018, based in Ann Arbor.

[umadaptivesports.com](https://www.umadaptivesports.com/)'),
  ('Michigan Youth Sled Hockey',
   '[metrodetroitsledhockey.org](https://www.metrodetroitsledhockey.org/)',
   'Youth and adult sled hockey teams in Metro Detroit',
   'Metro Detroit Sled Hockey is a nonprofit giving people with physical disabilities the chance to play sled hockey, from brand-new skaters to athletes pursuing the Paralympic Games. Its mission: "Provide the opportunity for any disabled athlete to reach their full potential on and off the ice."

- Four teams for youth and adult athletes, including the region''s first youth competitive sled hockey program
- Adult players as mentors for younger players
- Equipment loans and financial support to reduce barriers
- Outreach, advocacy and community events

Founded in 2018 by a group of parents, based in Brighton, Michigan.

[metrodetroitsledhockey.org](https://www.metrodetroitsledhockey.org/)'),
  ('Aimee Copeland Foundation',
   '[aimeecopelandfoundation.org](https://aimeecopelandfoundation.org/)',
   'Free all-terrain wheelchairs at Georgia State Parks, plus outdoor and wellness programs',
   'The Aimee Copeland Foundation helps people of all abilities lead fulfilling lives by connecting with nature and community. It is led by Aimee Copeland, a licensed master social worker, quadruple amputee and necrotizing fasciitis survivor.

- **All Terrain Georgia:** free all-terrain wheelchair rentals at select Georgia State Parks
- Accessible outdoor recreation, retreats and workshops, with mindfulness retreat scholarships
- Individual and group counseling for people affected by physical and mental health disabilities
- Wheelchair accessible vehicle giveaways

[aimeecopelandfoundation.org](https://aimeecopelandfoundation.org/)'),
  ('Youth Challenge',
   '[youthchallengesports.com](https://www.youthchallengesports.com)',
   'Free adapted sports, recreation and art for young people, with teen volunteers',
   'Youth Challenge brings kids with and without physical disabilities together "for free adapted sports, recreation, and art activities." It serves over 150 young people with physical disabilities, including cerebral palsy, spinal cord injuries and visual impairments, each paired 1:1 with a trained teen volunteer.

- Sports including pickleball, basketball, football, soccer, swimming, boccia, bowling, skiing and weightlifting
- Outdoor programs: archery, hiking, kayaking, handcycling, gardening and nature
- Art and life-skills programs, all at no cost to families
- Programs for adults too

Founded in 1976, based in Westlake, Ohio.

[youthchallengesports.com](https://youthchallengesports.com/)'),
  ('Adaptive Sports Ohio (ASO)',
   '[adaptivesportsohio.org](https://www.adaptivesportsohio.org)',
   'Community and school adaptive sports for people with physical disabilities in Ohio',
   'Adaptive Sports Ohio offers community-based and interscholastic adaptive sports for people of all ages with physical disabilities, with community programs in Wayne, Cuyahoga, Mahoning and Lucas Counties. It works to "remove barriers to ensure that individuals with physical disabilities have a chance to play".

- Power wheelchair soccer in Wooster, Youngstown and Cleveland, plus the competitive travel team Team Force
- Sled hockey with four adult/junior teams: Cleveland Monsters, Wooster Wildcats, Youngstown Boom and Toledo Walleye
- Wheelchair basketball, with programs open to disabled veterans and many disability types
- Interscholastic adaptive sports, plus camps and clinics such as Dream Camp
- A large inventory of adaptive sports equipment to use at each program

Headquartered in Wooster, with satellite offices in Warrensville Heights and Austintown.

[adaptivesportsohio.org](https://www.adaptivesportsohio.org)'),
  ('Charleston Sled Hockey',
   '[charlestonwvsledhockey.com](https://charlestonwvsledhockey.com/)',
   'Noncompetitive sled hockey for youth and adults, with gear loaned',
   'The Charleston Thunder, a nonprofit, offers sled hockey "to youth and adults who are unable to skate in a standing position due to a physical disability." It is a non-travel, noncompetitive team that practices at the South Charleston Memorial Ice Arena.

- Each player is loaned a sled, sticks, a wheeled bag and protective gear
- The only cost to players is the annual USA Hockey fee
- Weekly hour-long practices, late September or early October through March
- Adult and teen volunteers with hockey experience help each week

Formed in 2015, under USA Disabled Hockey.

[charlestonwvsledhockey.com](https://charlestonwvsledhockey.com/)'),
  ('FAAST',
   '[faast.org](https://faast.org/)',
   'Assistive technology loans, demos and training for Floridians with disabilities',
   'FAAST (Florida Alliance for Assistive Services and Technology) helps Floridians with disabilities, their families and the professionals who work with them find and get assistive technology. Its mission is "to improve the quality of life for Floridians with disabilities by increasing awareness of and access to assistive technology."

- Short-term device loans at no cost, to help decide what to buy or as a short-term accommodation
- Device demonstrations to compare assistive technology before choosing
- Device reuse, plus a financing program available statewide
- Information and assistance with questions about assistive technology devices and services
- Training and awareness presentations for individuals and groups, in person or at a distance

Based in Tallahassee.

[faast.org](https://faast.org/)'),
  ('Steelwheelers',
   '[steelwheelers.com](https://www.steelwheelers.com/)',
   'Wheelchair rugby, wheelchair basketball and handcycling in the Pittsburgh area',
   'The Pittsburgh Steelwheelers are an independent nonprofit offering adaptive athletic programs for people with physical disabilities from Western Pennsylvania, Eastern Ohio and Northern West Virginia. The organization is "dedicated to providing opportunities for persons with disabilities to participate in competitive sports."

- Wheelchair rugby
- Wheelchair basketball
- Handcycling

Founded in 1977, based in Pittsburgh.

[steelwheelers.com](https://www.steelwheelers.com/)'),
  ('Greater Buffalo Adaptive Sports',
   '[greaterbuffaloadaptivesports.org](https://greaterbuffaloadaptivesports.org/)',
   'Adaptive hockey, curling, tennis and more for people with disabilities around Buffalo',
   'Greater Buffalo Adaptive Sports, formerly The Sled Hockey Foundation, gives people with disabilities in Western New York access to adaptive sports. It aims to help them "develop the social, emotional, and physical confidence necessary to become leaders in the community."

- Hockey
- Football and lacrosse
- Cycling and tennis
- Adaptive curling with the Buffalo Curling Club, January to April, open to youth and adults with physical or cognitive disabilities

[greaterbuffaloadaptivesports.org](https://greaterbuffaloadaptivesports.org/)'),
  ('Charlotte Rollin’ Hornets',
   '[rollinhornets.org](http://rollinhornets.org/)',
   'Junior, adult, women''s and military wheelchair basketball teams in Charlotte',
   'The Charlotte Rollin'' Hornets are a wheelchair basketball program for children and adults with physical disabilities in the Charlotte area. The mission is "to promote independence for both children and adults with physical disabilities and provide opportunities to pursue active, healthy lifestyles in adaptive sports."

- Two junior, four adult, one women''s and two military teams competing in the NWBA
- Tournaments across the country, with a season from August to April
- Half-time exhibitions at NBA and college basketball games around the Carolinas
- Community awareness events for schools, fraternities and scouts
- Backed by Abilities Unlimited of the Carolinas, which has also offered wheelchair track and field, swimming, adaptive golf and wheelchair softball

Charlotte''s program dates back to the Carolina Tarwheels in 1970.

[rollinhornets.org](http://rollinhornets.org/)'),
  ('Waymaker Off Road Wheelchair',
   '[waymakeroffroadwheelchairs.com](https://www.waymakeroffroadwheelchairs.com/)',
   'Free off-road trackchair loans in South Carolina, including at state and county parks',
   'Waymaker Off-road Wheelchairs is a faith-based nonprofit in South Carolina that loans trackchairs, tracked wheelchairs for off-road and uneven terrain, free of charge to anyone with a mobility challenge. It was started by Jacob, who has a spinal cord injury from a 2020 hunting accident.

- Free trackchair loans for pick-up, or with delivery arranged
- Trackchairs to reserve at parks and beaches including Edisto Beach, Folly Beach County Park, Hunting Island, Huntington Beach and Myrtle Beach
- Open to anyone with a mobility challenge, not only full-time wheelchair users
- Events and volunteer opportunities

Based in Lamar, South Carolina.

[waymakeroffroadwheelchairs.com](https://www.waymakeroffroadwheelchairs.com/)'),
  ('Endless Highway, Inc.',
   '[endless-highway.org](https://endless-highway.org/)',
   'Adaptive equipment and inclusive sports, recreation and arts for mobility device users',
   'Endless Highway is a Rochester, New York nonprofit that helps children and adults who use mobility devices take part in adaptive and inclusive sports, recreation and the arts. Its mission: "We empower individuals who use mobility devices to live connected and active lives by cultivating inclusion in sports, recreation, arts, and communities."

- Custom adaptive equipment, such as custom-fitted racing chairs and sports chairs
- Family assistance, project funding, and team and travel sponsorships
- Inclusive experiences, from all-access museum trips to adaptive yoga seminars
- Training, assessments and design consultation on inclusion and accessibility for partners
- The Steve Barbato Memorial Wheelchair Basketball Tournament

Started in 2011 as the Robert A. Tortorella Charitable Trust by Rob Tortorella, who has a cervical spinal cord injury; based in Rochester.

[endless-highway.org](https://endless-highway.org/)'),
  ('WNY Wreckers',
   '[wnywreckers.wixsite.com](https://wnywreckers.wixsite.com/mysite)',
   'Wheelchair rugby team in Rochester, New York',
   'WNY Wreckers is a wheelchair rugby team in Rochester, New York, billed as "The only Wheelchair Rugby team in Upstate NY!" The team holds weekly practices and hosts the Wrecking Ball Tournament.

[wnywreckers.org](https://www.wnywreckers.org/)'),
  ('Penn State Ability Athletics Program and Disability Recreation',
   '[gopsusports.com](https://gopsusports.com/sports/2018/8/8/ability.aspx)',
   'Penn State''s adaptive sled hockey, wheelchair basketball, and track and field',
   'Penn State Adaptive Athletics, formerly Ability Athletics, gives Penn State students with disabilities "the same competitive sporting experiences available to all Penn State students". It serves both elite and recreational student-athletes.

- Sled hockey
- Wheelchair basketball, including a wheelchair basketball camp and the Penn State Wheelchair Basketball Tournament
- Track and field, including indoor meets at the Multi-Sport Facility
- Support for other team and individual sports, depending on student interest
- Adaptive summer camps

[gopsusports.com](https://gopsusports.com/sports/2018/8/8/ability.aspx)'),
  ('Therapeutic Adventures, Inc.',
   '[taonline.org](https://www.taonline.org/)',
   'Volunteer-run adaptive outdoor adventures and sports for all ages and abilities',
   'Therapeutic Adventures, Inc. is an all-volunteer nonprofit offering adaptive outdoor adventures and, through IndependencePlus Adaptive Sports, recreational and competitive adaptive sports. It serves people of all ages with physical and developmental disabilities, disabled veterans and first responders, cancer survivors, and people with complex medical needs.

- Adaptive snow sports: alpine and Nordic skiing, snowshoeing, and guiding for blind and deaf skiers
- Adaptive water sports, including fresh and salt water fly fishing and canoeing
- Outdoor adventures such as camping, climbing, hiking and retreats
- Fitness and wellness: cycling, strength and conditioning, and yoga
- Team sports: wheelchair basketball and sled hockey

Based in Charlottesville, Virginia.

[taonline.org](https://www.taonline.org/)'),
  ('Brooks Rehabilitation Adaptive Sports & Recreation',
   '[brooksrehab.org](https://brooksrehab.org/services/adaptive-sports/)',
   'Adaptive sports and recreation in Jacksonville, from yoga to full contact rugby',
   'Brooks Adaptive Sports and Recreation, part of Brooks Rehabilitation, offers sports and recreation to people with physical, neurological, developmental and visual impairments in Jacksonville, Florida. No experience is needed, and the program provides the equipment, training and adaptations each person needs.

- Up to 15 activities every week, recreational or competitive, from yoga to full contact rugby
- Group cycling on the Jacksonville-Baldwin Rail Trail and yoga at the Brooks Family YMCA
- Activities such as bowling, skeet shooting, bocce and horseback riding
- Virtual programming on Zoom, including yoga and game nights
- Free year-round youth programs for children from newborn to 17, from art and golf to kayaking and ice skating

Launched in 2007, based in Jacksonville.

[brooksadaptivesports.org](https://brooksadaptivesports.org/)'),
  ('Wounded Warriors Abilities Ranch',
   '[woundedwarriorsabilitiesranch.org](https://woundedwarriorsabilitiesranch.org)',
   'Adaptive sports and an accessible park for veterans in Pinellas Park, Florida',
   'Wounded Warriors Abilities Ranch (WWAR) is a nonprofit built to inspire veterans of all conflicts to get out and active, with activities for veterans and the adaptive sports community in the Tampa Bay Area. Its home is Lurie Park, a purpose-built ADA city park.

- Monthly adaptive sports clinics at Lurie Park
- Wheelchair rugby, wheelchair softball, wheelchair basketball, NFL wheelchair football and handcycling
- Sponsorship of the Rollin Warriors adaptive sports team
- A park with handcycling trails, a fishing pond, ADA workout stations and a court designed for wheelchair sports
- Strength and conditioning camps

Founded by veteran Michael Delancey; WWAR was built at Lurie Park with the City of Pinellas Park in 2015.

[woundedwarriorsabilitiesranch.org](https://woundedwarriorsabilitiesranch.org)'),
  ('Top End Sports LLC',
   '[topendsportsllc.com](https://topendsportsllc.com/)',
   'Maker of sports wheelchairs, racing wheelchairs and handcycles',
   'Top End makes and sells sports equipment for wheelchair users, including basketball court chairs, racing wheelchairs and handcycles. Its online store also carries Carbonbike-USA and C7 Concepts products.

- **GOAT Series** basketball wheelchairs, plus the GOAT XT for football and lacrosse
- Eliminator racing wheelchairs and Force handcycles
- **Sport Series:** an entry-level handcycle and racer for youth athletes, adaptive sports programs and schools
- Lifestyle chairs, youth equipment and service parts
- An online Design Lab to view and customize a chair in over 30 colors

[topendsportsllc.com](https://topendsportsllc.com/)'),
  ('Warrior Sailing Program',
   '[warriorsailing.org](https://warriorsailing.org/)',
   'Sailing camps and racing for wounded, ill and injured veterans',
   'The Warrior Sailing Program provides maritime education for wounded, ill and injured veterans, using sailing to support physical and mental health, including for PTSD, brain injury, amputation, paralysis and nerve damage. It is a program of the USMMA Sailing Foundation.

- **Basic Training camps:** three-day sail training camps with coaches trained in adaptive sailing
- **Certification & Training camps** for graduates, with the chance to earn ASA Basic Keelboat Certification
- Racing against top disabled and able-bodied sailors, offshore training and further certifications

[warriorsailing.org](https://warriorsailing.org/)'),
  ('Tampa Bay Buccaneers Wheelchair Football Team',
   '[buccaneers.com](https://www.buccaneers.com/photos/buccaneers-wheelchair-football-team-gallery)',
   'Wheelchair football team in Tampa, introduced by Hillsborough County in 2021',
   'The Buccaneers Wheelchair Football Team is a wheelchair football team in Tampa, Florida. A Tampa Bay Buccaneers photo gallery shows Hillsborough County introducing the team before a practice at All People''s Life Center in September 2021.

[buccaneers.com](https://www.buccaneers.com/photos/buccaneers-wheelchair-football-team-gallery)'),
  ('North Carolina Adapted Sports',
   '[ncadaptedsports.org](https://www.ncadaptedsports.org/programs)',
   'Adapted cycling, climbing, boccia and youth wheelchair basketball in the NC Triangle',
   'North Carolina Adapted Sports (NCAS) is a volunteer and community driven nonprofit offering recreational and competitive sports for people with physical disabilities in the Triangle Area and beyond. Its mission: "NCAS is an inclusive and equitable community for individuals with physical disabilities."

- Adapted off-road cycling on greenways, gravel and mountain trails, with electric assist handcycles, recumbent trikes and an all-electric quad cycle
- Three levels of cycling training, up to becoming an adapted cycling lead rider
- **NCAS Wolves:** youth wheelchair basketball in Cary, ages 6 to high school, with loaner chairs
- Monthly adapted climbing clinics at Triangle Rock Club in Morrisville, with Catalyst Sports
- Boccia at the Taylor Family YMCA in Cary

Founded in 2022.

[ncadaptedsports.org](https://www.ncadaptedsports.org/programs)'),
  ('Adaptive Expeditions',
   '[adaptiveexpeditions.org](https://www.AdaptiveExpeditions.org)',
   'Adaptive paddling instructor training, outdoor recreation and accessibility consulting',
   'Adaptive Expeditions is an educational nonprofit using sport and recreation to offer health and wellness programs to people with physical and sensory disabilities. It also helps businesses, clubs and organizations make outdoor recreation more welcoming.

- **ACA Adaptive Paddling Workshop (APW)** and ACA Advanced Communications Workshop (ACW) for instructors
- Training and certification for adaptive kayaking and adaptive stand-up paddleboarding
- Recreation and fitness: adaptive paddlesports, wheelchair tennis and pickleball, cycling and handcycling, swimming and water safety
- Disability awareness, program accessibility, remote venue access and private consulting
- Online learning courses

[adaptiveexpeditions.org](https://www.AdaptiveExpeditions.org)'),
  ('Pure Light Racing',
   '[purelightracing.org](https://www.purelightracing.org/)',
   'Adaptive outrigger canoe paddling and racing in Hawaii',
   'Pure Light Racing organizes adaptive outrigger canoe paddling for people with physical disabilities in Hawaii, as both recreation and competitive sport. Sessions are open to anyone with a physical disability; for safety, participants must be able to get into the canoe on their own and swim unaided.

- **RAP Day:** recreational adaptive paddling on the 2nd Saturday of every month
- Recreational swimming sessions every two weeks
- The PLR Competition Team, which has raced at the IVF World Sprints and long-distance races like the Molokai Hoe

Began in 2002 as Project Pure Light at Kailua Community Church; became the nonprofit Pure Light Racing in 2012.

[purelightracing.org](https://www.purelightracing.org/)'),
  ('Triangle Thunder',
   '[trianglethunder.org](https://trianglethunder.org/)',
   'Wheelchair basketball team in Raleigh, North Carolina',
   'Triangle Thunder is a wheelchair basketball team in Raleigh, North Carolina, giving people with disabilities "the opportunities and resources needed to become involved in the sport of wheelchair basketball." It holds weekly practices year-round that are open to the public and new players, with loaner basketball chairs for new players.

[trianglethunder.org](https://trianglethunder.org/)'),
  ('Central Florida Dreamplex',
   '[cfldreamplex.com](https://www.cfldreamplex.com/)',
   'Faith-based adaptive sports, therapy and recreation in Clermont and Orlando, Florida',
   'Central Florida Dreamplex serves children and adults with intellectual, developmental and physical disabilities, including spinal cord injury, through sports, recreation, therapy, education and employment opportunities. It has sites in Clermont and Orlando.

- Adaptive sports for youth, adults and veterans with physical disabilities, including wheelchair basketball, power soccer and sled hockey
- Adaptive water skiing and wakeboarding days
- Adaptive outdoor adventures with hiking wheelchairs, fishing and birdwatching
- Traditional and recreational therapies and vocational rehabilitation
- An accessible, adaptive fitness center and the Dreamplex Therapeutic School in Clermont

Opened in 2015 in Clermont.

[cfldreamplex.com](https://www.cfldreamplex.com/)'),
  ('Adaptive Fitness Legion',
   '[adaptivefitnesslegion.org](https://www.adaptivefitnesslegion.org/)',
   'Free adaptive fitness classes, open gym and adaptive sports',
   'Adaptive Fitness Legion is a nonprofit that funds free open gym sessions, fitness classes and adaptive sports, in partnership with DPI Adaptive Fitness. Its focus is helping people with physical disabilities meet their fitness goals.

- Free open gym sessions on Wednesdays, and Super Saturday open gym and classes at DPI Adaptive Fitness
- Free in-person group fitness classes and a weekly virtual class on Zoom
- UABC adaptive boxing
- **Workout Wednesday:** a weekly workout video series on YouTube

[adaptivefitnesslegion.org](https://www.adaptivefitnesslegion.org/)'),
  ('Orlando Magic Wheels',
   '[orlandomagicwheels.org](https://www.orlandomagicwheels.org/)',
   'Wheelchair basketball team in Orlando for athletes with lower limb disabilities',
   'The Orlando Magic Wheels are a wheelchair basketball team in Orlando, Florida, for athletes with lower limb disabilities ranging from amputations to paraplegia. The team is supported by Orlando Wheelchair Games, Inc.

- Competes in NWBA Division III and the Florida Wheelchair Basketball Conference
- Weekly practices in Orlando, where new players are always welcome
- Try an experienced player''s sports chair at practice; the team can talk through ways to get your own
- Open to high school students and older, with no upper age limit
- Away games around Florida, with car pooling

[orlandomagicwheels.org](https://www.orlandomagicwheels.org/)'),
  ('Center Of Recovery & Exercise (CORE)',
   '[coreflorida.com](https://coreflorida.com/)',
   'Activity-based recovery exercise for spinal cord injury and neurological conditions',
   'CORE (Center of Recovery & Exercise) offers activity-based training and other exercise programs for people with spinal cord injuries and other neurological conditions in Altamonte Springs, Florida. Its training focuses on getting clients out of their wheelchair or assistive device to maximize muscle and neural return.

- **Activity-Based Training:** weight bearing, functional electrical stimulation, core strengthening, locomotor training and massed practice
- Pediatric activity-based training and an intensive program
- Aquatic training, amputee training and adaptive fitness
- Rock Steady Boxing Orlando, nutrition and supplemental services
- The CORE Foundation, which gives financial support to people with spinal cord injuries to take part in activity-based recovery

Based in Altamonte Springs.

[coreflorida.com](https://coreflorida.com/)'),
  ('Fairfax Falcons',
   '[fairfaxfalcons.org](https://fairfaxfalcons.org/)',
   'Youth wheelchair basketball across Northern Virginia and the Washington, DC area',
   'The Fairfax Falcons Paralympic Sports Team offers adaptive basketball for youth with physical disabilities across Northern Virginia and the Washington, DC area. "We believe every athlete deserves the chance to play, compete, and belong."

- For ages 4 to 22 who have not graduated high school and have an irreversible lower limb disability, such as spinal cord injury, spina bifida, amputation or cerebral palsy
- Players must push a manual wheelchair unassisted, but not all use wheelchairs every day
- Novice, Prep and Varsity levels, from foundational chair skills to official NWBA divisions
- Alumni have gone on to play in college and compete with Team USA

[fairfaxfalcons.org](https://fairfaxfalcons.org/)'),
  ('Central Florida Tri Club',
   '[cfltriclub.wordpress.com](https://cfltriclub.wordpress.com/)',
   'Triathlon club welcoming beginners, athletes with disabilities and neurodiverse athletes',
   'CFL Tri Club "brings athletes together through swimming, cycling, running, and community." It welcomes beginners, experienced athletes, athletes with disabilities and neurodiverse athletes.

- Coaching in swimming, cycling and running
- A program for neurodiverse athletes since 2018
- **WITS (Warriors in Training):** a youth, junior and neurodiverse program

Founded by Hector Torres over 20 years ago.

[cfltriclub.com](https://cfltriclub.com/)'),
  ('Sheltering Arms',
   '[shelteringarms.com](https://www.shelteringarms.com/)',
   'Adaptive fitness, wellness classes and day recreation for people with disabilities',
   'Sheltering Arms works toward a more accessible and inclusive community for people with physical disabilities, under the phrase "Power to Overcome". Its certified exercise physiologists build customized fitness and wellness plans.

- **NeuroFit:** individualized fitness for people with neurological conditions
- **Adapt2Fit:** one-on-one training for people with temporary or chronic conditions or physical disabilities
- **PowerEx:** semi-supervised exercise to help people move to exercising on their own in the community
- **Club Rec:** supervised adult day recreation with social and wellness activities
- Wellness membership, group exercise and educational classes, plus therapy through Sheltering Arms Institute

[shelteringarms.com](https://www.shelteringarms.com/)'),
  ('Sportable',
   '[sportable.org](https://www.sportable.org/)',
   'Adaptive sports club for people with physical and visual disabilities in Central Virginia',
   'Sportable is an adaptive sports club offering sport, recreation, health and wellness to people with physical disabilities, visual impairments and those requiring physical accommodations throughout Central Virginia. It serves more than 400 athletes a year through competitive and recreational programs.

- Adult basketball and youth varsity and prep basketball
- Cycling, including advanced cycling and the Mid-Atlantic Paracycling Series
- Archery, rock climbing, and road racing and running
- Mindfulness coaching
- Adaptive sports equipment provided to athletes

Founded in 2005, serving the greater Richmond area.

[sportable.org](https://www.sportable.org/)'),
  ('Peak Experiences Adaptive Climbing',
   '[peakexperiences.com](https://www.peakexperiences.com/adaptive-climbing)',
   'Adaptive climbing at Peak Experiences gyms in Richmond and Midlothian, Virginia',
   'Peak Experiences is a climbing gym whose adaptive climbing program offers assisted rope systems and movement training for people with physical and invisible disabilities. It strives to ensure that "everyone, regardless of their abilities, can fully participate and enjoy the sport of climbing."

- **All-Abilities Nights:** weekly adaptive climb time on Sundays, open to people with all forms of disabilities
- Bouldering, top roping, auto belays and the Mechanical Advantage System (MAS) for climbers with physical disabilities or muscle weakness
- Volunteering as a belayer
- Partner organizations including Sportable, Up ENDing Parkinson''s and Beyond Boundaries

Open since 1998, with gyms in Richmond and Midlothian.

[peakexperiences.com](https://www.peakexperiences.com/adaptive-climbing)'),
  ('Medstar National Rehabilitation Network',
   '[medstarnrh.org](https://www.medstarnrh.org/our-services/adaptive-sports-fitness/)',
   'Free adaptive sports and fitness from MedStar National Rehabilitation Hospital',
   'The Adaptive Sports and Fitness program at MedStar National Rehabilitation Hospital helps people with physical disabilities lead healthy, active lives through recreational and competitive sports. Programs are open to anyone in the community with a physical disability at no cost, with coaching, training, equipment and travel assistance.

- **MedStar NRH Punishers:** wheelchair basketball in NWBA Division 1, practicing in Silver Spring, Maryland
- **MedStar NRH United:** wheelchair rugby in the USWRA, with its season in Fairfax, Virginia
- Wheelchair tennis with the Junior Tennis Champions Center in College Park, Maryland, from youth to advanced levels
- Adaptive cycling, sled hockey, boccia, adaptive rowing and adaptive fitness classes
- **SuperH 5K Run, Walk, and Wheel**, which raises money for the program

[medstarhealth.org](https://www.medstarhealth.org/services/adaptive-sports-fitness-program)'),
  ('Oceans of Hope Foundation',
   '[oceansofhopefoundation.org](https://oceansofhopefoundation.org)',
   'Free adaptive surfing and kayaking in New Smyrna Beach, Florida',
   'The Oceans of Hope Foundation is a Florida nonprofit offering free adaptive ocean and water sports, such as surfing and kayaking, for people with limited mobility and physical disabilities. It was founded by Danny Paltjon, a quadriplegic after a spinal cord injury, and surfer Chris Sharpe.

- **Adaptive surfing** on modified, tandem and prone boards with trained volunteers alongside, for ages 8 and up with no experience needed
- **Adaptive kayaking** in kayaks with outriggers for stability
- Beach wheelchairs and help getting on and off the sand
- Family and friends welcome at events, with lunch and water provided

Founded in 2014, based in New Smyrna Beach.

[oohf.net](https://oohf.net/)'),
  ('University of Maryland Rehabilitation & Orthopaedic Institute',
   '[umms.org](https://www.umms.org/rehab/health-services/adapted-sports)',
   'Wheelchair rugby, basketball, tennis and adapted golf in Baltimore',
   'The Adapted Sports Program at the University of Maryland Rehabilitation & Orthopaedic Institute helps people get back to living after a stroke, brain injury, spinal cord injury, amputation or other condition that causes physical limitation. It offers recreational and competitive programs in Baltimore.

- **Maryland Mayhem:** wheelchair rugby for adults, with chairs provided at no cost, and host of the annual Maryland Crab Pot Tournament
- Adapted golf at Forest Park Golf Course: free spring clinics, summer outings and a fall Mix and Mingle tournament
- Open gym wheelchair basketball with Baltimore City Recreation & Parks, with loaner sports chairs
- Wheelchair tennis clinics in three five-week sessions a year

Based in Baltimore.

[umms.org](https://www.umms.org/rehab/health-services/adapted-sports)'),
  ('Chesapeake Region Accessible Boating (CRAB)',
   '[crabsailing.org](https://crabsailing.org/)',
   'Free adaptive sailing and boating on the Chesapeake Bay in Annapolis',
   'Chesapeake Region Accessible Boating (CRAB) offers therapeutic sailing and boating on the Chesapeake Bay, at no cost, for people with any disability, recovering warriors and youth from underserved communities. Sailboats have special seating and seatbelts, and lifts and transfer slides help guests board.

- **Family Sails:** free sails for a person with a disability plus family and caregivers, twice a month
- Group sails for community organizations, plus two-day clinics and kids'' camps
- Adaptive fishing on the power catamaran Dream Catcher, and radio-controlled sailing from the dock
- Regattas in Annapolis, including two for recovering warriors and the Don Backe Memorial CRAB Regatta for sailors with disabilities
- Art, music and fitness classes

Based at the Annapolis Adaptive Boating Center, which opened in 2023.

[crabsailing.org](https://crabsailing.org/)'),
  ('Yes U Can USA',
   '[teamusa.org](https://www.teamusa.org)',
   'Free assisted exercise, swimming and recreation for people with disabilities',
   'Yes U Can USA, a 501(c)(3) nonprofit, works "to increase inclusion, awareness and access to health, recreation and physical fitness opportunities for people with limited mobility and disabilities." Its participants come from Delaware, Pennsylvania and Maryland.

- One-on-one exercise sessions, an hour twice a week, at no fee
- Staff-assisted group and individual exercise, swimming and weight training
- Staff-assisted outdoor recreation
- Healthy-eating workshops

[yesucanusa.org](https://yesucanusa.org/)'),
  ('Nemours, Al DuPont Hospital for Children',
   '[nemours.org](https://www.nemours.org/locations/wilmington-ai-dupont-childrens-hospital.html)',
   'Children''s hospital in Wilmington, Delaware, with rehab and a wheelchair seating clinic',
   'Nemours Children''s Hospital, Delaware is a children''s hospital in Wilmington with Delaware''s only pediatric Level 1 Trauma Center. Its services include several for children with mobility disabilities.

- Wheelchair Seating and Mobility Clinic
- Rehabilitation medicine, physical therapy and occupational therapy
- Assistive technology, orthotics and prosthetics
- Gait and motion analysis
- Neuromuscular orthopedic care

[nemours.org](https://www.nemours.org/locations/wilmington-ai-dupont-childrens-hospital.html)'),
  ('Philadelphia PowerPlay',
   '[philadelphiapowerplay.com](https://www.philadelphiapowerplay.com/)',
   'Power wheelchair floor hockey team in the Philadelphia area',
   'The Philadelphia Flyers PowerPlay are a nonprofit power wheelchair floor hockey team in the Philadelphia metropolitan area, offering "a community based competitive athletic experience for people who use power wheelchairs in their daily lives." The team says it is not affiliated with or managed by the Philadelphia Flyers.

- Power wheelchair hockey games through the season, including at Norristown Recreation Center
- Open to all competent power wheelchair users
- A recreational and social program focused on teamwork, skill development and fun
- Appearances at community events such as the Abilities Expo and the DCIU Recreation and Leisure Fair

[philadelphiapowerplay.com](https://www.philadelphiapowerplay.com/)'),
  ('Katie’s Komets',
   '[katieskomets.org](https://katieskomets.org/index.html)',
   'Youth wheelchair basketball in Philadelphia and nearby',
   'Katie''s Komets is "a co-ed wheelchair basketball team for youth with lower limb impairments from Philadelphia and surrounding areas." It strives "to create a positive atmosphere where we can foster independence, self-confidence, and emotional and social well-being."

- **Junior Prep Division:** players age 13 and under, with an 8.5-foot basket
- **Junior 10 foot (Varsity) Division:** full-size courts and hoops, with advanced skills
- Always looking for new players

[katieskomets.org](https://www.katieskomets.org/)'),
  ('Specialized Outdoor Adaptive Recreation',
   '[soarexperiences.org](https://soarexperiences.org/)',
   'Adaptive hiking and outdoor adventures for people with limited mobility in NY and CT',
   'SOAR (Specialized Outdoor Adaptive Recreation) Experiences is a New York nonprofit community health program that uses outdoor spaces and adaptive equipment to improve health for people with limited mobility. It runs experiences at its Ellenville, New York site and at public and private venues in NY and CT, at low or no cost to guests.

- Adaptive hiking, at Ellenville and other venues
- Air gun marksmanship and off-road passenger ride-alongs at Ellenville
- Group programs with rehabilitation hospitals, universities and veterans organizations
- Presentations and webinars on outdoor recreation inclusion for universities, OT schools and parks
- Help designing and launching your own outdoor adaptive program

Began in 2019 as a program of Northeast Off Road Adventures, based in Ellenville, New York.

[soarexperiences.org](https://soarexperiences.org/)'),
  ('NORA (Northeast Off-Road Adventures)',
   '[nyoffroaddriving.com](https://www.nyoffroaddriving.com/)',
   'Off-road driving school in Ellenville, NY, home of the SOAR adaptive recreation program',
   'Northeast Off-Road Adventures (NORA) offers 4WD and overland training, driving tours and group outings in Ellenville and Hunter, New York. Its SOAR program helps people with mobility disabilities enjoy adaptive outdoor recreation.

- **SOAR Experiences:** adaptive hiking and outdoor activities at no cost for people with limited mobility, such as spinal cord injury, at venues in NY and CT
- Off-road driving classes for beginner and experienced drivers on a 75-acre facility, with rental vehicles
- Hunter Mountain driving tours, overland trips and passenger ride-alongs
- Off-road and safety training for emergency services and professionals

Established in 2011, based in Ellenville, New York.

[nyoffroaddriving.com](https://www.nyoffroaddriving.com/)'),
  ('Shifting Gears United',
   '[shiftinggearsunited.org](https://shiftinggearsunited.org/)',
   'Free adaptive cycling, water sports and racing in Palm Beach County, Florida',
   'Shifting Gears United provides free adaptive sports programs for wounded veterans, first responders, and children and adults with disabilities in Palm Beach County, Florida. It aims to help people "train and participate in mainstream sports."

- **Handcycle Program:** one-on-one training for new athletes, including local bicycle traffic laws
- Running, walking and pushrim wheelchair racing with coached workout plans
- **Vision in Motion:** tandem cycling for riders who are blind or visually impaired
- **AquaFin Water Aerobics** and an adaptive paddleboard program, for members who can swim
- **Waves of Freedom:** free adaptive snorkeling at Palm Beach County locations

Founded on September 11, 2019 by two-time Paralympian Jacqui Kapinowski, based in Tequesta.

[shiftinggearsunited.org](https://shiftinggearsunited.org/)'),
  ('Helen Hayes Hospital',
   '[helenhayeshospital.org](https://helenhayeshospital.org/adapted-sports-recreation/)',
   'Four-season adapted sports and recreation from Helen Hayes Hospital in New York',
   'The Adapted Sports & Recreation Program at Helen Hayes Hospital is a four-season program for current and former patients and people with disabilities in the community, including spinal cord injury. Activities are supervised by recreational and physical therapists and held in the New York Metropolitan region, and no prior experience is needed.

- Sailing, rowing, kayaking, fishing and waterskiing
- Handcycling, hiking, off-roading and snow skiing
- Basketball, power soccer, softball, archery and target shooting
- GolfAbility, gardening and an accessible video game center
- Adaptive equipment at events, a loaner program, and help finding funding for your own equipment

The hospital was founded in 1900 and is in West Haverstraw, New York.

[helenhayeshospital.org](https://helenhayeshospital.org/adapted-sports-recreation/)'),
  ('Palm Beach County Parks and Recreation Department',
   '[discover.pbcgov.org](https://discover.pbcgov.org/parks/Pages/Therapeutic-Recreation.aspx)',
   'Palm Beach County''s adapted sports, rugby team and beach wheelchairs',
   'Palm Beach County Parks and Recreation''s Therapeutic Recreation is "committed to enhancing the quality of life for people with disabilities and their families." Its Therapeutic Recreation Complex runs adapted sports for youth and adults with physical and visual impairments.

- **WWAR Panthers:** a wheelchair rugby team that travels to games and tournaments, ages 16+
- Lacrosse, cycling and boccia, with sports wheelchairs and handcycles available
- Beach wheelchairs and mobility mats at several county beach parks
- Training, resource and referral services

[discover.pbc.gov](https://discover.pbc.gov/parks/Pages/Therapeutic-Recreation.aspx)'),
  ('North New Jersey Navigators',
   '[navigatorsadaptivesports.com](https://www.navigatorsadaptivesports.com/)',
   'Multi-sport adaptive club for youth and adults with disabilities in Bayonne, NJ',
   'Navigators Adaptive Sports Club is a volunteer-driven nonprofit in Bayonne, New Jersey offering weekly multi-sport programs for children and young adults with disabilities, with athletes aged 7 to 76. Its mission: "To motivate and help transform the lives of people living with disabilities."

- Track and field, with events from 40m to 5K plus throws and jumps
- Swim team with short and long courses
- Adaptive archery, and triathlon and road racing
- Training, qualifying and competition for elite athletes, with equipment provided at no cost
- No participation fee; costs may come with travel to competitions

[navigatorsadaptivesports.com](https://www.navigatorsadaptivesports.com/)'),
  ('STRIDE, Inc.',
   '[stride.org](https://www.stride.org)',
   'Adaptive sport and recreation lessons in 20+ sports across the Northeast',
   'STRIDE Adaptive Sports is a nonprofit that provides adaptive sport and recreation lessons to people with disabilities, with a focus on youth and Wounded Warfighters, at 24 regional locations in the Northeastern US. Its mission is "to educate and empower individuals with disabilities in life-changing sport and recreation programs to sustain healthy, active and fun lifestyles."

- Programs in more than 20 sports, using specialized equipment and teaching aids
- Sled hockey, wheelchair basketball, pickleball, competitive bowling and swimming, and dance
- **Warfighter Program:** snow sports, marksmanship, sled hockey, watersports, cycling and camping for injured service members
- A Youth Club, and a training club for New York Special Olympics
- Partner member of Move United and PSIA/AASI

Founded by Mary Ellen Whitney, with its office in West Sand Lake, NY, outside Albany.

[stride.org](https://www.stride.org)'),
  ('Northeast Disabled Athletic Association',
   '[disabledathletics.org](https://www.disabledathletics.org)',
   'All-volunteer adaptive sports for people with physical disabilities in Vermont',
   'The Northeast Disabled Athletic Association (NDAA) is an all-volunteer nonprofit providing recreational and competitive athletic opportunities for people with physical disabilities in Vermont. It has served disabled athletes in the state for more than 20 years.

- Two competitive teams: the Vermont Sled Cats sled hockey team and the Vermont Chargers power soccer team
- Sailing, kayaking, water skiing and handcycling
- Archery, biathlon, bocce, cross-country skiing, tennis and wheelchair basketball
- Equipment and training for athletes, and sponsorship of athletes in competition

Based in Burlington, VT.

[disabledathletics.org](https://www.disabledathletics.org)'),
  ('NY Rolling Fury',
   '[nyrollingfury.org](https://nyrollingfury.org)',
   'Junior wheelchair basketball for ages 5 to 18 in Greater NY, Long Island and NJ',
   'The New York Rolling Fury is a junior wheelchair basketball club for boys and girls ages 5 to 18 with physical disabilities across Greater New York, Long Island and New Jersey. Sport chairs are provided by the club and no experience is needed.

- Open practice: borrow a sport chair and learn to push, dribble, pass, pivot and shoot, free to try
- A competitive travel roster in the NWBA junior division
- Clinics and demos at schools, hospitals and community events
- Offseason skills and strength training, and college camps, preparing athletes for college wheelchair basketball

[nyrollingfury.org](https://nyrollingfury.org)'),
  ('The Impossible Dream Inc',
   '[theimpossibledream.org](https://www.theimpossibledream.org/)',
   'Universally accessible catamaran taking people with disabilities sailing',
   'The Impossible Dream is a universally accessible catamaran, designed so wheelchair users can sail independently, that takes people with disabilities sailing along the East Coast and from its winter base at Shake-A-Leg Miami. It is "dedicated to raising awareness of barrier-free design and improving the quality of life for disabled persons through sailing."

- **Summer Voyage:** an annual sail along the East Coast, taking disabled people sailing at over a dozen ports
- Free Community Sails from Shake-A-Leg Miami in winter, by reservation
- **Media Lab:** a workshop and sail for content creators with disabilities
- Virtual Chair Yoga classes, and racing with mixed-ability crews
- Partnerships with rehabilitation hospitals and spinal cord injury research institutions

The boat was built in 2002; its winter base is Shake-A-Leg Miami.

[theimpossibledream.org](https://www.theimpossibledream.org/)'),
  ('EDD Adaptive Sports',
   '[eddfund.org](https://www.eddfund.org/who-we-are.html)',
   'Mostly free adaptive sports for children and adults in Central NY and Vermont',
   'EDD Adaptive Sports is a nonprofit that provides recreational and competitive sports programs for children and adults with any type of disability in Central New York and Central and Northern Vermont. Many programs are run by college student athletes, with a 1:1 or 1:2 volunteer-to-athlete ratio.

- Basketball, soccer, swimming, kayaking, pickleball, biking and yoga
- Adaptive rowing with Otsego Area Rowing in Cooperstown, NY
- Alpine race training and downhill skiing with the Adaptive Sports Foundation in Windham, NY
- Horseback riding lessons with Athelas Therapeutic Riding
- Virtual on-demand fitness classes

Running programs since 1998.

[eddfund.org](https://www.eddfund.org/who-we-are.html)'),
  ('WSF New York Sled Rangers',
   '[wsfsledrangers.org](https://www.wsfsledrangers.org/)',
   'Para ice hockey for physically disabled youth ages 5 to 21 in the New York area',
   'The WSF New York Sled Rangers is an adaptive para ice hockey program of the Wheelchair Sports Federation for physically disabled youth aged 5 to 21. Athletes come from all five boroughs of NYC, Long Island, Westchester and Rockland Counties, and southern Connecticut.

- Sled hockey on a team for kids from diverse backgrounds
- More than 100 Sled Ranger athletes so far
- **Breakaway:** a fundraising gala that pays for ice time, equipment, tournament fees and transportation
- The Wheelchair Sports Federation also sponsors many adaptive sports, from archery to wheelchair tennis

[wsfsledrangers.org](https://www.wsfsledrangers.org/)'),
  ('Memorial’s Fort Lauderdale Sharks',
   '[fladaptivesports.org](https://www.fladaptivesports.org/memorialrehabinstitutesharks)',
   'Wheelchair basketball team in Fort Lauderdale',
   'The Memorial Rehab Institute Sharks are a wheelchair basketball team in Fort Lauderdale, listed by Florida Adaptive Sports, a social sports club for disabled Floridians of all ages.

[fladaptivesports.org](https://www.fladaptivesports.org/memorialrehabinstitutesharks)'),
  ('Able Athletics',
   '[ableathletics.org](https://ableathletics.org/)',
   'Inclusive youth sports with coaches, therapists and trained volunteers',
   'Able Athletics is a New York nonprofit offering inclusive sports programs for children with disabilities, led by therapists, special education teachers, professional coaches and volunteers. "We firmly believe that teaching inclusion is the first step in creating it."

- Adaptive sports sessions with professional coaches, trained volunteers and on-site therapists
- Programs including inclusive NFL Flag football, field hockey, lacrosse and basketball
- Training for volunteers in supporting athletes of all abilities
- Consulting for coaches, clubs and organizations building inclusive programs
- Scholarships available

[ableathletics.org](https://ableathletics.org/)'),
  ('GallopNYC',
   '[gallopnyc.org](https://www.gallopnyc.org)',
   'Therapeutic horseback riding for New Yorkers with disabilities',
   'GallopNYC uses therapeutic horsemanship to help riders in NYC with disabilities walk, talk and learn. It is New York City''s largest therapeutic equine-assisted nonprofit, serving people with disabilities, veterans with PTSD and seniors, and it welcomes riders with and without disabilities.

- Weekly therapeutic riding with PATH International Certified Therapeutic Riding Instructors
- Hippotherapy and non-mounted therapeutic work with horses
- A Veterans Program, including riding for veteran families
- Structured, semester-based programs rather than drop-in riding

Founded in 2005 by Alicia Kershaw and a group of volunteers.

[gallopnyc.org](https://www.gallopnyc.org)'),
  ('Grateful Divers Worldwide',
   '[gratefuldiversworldwide.org](https://gratefuldiversworldwide.org/)',
   'Adaptive scuba diving for people with disabilities and their families',
   'Grateful Divers Worldwide offers adaptive scuba diving for people living with disabilities, special needs groups and their families, from South Florida to international waters. "Our mission is to make the water welcome to everyone."

- Adaptive dive instruction with techniques and equipment for each diver
- Training and scuba certification in a supervised setting
- Discover Scuba sessions, adaptive charters and community events
- International dive trips
- Live webcams of South Florida dive sites

[gratefuldiversworldwide.org](https://gratefuldiversworldwide.org/)'),
  ('Smugglers’ Notch Adaptive Program (SNAP)',
   '[smuggs.com](https://www.smuggs.com/lessons/adaptive-programs/)',
   'Adaptive skiing, riding and summer programs at Smugglers'' Notch in Vermont',
   'The Smugglers'' Notch Adaptive Program (SNAP) at Smugglers'' Notch Resort in Jeffersonville, Vermont offers therapeutic recreation so children and adults of all abilities can ski, ride and join summer activities. Each program is tailored to the participant, with one or two instructors as needed.

- Winter adaptive skiing and snowboarding for ages 3 and up, with mono-skis, bi-skis, outriggers and sliders
- A summer program with hiking, kayaking, swimming, mini golf, and arts and crafts
- Adaptive swim lessons
- Inclusive options within the resort''s Summer Fun University and Snow Sport University
- Half-day and full-day sessions

[smuggs.com](https://www.smuggs.com/lessons/adaptive-programs/)'),
  ('Tranquil Adventures',
   '[captainmickswateradventures.com](https://captainmickswateradventures.com)',
   'Wheelchair accessible boat charters in Islamorada, in the Florida Keys',
   'Capt. Mick''s Water Adventures runs accessible boat tours and private charters for people with disabilities in Islamorada, Florida. Captain Mick Nealey, a polio survivor, has offered accessible boating for over 30 years.

- Fishing, sightseeing, snorkeling, island hopping and trips to waterfront restaurants
- A wheelchair accessible dock with a ramp, and a boat lift for people who can''t climb a ladder
- Room for up to 6 people, 4 of them in wheelchairs, including heavy power chairs
- Coast Guard approved safety equipment

[captainmickswateradventures.com](https://captainmickswateradventures.com)'),
  ('Just Hands Foundation',
   '[justhands.org](https://www.justhands.org/performance-driving)',
   'Track driving with hand controls, and adaptive mountain biking, in the Northeast',
   'Just Hands Foundation uses motorsports to put disabled athletes on equal terms, with adapted cars on race tracks and adaptive mountain biking. Its main track is Lime Rock Park in northwest Connecticut. "Our mission is simple. We get hand controlled drivers on a track."

- High Performance Driving Events: full track days with expert instructors in adapted cars
- Autocross and ride-alongs at Lime Rock Park
- Adaptive mountain biking on Bowhead bikes set up for paras and quads
- **Track to Trail:** a day on the track and a day on the trails
- Other tracks include Palmer, Thompson, Circuit of the Americas, Harris Hill and Homestead-Miami

[justhands.org](https://www.justhands.org/performance-driving)'),
  ('Long Island Sled Hockey',
   '[lisledhockey.org](https://lisledhockey.org/bios-profiles)',
   'Long Island''s sled hockey team, at no cost to its athletes',
   'The Long Island Sled Hockey RoughRiders "provide inclusive, competitive and recreational hockey opportunities for individuals with physical, developmental and intellectual disabilities." The team welcomes teen-to-adult players of all genders and ability levels.

- Adaptive gear and sleds, coaching and ice time, at no cost to athletes
- Tournament travel, lodging and meals covered
- Competitive and recreational play in tournaments across North America

Running for over two decades on Long Island, NY.

[lisledhockey.org](https://lisledhockey.org/)'),
  ('Green Mountain Adaptive Sports',
   '[greenmtnadaptive.org](https://greenmtnadaptive.org/)',
   'Adaptive sports access and grants for Vermonters with disabilities',
   'Green Mountain Adaptive Sports is a Vermont nonprofit that improves quality of life for people with disabilities living in or visiting Vermont through access to sports and recreation, working with partner programs.

- Free adaptive ski or snowboard lessons and passes at Stowe and Smugglers'' Notch for full-time Vermont residents who apply
- TetraSki and Snow''Kart, Nordic skiing, and the annual Stowe Monoski Camp
- Swimming at four pools, indoor rock climbing, adaptive skateboarding and kayaking
- Movement classes and P2P mentorship
- Scholarships, coach grants and help for partners getting adaptive equipment

Founded in 2010, based in Vermont.

[greenmtnadaptive.org](https://greenmtnadaptive.org/)'),
  ('Connecticut Spokebenders',
   '[c316los.wixsite.com](https://c316los.wixsite.com/mysite)',
   'Wheelchair basketball team in Connecticut',
   'Connecticut Spokebenders calls itself "CT''s premiere wheelchair basketball team": an amateur team and nonprofit in Meriden, Connecticut.

[facebook.com/ctspokebenders](https://www.facebook.com/ctspokebenders)'),
  ('Gaylord Sports Association',
   '[gaylord.org](https://www.gaylord.org/sports)',
   'Adaptive sports, recreation and fitness at Gaylord in Wallingford, Connecticut',
   'The Gaylord Sports Association, part of Gaylord Specialty Healthcare, offers adaptive sports, recreation and fitness for people ages 16 and up with a permanent physical disability or visual impairment. With over seventeen sports, it describes itself as the most diverse adaptive sports program in Connecticut.

- Introductory clinics with equipment and instruction provided
- Four competitive teams, including sled hockey, and competitive events through the year
- Archery, boccia, boxing, cycling, golf, kayaking, paratriathlon, pickleball and rock climbing
- Skiing and snowboarding, water skiing, wheelchair rugby, wheelchair tennis and yoga
- Exercise for Life fitness, virtual and in person, plus veteran programs and fishing tournaments

Running for over thirty years, based in Wallingford, CT.

[sportsassociation.gaylord.org](https://sportsassociation.gaylord.org/)'),
  ('All Out Adventures',
   '[alloutadventures.org](https://www.alloutadventures.org/programs)',
   'Year-round adaptive outdoor recreation for all ages and abilities, from Northampton, MA',
   'All Out Adventures runs adaptive outdoor recreation for people of all ages and abilities, with specialized equipment and trained staff, from Northampton, Massachusetts. Participants include people with spinal cord injury, brain injury, MS, limb difference, low vision and more.

- Warm season kayaking, canoeing, stand up paddleboarding, cycling, camping and hiking
- Winter cross-country and sit cross-country skiing, snowshoeing, ice skating and sled skating
- Rail trail rides on handcycles, wheelchair tandems and recumbent trikes
- Programs for people with brain injuries, veterans and seniors, plus pickleball
- Each person with a disability can bring a caregiver free, and fees are waived if they are a barrier

[alloutadventures.org](https://www.alloutadventures.org/programs)'),
  ('CHD All In Barrier-Free Recreation',
   '[chd.org](https://chd.org/programs-services/community-care-support/adaptive-sports-and-recreation-programs/)',
   'Adaptive sports and recreation in Western Massachusetts and Connecticut',
   'All In (Barrier-Free Recreation) is a program of the Center for Human Development (CHD) offering adaptive sports and recreation for people of all ages with physical disabilities and visual impairments in Western Massachusetts and Connecticut.

- Sled hockey, wheelchair basketball, cycling, fishing and rock climbing
- Dance and movement, swimming, and Adaptive CrossFit
- Annual membership with year-round programs, reduced rates and equipment loans
- Disability awareness presentations for schools and workplaces

Based in West Springfield, MA.

[chd.org](https://chd.org/programs-services/community-care-support/adaptive-sports-and-recreation-programs/)'),
  ('Oak Hill Adaptive Sports & Fitness',
   '[sportsandfitness.oakhillct.org](https://sportsandfitness.oakhillct.org/)',
   'Adaptive fitness center and sports programs in Hartford, Connecticut',
   'Oak Hill Adaptive Sports and Fitness is a sports and fitness facility in Hartford, Connecticut designed for people with physical disabilities and chronic health conditions, but open to all. It is an Easterseals affiliate.

- An accessible gym with equipment such as the AlterG Anti-Gravity Treadmill and Wheeler''s Paramill
- Personal training and inclusive group exercise classes
- Virtual group exercise and personal training
- Competitive and recreational sports programs for adults and youth

[sportsandfitness.oakhillct.org](https://sportsandfitness.oakhillct.org/)'),
  ('Cannon Adaptive Sports Partners',
   '[cannonmt.com](https://www.cannonmt.com/adaptive-sports-partners)',
   'Adaptive ski and snowboard lessons at Cannon Mountain, New Hampshire',
   'Cannon Mountain in Franconia, New Hampshire partners with Adaptive Sports Partners to offer adaptive ski and ride lessons for people of all abilities, ages 3 and up. Adaptive Sports Partners'' mission is "to empower individuals with disabilities by building community, confidence, and skills through sport, recreation, and adventure."

- Lessons with trained volunteer instructors, including rental and adaptive equipment and a lift ticket
- Equipment for sit-down and stand-up skiers and riders
- The TetraSki, an independent alpine ski for complex disabilities
- Scholarships available, and free lessons for veterans

[cannonmt.com](https://www.cannonmt.com/adaptive-sports-partners)'),
  ('New England Disabled Sports',
   '[nedisabledsports.org](https://www.nedisabledsports.org)',
   'Year-round adaptive sports at Loon Mountain and Bretton Woods, New Hampshire',
   'New England Disabled Sports (NEDS) provides year-round adaptive sports instruction to adults and children with physical and cognitive disabilities at Loon Mountain and Bretton Woods in New Hampshire. Close to 600 student-athletes take part, coached by over 200 trained volunteers.

- Winter and summer adaptive sports programs
- Military programs for wounded service members, including the White Mountain WarFighter Retreat
- Customized camps for groups of 10 to 25, and an SCI summer camp
- **Pre-Adaptive Coach (PAC):** training for high school volunteers to become coaches
- A chapter of Move United

Founded in 1987 as White Mountain Adaptive Snow Sports, based at Loon Mountain in Lincoln, NH and Bretton Woods.

[nedisabledsports.org](https://www.nedisabledsports.org)'),
  ('Jack Trottier Foundation for Spinal Cord Injury',
   '[jacktrottierfoundation.org](https://www.jacktrottierfoundation.org)',
   'Grants, recreation therapy and education for people with spinal cord injury',
   'The Jack Trottier Foundation supports people living with a spinal cord injury through grants, guided recreation therapy outside the hospital, and education. Its mission: "Advancing opportunities and support for the spinal cord injury community through innovative programming, empowering confidence to Win The Day, everyday."

- **Quality of Life Grants:** help paying for needed equipment or modifications, approved for people across New England
- **Advanced Recreation Therapy:** adaptive recreation events across the US
- **Education:** Storytellers talks on common causes of SCI, injury prevention and life as a wheelchair user

Started in 2021, based in Tyngsboro, MA.

[jacktrottierfoundation.org](https://www.jacktrottierfoundation.org)'),
  ('Miracle League of MA',
   '[miracleleaguema.org](https://miracleleaguema.org/)',
   'Free baseball league for children and adults with disabilities in Acton, MA',
   'The Miracle League of Massachusetts gives people with physical, cognitive, emotional and behavioral disabilities the chance to play baseball on a team in an organized, non-competitive league, at no cost to families. Games are played at the Joseph Lalli Miracle Field in NARA Park, Acton.

- Spring and fall seasons of six to seven games
- Youth games on Saturday mornings, adult games on Sundays
- Volunteer buddies who support each player
- Social events such as dance parties, game nights and movie nights

[miracleleaguema.org](https://miracleleaguema.org/)'),
  ('United States Volt Hockey Association',
   '[volthockeyusa.org](https://www.volthockeyusa.org)',
   'National body growing volt hockey, a motorized-chair team sport, in the US',
   'The United States Volt Hockey Association is the governing body for volt hockey in the US. Volt hockey is a 3v3 team sport for people with limited upper and lower body mobility, played on a basketball court in motorized chairs fitted with paddles.

- Help for new teams getting started across the country
- Resources for training and refereeing
- Working toward national and international tournaments
- Support for teams traveling to the Volt Hockey World Cup in Sweden

Founded in 2022.

[volthockeyusa.org](https://www.volthockeyusa.org)'),
  ('Bike-On',
   '[bike-on.com](https://bike-on.com/)',
   'Handcycles, recumbent trikes, adaptive bikes and wheelchairs, from Rhode Island',
   'Bike-On is a family-owned adaptive bike shop in Warwick, Rhode Island selling handcycles, recumbents, adaptive bikes, wheelchairs and sports chairs, with personal guidance on fit and setup.

- Competitive, recreational, off-road and attachable handcycles
- Recumbent trikes, adaptive cycles for riders with a range of needs, and cargo bikes
- Everyday, sport and custom wheelchairs
- A full-service shop with parts and accessories
- Discounts for adaptive sports organizations, and support for veterans and children''s programs

Founded in 1999, based in Warwick, Rhode Island.

[bike-on.com](https://bike-on.com/)'),
  ('Maine Adaptive Sports and Recreation',
   '[maineadaptive.org](https://www.maineadaptive.org/)',
   'Year-round adaptive sports and recreation lessons, based in Newry, Maine',
   'Maine Adaptive Sports & Recreation offers year-round, volunteer-led adaptive sports instruction for people with disabilities. It "promotes year-round education and training for individuals with disabilities in order to develop skills, enhance independence, and provide enjoyment through active recreation."

- Alpine skiing and snowboarding
- Nordic skiing and snowshoeing
- Mono-skiing clinics
- Climbing and other summer programs

Founded in 1982 with the support of Sunday River, based in Newry, Maine.

[maineadaptive.org](https://www.maineadaptive.org/)'),
  ('South Coast Wheelchair Tennis',
   '[southcoastwheelchairtennis.org](https://southcoastwheelchairtennis.org)',
   'Wheelchair tennis clinics in Southeastern Massachusetts and Rhode Island',
   'The South Coast Wheelchair Tennis Foundation promotes wheelchair tennis throughout Southeastern Massachusetts and Rhode Island, introducing people with disabilities to the sport and helping them develop their game.

- Wheelchair tennis clinics and instruction
- A Junior Wheelchair Tennis Initiative
- Tournaments
- Exhibition matches and "Train the Trainer" sessions
- Support for other organizations bringing wheelchair tennis into mainstream tennis

Founded in 2016.

[southcoastwheelchairtennis.org](https://southcoastwheelchairtennis.org)'),
  ('Fit to Function',
   '[fittofunctionrecovery.com](https://www.fittofunctionrecovery.com/)',
   'One-on-one adaptive training and inclusive classes in Roslindale, MA',
   'Fit to Function is a gym in Roslindale, Massachusetts offering 1:1 adaptive training for people with disabilities, including spinal cord injury, brain injury, stroke, MS and other neurological conditions. It was founded to fill the gap between traditional rehab and lifelong fitness.

- In-person 1:1 functional fitness, adapted to the way you move
- Live virtual training from anywhere
- Remote programming with custom workouts
- Small group and specialty classes for kids, moms and seniors
- First visit free

Opened in 2019.

[fittofunctionrecovery.com](https://www.fittofunctionrecovery.com/)'),
  ('Empower Spinal Cord Injury Inc.',
   '[empowersci.org](https://www.empowersci.org/)',
   'Residential rehabilitation programs for people with spinal cord injury',
   'Empower Spinal Cord Injury (Empower SCI) is a nonprofit running immersive residential rehabilitation programs for people with spinal cord injuries once traditional rehabilitation has ended. Its mission is "To propel individuals living with spinal cord injuries on their path to a fully actualized, more independent life through immersive programming and community support."

- Summer Intensive Programs with physical, occupational and recreational therapy, peer mentoring and rehabilitation counseling
- A flagship program at Stony Brook University in NY, and one at the University of Montana in Missoula
- **Teen / Young Adult Program:** a week in Rhode Island for ages 16 to 22, with 24/7 care
- Wheelchair skills courses around the United States

First program held in 2012 at Stony Brook University.

[empowersci.org](https://www.empowersci.org/)'),
  ('Appalachian Mountain Club (AMC)',
   '[outdoors.org](https://www.outdoors.org/about/)',
   'Outdoor club for trips, huts, trails and conservation from Maine to Virginia',
   'The Appalachian Mountain Club is a community of more than 90,000 members connecting people with nature from Maine to Virginia. Its mission is "to foster the protection, enjoyment, and understanding of the outdoors."

- Guided trips and adventure travel for adults, women, teens and school groups
- Local chapters and outings
- Outdoor skills and leadership trainings
- High mountain huts and lodging
- Conservation and trail work

Founded in 1876 in Boston.

[outdoors.org](https://www.outdoors.org/about/)'),
  ('MPGA Adaptive Golf',
   '[adaptivegolf.club](https://www.adaptivegolf.club/)',
   'Adaptive golf league and free lessons in Canton and Weston, Massachusetts',
   'The Massachusetts Para-Golfers Association (MPGA) promotes adaptive golf for players with vision or hearing impairments, amputations, loss of mobility, TBI, autism or paraplegia, and for wounded veterans. Play is at Massachusetts DCR universal access courses in Canton and Weston.

- Weekly and flexible times on the course for organized, competitive or recreational play
- Free adaptive golf lessons
- Accessible golf carts, including Paramobile and SoloRider
- Driving ranges, chipping and putting greens, and companion golfers
- Regional amateur adaptive golf tournaments

Based in Quincy, MA.

[adaptivegolf.club](https://www.adaptivegolf.club/)'),
  ('Adaptive Sports New England',
   '[adaptivesportsne.org](https://adaptivesportsne.org/)',
   'Sports for youth and adults with visual or mobility impairments in New England',
   'Adaptive Sports New England is a Massachusetts nonprofit working to increase participation in sports among New England youth and adults with visual or mobility impairments. It partners with adaptive and mainstream sports programs so more people can play closer to home.

- Youth wheelchair basketball with Franciscan Children''s, and the adult Rollin'' Celtics
- A swim team led by Paralympic medalists, and one-on-one swim lessons
- Teen para rowing with Community Rowing, Inc. on the Charles River
- Youth wheelchair track
- Offseason beep baseball, wheelchair football and youth/family sailing

[adaptivesportsne.org](https://adaptivesportsne.org/)'),
  ('Spaulding Rehabilitation Adaptive Sports Centers',
   '[sasc.spauldingrehab.org](https://sasc.spauldingrehab.org/)',
   'Adaptive sports and recreation across eastern Massachusetts',
   'Spaulding Adaptive Sports Centers "are open to all individuals in the community who are living with disabilities." Children and adults take part in sports and recreation with adaptive sports professionals and Spaulding therapists, from Salem to Brewster.

- **Boston:** adaptive swim, pickleball, indoor spin, inclusive fitness and dance, sled hockey
- **Cape Cod and North Shore:** spin, pickleball, indoor golf, mountain biking, archery and air rifle, yoga
- **Ski and Snowboard Club:** trips to New Hampshire, Vermont, Maine and Mount Wachusett
- Virtual group fitness, adaptive boxing and chair yoga

[sasc.spauldingrehab.org](https://sasc.spauldingrehab.org/)'),
  ('Piers Park Sailing',
   '[piersparksailing.org](https://piersparksailing.org/adaptive/adaptive-sailing)',
   'Adaptive sailing on Boston Harbor, with free first sails for adults with SCI',
   'Piers Park Sailing Center in East Boston is an accredited US Sailing Adaptive Sailing Center, using adapted teaching methods and equipment so sailors with disabilities can learn and enjoy sailing on Boston Harbor. It has worked with over 2,800 people with disabilities.

- A free ''give it a try'' session for adults with a spinal cord injury who have never sailed
- Then Learn to Sail and a Sailing Pass at 50% off regular pricing
- Partnership programs with nonprofits and schools serving people with disabilities
- Discounted youth programs for youth with disabilities ages 6 to 22
- Fully ADA-accessible facilities

Founded in 1998 on the East Boston waterfront.

[piersparksailing.org](https://piersparksailing.org/adaptive/adaptive-sailing)'),
  ('Access 2 Adventure',
   '[usopc.org](https://www.usopc.org/paralympic-sport-development/getting-started/find-a-club/rhode-island)',
   'Sports, recreation and adventure travel for people with physical disabilities in RI',
   'Access2Adventure (a2a) is a Rhode Island nonprofit serving southern New England that offers people with physical disabilities sports, recreational activities and adventure travel. It is the only Rhode Island chapter of Disabled Sports USA and was established in 2004.

[usopc.org](https://www.usopc.org/paralympic-sport-development/getting-started/find-a-club/rhode-island)'),
  ('Cape Cod Curling Club',
   '[capecodcurling.org](https://www.capecodcurling.org)',
   'Accessible curling club in Falmouth, MA, host of a wheelchair bonspiel',
   'The Cape Cod Curling Club is a member-driven, volunteer-run curling club in Falmouth, Massachusetts with a fully accessible facility, dedicated to the sport for all ages from 6 up.

- Hosts the Tony Colacchio Wheelchair Bonspiel
- A Learn to Curl program for new curlers
- Leagues, bonspiels, friendlies and social curling
- Skills sessions on sliding, shot selection and strategy

Founded in 1969, based in Falmouth, MA.

[capecodcurling.org](https://www.capecodcurling.org)')
  ) v(name, imported, summary, description)
 where o.name = v.name
   and o.description = v.imported
   and o.summary is null
   and o.removed_at is null;
