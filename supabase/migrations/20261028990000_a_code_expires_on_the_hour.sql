-- ============================================================================
-- A code expires on the hour, and the same code again is the one made
-- ============================================================================
-- The owner, 2026-10-28: invite links and QR codes need no expiry to the
-- second. An expiry is rounded up to the hour, and asking again for a code
-- the same in every way (who it is for, the event, the email, the expiry and
-- the note) while it is still live gives back that one instead of a new one,
-- so pressing Make a link twice in an hour makes one code.
--
-- create_qr_code is as 20261028960000 but for that.
-- ============================================================================

create or replace function public.create_qr_code(
  p_organization uuid,
  p_event_name text,
  p_contact_email text,
  p_expires_at timestamptz,
  p_notes text
)
returns public.qr_codes
language plpgsql
security definer
set search_path = ''
as $$
declare
  event text := nullif(btrim(coalesce(p_event_name, '')), '');
  address text := public.normalize_email(nullif(btrim(coalesce(p_contact_email, '')), ''));
  note text := nullif(btrim(coalesce(p_notes, '')), '');
  -- To the hour, rounded up: no code expires sooner than asked.
  expires timestamptz := case when p_expires_at is null then null
    else date_trunc('hour', p_expires_at)
         + case when p_expires_at = date_trunc('hour', p_expires_at) then interval '0' else interval '1 hour' end
  end;
  made public.qr_codes;
begin
  if p_organization is null then
    if not public.is_admin() then
      raise exception 'Choose the organization the code is for.' using errcode = '42501';
    end if;
    if address is null or not private.valid_email(address) then
      raise exception 'Enter an email address people can write to.' using errcode = '22023';
    end if;
  else
    if not (public.is_admin() or public.speaks_for(p_organization)) then
      raise exception 'Only that organization''s admins can make its codes.' using errcode = '42501';
    end if;
    if not exists (select 1 from public.organizations where id = p_organization and removed_at is null) then
      raise exception 'That organization is no longer in the directory.' using errcode = 'P0002';
    end if;
    if address is not null and not private.valid_email(address) then
      address := null;
    end if;
  end if;
  if event is not null and not public.is_admin() then
    raise exception 'Only an administrator names an event on a code.' using errcode = '42501';
  end if;
  if event is not null and char_length(event) > 80 then
    raise exception 'Keep the event name to 80 characters.' using errcode = '22023';
  end if;
  if note is not null and char_length(note) > 300 then
    raise exception 'Keep the note to 300 characters.' using errcode = '22023';
  end if;
  if p_expires_at is not null
     and (p_expires_at <= now() or p_expires_at > now() + interval '366 days') then
    raise exception 'Choose when the code expires: within a year from now.' using errcode = '22023';
  end if;
  -- The same code again is the one already made (the owner, 2026-10-28):
  -- expiry is to the hour, so pressing again within it makes nothing new.
  select q.* into made
    from public.qr_codes q
   where q.admin_id = auth.uid()
     and q.turned_off_at is null
     and (q.expires_at is null or q.expires_at > now())
     and q.organization_id is not distinct from p_organization
     and q.event_name is not distinct from event
     and q.contact_email is not distinct from address::extensions.citext
     and q.expires_at is not distinct from expires
     and q.notes is not distinct from note
   order by q.created_at desc
   limit 1;
  if found then
    return made;
  end if;
  insert into public.qr_codes (admin_id, organization_id, event_name, contact_email, expires_at, notes)
  values (auth.uid(), p_organization, event, address, expires, note)
  returning * into made;
  return made;
end;
$$;
