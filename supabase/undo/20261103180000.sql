-- Undo for 20261103180000_a_registration_refusal_is_not_a_server_error.sql:
-- register_for_event as 20261029110000 left it. Compare with the live
-- definition first.

create or replace function public.register_for_event(
  event uuid, name text, email text, phone text, status text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  address text := public.normalize_email(email);
  cleaned_name text := btrim(coalesce(name, ''));
  cleaned_phone text := nullif(btrim(coalesce(phone, '')), '');
begin
  if not exists (
    select 1 from public.events e
     where e.id = event
       and coalesce(e.end_time, e.start_time) > now() - interval '1 day'
  ) then
    raise exception 'This event is not taking registrations.' using errcode = 'P0002';
  end if;
  if status is null or status not in ('going', 'interested') then
    raise exception 'Choose Going or Interested.' using errcode = '22023';
  end if;
  if cleaned_name = '' or char_length(cleaned_name) > 100 then
    raise exception 'Add your name.' using errcode = '22023';
  end if;
  if address is null or not private.valid_email(address) then
    raise exception 'That does not look like an email address.' using errcode = '22023';
  end if;
  if cleaned_phone is not null and char_length(cleaned_phone) > 32 then
    raise exception 'That phone number is too long.' using errcode = '22023';
  end if;
  if (
    select count(*) from public.event_registrations r
     where r.event_id = event and r.updated_at > now() - interval '1 minute'
  ) >= 30 then
    raise exception 'Too many registrations just now. Try again in a minute.' using errcode = '54000';
  end if;

  insert into public.event_registrations as r (event_id, name, email, phone, status)
  values (event, cleaned_name, address, cleaned_phone, status)
  on conflict (event_id, email) do update
    set name = excluded.name, phone = excluded.phone, status = excluded.status,
        updated_at = now();
end;
$$;
