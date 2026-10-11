-- ============================================================================
-- The email address is the account
-- ============================================================================
-- Twilio's registration was never approved, so a phone number can no longer be
-- what a member is. Everything the number did moves to the email address; see
-- EMAIL-SIGN-IN-PLAN.md (Contract, Workstream A) for the decisions behind this.
--
--   * An invite names an email address. It is claimed by opening the emailed
--     link while signed in (claim_invite), or by signing up at the exact
--     address with the address confirmed. Nothing else matches.
--   * `members.phone` stays, but is now only an optional contact number "for
--     events", typed by the member and never verified. It is not unique and it
--     is no longer an identity: nothing below trusts it.
--   * Members have a @username, unique without regard to case.
--   * Blocking is by email.
--
-- Two things in here are easy to get wrong, and are why this file is long:
--
-- 1. citext and `search_path = ''`. Every definer function in this project
--    pins an empty search path. With one, `citext_col = other_citext` does NOT
--    find citext's operator (operators are looked up through the search path);
--    it silently falls back to a case-SENSITIVE text comparison. So columns of
--    type citext keep their unique indexes (an index uses its own operator
--    class), but functions compare `lower(x::text)` and never rely on `=`
--    between two citext values. The probe proves case-insensitive collisions.
--
-- 2. Nobody may ask "is this address invited?". my_invite_status() and
--    i_am_invited() answer only for the caller's own CONFIRMED address, read
--    from auth.users. Reading the JWT would be wrong twice over: the JWT is
--    stale after an email change, and it does not say whether the address was
--    confirmed. The helpers that take an address (is_blocked_email, ...) are
--    not executable by any client.
--
-- The Before User Created hook (only_a_phone_makes_an_account) was switched
-- off on the hosted project on 2026-10-10, so it is dropped here. The function
-- must not be dropped while the hook still points at it.
-- ============================================================================

create extension if not exists citext with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ----------------------------------------------------------------- members --

alter table public.members alter column phone drop not null;
alter table public.members drop constraint if exists members_phone_key;

alter table public.members
  add constraint members_phone_length check (char_length(phone) <= 32);

alter table public.members add column if not exists username extensions.citext;

-- Stored lowercase (members_a_a_username below), so this is a case-sensitive
-- check on text; the citext type is what makes the unique index ignore case.
alter table public.members
  add constraint members_username_shape check (
    username is null
    or (
      username::text ~ '^[a-z0-9._]{3,20}$'
      and username::text !~ '^[._]|[._]$|\.\.'
    )
  );

create unique index if not exists members_username_key on public.members (username);

comment on column public.members.phone is
  'Optional contact number "for events", typed by the member and never verified. Not unique, not an identity.';
comment on column public.members.username is
  'The @name shown on profiles. Lowercase letters, digits, "." and "_", 3-20. Changed only through set_my_username.';

-- ----------------------------------------------------------------- invites --

alter table public.invites alter column phone_raw drop not null;

-- normalize_phone(null) is '', not null, which would put every email invite on
-- the same '' entry of invites_live_phone_idx. An invite with no number has no
-- `phone`.
alter table public.invites
  alter column phone set expression as (nullif(public.normalize_phone(phone_raw), ''));

alter table public.invites
  add column if not exists email extensions.citext,
  add column if not exists token_hash text,
  add column if not exists claimed_by uuid references auth.users (id) on delete set null,
  add column if not exists claimed_at timestamptz,
  add column if not exists sent_at timestamptz;

alter table public.invites
  add constraint invites_email_or_phone check (email is not null or phone_raw is not null),
  add constraint invites_email_normalised check (
    email is null
    or (
      email::text = lower(btrim(email::text))
      and char_length(email::text) <= 254
      and email::text ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    )
  ),
  add constraint invites_token_hash_unique unique (token_hash);

create unique index if not exists invites_live_email_idx
  on public.invites (email)
  where status in ('pending', 'consumed') and email is not null;

comment on column public.invites.token_hash is
  'sha256 hex of the emailed link token. The token itself is never stored.';

