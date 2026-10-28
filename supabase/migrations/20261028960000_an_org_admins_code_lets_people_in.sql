-- ============================================================================
-- An org admin's QR code or link lets their people in, until it expires
-- ============================================================================
-- The owner, 2026-10-28. Org admins (organization_representatives) make QR
-- codes and links for their own organization, from Me as administrators do.
-- A code made for an organization lets in whoever scans it, even while the
-- club is invite only, as long as they scanned it before it expired and
-- before it was turned off; they join as invited by whoever made it. A code
-- with no organization is as before (20261014020000): credit while anybody
-- can join, and an email to ask while joining is closed. Only club
-- administrators make those, and only they name an event.
--
-- Every code may expire (72 hours unless the maker chooses otherwise) and
-- carry a note for its maker. An expired code answers nothing, like a
-- turned-off one, and cannot be claimed.
--
-- The scan is what counts: a code is claimed for the account the moment it
-- signs in (claim_qr_code), so somebody who scanned in time and confirms
-- their email an hour after the code expired is still let in.
-- ============================================================================

alter table public.qr_codes
  add column if not exists organization_id uuid references public.organizations (id) on delete cascade,
  add column if not exists expires_at timestamptz,
  add column if not exists notes text check (
    notes is null or (notes = btrim(notes) and char_length(notes) between 1 and 300)
  );

-- An organization's code needs no email: it lets people in.
alter table public.qr_codes alter column contact_email drop not null;

comment on column public.qr_codes.organization_id is
  'Made by an org admin for this organization: lets in whoever scans it while live. See 20261028960000.';
comment on column public.qr_codes.expires_at is
  'After this, the code answers nothing and cannot be claimed. Null: until turned off. See 20261028960000.';

-- Whoever made a code reads it: administrators and org admins alike.
drop policy if exists "administrators read their own codes" on public.qr_codes;
drop policy if exists "makers read their own codes" on public.qr_codes;
create policy "makers read their own codes"
  on public.qr_codes for select
  using (admin_id = auth.uid());

-- Whether a code's maker may still speak for it: an active administrator for
-- a code with no organization; an active org admin of a live organization
-- (or an administrator) for an organization's.
create or replace function private.qr_code_maker_stands(q public.qr_codes)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members a
     where a.id = q.admin_id and a.status = 'active'
       and (
         (q.organization_id is null and a.is_admin)
         or (
           q.organization_id is not null
           and exists (select 1 from public.organizations o
                        where o.id = q.organization_id and o.removed_at is null)
           and (
             a.is_admin
             or exists (select 1 from public.organization_representatives r
                         where r.organization_id = q.organization_id and r.member_id = a.id)
           )
         )
       )
  );
$$;

revoke all on function private.qr_code_maker_stands(public.qr_codes) from public, anon, authenticated;

