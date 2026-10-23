-- ============================================================================
-- Registering for a public event, with or without an account
-- ============================================================================
-- The owner, 2026-10-22. Going or Interested on a public event's page, signed
-- out, asks for a name, an email and a phone, and keeps them as a
-- registration at once: organizations run their events here without losing
-- people to the club's onboarding. Then the welcome page asks them to sign in
-- or join, the same page for everybody, so it never says whether an address
-- is a member's.
--
-- Who sees a registration: whoever may change the event (may_change_event)
-- and administrators, through event_guest_list. Nobody else, and never on the
-- public page.
--
-- An address is not proven by typing it. A registration stays "not
-- confirmed" until an account with that CONFIRMED address signs in or joins;
-- then it becomes that member's RSVP (claim_event_registrations, and a
-- trigger as a member is made). A registration also lets its address join
-- while the club is invite-only, as an invite would (i_am_invited and the
-- sign-up hook): the point of a public event is to bring people in.
--
-- Deleted 90 days after the event (cron event-registrations-expire), and with
-- the event.
-- ============================================================================

create table public.event_registrations (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 100),
  email      extensions.citext not null check (char_length(email) <= 254),
  phone      text check (phone is null or char_length(phone) <= 32),
  status     text not null check (status in ('going', 'interested')),
  member_id  uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, email)
);

create index event_registrations_email_idx on public.event_registrations (email);

alter table public.event_registrations enable row level security;
revoke all on public.event_registrations from public, anon, authenticated;

comment on table public.event_registrations is
  'Sign-ups from a public event''s page, account or not. Read through event_guest_list only. See 20261022190000.';

-- For the public page's form: anybody, signed in or not. One per address per
-- event (a second replaces the first), and a cap per event per minute so a
-- page cannot be flooded.
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
     where e.id = event and e.audience = 'public'
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

revoke all on function public.register_for_event(uuid, text, text, text, text) from public;
grant execute on function public.register_for_event(uuid, text, text, text, text) to anon, authenticated;

-- Registrations made with this member's confirmed address become their RSVPs.
-- Returns the events, newest first, so the app can open the one just made.
create or replace function private.claim_event_registrations_for(member uuid)
returns setof uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  address text := private.confirmed_email(member);
begin
  if address is null or not exists (
    select 1 from public.members m where m.id = member and m.status = 'active'
  ) then
    return;
  end if;

  insert into public.event_rsvps (event_id, member_id, status)
  select r.event_id, member, r.status
    from public.event_registrations r
   where lower(r.email::text) = address and r.member_id is null
  on conflict (event_id, member_id) do nothing;

  return query
    update public.event_registrations r set member_id = member, updated_at = now()
     where lower(r.email::text) = address and r.member_id is null
    returning r.event_id;
end;
$$;

revoke all on function private.claim_event_registrations_for(uuid) from public, anon, authenticated;

create or replace function public.claim_event_registrations()
returns setof uuid
language sql
volatile
security definer
set search_path = ''
as $$
  select private.claim_event_registrations_for(auth.uid());
$$;

revoke all on function public.claim_event_registrations() from public, anon;
grant execute on function public.claim_event_registrations() to authenticated;

create or replace function private.member_claims_event_registrations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.claim_event_registrations_for(new.id);
  return new;
end;
$$;

revoke all on function private.member_claims_event_registrations() from public, anon, authenticated;

create trigger members_claim_event_registrations
  after insert on public.members
  for each row execute function private.member_claims_event_registrations();

