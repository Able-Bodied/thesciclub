-- ============================================================================
-- Answering an event invite from its email
-- ============================================================================
-- The owner, 2026-11-14: "add an RSVP button in the e-mails ... a nice e-mail
-- that looks like you are on the invite page for the event ... for all
-- invites sent through e-mail, including a notification e-mail that you were
-- invited. An explicit invite should trigger an invite email."
--
-- The email shows the event as its page does, with Going, Maybe and Can't
-- go. Each is a link: one tap opens the event's page with the answer already
-- saved (an email cannot save it by itself in every mail app).
--
-- Somebody outside the club (an invite from a list, 20261114020000): the
-- link carries their invite's token, and rsvp_event_invite saves the answer
-- on the registration their invite makes, as accept_event_invite does, or
-- notes that they cannot come (invites.declined_at), which the guest list
-- shows. accept_event_invite stays, for the store builds' pages.
--
-- A member invited by name (an invite-only event, set_event_visibility or an
-- invite from a list, 20261106030000 / 20261114020000): they were told in
-- the app; now they are emailed too, from push-notify when the event_notice
-- for that invite runs. event_invite_emails returns each one due, once, and
-- records it. The member's buttons open the event in the club, signed in,
-- where the answer is saved as their own.
--
-- Probe: supabase/tests/rsvp-from-the-invite-email.sql.
-- ============================================================================

alter table public.invites add column if not exists declined_at timestamptz;
comment on column public.invites.declined_at is
  'When the person an event invite went to answered Can''t go. Cleared by Going or Maybe. See 20261114070000.';

-- ---------------------------------------------------- outside the club --
-- p_status: going, interested or no. p_name is used when given; otherwise
-- the name they gave before, or the one the invite was sent with, or the
-- part of their address before the @. Returns the event.
create function public.rsvp_event_invite(p_token text, p_status text, p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invites := private.event_invite_for_token(p_token);
  cleaned_name text := nullif(btrim(coalesce(p_name, '')), '');
  before_name text;
  reg uuid;
begin
  if inv.id is null then
    raise exception 'This invite link has been used or is no longer good.' using errcode = '22023';
  end if;
  if p_status is null or p_status not in ('going', 'interested', 'no') then
    raise exception 'Answer Going, Maybe or Can''t go.' using errcode = '22023';
  end if;
  if cleaned_name is not null and char_length(cleaned_name) > 100 then
    raise exception 'That name is too long.' using errcode = '22023';
  end if;

  if p_status = 'no' then
    -- Their own registration goes; one already claimed by a member is theirs to change in the club.
    delete from public.event_registrations r
     where r.event_id = inv.event_id
       and lower(r.email::text) = lower(inv.email::text)
       and r.member_id is null;
    update public.invites set declined_at = now(), event_registration_id = null where id = inv.id;
    return inv.event_id;
  end if;

  select r.name into before_name
    from public.event_registrations r
   where r.event_id = inv.event_id and lower(r.email::text) = lower(inv.email::text);

  insert into public.event_registrations as r (event_id, name, email, status, added_by)
  values (inv.event_id,
          coalesce(cleaned_name, before_name, nullif(btrim(coalesce(inv.invitee_name, '')), ''),
                   split_part(inv.email::text, '@', 1)),
          inv.email, p_status, inv.invited_by_member_id)
  on conflict (event_id, email) do update
    set name = coalesce(cleaned_name, r.name), status = excluded.status, updated_at = now()
  returning r.id into reg;

  update public.invites set event_registration_id = reg, declined_at = null where id = inv.id;
  return inv.event_id;
end;
$$;
revoke all on function public.rsvp_event_invite(text, text, text) from public;
grant execute on function public.rsvp_event_invite(text, text, text) to anon, authenticated;

-- Their answer so far, for the page to show: going, interested, no, or null.
create function public.event_invite_answer(p_token text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select r.status from public.event_registrations r
      where r.event_id = i.event_id and lower(r.email::text) = lower(i.email::text)),
    case when i.declined_at is not null then 'no' end)
    from private.event_invite_for_token(p_token) i
   where i.id is not null;
$$;
revoke all on function public.event_invite_answer(text) from public;
grant execute on function public.event_invite_answer(text) to anon, authenticated;

