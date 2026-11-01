-- The owner, 2026-11-01: Able Bodied also teaches handcycling in Sebastopol.
-- No street address: whoever registers is emailed it, so the pin is at the
-- town's middle. The sign-up is Able Bodied's own, from ablebodied.org, and its
-- note about quadriplegics is what that page says of this location.

insert into public.organization_places
  (organization_id, position, label, address, city, state, postal_code,
   latitude, longitude, location_precision, geocoded_location)
select o.id, 1, 'Handcycling lessons', null, 'Sebastopol', 'CA', null,
       38.4021038, -122.8242220, 'approximate',
       public.geocode_key(null, 'Sebastopol', 'CA')
  from public.organizations o
 where o.name = 'Able Bodied'
   and not exists (
     select 1 from public.organization_places p
      where p.organization_id = o.id and p.city = 'Sebastopol'
   );

update public.organizations o
   set description = replace(
     o.description,
     '- Free one-on-one e-assist handcycling lessons in San Jose and Sebastopol',
     '- Free one-on-one e-assist handcycling lessons in San Jose and Sebastopol. [Register for a Sebastopol lesson](https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ3wZ32McmfXb2P6P5S4cdOaaZ8GPM2kVPnmCD344h8LyXspc-NfcrroP51liWIfLmLTAvkWPMkT) and you are emailed where to go. Its handcycles are not designed for quadriplegics.'
   )
 where o.name = 'Able Bodied';