-- The organizer's list: members who said yes, and registrations not yet a
-- member's. State is member, joining (an account with that address, no
-- member yet) or unconfirmed (nothing but the form).
create or replace function public.event_guest_list(event uuid)
returns table (
  name text,
  email text,
  phone text,
  status text,
  state text,
  responded_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.may_change_event(event) then
    raise exception 'Only the event''s organizers see its guest list.' using errcode = '42501';
  end if;

  -- Members only when Going: the privacy policy promises that Interested
  -- shares nothing with the host. A registration from the public page is
  -- listed either way, since its form says the organizer sees it.
  return query
    select m.display_name, u.email::text, m.phone, r.status, 'member'::text, r.created_at
      from public.event_rsvps r
      join public.members m on m.id = r.member_id
      left join auth.users u on u.id = m.id
     where r.event_id = event and r.status = 'going'
    union all
    -- A member's address not yet claimed reads as a member; an account with
    -- no member yet, as joining; nothing but the form, as unconfirmed.
    select g.name, g.email::text, g.phone, g.status,
           case
             when exists (
               select 1 from auth.users u join public.members m on m.id = u.id
                where lower(u.email) = lower(g.email::text)
             ) then 'member'
             when exists (
               select 1 from auth.users u where lower(u.email) = lower(g.email::text)
             ) then 'joining'
             else 'unconfirmed'
           end,
           g.created_at
      from public.event_registrations g
     where g.event_id = event and g.member_id is null
       -- Not twice: a member who also said yes in the club is listed once.
       and not exists (
         select 1 from public.event_rsvps r
           join auth.users u on u.id = r.member_id
          where r.event_id = event and lower(u.email) = lower(g.email::text)
       )
    order by 6;
end;
$$;

revoke all on function public.event_guest_list(uuid) from public, anon;
grant execute on function public.event_guest_list(uuid) to authenticated;

-- ------------------------------------------------------------- joining --
-- As 20261018010000, and a registration for a public event lets its address in.
create or replace function public.i_am_invited()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from (
        select auth.uid() as id, private.confirmed_email(auth.uid()) as email
      ) me
     where me.id is not null
       and not (me.email is not null and public.is_blocked_email(me.email))
       and (
         (public.joining_is_open() and me.email is not null)
         or exists (
           select 1 from public.invites i
            where (
                    i.status = 'pending'
                    and (
                      i.claimed_by = me.id
                      or (me.email is not null and lower(i.email::text) = me.email)
                    )
                  )
               -- Consumed counts too, since the members insert policy is
               -- judged after consume_invite_for_new_member has marked it,
               -- but only for the account it was consumed by.
               or (i.status = 'consumed' and i.claimed_by = me.id)
         )
         or (
           me.email is not null
           and exists (
             select 1 from public.event_registrations r
              where lower(r.email::text) = me.email
           )
         )
       )
  );
$$;

comment on function public.i_am_invited() is
  'True when joining is open and the caller has a CONFIRMED address, a pending invite is claimed by the caller or names that address, the caller consumed an invite, or that address registered for a public event; never when the address is blocked. Answers only about the caller.';

-- As 20261014000000, and an address registered for a public event may sign up.
create or replace function public.signup_needs_an_invite(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  provider text := coalesce(event -> 'user' -> 'app_metadata' ->> 'provider', '');
  address text := public.normalize_email(event -> 'user' ->> 'email');
  token text := btrim(coalesce(event -> 'user' -> 'user_metadata' ->> 'invite_token', ''));
begin
  if provider in ('google', 'apple') then
    return '{}'::jsonb;
  end if;

  -- Only an email sign-up is judged on its address and token. Anything else
  -- (phone, anonymous, a payload with no provider) is refused: it fails closed,
  -- open or not.
  if provider = 'email'
     and address is not null
     and not public.is_blocked_email(address)
     and (
       public.joining_is_open()
       or exists (
         select 1 from public.invites i
          where i.status = 'pending'
            and lower(i.email::text) = address
       )
       or exists (
         select 1 from public.event_registrations r
          where lower(r.email::text) = address
       )
       or (
         token <> ''
         and exists (
           select 1 from public.invites i
            where i.token_hash = encode(extensions.digest(token, 'sha256'), 'hex')
              and i.status = 'pending'
              and i.claimed_by is null
         )
       )
     ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error',
    jsonb_build_object(
      'http_code', 403,
      'message', 'This email is not on the invite list.'
    )
  );
end;
$$;

comment on function public.signup_needs_an_invite(jsonb) is
  'Before User Created hook: an email sign-up needs a pending invite for its address, a live invite token, or a registration for a public event, unless joining is open. See 20261012040000, 20261014000000 and 20261022190000.';

-- ----------------------------------------------------------- retention --
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'event-registrations-expire';
  perform cron.schedule(
    'event-registrations-expire', '55 11 * * *',
    $job$delete from public.event_registrations r using public.events e
          where e.id = r.event_id
            and coalesce(e.end_time, e.start_time) < now() - interval '90 days'$job$);
end;
$$;
