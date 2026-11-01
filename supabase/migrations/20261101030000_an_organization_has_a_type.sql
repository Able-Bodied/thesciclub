-- ============================================================================
-- An organization has a type
--
-- The owner, 2026-11-01: logos are hard to make out on the map, so a pin is
-- coloured by what kind of organization it is, and Layers can show or hide
-- each kind. One type each, chosen from what the whole directory holds. An
-- organization made after this, with none, is drawn in the plain colour until
-- it has one. The directory reads the column; whoever may change the
-- organization may set it.
-- ============================================================================

alter table public.organizations
  add column category text check (category in (
    'outdoor', 'team', 'multi_sport', 'hospital', 'gym', 'peer', 'funding', 'veterans'
  ));

grant select (category) on public.organizations to anon, authenticated;

create function public.set_organization_category(p_organization uuid, p_category text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.is_admin() or public.speaks_for(p_organization)) then
    raise exception 'You cannot change this organization.' using errcode = '42501';
  end if;
  update public.organizations o set category = p_category where o.id = p_organization;
end;
$$;

revoke all on function public.set_organization_category(uuid, text) from public, anon;
grant execute on function public.set_organization_category(uuid, text) to authenticated;

update public.organizations set category = 'outdoor' where name in (
  'Able Bodied', 'Access Mammoth', 'Achieve Tahoe', 'Adaptive Adventures',
  'Bay Area Association of Disabled Sailors', 'Central California Adaptive Sports Center',
  'Challenged Sailors San Diego', 'Diveheart', 'Environmental Traveling Companions',
  'High Fives Foundation', 'Life Rolls On', 'NatureTrack', 'Operation Surf', 'ParaCliffHangers',
  'Shared Adventures', 'Team River Runner Palo Alto', 'The Unrecables',
  'United States Adaptive Recreation Center'
);

update public.organizations set category = 'team' where name in (
  'National Wheelchair Basketball Association', 'National Wheelchair Softball Association',
  'Rancho Los Amigos Wheelchair Sports', 'United States Power Soccer Association',
  'United States Wheelchair Rugby Association', 'USA Boccia', 'USA Hockey Sled Hockey',
  'USA Wheelchair Rugby', 'USTA Wheelchair Tennis', 'Wheelchair Lacrosse USA'
);

update public.organizations set category = 'multi_sport' where name in (
  'Ability First Sports', 'Access Leisure', 'Achilles Los Angeles', 'Achilles SF Bay Area',
  'Adaptive Sports Northwest', 'Angel City Sports', 'BlazeSports America',
  'BORP Adaptive Sports', 'Break the Barriers', 'Lakeshore Foundation', 'Move United',
  'SoCal Adaptive Sports'
);

update public.organizations set category = 'hospital' where name in (
  'Craig Hospital', 'Kaiser Foundation Rehabilitation Center', 'Precision Rehabilitation',
  'SCVMC SCI Peer Support', 'Shepherd Center', 'Shirley Ryan AbilityLab'
);

update public.organizations set category = 'gym' where name in (
  'Abilities Recovery Center', 'Center of Restorative Exercise', 'Challenge Center',
  'DRIVEN Neuro', 'National Center for Equine Facilitated Therapy', 'NextStep', 'SCI-FIT',
  'The Perfect Step'
);

update public.organizations set category = 'peer' where name in (
  'Ability360', 'BLINK of an Eye', 'Center for Independent Living', 'Facing Disability',
  'Men with SCI Support Group', 'More Than Walking', 'NorCal SCI', 'PossAbilities',
  'Silicon Valley Independent Living Center', 'SPINALpedia', 'The Lionheart Community',
  'The SCI Club', 'Triumph Foundation', 'United Spinal Association', 'Wheel with Me Foundation'
);

update public.organizations set category = 'funding' where name in (
  'Be Perfect Foundation', 'Bryon Riesch Paralysis Foundation', 'Canine Companions',
  'Christopher & Dana Reeve Foundation', 'Craig H. Neilsen Foundation',
  'Falling Forward Foundation', 'Getting Back Up', 'Help Hope Live', 'Ian Burkhart Foundation',
  'Kelly Brush Foundation', 'North American Spinal Cord Injury Consortium', 'Project 34',
  'ReCARES', 'Thomas E. Smith Foundation', 'Walking With Anthony'
);

update public.organizations set category = 'veterans' where name in (
  'Bay Area and Western Chapter PVA', 'Paralyzed Veterans of America', 'PVA California Chapter',
  'VA Palo Alto Spinal Cord Injury Center'
);
