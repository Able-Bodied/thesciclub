-- ============================================================================
-- Six towns the geocoder refused
--
-- The owner, 2026-10-31: "I thought we default to the org location if the event
-- does not have one?" We do, but only when that city has a place. These six are
-- organizations' main places, and the settlement check refused them
-- (20261025020000), so an event of theirs with no place of its own had nothing
-- to be measured from and showed at every distance: all 73 of United Spinal's
-- upcoming events, for everybody. These are their town centers.
-- ============================================================================

update public.city_places p
   set latitude = v.latitude,
       longitude = v.longitude,
       settlement = true,
       settlement_checked_at = now()
  from (values
    ('fort totten', 'NY', 40.7920::double precision, -73.7760::double precision),
    ('short hills', 'NJ', 40.7479, -74.3257),
    ('radnor', 'PA', 40.0462, -75.3599),
    ('waukesha', 'WI', 43.0117, -88.2315),
    ('shaver lake', 'CA', 37.1027, -119.3176),
    ('bay shore', 'NY', 40.7251, -73.2454)
  ) as v (city_key, state, latitude, longitude)
 where p.city_key = v.city_key
   and p.state = v.state
   and p.latitude is null;