-- Mentors used to write invites directly. They now go through create_my_invite
-- (and may only revoke their own pending invites), so the new columns --
-- email, claimed_by, token_hash -- cannot be written from a profile.
drop policy if exists "members can invite within their allowance" on public.invites;
revoke insert on public.invites from anon, authenticated;
revoke update on public.invites from anon, authenticated;
grant update (status, revoked_at) on public.invites to authenticated;

-- ---------------------------------------------------------- blocked_emails --

create table if not exists public.blocked_emails (
  email      extensions.citext primary key,
  blocked_at timestamptz not null default now(),
  blocked_by uuid references public.members (id) on delete set null,
  note       text,
  constraint blocked_emails_normalised check (email::text = lower(btrim(email::text)))
);

comment on table public.blocked_emails is
  'Addresses that cannot be invited or matched. Written and read through the admin_* functions and view only.';

alter table public.blocked_emails enable row level security;
revoke all on public.blocked_emails from public, anon, authenticated;

-- ----------------------------------------------------------------- helpers --

create schema if not exists private;

create or replace function public.normalize_email(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(lower(btrim(coalesce(raw, ''))), '');
$$;

create or replace function private.valid_email(address text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select address is not null
     and char_length(address) <= 254
     and address ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$';
$$;

-- The address an account has proven, or null. Read from auth.users rather than
-- the JWT, which is stale after a change and says nothing about confirmation.
create or replace function private.confirmed_email(account uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email::text)
    from auth.users u
   where u.id = account
     and u.email is not null
     and u.email_confirmed_at is not null;
$$;

create or replace function public.is_blocked_email(raw_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocked_emails b
     where lower(b.email::text) = public.normalize_email(raw_email)
  );
$$;

create or replace function private.username_is_reserved(name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(name) = any (array[
    'admin', 'administrator', 'sciclub', 'thesciclub', 'the.sci.club', 'sci.club',
    'support', 'help', 'staff', 'team', 'moderator', 'mod', 'owner', 'official',
    'root', 'system', 'security', 'contact', 'info', 'hello', 'invites', 'invite',
    'null', 'undefined', 'deleted.member', 'deleted_member'
  ]);
$$;

create or replace function private.username_is_valid(name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select name is not null
     and name ~ '^[a-z0-9._]{3,20}$'
     and name !~ '^[._]|[._]$|\.\.';
$$;

revoke all on function public.normalize_email(text) from public, anon, authenticated;
grant execute on function public.normalize_email(text) to authenticated;
revoke all on function private.valid_email(text) from public, anon, authenticated;
revoke all on function private.confirmed_email(uuid) from public, anon, authenticated;
revoke all on function public.is_blocked_email(text) from public, anon, authenticated;
revoke all on function private.username_is_reserved(text) from public, anon, authenticated;
revoke all on function private.username_is_valid(text) from public, anon, authenticated;
-- guard_own_member_row is not a definer (it has to see who is writing), so it
-- calls these as the member. They are pure functions of their argument and
-- `private` is not exposed through the API.
grant execute on function private.username_is_reserved(text) to authenticated;
grant execute on function private.username_is_valid(text) to authenticated;

-- ------------------------------------------------------ who is invited ------

create or replace function public.i_am_invited()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Consumed counts as well as pending: the members insert policy is judged
  -- after consume_invite_for_new_member has marked the invite consumed.
  select exists (
    select 1
      from (
        select auth.uid() as id, private.confirmed_email(auth.uid()) as email
      ) me
      join public.invites i
        on i.status in ('pending', 'consumed')
       and (
         i.claimed_by = me.id
         or (me.email is not null and lower(i.email::text) = me.email)
       )
     where me.id is not null
       and not (me.email is not null and public.is_blocked_email(me.email))
  );
$$;

comment on function public.i_am_invited() is
  'True when a live invite is claimed by the caller, or names the caller''s CONFIRMED address, and that address is not blocked. Answers only about the caller.';

revoke all on function public.i_am_invited() from public, anon;
grant execute on function public.i_am_invited() to authenticated;

drop function if exists public.my_invite_status();
create function public.my_invite_status()
returns table (invited boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select public.i_am_invited();
$$;

revoke all on function public.my_invite_status() from public, anon;
grant execute on function public.my_invite_status() to authenticated;

create or replace function public.claim_invite(token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  hashed text;
begin
  -- Every refusal is the same `false`: an unknown, used, revoked or someone
  -- else's token must not be told apart.
  if me is null or coalesce(btrim(token), '') = '' then
    return false;
  end if;
  if exists (select 1 from public.members where id = me) then
    return false;
  end if;
  if public.is_blocked_email(private.confirmed_email(me)) then
    return false;
  end if;

  hashed := encode(extensions.digest(btrim(token), 'sha256'), 'hex');

  update public.invites
     set claimed_by = me,
         claimed_at = coalesce(claimed_at, now())
   where token_hash = hashed
     and status = 'pending'
     and (claimed_by is null or claimed_by = me);

  return found;
end;
$$;

revoke all on function public.claim_invite(text) from public, anon;
grant execute on function public.claim_invite(text) to authenticated;

-- The invite is consumed in the same statement that makes the member, and
-- judged afterwards by the insert policy (i_am_invited), which is why a refused
-- insert rolls the consumption back with it.
create or replace function public.consume_invite_for_new_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_id uuid;
  account_email text := private.confirmed_email(new.id);
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
    update public.invites
       set status = 'consumed', consumed_at = now()
     where id = matched_id;
  end if;

  new.invite_id := coalesce(new.invite_id, matched_id);

  -- An instruction to this trigger, not a fact about the member: never
  -- stored. members_start_fresh_not_stored holds it to false afterwards.
  new.start_fresh := false;

  return new;
end;
$$;

-- The members insert policy: the phone check goes.
drop policy if exists "members insert own row, and only with an invite" on public.members;
create policy "members insert own row, and only with an invite"
  on public.members for insert
  with check (auth.uid() = id and public.i_am_invited());

-- --------------------------------------------------------------- usernames --

create or replace function public.members_a_a_username_fn()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.username := nullif(lower(btrim(new.username::text)), '')::extensions.citext;
  return new;
end;
$$;

revoke all on function public.members_a_a_username_fn() from public, anon, authenticated;

-- Sorts before members_a_guard_own_row so the guard judges the stored form.
create trigger members_a_a_username
  before insert or update of username on public.members
  for each row execute function public.members_a_a_username_fn();

create or replace function public.username_available(name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and private.username_is_valid(public.normalize_email(name))
     and not private.username_is_reserved(public.normalize_email(name))
     and not exists (
       select 1 from public.members m
        where lower(m.username::text) = public.normalize_email(name)
          and m.id <> auth.uid()
     );
$$;

revoke all on function public.username_available(text) from public, anon;
grant execute on function public.username_available(text) to authenticated;

create or replace function public.suggest_usernames(full_name text)
returns setof text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  words text[];
  first_name text;
  last_name text;
  base text;
  candidates text[] := '{}';
  picked text[] := '{}';
  candidate text;
  attempts int := 0;
begin
  if auth.uid() is null then
    return;
  end if;

  -- "José  García-López" -> {jose, garcialopez}: accents stripped (with the
  -- dictionary named, since the search path is empty), then only letters and
  -- digits kept within each word.
  select coalesce(array_agg(w), '{}') into words
    from (
      select regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, part)), '[^a-z0-9]', '', 'g') as w
        from regexp_split_to_table(coalesce(full_name, ''), '\s+') part
    ) parts
   where w <> '';

  if cardinality(words) = 0 then
    return;
  end if;

  first_name := words[1];
  last_name := case when cardinality(words) > 1 then words[cardinality(words)] end;
  base := first_name || coalesce(last_name, '');

  candidates := array[first_name, base];
  if last_name is not null then
    candidates := candidates || array[
      first_name || '.' || last_name,
      first_name || '_' || last_name,
      first_name || left(last_name, 1)
    ];
  end if;

  foreach candidate in array candidates loop
    exit when cardinality(picked) >= 5;
    if not candidate = any (picked)
       and public.username_available(candidate) then
      picked := picked || candidate;
    end if;
  end loop;

  -- Then the plain name with two digits, until there are five.
  while cardinality(picked) < 5 and attempts < 60 loop
    attempts := attempts + 1;
    candidate := left(base, 18) || lpad((floor(random() * 100))::int::text, 2, '0');
    if not candidate = any (picked)
       and public.username_available(candidate) then
      picked := picked || candidate;
    end if;
  end loop;

  return query select unnest(picked);
end;
$$;

revoke all on function public.suggest_usernames(text) from public, anon;
grant execute on function public.suggest_usernames(text) to authenticated;

create or replace function public.set_my_username(name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  wanted text := public.normalize_email(name);
begin
  if me is null or not exists (select 1 from public.members where id = me) then
    raise exception 'Only a member has a username.' using errcode = '42501';
  end if;
  if not private.username_is_valid(wanted) then
    raise exception 'Use 3 to 20 lowercase letters, digits, dots or underscores, not starting or ending with a dot or underscore.'
      using errcode = '22023';
  end if;
  -- A reserved name reads exactly like a taken one.
  if private.username_is_reserved(wanted) then
    raise exception 'That username is taken.' using errcode = '23505';
  end if;

  update public.members set username = wanted where id = me;
exception
  when unique_violation then
    raise exception 'That username is taken.' using errcode = '23505';
end;
$$;

revoke all on function public.set_my_username(text) from public, anon;
grant execute on function public.set_my_username(text) to authenticated;

-- ------------------------------------------------------ guard on own row -----

create or replace function public.guard_own_member_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Joining makes an active peer. Everything else about a membership is
    -- decided by an administrator afterwards, or by the invite trigger.
    if new.is_admin
       or new.type <> 'peer'
       or new.status <> 'active'
       or new.is_seed
       or new.invite_id is not null then
      raise exception 'A new member joins as an active peer. The rest is decided by an administrator.';
    end if;
    -- Onboarding chooses a username; the reserved list is enforced here
    -- because the insert is not made through set_my_username.
    if new.username is null then
      raise exception 'Choose a username to join.' using errcode = '23502';
    end if;
    if private.username_is_reserved(new.username::text) then
      raise exception 'That username is taken.' using errcode = '23505';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    raise exception 'Membership status is changed by an administrator, not from your own profile';
  end if;
  if new.type is distinct from old.type then
    raise exception 'Becoming a mentor is decided by an administrator, not from your own profile';
  end if;
  if new.username is distinct from old.username then
    raise exception 'Your username is changed with set_my_username, not from your profile';
  end if;
  if new.is_seed is distinct from old.is_seed or new.invite_id is distinct from old.invite_id then
    raise exception 'That is a record of how you joined and cannot be changed from your profile';
  end if;
  -- `phone` may be edited now: it is only a contact number for events.
  return new;
end;
$$;

-- ----------------------------------------------------------- admin: invites -

create or replace function public.invites_refuse_blocked()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
begin
  if new.email is not null and public.is_blocked_email(new.email::text) then
    raise exception 'That email address is blocked from the club and cannot be invited';
  end if;
  if new.phone_raw is not null and public.is_blocked(new.phone_raw) then
    raise exception 'That number is blocked from the club and cannot be invited';
  end if;
  return new;
end;
$$;

drop function if exists public.admin_create_invite(text, uuid, uuid, text);
create function public.admin_create_invite(
  raw_email text,
  organization_id uuid default null,
  note text default null
)
returns public.invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  address text := public.normalize_email(raw_email);
  created public.invites;
begin
  if not public.is_admin() then
    raise exception 'Not an administrator';
  end if;
  if not private.valid_email(address) then
    raise exception 'That does not look like an email address' using errcode = '22023';
  end if;
  if organization_id is not null
     and not exists (
       select 1 from public.organizations o where o.id = organization_id and o.can_invite
     ) then
    raise exception 'That organization cannot issue invites';
  end if;
  if public.is_blocked_email(address) then
    raise exception 'That email address is blocked from the club and cannot be invited';
  end if;
  if exists (
    select 1 from public.invites i
     where lower(i.email::text) = address and i.status in ('pending', 'consumed')
  ) then
    raise exception 'That email address is already on the list' using errcode = '23505';
  end if;

  insert into public.invites (email, invited_by_organization_id, invited_by_member_id, note)
  values (
    address::extensions.citext,
    organization_id,
    case when organization_id is null then auth.uid() end,
    nullif(btrim(coalesce(note, '')), '')
  )
  returning * into created;

  return created;
end;
$$;

revoke all on function public.admin_create_invite(text, uuid, text) from public, anon;
grant execute on function public.admin_create_invite(text, uuid, text) to authenticated;

create or replace function public.create_my_invite(raw_email text, note text default null)
returns public.invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  address text := public.normalize_email(raw_email);
  created public.invites;
begin
  -- The rules the direct-insert policy used to hold: an active member who may
  -- invite, within their allowance. 42501 is how the client already reads "the
  -- allowance is spent".
  if me is null
     or not exists (select 1 from public.my_invite_permissions() p where p.can_invite)
     or not (
       (select p.unlimited from public.my_invite_permissions() p)
       or public.live_invite_count(me) < public.mentor_invite_limit()
     ) then
    raise exception 'You cannot add another invite.' using errcode = '42501';
  end if;
  if not private.valid_email(address) then
    raise exception 'That does not look like an email address' using errcode = '22023';
  end if;
  if public.is_blocked_email(address) then
    raise exception 'That email address is blocked from the club and cannot be invited';
  end if;
  if exists (
    select 1 from public.invites i
     where lower(i.email::text) = address and i.status in ('pending', 'consumed')
  ) then
    raise exception 'That email address is already on the list' using errcode = '23505';
  end if;

  insert into public.invites (email, invited_by_member_id, note)
  values (address::extensions.citext, me, nullif(btrim(coalesce(note, '')), ''))
  returning * into created;

  return created;
end;
$$;

revoke all on function public.create_my_invite(text, text) from public, anon;
grant execute on function public.create_my_invite(text, text) to authenticated;

-- "Already used" used to be judged by the invite's number. An email invite has
-- none, so it is judged by the member it made.
create or replace function public.admin_revoke_invite(target uuid)
returns void
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  current_status text;
begin
  if not public.is_admin() then
    raise exception 'Not an administrator';
  end if;

  select status into current_status from public.invites where id = target;
  if not found then
    raise exception 'No such invite';
  end if;

  if current_status = 'consumed'
     and exists (select 1 from public.members where invite_id = target) then
    raise exception 'That invite has already been used — remove the member instead';
  end if;

  update public.invites
     set status = 'revoked', revoked_at = now()
   where id = target;
end;
$$;

-- ----------------------------------------------------------- admin: blocks --

create or replace function public.admin_block_email(raw_email text, note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  address text := public.normalize_email(raw_email);
  holder uuid;
begin
  if not public.is_admin() then
    raise exception 'Not an administrator';
  end if;
  if not private.valid_email(address) then
    raise exception 'That does not look like an email address' using errcode = '22023';
  end if;

  -- The two guards admin_delete_member has: nobody locks themselves out, and
  -- two administrators cannot lock each other out of the club they run.
  select u.id into holder from auth.users u where lower(u.email::text) = address limit 1;
  if holder = auth.uid() then
    raise exception 'You cannot block your own email';
  end if;
  if exists (select 1 from public.members m where m.id = holder and m.is_admin) then
    raise exception 'An administrator cannot be blocked from the application';
  end if;

  update public.invites
     set status = 'revoked', revoked_at = now()
   where lower(email::text) = address
     and status in ('pending', 'consumed');

  insert into public.blocked_emails (email, blocked_by, note)
  values (address::extensions.citext, auth.uid(), nullif(btrim(coalesce(note, '')), ''))
  on conflict do nothing;
end;
$$;

create or replace function public.admin_unblock_email(raw_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not an administrator';
  end if;
  delete from public.blocked_emails where lower(email::text) = public.normalize_email(raw_email);
  if not found then
    raise exception 'That email address is not blocked';
  end if;
end;
$$;

revoke all on function public.admin_block_email(text, text) from public, anon;
grant execute on function public.admin_block_email(text, text) to authenticated;
revoke all on function public.admin_unblock_email(text) from public, anon;
grant execute on function public.admin_unblock_email(text) to authenticated;

-- A number blocked by an administrator removes the member who holds it. That
-- member is found by the number Auth verified (auth.users.phone), never by
-- members.phone, which a member can now type to anything.
create or replace function public.admin_block_number(raw_phone text, block_reason text default null)
returns void
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  target_phone text := public.normalize_phone(raw_phone);
  target_member uuid;
  target_is_admin boolean;
begin
  if not public.is_admin() then
    raise exception 'Not an administrator';
  end if;
  if target_phone = '' then
    raise exception 'No number given';
  end if;

  select m.id, m.is_admin into target_member, target_is_admin
    from public.members m
    join auth.users u on u.id = m.id
   where public.normalize_phone(u.phone) = target_phone;

  if target_member = auth.uid() then
    raise exception 'You cannot block your own number';
  end if;
  if target_is_admin then
    raise exception 'An administrator cannot be blocked from the application';
  end if;

  update public.invites
     set status = 'revoked', revoked_at = now()
   where phone = target_phone
     and status in ('pending', 'consumed');

  if target_member is not null then
    update public.invites
       set status = 'revoked', revoked_at = now()
     where invited_by_member_id = target_member
       and status = 'pending';

    delete from public.members where id = target_member;
  end if;

  insert into public.blocked_numbers (phone_raw, reason, blocked_by)
  values (target_phone, nullif(btrim(coalesce(block_reason, '')), ''), auth.uid())
  on conflict do nothing;
end;
$$;

-- ------------------------------------------------------------- admin views --

create or replace function private.account_created_at_for_invite(claimed uuid, invite_email text)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  -- Its own admin gate, like private.account_created_at. A claimed account
  -- counts, and so does a CONFIRMED account at the invited address.
  select u.created_at
    from auth.users u
   where public.is_admin()
     and (
       u.id = claimed
       or (
         invite_email is not null
         and u.email_confirmed_at is not null
         and lower(u.email::text) = lower(invite_email)
       )
     )
   order by coalesce(u.id = claimed, false) desc
   limit 1;
$$;

revoke all on function private.account_created_at_for_invite(uuid, text) from public, anon;
grant execute on function private.account_created_at_for_invite(uuid, text) to authenticated;

-- Behind its own admin gate, so a view can show an address without naming
-- auth.users in its definition (20260929000000: Supabase's auth_users_exposed
-- advisor flags a view the API can reach that does).
create or replace function private.account_email(account uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email::text from auth.users u where public.is_admin() and u.id = account;
$$;

revoke all on function private.account_email(uuid) from public, anon;
grant execute on function private.account_email(uuid) to authenticated;

-- The columns up to account_created_at keep their place and type; the new ones
-- are appended. has_account now also asks the email side.
create or replace view public.admin_invites with (security_barrier = true) as
select
  i.id,
  i.phone,
  i.phone_raw,
  i.status,
  i.note,
  i.created_at,
  i.consumed_at,
  o.name as invited_by_organization,
  inviter.display_name as invited_by_member,
  inviter.is_admin as invited_by_member_is_admin,
  claim.display_name as claimable_name,
  i.seed_member_id,
  holder.display_name as held_by,
  holder.status as held_by_status,
  (coalesce(
     private.account_created_at_for_invite(i.claimed_by, i.email::text),
     private.account_created_at(i.phone)
   ) is not null) as has_account,
  coalesce(
    private.account_created_at_for_invite(i.claimed_by, i.email::text),
    private.account_created_at(i.phone)
  ) as account_created_at,
  i.email,
  i.claimed_by,
  i.claimed_at,
  i.sent_at
from public.invites i
left join public.organizations o on o.id = i.invited_by_organization_id
left join public.members inviter on inviter.id = i.invited_by_member_id
left join public.members claim on claim.id = i.seed_member_id
left join lateral (
  select h.display_name, h.status
    from public.members h
   where h.invite_id = i.id
      or (i.phone is not null and h.phone = i.phone)
   order by coalesce(h.invite_id = i.id, false) desc
   limit 1
) holder on true
where public.is_admin();

create or replace view public.admin_blocked_emails with (security_barrier = true) as
select
  b.email,
  b.note,
  b.blocked_at,
  blocker.display_name as blocked_by
from public.blocked_emails b
left join public.members blocker on blocker.id = b.blocked_by
where public.is_admin();

revoke all on public.admin_blocked_emails from public, anon, authenticated;
grant select on public.admin_blocked_emails to authenticated;

-- The email is the account's, so it comes from auth.users, through a function
-- that answers only an administrator.
create or replace view public.admin_members with (security_barrier = true) as
select
  m.id,
  m.display_name,
  m.phone,
  m.type,
  m.status,
  m.is_admin,
  m.is_seed,
  m.city,
  m.state,
  m.level_range,
  m.exact_level,
  m.show_in_browse,
  m.created_at,
  m.updated_at,
  public.live_invite_count(m.id) as invites_used,
  public.active_strike_count(m.id) as strikes,
  (
    m.is_admin
    or m.type = 'organization'
    or exists (
      select 1
        from public.organization_representatives r
        join public.organizations o on o.id = r.organization_id and o.removed_at is null
       where r.member_id = m.id
    )
  ) as unlimited_invites,
  private.account_email(m.id) as email,
  m.username::text as username
from public.members m
where public.is_admin();

-- Members see each other's @username.
create or replace view public.browse_members with (security_barrier = true) as
select
  m.id,
  m.type,
  m.display_name,
  m.photo_path,
  m.photo_alt,
  m.avatar_color,
  m.city,
  m.state,
  m.level_range,
  m.exact_level,
  m.completeness,
  m.injury_date,
  m.injury_date_precision,
  m.region,
  (extract(year from age(m.birth_date::timestamptz)))::integer as age,
  m.how_injured,
  m.bio,
  m.detail,
  m.gender,
  m.languages,
  m.independence,
  m.employment,
  m.field_of_work,
  m.education,
  m.education_when,
  m.marital_status,
  m.has_children,
  m.children_when,
  m.interests,
  m.topics,
  m.self_care,
  m.affiliations,
  m.wants_to_mentor,
  m.is_seed,
  m.is_admin,
  m.created_at,
  coalesce((
    select jsonb_agg(
             jsonb_build_object('id', o.id, 'name', o.name, 'short_code', o.short_code, 'logo_path', o.logo_path)
             order by o.name, o.id)
      from public.organization_representatives r
      join public.organizations o on o.id = r.organization_id
     where r.member_id = m.id and o.removed_at is null
  ), '[]'::jsonb) as represented_organizations,
  m.sports_equipment,
  m.grants,
  m.username::text as username
from public.members m
where m.show_in_browse
  and m.status = 'active'
  and exists (
    select 1 from public.members viewer
     where viewer.id = auth.uid() and viewer.status = 'active'
  );

-- ------------------------------------------------------- event host contacts -

create or replace function public.event_host_contacts(event_id uuid)
returns table (member_id uuid, display_name text, email text, phone text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not an administrator';
  end if;

  return query
    select m.id, m.display_name, u.email::text, m.phone
      from public.event_rsvps r
      join public.members m on m.id = r.member_id
      left join auth.users u on u.id = m.id
     where r.event_id = event_host_contacts.event_id
       and r.status = 'going'
     order by m.display_name, m.id;
end;
$$;

revoke all on function public.event_host_contacts(uuid) from public, anon;
grant execute on function public.event_host_contacts(uuid) to authenticated;

-- ----------------------------------------------------- delete my account -----

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  my_email text;
  my_phone text;
  me_admin boolean;
begin
  if me is null then
    raise exception 'You are not signed in.';
  end if;

  select m.is_admin into me_admin from public.members m where m.id = me;
  if me_admin then
    raise exception 'An administrator''s account cannot be deleted from the app. Ask another administrator.';
  end if;

  -- Only addresses and numbers Auth has verified free an invite. members.phone
  -- is typed by the member and could name somebody else's.
  my_email := private.confirmed_email(me);
  my_phone := public.normalize_phone(auth.jwt() ->> 'phone');

  update public.invites
     set status = 'revoked', revoked_at = now()
   where invited_by_member_id = me
     and status = 'pending';

  delete from public.members where id = me;

  delete from public.invites
   where claimed_by = me
      or (my_email is not null and lower(email::text) = my_email)
      or (my_phone <> '' and phone = my_phone);

  delete from auth.users where id = me;
end;
$$;

-- --------------------------------------------------------------- retired ----

-- Off on the hosted project since 2026-10-10 (and removed from config.toml).
drop function if exists public.only_a_phone_makes_an_account(jsonb);

-- Left in place, unused: find_inviters (and the my_number_is_invited it calls)
-- already refuse anybody without a JWT phone. Drop them in a later cleanup.
