-- ============================================================================
-- An organization has a line for its card
-- ============================================================================
-- The owner, 2026-11-01. Written from each organization's own description, which
-- stays as it is for its page. Readable by anybody, as the description is. Its
-- org admins and the club's administrators can change it.
-- ============================================================================

alter table public.organizations
  add column summary text check (
    summary is null or (summary = btrim(summary) and char_length(summary) between 1 and 90)
  );

comment on column public.organizations.summary is
  'One line for its card in the directory. See 20261101120000.';

grant select (summary) on public.organizations to anon, authenticated;

create function public.set_organization_summary(p_organization uuid, p_summary text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  line text := nullif(btrim(coalesce(p_summary, '')), '');
begin
  if not public.can_edit_organization(p_organization) then
    raise exception 'Only its org admins can change this.' using errcode = '42501';
  end if;
  if line is not null and char_length(line) > 90 then
    raise exception 'Keep it to 90 characters.' using errcode = '22023';
  end if;

  update public.organizations o
     set summary = line
   where o.id = p_organization and o.removed_at is null;
  if not found then
    raise exception 'There is no such organization.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_organization_summary(uuid, text) from public, anon;
grant execute on function public.set_organization_summary(uuid, text) to authenticated;

update public.organizations o
   set summary = v.summary
  from (values
    ('ARC', 'Paralysis recovery center helping people move, stand and walk again'),
    ('AFS', 'Sports, recreation and leisure for youth and adults'),
    ('ABY', 'Independent living center and programs in Phoenix'),
    ('AB', 'Electric assist handcycling, with free one-on-one lessons'),
    ('ACL', 'Sacramento''s adaptive and inclusive recreation program'),
    ('AMM', 'Inclusive mountain sports for every age and ability'),
    ('ACT', 'Affordable adaptive outdoor recreation around Tahoe'),
    ('ACLA', 'Athletic programs and social connection in Los Angeles'),
    ('ACSF', 'Athletic programs and social connection in the Bay Area'),
    ('AA', 'Outdoor adventures for people with physical disabilities and families'),
    ('ASNW', 'Fitness, recreation and competitive sport in Oregon and SW Washington'),
    ('ACS', 'Free year-round adaptive sports for kids, adults and veterans'),
    ('BWPV', 'Service organization for veterans with paralysis'),
    ('BAAD', 'All-volunteer sailing club, no experience needed'),
    ('BPF', 'Financial and emotional aid for people living with paralysis'),
    ('BLZ', 'Adaptive sport and recreation, a legacy of the 1996 Paralympics'),
    ('BLNK', 'Support for families of the newly injured'),
    ('BORP', 'Adaptive sports, fitness and recreation in the East Bay'),
    ('BTB', 'Inclusive sports, fitness and arts center in Fresno'),
    ('BRPF', 'Funds paralysis cure research and helps people with SCI/D'),
    ('CC', 'Trained service dogs, free to the people it serves'),
    ('CIL', 'Rights, independence and support in Berkeley'),
    ('CORE', 'Fitness bridging the gap between rehab and regular exercise'),
    ('CCAS', 'Year-round mountain adventures in the Central Sierra'),
    ('CHC', 'Therapy and specialized fitness in San Diego'),
    ('CSSD', 'Free adaptive sailing on San Diego Bay'),
    ('CDRF', 'Funds SCI research and improves life with paralysis'),
    ('CHN', 'Largest private funder of SCI research and programs'),
    ('CH', 'Rehabilitation hospital for spinal cord and brain injuries'),
    ('DH', 'Scuba diving and scuba therapy for people with disabilities'),
    ('DN', 'Paralysis recovery centers in Las Vegas and Indianapolis'),
    ('ETC', 'Accessible sea kayaking and outdoor adventures'),
    ('FD', 'Website connecting families with people who have lived SCI'),
    ('FFF', 'Pays for rehab after insurance benefits run out'),
    ('GBU', 'Funds goods and services for people living with SCI'),
    ('HHL', 'Eases the cost of serious medical challenges'),
    ('HF', 'Helps injured athletes get back to outdoor sports'),
    ('IBF', 'Supports people with SCI and families, from injury onward'),
    ('KFRC', 'Inpatient rehab for Kaiser members in Northern California'),
    ('KBF', 'Helps people with SCI lead active, engaged lives'),
    ('LKS', 'Physical activity, research and advocacy in Birmingham'),
    ('LRO', 'Adaptive surf, skate and fishing events'),
    ('MENS', 'Men with SCI meeting in person and online'),
    ('MTW', 'Shares peer mentors'' experience of independent living'),
    ('MU', 'National leader in adaptive sport and recreation'),
    ('NCEF', 'Equine-assisted therapy in Woodside'),
    ('NWBA', 'Governing body of US wheelchair basketball'),
    ('NWSA', 'Governing body of competitive wheelchair softball'),
    ('NT', 'All-terrain mobility on beaches and trails for wheelchair users'),
    ('NXS', 'Network of paralysis recovery and fitness centers'),
    ('NCS', 'Peer mentors, resources and programs for Northern California'),
    ('NASC', 'Unites the SCI community on research, care and policy'),
    ('OPS', 'Adaptive surf programs for injured military and veterans'),
    ('PCH', 'Paraclimber-led indoor climbing meetups in the Bay Area'),
    ('PVA', 'Service organization for veterans with SCI/D, MS and ALS'),
    ('POSS', 'Free community program from Loma Linda University Health'),
    ('PRC', 'Outpatient neurological therapy clinic in Long Beach'),
    ('PRJ', 'Funds equipment, adaptive devices and therapy for people with SCI'),
    ('PVAC', 'Free services for veterans with SCI/D and their families'),
    ('RLA', 'Competitive wheelchair sports from Rancho Los Amigos'),
    ('RC', 'Free used medical equipment for Bay Area residents'),
    ('SCIF', 'Activity-based therapy for people living with paralysis'),
    ('SC', 'Matches current patients with former patients at Valley Medical'),
    ('SA', 'Year-round inclusive outdoor recreation in Santa Cruz'),
    ('SHC', 'Atlanta rehabilitation hospital for SCI and brain injury'),
    ('SRA', 'Chicago rehabilitation hospital and research center'),
    ('SVIL', 'Free independent living services in Santa Clara County'),
    ('SCAS', 'Adaptive sports across Southern California'),
    ('SPP', 'Mentoring network and video archive by the SCI community'),
    ('TRR', 'Adaptive paddling for veterans and their families'),
    ('LHC', 'Peer connection and recreation for adults with paralysis'),
    ('TPS', 'Exercise-based therapy center for paralysis'),
    ('SCIC', 'The organization behind this app'),
    ('UNR', 'Adaptive snowsports club in Los Angeles'),
    ('TESF', 'Financial and emotional support for people with SCI'),
    ('TF', 'Helps people with SCI/D overcome obstacles, mostly in SoCal'),
    ('UNSP', 'National membership group with one-on-one peer mentoring'),
    ('USRC', 'Winter and summer outdoor sports at Big Bear'),
    ('PSOC', 'Governing body of power soccer in the US'),
    ('WRA', 'Runs and develops wheelchair rugby across the US'),
    ('BOC', 'National organization for boccia in the US'),
    ('USH', 'USA Hockey''s sled hockey program'),
    ('AWR', 'Develops the athletes and teams of US wheelchair rugby'),
    ('USTA', 'Wheelchair tennis programs for athletes of all ages'),
    ('VAPA', 'VA spinal cord injury care for veterans and service members'),
    ('WWA', 'Grants and support for SCI rehab and recovery'),
    ('WWM', 'Connection and support for wheelchair users'),
    ('WLAX', 'Organizes and promotes wheelchair lacrosse')
  ) as v(short_code, summary)
 where o.short_code = v.short_code
   and o.removed_at is null;