-- A live code: not turned off, not expired, and its maker still stands.
create or replace function private.live_qr_code(p_code text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select q.id
    from public.qr_codes q
   where q.code = btrim(coalesce(p_code, ''))
     and q.turned_off_at is null
     and (q.expires_at is null or q.expires_at > now())
     and private.qr_code_maker_stands(q);
$$;

revoke all on function private.live_qr_code(text) from public, anon, authenticated;

-- Whether this account scanned an organization's code while it was live, and
-- its maker still stands: then it may join while joining is closed.
create or replace function private.qr_code_admits(account uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.qr_code_claims c
      join public.qr_codes q on q.id = c.qr_code_id
     where c.account = qr_code_admits.account
       and q.organization_id is not null
       and (q.turned_off_at is null or q.turned_off_at > c.claimed_at)
       and (q.expires_at is null or c.claimed_at <= q.expires_at)
       and private.qr_code_maker_stands(q)
  );
$$;

revoke all on function private.qr_code_admits(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- making one
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
  insert into public.qr_codes (admin_id, organization_id, event_name, contact_email, expires_at, notes)
  values (auth.uid(), p_organization, event, address, p_expires_at, note)
  returning * into made;
  return made;
end;
$$;

revoke all on function public.create_qr_code(uuid, text, text, timestamptz, text) from public, anon;
grant execute on function public.create_qr_code(uuid, text, text, timestamptz, text) to authenticated;

-- Its maker turns a code off, administrator or org admin.
create or replace function public.turn_off_qr_code(p_code_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.qr_codes
     set turned_off_at = coalesce(turned_off_at, now())
   where id = p_code_id and admin_id = auth.uid();
  if not found then
    raise exception 'No such code.' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.turn_off_qr_code(uuid) from public, anon;
grant execute on function public.turn_off_qr_code(uuid) to authenticated;

-- ------------------------------------------------------- what a code says --
-- As 20261014020000, with the organization and whether it lets them in.
drop function if exists public.qr_code_details(text);
create function public.qr_code_details(p_code text)
returns table (
  inviter_name text,
  event_name text,
  joining_open boolean,
  contact_email text,
  organization_name text,
  admits boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.display_name,
         q.event_name,
         public.joining_is_open(),
         case when public.joining_is_open() or q.organization_id is not null
              then null else q.contact_email::text end,
         o.name,
         q.organization_id is not null
    from public.qr_codes q
    join public.members a on a.id = q.admin_id
    left join public.organizations o on o.id = q.organization_id
   where q.id = private.live_qr_code(p_code);
$$;

comment on function public.qr_code_details(text) is
  'For the join screen: who a live QR code is from, for which organization, whether it lets them in, and the email to ask while joining is closed. See 20261028960000.';

revoke all on function public.qr_code_details(text) from public;
grant execute on function public.qr_code_details(text) to anon, authenticated;

-- --------------------------------------------------------- who may join --
-- As 20261022230000, and an organization's live code scanned in time.
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
         or (me.email is not null and private.qr_code_admits(me.id))
         or exists (
           select 1 from public.invites i
            where (
                    i.status = 'pending'
                    and (
                      i.claimed_by = me.id
                      or (me.email is not null and lower(i.email::text) = me.email)
                    )
                  )
               -- Consumed counts only for the account it was consumed by.
               or (i.status = 'consumed' and i.claimed_by = me.id)
         )
       )
  );
$$;

-- ------------------------------------------------ the walk-in's invite, again
-- As 20261018010000: a walk-in on an organization's code joins while joining
-- is closed too, and any code's standing maker gets the credit.
create or replace function public.consume_invite_for_new_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_id uuid;
  account_email text := private.confirmed_email(new.id);
  from_code uuid;
  from_admin uuid;
begin
  select i.id into matched_id
    from public.invites i
   where i.status = 'pending'
     and (
       i.claimed_by = new.id
       or (account_email is not null and lower(i.email::text) = account_email)
     )
   order by coalesce(i.claimed_by = new.id, false) desc, i.created_at
   limit 1
     for update;

  if matched_id is not null then
    -- Whoever joins on it is who it was used by, whoever claimed it first.
    update public.invites
       set status = 'consumed',
           consumed_at = now(),
           claimed_by = new.id,
           claimed_at = coalesce(claimed_at, now())
     where id = matched_id;
  elsif new.invite_id is null
        and auth.uid() = new.id
        and account_email is not null
        and not public.is_blocked_email(account_email)
        and (public.joining_is_open() or private.qr_code_admits(new.id)) then
    -- Credit for the code they came from, if its maker still stands. Turned
    -- off since the claim still counts: it was live then.
    select q.id, q.admin_id into from_code, from_admin
      from public.qr_code_claims c
      join public.qr_codes q on q.id = c.qr_code_id
     where c.account = new.id
       and private.qr_code_maker_stands(q);

    insert into public.invites (
      email, status, consumed_at, claimed_by, claimed_at, joined_while_open,
      invited_by_member_id, qr_code_id
    )
    values (account_email, 'consumed', now(), new.id, now(), public.joining_is_open(),
            from_admin, from_code)
    on conflict (email) where status in ('pending', 'consumed') and email is not null
    do nothing
    returning id into matched_id;
  end if;

  new.invite_id := coalesce(new.invite_id, matched_id);

  -- An instruction to this trigger, not a fact about the member: never
  -- stored. members_start_fresh_not_stored holds it to false afterwards.
  new.start_fresh := false;

  return new;
end;
$$;

revoke all on function public.consume_invite_for_new_member() from public, anon, authenticated;
