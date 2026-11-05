-- ============================================================================
-- Confirming your email once you are in
-- ============================================================================
-- The owner, 2026-11-04 (first asked 2026-11-02): somebody who joins with an
-- organization's code, or with an invite link at another address, is in at
-- once and confirms their email afterwards, from Me. Nothing proved those
-- addresses (invite-signup made them confirmed), so:
--
--   * invite-signup notes the account here (note_unproven_email), and an
--     invite link used at its own address needs nothing: it went there;
--   * Me shows a dot and asks for a 6-digit code emailed to the address,
--     typed in while signed in. Never a link: the address's real owner could
--     open it and confirm a stranger's account;
--   * until then the address is not handed out or acted on: not to an
--     event's hosts, not for claiming registrations made with it on a public
--     page, and no reminder emails go to it;
--   * a Google or Apple sign-in at the address proves it, and as that is its
--     owner, the account's password and every other session end.
--
-- Joining by an address on the invite list still confirms first: that is
-- what makes the invite theirs (20261012000000).
--
-- A code lasts 10 minutes and takes 5 tries; one a minute and 5 an hour can
-- be sent. Only the code's salted hash is kept.
-- ============================================================================

create table private.unproven_emails (
  account uuid primary key references auth.users (id) on delete cascade,
  since timestamptz not null default now()
);

comment on table private.unproven_emails is
  'Accounts whose address was never proved: in by a code or another address''s invite link. See 20261104110000.';

create table private.email_proofs (
  account uuid primary key references auth.users (id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  tries smallint not null default 0,
  sent_at timestamptz not null default now(),
  sends smallint not null default 1,
  window_started_at timestamptz not null default now()
);

comment on table private.email_proofs is
  'The code emailed to an account''s own address, while it is unproven. See 20261104110000.';

revoke all on table private.unproven_emails, private.email_proofs from public, anon, authenticated;

create function private.email_unproven(account uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.unproven_emails u where u.account = email_unproven.account);
$$;

revoke all on function private.email_unproven(uuid) from public, anon, authenticated;

-- --------------------------------------------------------- invite-signup --
create function public.note_unproven_email(p_account uuid)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  insert into private.unproven_emails (account)
  select u.id from auth.users u where u.id = p_account
  on conflict (account) do nothing;
  select exists (select 1 from private.unproven_emails u where u.account = p_account);
$$;

revoke all on function public.note_unproven_email(uuid) from public, anon, authenticated;
grant execute on function public.note_unproven_email(uuid) to service_role;

-- ------------------------------------------------------------------ Me --
-- The address to confirm, or null when there is nothing to do.
create function public.my_unproven_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email::text)
    from auth.users u
    join private.unproven_emails p on p.account = u.id
   where u.id = auth.uid();
$$;

revoke all on function public.my_unproven_email() from public, anon;
grant execute on function public.my_unproven_email() to authenticated;