-- The guest list says "Can't go" for them: rsvp is 'no'.
create or replace function public.event_invite_tracking(p_event uuid)
returns table (
  id uuid,
  email text,
  name text,
  status text,
  inviter_name text,
  created_at timestamptz,
  sent_at timestamptz,
  opened_at timestamptz,
  link_opened_at timestamptz,
  rsvp text,
  joined_at timestamptz,
  member_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.may_change_event(p_event) then
    raise exception 'Only the event''s organizers can see its invites.' using errcode = '42501';
  end if;
  return query
  select i.id,
         lower(i.email::text),
         coalesce(joined.display_name, r.name, i.invitee_name),
         i.status,
         coalesce(org.name, inviter.display_name),
         i.created_at,
         i.sent_at,
         i.opened_at,
         i.link_opened_at,
         coalesce(
           (select x.status from public.event_rsvps x
             where x.event_id = i.event_id and x.member_id = i.claimed_by),
           r.status,
           case when i.declined_at is not null then 'no' end),
         i.claimed_at,
         joined.display_name
    from public.invites i
    left join public.organizations org on org.id = i.invited_by_organization_id
    left join public.members inviter on inviter.id = i.invited_by_member_id
    left join public.members joined on joined.id = i.claimed_by
    left join public.event_registrations r
      on r.id = i.event_registration_id and lower(r.email::text) = lower(i.email::text)
   where i.event_id = p_event
     and i.email is not null
     and i.status <> 'revoked'
   order by i.created_at desc, i.id desc
   limit 1000;
end;
$$;

-- ------------------------------------------------------ members invited --
create table if not exists public.event_invite_emails_sent (
  event_id uuid not null references public.events (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (event_id, member_id)
);
alter table public.event_invite_emails_sent enable row level security;
revoke all on public.event_invite_emails_sent from public, anon, authenticated;
comment on table public.event_invite_emails_sent is
  'Each member emailed that they were invited to an event, so they are emailed once. See 20261114070000.';

-- Everybody invited before now was told in the app only; they are not emailed late.
insert into public.event_invite_emails_sent (event_id, member_id)
select i.event_id, i.member_id from public.event_invitees i
on conflict do nothing;

-- For push-notify's event_notice run: each member newly invited to the
-- event, with a confirmed address they have proved, once. Not whoever invited
-- them, not somebody who has already answered, and nothing for an event
-- that is over.
create function public.event_invite_emails(p_secret text, p_key jsonb)
returns table (
  email text,
  name text,
  inviter_name text,
  event_id uuid,
  title text,
  description text,
  start_time timestamptz,
  end_time timestamptz,
  all_day boolean,
  timezone text,
  place text,
  photo_path text,
  photo_alt text,
  organization_name text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target uuid := nullif(p_key ->> 'event_id', '')::uuid;
begin
  if p_secret is null or p_secret is distinct from (
    select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'push_notify_secret'
  ) then
    raise exception 'Not the notification trigger.' using errcode = '42501';
  end if;

  return query
    with due as (
      insert into public.event_invite_emails_sent (event_id, member_id)
      select i.event_id, i.member_id
        from public.event_invitees i
        join public.events e on e.id = i.event_id and e.audience = 'people'
        join public.members m on m.id = i.member_id and m.status = 'active'
       where i.event_id = target
         and i.member_id is distinct from i.invited_by
         and coalesce(e.end_time, e.start_time) > now()
         and private.confirmed_email(m.id) is not null
         and not private.email_unproven(m.id)
         and not exists (select 1 from public.event_rsvps x
                          where x.event_id = i.event_id and x.member_id = i.member_id)
         and not exists (select 1 from public.event_registrations r
                          where r.event_id = i.event_id and r.member_id = i.member_id)
      on conflict do nothing
      returning event_invite_emails_sent.event_id, event_invite_emails_sent.member_id
    )
    select private.confirmed_email(d.member_id),
           m.display_name,
           coalesce(inviter.display_name, o.name),
           e.id,
           e.title,
           e.description,
           e.start_time,
           e.end_time,
           e.all_day,
           coalesce(e.timezone, f.timezone, 'America/Los_Angeles'),
           case when e.event_format = 'online' then 'Online'
                else nullif(concat_ws(', ', nullif(btrim(e.location), ''), nullif(btrim(e.city), '')), '')
           end,
           e.photo_path,
           e.photo_alt,
           o.name
      from due d
      join public.events e on e.id = d.event_id
      left join public.data_feeds f on f.id = e.feed_id
      join public.members m on m.id = d.member_id
      left join public.event_invitees i on i.event_id = d.event_id and i.member_id = d.member_id
      left join public.members inviter on inviter.id = i.invited_by
      left join public.organizations o on o.id = e.organization_id and o.removed_at is null;
end;
$$;
revoke all on function public.event_invite_emails(text, jsonb) from public, anon, authenticated;
grant execute on function public.event_invite_emails(text, jsonb) to service_role;