-- ---------------------------------------------------------- prove-email --
-- The address to email the code to, or null to send nothing.
create function public.start_email_proof(p_account uuid, p_code_hash text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  address text;
  mine private.email_proofs%rowtype;
begin
  delete from private.email_proofs where expires_at < now() - interval '1 day';
  if p_account is null or coalesce(p_code_hash, '') = '' or not private.email_unproven(p_account) then
    return null;
  end if;
  select lower(u.email::text) into address from auth.users u where u.id = p_account;
  if address is null or public.is_blocked_email(address) then
    return null;
  end if;

  select * into mine from private.email_proofs where account = p_account for update;
  if found then
    if mine.sent_at > now() - interval '1 minute' then
      return null;
    end if;
    if mine.window_started_at > now() - interval '1 hour' and mine.sends >= 5 then
      return null;
    end if;
  end if;

  insert into private.email_proofs (account, code_hash, expires_at)
  values (p_account, p_code_hash, now() + interval '10 minutes')
  on conflict (account) do update
    set code_hash = excluded.code_hash,
        expires_at = excluded.expires_at,
        tries = 0,
        sent_at = now(),
        sends = case
          when private.email_proofs.window_started_at > now() - interval '1 hour'
            then private.email_proofs.sends + 1
          else 1
        end,
        window_started_at = case
          when private.email_proofs.window_started_at > now() - interval '1 hour'
            then private.email_proofs.window_started_at
          else now()
        end;
  return address;
end;
$$;

create function public.finish_email_proof(p_account uuid, p_code_hash text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  proof private.email_proofs%rowtype;
begin
  select * into proof from private.email_proofs where account = p_account for update;
  if not found or proof.expires_at < now() or proof.tries >= 5 then
    return false;
  end if;
  if proof.code_hash is distinct from p_code_hash then
    update private.email_proofs set tries = tries + 1 where account = p_account;
    return false;
  end if;
  delete from private.email_proofs where account = p_account;
  delete from private.unproven_emails where account = p_account;
  -- What waited for the proof.
  perform private.claim_event_registrations_for(p_account);
  return true;
end;
$$;

revoke all on function public.start_email_proof(uuid, text) from public, anon, authenticated;
revoke all on function public.finish_email_proof(uuid, text) from public, anon, authenticated;
grant execute on function public.start_email_proof(uuid, text) to service_role;
grant execute on function public.finish_email_proof(uuid, text) to service_role;

-- -------------------------------------------------- Google or Apple proves --
-- Linked by its address, so this is the address's owner: whoever made the
-- account with a password is signed out and cannot sign in again.
create function private.provider_proves_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.provider in ('google', 'apple')
     and private.email_unproven(new.user_id)
     and lower(new.identity_data ->> 'email') = (
       select lower(u.email::text) from auth.users u where u.id = new.user_id
     ) then
    delete from private.unproven_emails where account = new.user_id;
    delete from private.email_proofs where account = new.user_id;
    update auth.users set encrypted_password = null where id = new.user_id;
    delete from auth.sessions where user_id = new.user_id;
    perform private.claim_event_registrations_for(new.user_id);
  end if;
  return new;
end;
$$;

revoke all on function private.provider_proves_email() from public, anon, authenticated;

create trigger provider_proves_email
  after insert on auth.identities
  for each row execute function private.provider_proves_email();

-- -------------------------------------------- what waits for the proof --
create or replace function private.claim_event_registrations_for(member uuid)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  address text := private.confirmed_email(member);
begin
  -- Registrations made with an address are theirs once it is (20261104110000).
  if address is null or private.email_unproven(member) or not exists (
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

create or replace function public.event_guest_list(event uuid)
returns table(name text, email text, phone text, status text, state text, responded_at timestamp with time zone, registration_id uuid, invite_status text, invite_id uuid)
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
    -- Not an address the member has not confirmed (20261104110000).
    select m.display_name, case when private.email_unproven(m.id) then null else u.email::text end,
           m.phone, r.status, 'member'::text, r.created_at,
           null::uuid, null::text, null::uuid
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
           g.created_at,
           g.id,
           inv.status,
           case
             when inv.status = 'pending'
              and (inv.invited_by_member_id = (select auth.uid()) or public.is_admin())
               then inv.id
           end
      from public.event_registrations g
      left join lateral (
        select i.id, i.status, i.invited_by_member_id
          from public.invites i
         where lower(i.email::text) = lower(g.email::text)
           and i.status in ('pending', 'consumed')
         order by i.status = 'pending' desc, i.created_at desc
         limit 1
      ) inv on true
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

create or replace function public.event_reminder_emails(p_secret text, p_key jsonb)
returns table(email text, name text, title text, starts text, place text, url text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch_at timestamptz := (p_key ->> 'batch')::timestamptz;
begin
  if p_secret is null or p_secret is distinct from (
    select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'push_notify_secret'
  ) then
    raise exception 'Not the notification trigger.' using errcode = '42501';
  end if;

  return query
    with candidates as (
      select sent.event_id, sent.member_id
        from public.event_day_before_sent sent
       where batch_at is not null and sent.batch = batch_at
      union
      select e.id, rv.member_id
        from public.events e
        left join public.data_feeds f on f.id = e.feed_id
        join public.event_rsvps rv on rv.event_id = e.id and rv.status = 'going'
       where batch_at is null
         and e.all_day
         and (e.start_time at time zone coalesce(e.timezone, f.timezone, 'America/Los_Angeles'))::date
             = (now() at time zone coalesce(e.timezone, f.timezone, 'America/Los_Angeles'))::date + 1
    ),
    due as (
      insert into public.event_reminder_emails_sent (event_id, member_id)
      select c.event_id, c.member_id
        from candidates c
        join public.members r on r.id = c.member_id and r.status = 'active'
       where r.email_event_reminders
         and private.confirmed_email(r.id) is not null
         and not private.email_unproven(r.id)
      on conflict do nothing
      returning event_id, member_id
    )
    select private.confirmed_email(d.member_id),
           r.display_name,
           e.title,
           case when e.all_day
                then to_char(e.start_time at time zone coalesce(e.timezone, f.timezone, 'America/Los_Angeles'), 'FMDay, FMMonth FMDD') || ', all day'
                else to_char(e.start_time at time zone coalesce(e.timezone, f.timezone, 'America/Los_Angeles'), 'FMDay, FMMonth FMDD "at" FMHH12:MI ')
                     || lower(to_char(e.start_time at time zone coalesce(e.timezone, f.timezone, 'America/Los_Angeles'), 'AM'))
           end,
           case when e.event_format = 'online' then 'Online'
                else nullif(concat_ws(', ', nullif(btrim(e.location), ''), nullif(btrim(e.city), '')), '')
           end,
           'https://thesciclub.com/events/' || e.id::text
      from due d
      join public.events e on e.id = d.event_id
      left join public.data_feeds f on f.id = e.feed_id
      join public.members r on r.id = d.member_id;
end;
$$;

-- ------------------------------------------------------------- backfill --
-- Made by invite-signup before now: confirmed with no email sent, from a
-- code or a link, and never signed in with Google or Apple. A link used at
-- the address it went to proved it.
insert into private.unproven_emails (account, since)
select u.id, u.created_at
  from auth.users u
 where u.email is not null
   and u.email_confirmed_at is not null
   and u.confirmation_sent_at is null
   and (u.raw_user_meta_data ? 'qr_code' or u.raw_user_meta_data ? 'invite_token')
   and not exists (
     select 1 from auth.identities i
      where i.user_id = u.id and i.provider in ('google', 'apple')
   )
   and not exists (
     select 1 from public.invites inv
      where inv.token_hash = encode(extensions.digest(btrim(u.raw_user_meta_data ->> 'invite_token'), 'sha256'), 'hex')
        and lower(inv.email::text) = lower(u.email::text)
   )
on conflict (account) do nothing;
