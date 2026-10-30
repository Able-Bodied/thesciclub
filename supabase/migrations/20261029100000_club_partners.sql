-- ============================================================================
-- Club partners: professionals who connect members
-- ============================================================================
-- The owner, 2026-10-29: a role for people like the peer support lead at a
-- rehab hospital, or a physical therapist at an SCI gym, who work with
-- people with SCI/D every day. An administrator grants it, with the title
-- shown beside their name; nobody can choose it for themselves.
--
-- A partner:
--   * invites without a limit, and makes QR codes and links of their own
--     that let people in until they expire, as an org admin's do;
--   * introduces two members: each is asked, and only when both say yes is
--     a group of the three opened, with the partner's note as its first
--     message. Nobody is told who said no;
--   * sees My people: who they invited or introduced, whether each joined,
--     finished their profile and was introduced to a mentor, and counts of
--     their own. Nothing from conversations, no contact details beyond what
--     the partner already gave, and nothing about anybody else;
--   * keeps a printable card: their name, title, QR code and words of
--     their own choosing.
--
-- Joining, anybody may say they are a professional who works with people
-- with SCI/D (injury_type 'professional'), as a relative says 'family'. That
-- alone grants nothing.
--
-- my_notifications and push_owed are as 20261029070000 with introductions.
-- push-notify words them (kind 'introduction'), so it needs deploying; until
-- then the bell lists them and the push is refused.
-- ============================================================================

-- ------------------------------------------------------- saying it, joining
alter table public.members drop constraint if exists members_injury_type_check;
alter table public.members
  add constraint members_injury_type_check check (injury_type in (
    'quad', 'high_para', 'low_para', 'condition', 'family', 'professional', 'para', 'central_cord'));

comment on column public.members.injury_type is
  'quad, high_para, low_para, condition, family or professional (para and central_cord before 20261015040000); null when not said. professional grants nothing: see club_partners (20261029100000).';

-- ------------------------------------------------------------- the role --
create table if not exists public.club_partners (
  member_id uuid primary key references public.members (id) on delete cascade,
  -- Shown beside their name: "Physical therapist, SCI-FIT".
  title text not null check (title = btrim(title) and char_length(title) between 2 and 80),
  card_heading text check (
    card_heading is null or (card_heading = btrim(card_heading) and char_length(card_heading) between 1 and 80)
  ),
  card_body text check (
    card_body is null or (card_body = btrim(card_body) and char_length(card_body) between 1 and 400)
  ),
  granted_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.club_partners is
  'Members an administrator made club partners, with the title shown beside their name and the words on their card. See 20261029100000.';

alter table public.club_partners enable row level security;
revoke all on public.club_partners from public, anon, authenticated;
-- The title is a label every member sees; the card's words are read through
-- my_partner_card.
grant select (member_id, title) on public.club_partners to authenticated;
grant select, insert, update, delete on public.club_partners to service_role;

drop policy if exists "members see who is a partner" on public.club_partners;
create policy "members see who is a partner"
  on public.club_partners for select
  using (public.is_active_member());

-- Whether this account is an active club partner.
create or replace function private.is_partner(account uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.club_partners p
      join public.members m on m.id = p.member_id and m.status = 'active'
     where p.member_id = account
  );
$$;

revoke all on function private.is_partner(uuid) from public, anon, authenticated;

create or replace function public.i_am_partner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_partner(auth.uid());
$$;

revoke all on function public.i_am_partner() from public, anon;
grant execute on function public.i_am_partner() to authenticated;

-- An administrator makes somebody a partner, or changes their title.
create or replace function public.admin_set_partner(p_member uuid, p_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean text := btrim(coalesce(p_title, ''));
begin
  if not public.is_admin() then
    raise exception 'Not an administrator' using errcode = '42501';
  end if;
  if char_length(clean) < 2 or char_length(clean) > 80 then
    raise exception 'Give them a title of 2 to 80 characters, such as "Physical therapist, SCI-FIT".'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.members m where m.id = p_member and m.status = 'active' and not m.is_seed) then
    raise exception 'Only a member who has joined and is active can be a partner.' using errcode = 'P0002';
  end if;
  insert into public.club_partners (member_id, title, granted_by)
  values (p_member, clean, auth.uid())
  on conflict (member_id) do update set title = excluded.title, updated_at = now();
end;
$$;

create or replace function public.admin_remove_partner(p_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not an administrator' using errcode = '42501';
  end if;
  delete from public.club_partners where member_id = p_member;
end;
$$;

revoke all on function public.admin_set_partner(uuid, text) from public, anon;
revoke all on function public.admin_remove_partner(uuid) from public, anon;
grant execute on function public.admin_set_partner(uuid, text) to authenticated;
grant execute on function public.admin_remove_partner(uuid) to authenticated;

-- ------------------------------------------------------------- the card --
create or replace function public.my_partner_card()
returns table (title text, card_heading text, card_body text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.title, p.card_heading, p.card_body
    from public.club_partners p
   where p.member_id = auth.uid() and private.is_partner(auth.uid());
$$;

create or replace function public.set_my_partner_card(p_heading text, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  heading text := nullif(btrim(coalesce(p_heading, '')), '');
  body text := nullif(btrim(coalesce(p_body, '')), '');
begin
  if not private.is_partner(auth.uid()) then
    raise exception 'Only a club partner has a card.' using errcode = '42501';
  end if;
  if heading is not null and char_length(heading) > 80 then
    raise exception 'Keep the heading to 80 characters.' using errcode = '22023';
  end if;
  if body is not null and char_length(body) > 400 then
    raise exception 'Keep the card''s words to 400 characters.' using errcode = '22023';
  end if;
  update public.club_partners
     set card_heading = heading, card_body = body, updated_at = now()
   where member_id = auth.uid();
end;
$$;

revoke all on function public.my_partner_card() from public, anon;
revoke all on function public.set_my_partner_card(text, text) from public, anon;
grant execute on function public.my_partner_card() to authenticated;
grant execute on function public.set_my_partner_card(text, text) to authenticated;

-- --------------------------------------------------------------- invites --
-- As 20261009020000, and a partner invites without a limit.
create or replace function public.my_invite_permissions()
returns table (can_invite boolean, unlimited boolean)
language sql security definer stable set search_path = '' as $$
  select coalesce(bool_or(m.type = 'mentor' or m.type = 'organization' or m.is_admin or r.linked or r.partner), false),
    coalesce(bool_or(m.type = 'organization' or m.is_admin or r.linked or r.partner), false)
  from public.members m
  cross join lateral (select exists (
    select 1 from public.organization_representatives rep
    join public.organizations o on o.id = rep.organization_id and o.removed_at is null
    where rep.member_id = m.id
  ) as linked,
  exists (select 1 from public.club_partners p where p.member_id = m.id) as partner) r
  where m.id = auth.uid() and m.status = 'active';
$$;

-- -------------------------------------------------------------- QR codes --
-- A partner's own code, with no organization, lets people in as an
-- organization's does (20261028960000), while they are still a partner.
alter table public.qr_codes
  add column if not exists made_as_partner boolean not null default false;

comment on column public.qr_codes.made_as_partner is
  'Made by a club partner with no organization: lets in whoever scans it while live and they are still a partner. See 20261029100000.';

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
         (q.organization_id is null and q.made_as_partner
          and exists (select 1 from public.club_partners p where p.member_id = a.id))
         or (q.organization_id is null and not q.made_as_partner and a.is_admin)
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
       and (q.organization_id is not null or q.made_as_partner)
       and (q.turned_off_at is null or q.turned_off_at > c.claimed_at)
       and (q.expires_at is null or c.claimed_at <= q.expires_at)
       and private.qr_code_maker_stands(q)
  );
$$;

revoke all on function private.qr_code_admits(uuid) from public, anon, authenticated;

-- As 20261028960000, and a partner's lets them in.
create or replace function public.qr_code_details(p_code text)
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
         case when public.joining_is_open() or q.organization_id is not null or q.made_as_partner
              then null else q.contact_email::text end,
         o.name,
         q.organization_id is not null or q.made_as_partner
    from public.qr_codes q
    join public.members a on a.id = q.admin_id
    left join public.organizations o on o.id = q.organization_id
   where q.id = private.live_qr_code(p_code);
$$;

-- As 20261028990000. With no organization: a partner who gives no email
-- makes their own code; an administrator's needs the email to ask.
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
  as_partner boolean := false;
  made public.qr_codes;
begin
  if p_organization is null then
    if private.is_partner(auth.uid()) and (address is null or not public.is_admin()) then
      as_partner := true;
      if address is not null and not private.valid_email(address) then
        address := null;
      end if;
    elsif not public.is_admin() then
      raise exception 'Choose the organization the code is for.' using errcode = '42501';
    elsif address is null or not private.valid_email(address) then
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
  select q.* into made
    from public.qr_codes q
   where q.admin_id = auth.uid()
     and q.turned_off_at is null
     and (q.expires_at is null or q.expires_at > now())
     and q.organization_id is not distinct from p_organization
     and q.made_as_partner = as_partner
     and q.event_name is not distinct from event
     and q.contact_email is not distinct from address::extensions.citext
     and q.expires_at is not distinct from expires
     and q.notes is not distinct from note
   order by q.created_at desc
   limit 1;
  if found then
    return made;
  end if;
  insert into public.qr_codes (admin_id, organization_id, event_name, contact_email, expires_at, notes, made_as_partner)
  values (auth.uid(), p_organization, event, address, expires, note, as_partner)
  returning * into made;
  return made;
end;
$$;

-- --------------------------------------------------------- introductions --
create table if not exists public.introductions (
  id uuid primary key default gen_random_uuid(),
  introduced_by uuid references public.members (id) on delete set null,
  first_id uuid not null references public.members (id) on delete cascade,
  second_id uuid not null references public.members (id) on delete cascade,
  note text not null check (note = btrim(note) and char_length(note) between 1 and 500),
  first_answer boolean,
  first_answered_at timestamptz,
  second_answer boolean,
  second_answered_at timestamptz,
  withdrawn_at timestamptz,
  opened_at timestamptz,
  thread_id uuid references public.chat_threads (id) on delete set null,
  created_at timestamptz not null default now(),
  check (first_id <> second_id)
);

create index if not exists introductions_by_idx on public.introductions (introduced_by, created_at desc);
create index if not exists introductions_first_idx on public.introductions (first_id);
create index if not exists introductions_second_idx on public.introductions (second_id);

comment on table public.introductions is
  'A club partner introducing two members: each says yes or no, and two yeses open a group of the three. See 20261029100000.';

alter table public.introductions enable row level security;
revoke all on public.introductions from public, anon, authenticated;
grant select, insert, update, delete on public.introductions to service_role;

-- How long an introduction waits for its answers.
create or replace function private.introduction_days()
returns integer language sql immutable set search_path = '' as $$ select 30 $$;

-- asked, opened, declined, withdrawn or expired.
create or replace function private.introduction_status(i public.introductions)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when i.opened_at is not null then 'opened'
    when i.withdrawn_at is not null then 'withdrawn'
    when i.first_answer is false or i.second_answer is false then 'declined'
    when i.created_at <= now() - make_interval(days => private.introduction_days()) then 'expired'
    else 'asked'
  end;
$$;

revoke all on function private.introduction_days() from public, anon, authenticated;
revoke all on function private.introduction_status(public.introductions) from public, anon, authenticated;

-- Whether two members have blocked each other, either way.
create or replace function private.blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.member_blocks x
     where (x.blocker_id = a and x.blocked_id = b) or (x.blocker_id = b and x.blocked_id = a)
  );
$$;

revoke all on function private.blocked_between(uuid, uuid) from public, anon, authenticated;

alter table public.notifications
  add column if not exists introduction_id uuid references public.introductions (id) on delete cascade;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'direct', 'group', 'reply', 'reply_participant', 'like', 'group_add', 'report',
  'invite_joined', 'event_reminder', 'org_events', 'grant_open', 'profile_reminder',
  'blocks_weekly', 'reaction', 'event_starting', 'invite_request', 'mention', 'introduction'
));

alter table public.push_muted_kinds drop constraint if exists push_muted_kinds_kind_check;
alter table public.push_muted_kinds add constraint push_muted_kinds_kind_check check (kind in (
  'group_add', 'reply_participant', 'report', 'invite_joined', 'event_reminder', 'org_events',
  'like', 'grant_open', 'profile_reminder', 'reaction', 'event_starting', 'invite_request',
  'mention', 'introduction'
));

-- A partner introduces two members, with a note both will read.
create or replace function public.make_introduction(p_first uuid, p_second uuid, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  clean text := btrim(coalesce(p_note, ''));
  made uuid;
begin
  if not private.is_partner(me) then
    raise exception 'Only a club partner introduces members.' using errcode = '42501';
  end if;
  if p_first is null or p_second is null or p_first = p_second then
    raise exception 'Choose two different members to introduce.' using errcode = '22023';
  end if;
  if me in (p_first, p_second) then
    raise exception 'Introduce two other members; message somebody yourself to meet them.' using errcode = '22023';
  end if;
  if char_length(clean) < 1 or char_length(clean) > 500 then
    raise exception 'Write a note to both of them, of 500 characters or fewer.' using errcode = '22023';
  end if;
  if not (public.chat_is_findable(p_first) and public.chat_is_findable(p_second)) then
    raise exception 'One of those members cannot be introduced.' using errcode = 'P0002';
  end if;
  if private.blocked_between(p_first, p_second)
     or private.blocked_between(me, p_first)
     or private.blocked_between(me, p_second) then
    raise exception 'One of those members cannot be introduced.' using errcode = 'P0002';
  end if;

  -- One at a time for a pair, whoever made it.
  perform pg_advisory_xact_lock(hashtextextended(
    least(p_first, p_second)::text || greatest(p_first, p_second)::text, 0));
  if exists (
    select 1 from public.introductions i
     where least(i.first_id, i.second_id) = least(p_first, p_second)
       and greatest(i.first_id, i.second_id) = greatest(p_first, p_second)
       and private.introduction_status(i) = 'asked'
  ) then
    raise exception 'Those two have already been asked; they have % days to answer.', private.introduction_days()
      using errcode = '23505';
  end if;
  if (select count(*) from public.introductions i
       where i.introduced_by = me and i.created_at > now() - interval '7 days') >= 50 then
    raise exception 'That is 50 introductions this week. Try again in a few days.' using errcode = '54000';
  end if;

  insert into public.introductions (introduced_by, first_id, second_id, note)
  values (me, p_first, p_second, clean)
  returning id into made;

  insert into public.notifications (member_id, kind, tag, actor_id, introduction_id, detail)
  select x, 'introduction', 'introduction:' || made::text, me, made, 'asked'
    from unnest(array[p_first, p_second]) as x;
  perform public.push_notify_send('introduction', jsonb_build_object('id', made, 'step', 'asked'));
  return made;
end;
$$;

-- One of the two answers. Two yeses open a group of the three, the
-- partner's note its first message; the partner is told.
create or replace function public.answer_introduction(p_introduction uuid, p_yes boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  i public.introductions;
  by_ok boolean;
  group_name text;
  claims text := current_setting('request.jwt.claims', true);
  claim_sub text := current_setting('request.jwt.claim.sub', true);
  made uuid;
begin
  if p_yes is null then
    raise exception 'Say yes or no.' using errcode = '22023';
  end if;
  select * into i from public.introductions x
   where x.id = p_introduction and me in (x.first_id, x.second_id)
   for update;
  if not found then
    raise exception 'No such introduction.' using errcode = 'P0002';
  end if;
  if private.introduction_status(i) <> 'asked' then
    raise exception 'This introduction is no longer waiting for an answer.' using errcode = '22023';
  end if;
  if (me = i.first_id and i.first_answer is not null) or (me = i.second_id and i.second_answer is not null) then
    raise exception 'You have already answered.' using errcode = '22023';
  end if;

  if me = i.first_id then
    update public.introductions set first_answer = p_yes, first_answered_at = now()
     where id = i.id returning * into i;
  else
    update public.introductions set second_answer = p_yes, second_answered_at = now()
     where id = i.id returning * into i;
  end if;
  update public.notifications set read_at = coalesce(read_at, now()), seen_at = coalesce(seen_at, now())
   where member_id = me and introduction_id = i.id and detail = 'asked';

  -- Null until both have answered.
  if not coalesce(i.first_answer and i.second_answer, false) then
    return null;
  end if;

  -- Both said yes. Checked again: anything may have changed since.
  if not exists (select 1 from public.members m where m.id = i.first_id and m.status = 'active')
     or not exists (select 1 from public.members m where m.id = i.second_id and m.status = 'active')
     or private.blocked_between(i.first_id, i.second_id) then
    raise exception 'This introduction can no longer go ahead.' using errcode = 'P0002';
  end if;
  by_ok := i.introduced_by is not null
    and exists (select 1 from public.members m where m.id = i.introduced_by and m.status = 'active')
    and not private.blocked_between(i.introduced_by, i.first_id)
    and not private.blocked_between(i.introduced_by, i.second_id);

  select left(
           split_part(btrim(a.display_name), ' ', 1) || ' & ' || split_part(btrim(b.display_name), ' ', 1),
           60)
    into group_name
    from public.members a, public.members b
   where a.id = i.first_id and b.id = i.second_id;

  insert into public.chat_threads (kind, name, created_by)
  values ('group', group_name, case when by_ok then i.introduced_by else i.first_id end)
  returning id into made;

  -- Nobody added anybody: without this, push_notify_enqueue tells the
  -- others that whoever answered last added them to a group.
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  insert into public.chat_thread_members (thread_id, member_id, joined_at)
  select made, x.member, clock_timestamp()
    from unnest(case when by_ok then array[i.introduced_by, i.first_id, i.second_id]
                     else array[i.first_id, i.second_id] end) with ordinality as x(member, n)
   order by x.n;
  perform set_config('request.jwt.claims', coalesce(claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(claim_sub, ''), true);

  update public.introductions set opened_at = now(), thread_id = made where id = i.id;

  if by_ok then
    -- The note opens the conversation: both are told of it as of any message.
    insert into public.chat_messages (thread_id, author_id, body) values (made, i.introduced_by, i.note);
    insert into public.notifications (member_id, kind, tag, actor_id, introduction_id, thread_id, detail)
    values (i.introduced_by, 'introduction', 'introduction:' || i.id::text || ':opened', me, i.id, made, 'opened');
  else
    insert into public.notifications (member_id, kind, tag, actor_id, introduction_id, thread_id, detail)
    select x, 'introduction', 'introduction:' || i.id::text || ':opened',
           case when x = i.first_id then i.second_id else i.first_id end, i.id, made, 'opened'
      from unnest(array[i.first_id, i.second_id]) as x;
  end if;
  perform public.push_notify_send('introduction', jsonb_build_object('id', i.id, 'step', 'opened'));
  return made;
end;
$$;

-- The partner takes back one still waiting.
create or replace function public.withdraw_introduction(p_introduction uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.introductions i set withdrawn_at = now()
   where i.id = p_introduction and i.introduced_by = auth.uid()
     and private.introduction_status(i) = 'asked';
  if not found then
    raise exception 'That introduction is not waiting for an answer.' using errcode = '22023';
  end if;
  delete from public.notifications n
   where n.introduction_id = p_introduction and n.detail = 'asked' and n.read_at is null;
end;
$$;

-- An introduction, to one of the two it introduces. Never says what the
-- other answered, only whether it went ahead.
create or replace function public.introduction_for_me(p_introduction uuid)
returns table (
  id uuid,
  status text,
  my_answer boolean,
  note text,
  created_at timestamptz,
  thread_id uuid,
  partner_id uuid,
  partner_name text,
  partner_photo text,
  partner_title text,
  other_id uuid,
  other_name text,
  other_username text,
  other_photo text,
  other_photo_alt text
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id,
         -- Whoever said yes is never told the other said no: it waits, and
         -- then expires, as an unanswered one does.
         case when private.introduction_status(i) = 'declined'
                   and (case when i.first_id = auth.uid() then i.first_answer else i.second_answer end) is distinct from false
              then case when i.created_at <= now() - make_interval(days => private.introduction_days())
                        then 'expired' else 'asked' end
              else private.introduction_status(i)
         end,
         case when i.first_id = auth.uid() then i.first_answer else i.second_answer end,
         i.note, i.created_at,
         case when exists (select 1 from public.chat_thread_members tm
                            where tm.thread_id = i.thread_id and tm.member_id = auth.uid())
              then i.thread_id end,
         p.id, p.display_name, p.photo_path, cp.title,
         o.id, o.display_name, o.username::text, o.photo_path, o.photo_alt
    from public.introductions i
    join public.members o on o.id = case when i.first_id = auth.uid() then i.second_id else i.first_id end
    left join public.members p on p.id = i.introduced_by
    left join public.club_partners cp on cp.member_id = i.introduced_by
   where i.id = p_introduction
     and auth.uid() in (i.first_id, i.second_id)
     and not private.blocked_between(auth.uid(), o.id);
$$;

-- The introductions a partner made, newest first.
create or replace function public.my_introductions()
returns table (
  id uuid,
  status text,
  -- Of the two, how many said yes so far; never who said no.
  yeses integer,
  note text,
  created_at timestamptz,
  thread_id uuid,
  first_id uuid,
  first_name text,
  first_photo text,
  second_id uuid,
  second_name text,
  second_photo text
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id,
         private.introduction_status(i),
         (coalesce(i.first_answer, false)::int + coalesce(i.second_answer, false)::int),
         i.note, i.created_at,
         case when exists (select 1 from public.chat_thread_members tm
                            where tm.thread_id = i.thread_id and tm.member_id = auth.uid())
              then i.thread_id end,
         a.id, a.display_name, a.photo_path,
         b.id, b.display_name, b.photo_path
    from public.introductions i
    join public.members a on a.id = i.first_id and a.status = 'active'
    join public.members b on b.id = i.second_id and b.status = 'active'
   where i.introduced_by = auth.uid()
     and private.is_partner(auth.uid())
     and not private.blocked_between(auth.uid(), a.id)
     and not private.blocked_between(auth.uid(), b.id)
   order by i.created_at desc
   limit 500;
$$;

revoke all on function public.make_introduction(uuid, uuid, text) from public, anon;
revoke all on function public.answer_introduction(uuid, boolean) from public, anon;
revoke all on function public.withdraw_introduction(uuid) from public, anon;
revoke all on function public.introduction_for_me(uuid) from public, anon;
revoke all on function public.my_introductions() from public, anon;
grant execute on function public.make_introduction(uuid, uuid, text) to authenticated;
grant execute on function public.answer_introduction(uuid, boolean) to authenticated;
grant execute on function public.withdraw_introduction(uuid) to authenticated;
grant execute on function public.introduction_for_me(uuid) to authenticated;
grant execute on function public.my_introductions() to authenticated;

-- ------------------------------------------------------------ My people --
-- Everybody a partner invited (by email, link or code) or introduced. An
-- email only where the partner typed it in themselves. Nobody who blocked
-- them, or whom they blocked.
create or replace function public.my_people()
returns table (
  member_id uuid,
  display_name text,
  photo_path text,
  injury_type text,
  member_type text,
  -- An invite by email still waiting: the address the partner gave.
  invited_email text,
  invited_at timestamptz,
  invite_id uuid,
  invited boolean,
  joined_at timestamptz,
  profile_done boolean,
  introduced_to_mentor boolean,
  my_introductions integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select auth.uid() as id where private.is_partner(auth.uid())
  ),
  mine as (
    -- Those I invited who joined, and those still to.
    select case when i.status = 'consumed' then i.claimed_by end as member_id,
           case when i.status = 'pending' and i.qr_code_id is null then i.email::text end as email,
           i.created_at as invited_at, i.id as invite_id, i.status
      from public.invites i, me
     where i.invited_by_member_id = me.id
       and i.revoked_at is null
       and (i.status = 'consumed' or (i.status = 'pending' and i.qr_code_id is null and i.email is not null))
    union all
    -- Those I introduced, whether or not I invited them.
    select x.member, null, null, null, 'introduced'
      from public.introductions n, me,
           unnest(array[n.first_id, n.second_id]) as x(member)
     where n.introduced_by = me.id
  ),
  people as (
    select member_id,
           max(email) as email,
           min(invited_at) as invited_at,
           (array_agg(invite_id) filter (where invite_id is not null))[1] as invite_id,
           bool_or(status in ('pending', 'consumed')) as invited
      from mine
     where member_id is not null
     group by member_id
  )
  select m.id, m.display_name, m.photo_path, m.injury_type, m.type,
         null::text, p.invited_at, p.invite_id, p.invited, m.created_at,
         public.member_profile_done(m),
         exists (
           select 1 from public.introductions n
             join public.members t on t.id = case when n.first_id = m.id then n.second_id else n.first_id end
            where m.id in (n.first_id, n.second_id) and n.opened_at is not null and t.type = 'mentor'
         ),
         (select count(*)::int from public.introductions n, me
           where n.introduced_by = me.id and m.id in (n.first_id, n.second_id))
    from people p
    join public.members m on m.id = p.member_id and m.status = 'active' and not m.is_seed
   cross join me
   where not private.blocked_between(me.id, m.id)
  union all
  select null, null, null, null, null, x.email, x.invited_at, x.invite_id, true, null, null, null, 0
    from mine x
   where x.member_id is null and x.status = 'pending'
   order by 10 desc nulls last, 7 desc nulls last
   limit 1000;
$$;

-- A partner's own counts, for the period asked: who they invited, who
-- joined, who took part (a post, a reply or an RSVP; never messages), and
-- their introductions.
create or replace function public.my_partner_stats(p_days integer default 30)
returns table (
  invited integer,
  joined integer,
  active integer,
  introductions integer,
  opened integer,
  with_mentor integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select auth.uid() as id where private.is_partner(auth.uid())
  ),
  since as (
    select now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 3660)) as at
  ),
  people as (
    select p.member_id from public.my_people() p where p.member_id is not null
  )
  select
    (select count(*)::int from public.invites i, me, since
      where i.invited_by_member_id = me.id and i.created_at > since.at and i.revoked_at is null),
    (select count(*)::int from public.invites i
       join public.members m on m.id = i.claimed_by and m.status = 'active', me, since
      where i.invited_by_member_id = me.id and i.status = 'consumed' and i.consumed_at > since.at),
    (select count(*)::int from people x, since
      where exists (select 1 from public.chat_posts c
                     where c.author_id = x.member_id and c.created_at > since.at and c.removed_at is null)
         or exists (select 1 from public.event_rsvps r
                     where r.member_id = x.member_id and r.status = 'going' and r.updated_at > since.at)),
    (select count(*)::int from public.introductions n, me, since
      where n.introduced_by = me.id and n.created_at > since.at),
    (select count(*)::int from public.introductions n, me, since
      where n.introduced_by = me.id and n.opened_at > since.at),
    (select count(*)::int from public.my_people() p where p.introduced_to_mentor)
    from me;
$$;

revoke all on function public.my_people() from public, anon;
revoke all on function public.my_partner_stats(integer) from public, anon;
grant execute on function public.my_people() to authenticated;
grant execute on function public.my_partner_stats(integer) to authenticated;

-- ---------------------------------------------- the bell and the push --
-- As 20261029070000, with introductions.
create or replace function public.my_notifications(before timestamptz default null, max_rows integer default 40)
returns table (
  id uuid,
  kind text,
  count integer,
  created_at timestamptz,
  seen boolean,
  read boolean,
  actor_id uuid,
  actor_name text,
  actor_photo text,
  place text,
  excerpt text,
  detail text,
  url text
)
language sql
security definer
stable
set search_path = ''
as $$
  select n.id, n.kind, n.count, n.created_at, n.seen_at is not null, n.read_at is not null,
         n.actor_id,
         case when n.actor_id is null and n.kind in ('direct', 'group', 'reply', 'reply_participant', 'like', 'group_add', 'reaction', 'mention', 'introduction')
              then 'Deleted member' else a.display_name end,
         a.photo_path,
         case
           when n.kind in ('direct', 'group', 'group_add')
                or (n.kind = 'reaction' and n.thread_id is not null) then
             coalesce(t.name, (select e.title from public.events e where e.id = t.event_id))
           when n.kind in ('reply', 'reply_participant', 'like', 'reaction', 'mention') then tp.title
           when n.kind in ('event_reminder', 'event_starting') then ev.title
           when n.kind in ('org_events', 'grant_open', 'invite_request') then o.name
           when n.kind = 'invite_joined' then j.display_name
           -- Who they are being introduced to; to the partner, the group.
           when n.kind = 'introduction' and n.detail = 'opened' and t.id is not null then t.name
           when n.kind = 'introduction' then ox.display_name
         end,
         case
           when (n.kind in ('direct', 'group') or (n.kind = 'reaction' and n.thread_id is not null))
                and m.removed_at is null then
             left(nullif(btrim(m.body), ''), 160)
           when n.kind in ('reply', 'reply_participant', 'like', 'reaction', 'mention')
                and p.removed_at is null then
             left(nullif(btrim(p.body), ''), 160)
           when n.kind = 'grant_open' then gr.name
           when n.kind = 'introduction' and n.detail = 'asked' then left(ix.note, 160)
         end,
         n.detail,
         case
           when n.kind in ('direct', 'group')
                or (n.kind = 'reaction' and n.thread_id is not null) then
             '/chat/t/' || n.thread_id::text || coalesce('?message=' || n.message_id::text, '')
           when n.kind = 'group_add' then '/chat/t/' || n.thread_id::text
           when n.kind in ('reply', 'reply_participant', 'like', 'reaction', 'mention') then
             '/chat/rooms/' || tp.room_id || '/topics/' || tp.id::text
               || coalesce('?post=' || n.post_id::text, '')
           when n.kind = 'report' then '/admin?tab=reports'
           when n.kind = 'blocks_weekly' then '/admin?tab=reports#blocks'
           -- From a QR code or link: the administrators' tally, or for an
           -- org admin, who joined (20261028970000).
           when n.kind = 'invite_joined' and n.detail like 'qr:%' and public.is_admin() then '/admin?tab=invites'
           when n.kind = 'invite_joined' and n.detail like 'qr:%' then '/peers/' || n.joined_id::text
           when n.kind = 'invite_joined' then '/invites'
           when n.kind in ('event_reminder', 'event_starting') then '/events/' || n.event_id::text
           when n.kind in ('org_events', 'grant_open') then '/events/organizations/' || n.organization_id::text
           when n.kind = 'invite_request' then '/invites#requests'
           when n.kind = 'profile_reminder' and n.detail = 'details' then '/profile/details'
           when n.kind = 'profile_reminder' then '/profile?resume'
           when n.kind = 'introduction' and n.detail = 'opened' then '/chat/t/' || n.thread_id::text
           when n.kind = 'introduction' then '/introductions/' || n.introduction_id::text
         end
    from public.notifications n
    left join public.members a on a.id = n.actor_id
    left join public.chat_threads t on t.id = n.thread_id
    left join public.chat_messages m on m.id = n.message_id
    left join public.chat_topics tp on tp.id = n.topic_id
    left join public.chat_posts p on p.id = n.post_id
    left join public.events ev on ev.id = n.event_id
    left join public.organizations o on o.id = n.organization_id
    left join public.members j on j.id = n.joined_id
    left join public.organization_grants gr on gr.id = n.grant_id
    left join public.introductions ix on ix.id = n.introduction_id
    left join public.members ox
      on ox.id = case when ix.first_id = n.member_id then ix.second_id else ix.first_id end
   where n.member_id = auth.uid()
     and (before is null or n.created_at < before)
     and n.created_at > now() - interval '30 days'
     and case
       when n.kind in ('direct', 'group', 'group_add') then exists (
         select 1 from public.chat_thread_members x
          where x.thread_id = n.thread_id and x.member_id = auth.uid()
       )
       when n.kind in ('reply', 'reply_participant') then public.chat_room_is_readable(tp.room_id)
       -- A like is about the post, so it goes with the post.
       when n.kind = 'like' then p.removed_at is null and public.chat_room_is_readable(tp.room_id)
       when n.kind = 'reaction' and n.thread_id is not null then m.removed_at is null and exists (
         select 1 from public.chat_thread_members x
          where x.thread_id = n.thread_id and x.member_id = auth.uid()
       )
       when n.kind = 'reaction' then p.removed_at is null and public.chat_room_is_readable(tp.room_id)
       when n.kind = 'mention' then p.removed_at is null and public.chat_room_is_readable(tp.room_id)
       when n.kind in ('report', 'blocks_weekly') then public.is_admin()
       -- Only while they still speak for its organization.
       when n.kind = 'invite_request' then public.speaks_for(n.organization_id)
       when n.kind = 'introduction' and n.detail = 'opened' then exists (
         select 1 from public.chat_thread_members x
          where x.thread_id = n.thread_id and x.member_id = auth.uid()
       )
       when n.kind = 'introduction' then ix.id is not null and ox.status = 'active'
       else true
     end
     and not exists (
       select 1 from public.member_blocks b
        where b.blocker_id = auth.uid()
          and b.blocked_id in (n.actor_id, tp.author_id, ox.id)
     )
   order by n.created_at desc, n.id
   limit least(greatest(coalesce(max_rows, 40), 1), 100);
$$;

create or replace function public.push_owed(p_secret text, p_event text, p_key jsonb)
returns table (
  endpoint text,
  p256dh text,
  auth text,
  kind text,
  actor_name text,
  body text,
  photo_count integer,
  subject text,
  detail text,
  url text,
  tag text,
  badge integer
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  key_id uuid;
begin
  if p_secret is null or p_secret is distinct from (
    select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'push_notify_secret'
  ) then
    raise exception 'Not the notification trigger.' using errcode = '42501';
  end if;

  if p_event in ('message', 'post', 'report', 'member_joined', 'grant_open', 'invite_request') then
    key_id := (p_key ->> 'id')::uuid;
  end if;

  if p_event = 'message' then
    -- Opens on the message itself (?message=), which the conversation
    -- scrolls to: a later look at the notification should not land on
    -- whatever was said since.
    return query
      select s.endpoint, s.p256dh, s.auth,
             t.kind, a.display_name, m.body, cardinality(m.attachments),
             null::text, null::text,
             '/chat/t/' || t.id::text || '?message=' || m.id::text, 'thread:' || t.id::text,
             public.notification_badge(r.id)
        from public.chat_messages m
        join public.chat_threads t on t.id = m.thread_id
        join public.chat_thread_members tm
          on tm.thread_id = t.id and tm.member_id is distinct from m.author_id
        join public.members r on r.id = tm.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
        left join public.members a on a.id = m.author_id
       where m.id = key_id
         and m.removed_at is null
         and not exists (
           select 1 from public.member_blocks b
            where b.blocker_id = r.id and b.blocked_id = m.author_id
         )
         and not exists (
           select 1 from public.chat_thread_mutes x where x.thread_id = t.id and x.member_id = r.id
         );

  elsif p_event = 'post' then
    -- The starter ('reply'), and everybody else who has posted in the topic
    -- ('reply_participant'). Since 20261003000000 with the reply's words and
    -- its photograph count, as a message has; still no room and no topic.
    return query
      with p as (
        select p.id, p.author_id, p.body, p.attachments,
               tp.id as topic_id, tp.author_id as starter_id,
               tp.room_id, rm.opened_at
          from public.chat_posts p
          join public.chat_topics tp on tp.id = p.topic_id
          join public.chat_rooms rm on rm.id = tp.room_id
         where p.id = key_id and p.removed_at is null
      ),
      owed as (
        select p.starter_id as member_id, 'reply'::text as kind from p
         where p.starter_id is not null and p.starter_id is distinct from p.author_id
        union
        select distinct o.author_id, 'reply_participant'::text
          from p
          join public.chat_posts o on o.topic_id = p.topic_id and o.removed_at is null
         where o.author_id is not null
           and o.author_id is distinct from p.author_id
           and o.author_id is distinct from p.starter_id
      )
      select s.endpoint, s.p256dh, s.auth,
             owed.kind, a.display_name, p.body, coalesce(cardinality(p.attachments), 0),
             null::text, null::text,
             '/chat/rooms/' || p.room_id || '/topics/' || p.topic_id::text || '?post=' || p.id::text,
             'topic:' || p.topic_id::text,
             public.notification_badge(r.id)
        from p
        join owed on true
        join public.members r on r.id = owed.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
        left join public.members a on a.id = p.author_id
       where (p.opened_at is not null or r.is_admin)
         and not exists (
           select 1 from public.member_blocks b
            where b.blocker_id = r.id and b.blocked_id in (p.author_id, p.starter_id)
         )
         and not exists (
           select 1 from public.chat_topic_mutes x where x.topic_id = p.topic_id and x.member_id = r.id
         )
         and not exists (
           select 1 from public.chat_room_mutes x where x.room_id = p.room_id and x.member_id = r.id
         )
         -- Named in it: the mention says so instead, unless its push is off.
         and not exists (
           select 1 from public.chat_post_mentions x
            where x.post_id = p.id and x.member_id = r.id
              and not exists (
                select 1 from public.push_muted_kinds q where q.member_id = r.id and q.kind = 'mention'
              )
         )
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = owed.kind
         );

  elsif p_event = 'like' then
    -- The author of the liked post, once, with the start of their own post.
    -- Not the liker (the policy refuses liking your own, and this says so
    -- too), not somebody paused, not a post taken back or a like already
    -- undone by the time this runs, not a closed room to a member who can no
    -- longer read it, and not through a topic's or room's mute or the switch
    -- on Me. `detail` says whether it was the topic's opening post.
    return query
      with l as (
        select lk.member_id as liker_id, p.id as post_id, p.author_id, p.body,
               p.attachments, tp.id as topic_id, tp.room_id, rm.opened_at,
               p.id = (select f.id from public.chat_posts f
                        where f.topic_id = tp.id
                        order by f.created_at, f.id limit 1) as is_opening
          from public.chat_post_likes lk
          join public.chat_posts p on p.id = lk.post_id and p.removed_at is null
          join public.chat_topics tp on tp.id = p.topic_id
          join public.chat_rooms rm on rm.id = tp.room_id
         where lk.post_id = (p_key ->> 'post_id')::uuid
           and lk.member_id = (p_key ->> 'member_id')::uuid
      )
      select s.endpoint, s.p256dh, s.auth,
             'like'::text, a.display_name, l.body, coalesce(cardinality(l.attachments), 0),
             null::text, case when l.is_opening then 'topic' else 'post' end,
             '/chat/rooms/' || l.room_id || '/topics/' || l.topic_id::text || '?post=' || l.post_id::text,
             'like:' || l.post_id::text,
             public.notification_badge(r.id)
        from l
        join public.members r on r.id = l.author_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
        left join public.members a on a.id = l.liker_id
       where l.author_id is distinct from l.liker_id
         and not exists (
           select 1 from public.member_blocks b
            where b.blocker_id = r.id
              and b.blocked_id in (
                l.liker_id,
                (select tp.author_id from public.chat_topics tp where tp.id = l.topic_id)
              )
         )
         and (l.opened_at is not null or r.is_admin)
         and not exists (
           select 1 from public.chat_topic_mutes x where x.topic_id = l.topic_id and x.member_id = r.id
         )
         and not exists (
           select 1 from public.chat_room_mutes x where x.room_id = l.room_id and x.member_id = r.id
         )
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'like'
         );

  elsif p_event = 'reaction' and p_key ->> 'target' = 'message' then
    -- The message's author, with their own words; the emoji is as it is now,
    -- so one cleared before this runs sends nothing.
    return query
      select s.endpoint, s.p256dh, s.auth,
             'reaction'::text, a.display_name, m.body, coalesce(cardinality(m.attachments), 0),
             null::text, 'message:' || x.emoji,
             '/chat/t/' || t.id::text || '?message=' || m.id::text,
             'reaction:' || m.id::text,
             public.notification_badge(r.id)
        from public.chat_message_reactions x
        join public.chat_messages m
          on m.id = x.target_id and m.removed_at is null and m.notice is null
        join public.chat_threads t on t.id = m.thread_id
        join public.chat_thread_members tm on tm.thread_id = t.id and tm.member_id = m.author_id
        join public.members r on r.id = m.author_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
        left join public.members a on a.id = x.member_id
       where x.target_id = (p_key ->> 'id')::uuid
         and x.member_id = (p_key ->> 'member_id')::uuid
         and x.emoji is not null
         and m.author_id is distinct from x.member_id
         and not exists (
           select 1 from public.member_blocks b
            where (b.blocker_id = r.id and b.blocked_id = x.member_id)
               or (b.blocker_id = x.member_id and b.blocked_id = r.id)
         )
         and not exists (
           select 1 from public.chat_thread_mutes q where q.thread_id = t.id and q.member_id = r.id
         )
         and not exists (
           select 1 from public.push_muted_kinds q where q.member_id = r.id and q.kind = 'reaction'
         );

  elsif p_event = 'reaction' and p_key ->> 'target' = 'post' then
    -- The post's author, as a like: 'topic:' for the topic's opening post.
    return query
      with l as (
        select x.member_id as reactor_id, x.emoji, p.id as post_id, p.author_id, p.body,
               p.attachments, tp.id as topic_id, tp.author_id as starter_id, tp.room_id, rm.opened_at,
               p.id = (select f.id from public.chat_posts f
                        where f.topic_id = tp.id
                        order by f.created_at, f.id limit 1) as is_opening
          from public.chat_post_reactions x
          join public.chat_posts p on p.id = x.target_id and p.removed_at is null
          join public.chat_topics tp on tp.id = p.topic_id
          join public.chat_rooms rm on rm.id = tp.room_id
         where x.target_id = (p_key ->> 'id')::uuid
           and x.member_id = (p_key ->> 'member_id')::uuid
           and x.emoji is not null
      )
      select s.endpoint, s.p256dh, s.auth,
             'reaction'::text, a.display_name, l.body, coalesce(cardinality(l.attachments), 0),
             null::text, case when l.is_opening then 'topic:' else 'post:' end || l.emoji,
             '/chat/rooms/' || l.room_id || '/topics/' || l.topic_id::text || '?post=' || l.post_id::text,
             'reaction:' || l.post_id::text,
             public.notification_badge(r.id)
        from l
        join public.members r on r.id = l.author_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
        left join public.members a on a.id = l.reactor_id
       where l.author_id is distinct from l.reactor_id
         and not exists (
           select 1 from public.member_blocks b
            where (b.blocker_id = r.id and b.blocked_id in (l.reactor_id, l.starter_id))
               or (b.blocker_id = l.reactor_id and b.blocked_id = r.id)
         )
         and (l.opened_at is not null or r.is_admin)
         and not exists (
           select 1 from public.chat_topic_mutes q where q.topic_id = l.topic_id and q.member_id = r.id
         )
         and not exists (
           select 1 from public.chat_room_mutes q where q.room_id = l.room_id and q.member_id = r.id
         )
         and not exists (
           select 1 from public.push_muted_kinds q where q.member_id = r.id and q.kind = 'reaction'
         );

  elsif p_event = 'mention' then
    -- Each member the post named for the first time, checked again: 'topic'
    -- for a topic's opening post, as a like.
    return query
      with l as (
        select p.id as post_id, p.author_id, p.body, p.attachments,
               tp.id as topic_id, tp.author_id as starter_id, tp.room_id, rm.opened_at,
               p.id = (select f.id from public.chat_posts f
                        where f.topic_id = tp.id
                        order by f.created_at, f.id limit 1) as is_opening
          from public.chat_posts p
          join public.chat_topics tp on tp.id = p.topic_id
          join public.chat_rooms rm on rm.id = tp.room_id
         where p.id = (p_key ->> 'id')::uuid and p.removed_at is null
      )
      select s.endpoint, s.p256dh, s.auth,
             'mention'::text, a.display_name, l.body, coalesce(cardinality(l.attachments), 0),
             null::text, case when l.is_opening then 'topic' else 'post' end,
             '/chat/rooms/' || l.room_id || '/topics/' || l.topic_id::text || '?post=' || l.post_id::text,
             'mention:' || l.post_id::text,
             public.notification_badge(r.id)
        from l
        join public.chat_post_mentions x
          on x.post_id = l.post_id and x.created_at = (p_key ->> 'at')::timestamptz
        join public.members r on r.id = x.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
        left join public.members a on a.id = l.author_id
       where r.id is distinct from l.author_id
         and (l.opened_at is not null or r.is_admin)
         and not exists (
           select 1 from public.member_blocks b
            where (b.blocker_id = r.id and b.blocked_id in (l.author_id, l.starter_id))
               or (b.blocker_id = l.author_id and b.blocked_id = r.id)
         )
         and not exists (
           select 1 from public.chat_topic_mutes q where q.topic_id = l.topic_id and q.member_id = r.id
         )
         and not exists (
           select 1 from public.chat_room_mutes q where q.room_id = l.room_id and q.member_id = r.id
         )
         and not exists (
           select 1 from public.push_muted_kinds q where q.member_id = r.id and q.kind = 'mention'
         );

  elsif p_event = 'group_add' then
    return query
      select s.endpoint, s.p256dh, s.auth,
             'group_add'::text, a.display_name, null::text, 0,
             null::text, null::text,
             '/chat/t/' || t.id::text, 'thread:' || t.id::text,
             public.notification_badge(r.id)
        from public.chat_threads t
        join public.chat_thread_members tm
          on tm.thread_id = t.id and tm.member_id = (p_key ->> 'member_id')::uuid
        join public.members r on r.id = tm.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
        left join public.members a on a.id = (p_key ->> 'by')::uuid
       where t.id = (p_key ->> 'thread_id')::uuid
         and t.kind = 'group'
         and t.event_id is null
         and not exists (
           select 1 from public.member_blocks b
            where b.blocker_id = r.id and b.blocked_id = (p_key ->> 'by')::uuid
         )
         and (p_key ->> 'by') is not null
         and (p_key ->> 'by')::uuid <> tm.member_id
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'group_add'
         );

  elsif p_event = 'report' then
    -- Administrators, and not whoever made the report. Nothing about it
    -- reaches the lock screen but that it exists.
    return query
      select s.endpoint, s.p256dh, s.auth,
             'report'::text, null::text, null::text, 0,
             null::text, null::text,
             '/admin?tab=reports', 'report:' || rep.id::text,
             public.notification_badge(r.id)
        from public.chat_reports rep
        join public.members r
          on r.is_admin and r.status = 'active' and r.id is distinct from rep.reporter_id
        join public.push_subscriptions s on s.member_id = r.id
       where rep.id = key_id
         and rep.kind <> 'block'
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'report'
         );

  elsif p_event = 'member_joined' then
    return query
      select s.endpoint, s.p256dh, s.auth,
             'invite_joined'::text, joined.display_name, null::text, 0,
             null::text, null::text,
             -- From a QR code or link: who joined (20261028970000).
             case when i.qr_code_id is not null then '/peers/' || joined.id::text else '/invites' end,
             'joined:' || joined.id::text,
             public.notification_badge(r.id)
        from public.members joined
        join public.invites i on i.id = joined.invite_id
        join public.members r
          on r.id = i.invited_by_member_id and r.status = 'active' and r.id <> joined.id
        join public.push_subscriptions s on s.member_id = r.id
       where joined.id = key_id
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'invite_joined'
         );

  -- 20261028980000: 24 hours before (quiet hours kept), and ten minutes before.
  elsif p_event = 'day_before' then
    return query
      select s.endpoint, s.p256dh, s.auth,
             'event_reminder'::text, null::text, null::text, 0,
             e.title,
             lower(to_char(e.start_time at time zone coalesce(e.timezone, f.timezone, 'America/Los_Angeles'), 'FMHH12:MIam')),
             '/events/' || e.id::text, 'event:' || e.id::text,
             public.notification_badge(r.id)
        from public.event_day_before_sent sent
        join public.events e on e.id = sent.event_id
        left join public.data_feeds f on f.id = e.feed_id
        join public.members r on r.id = sent.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
       where sent.batch = (p_key ->> 'batch')::timestamptz
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'event_reminder'
         );

  elsif p_event = 'starting' then
    return query
      select s.endpoint, s.p256dh, s.auth,
             'event_starting'::text, null::text, null::text, 0,
             e.title,
             lower(to_char(e.start_time at time zone coalesce(e.timezone, f.timezone, 'America/Los_Angeles'), 'FMHH12:MIam')),
             '/events/' || e.id::text, 'starting:' || e.id::text,
             public.notification_badge(r.id)
        from public.event_starting_sent sent
        join public.events e on e.id = sent.event_id
        left join public.data_feeds f on f.id = e.feed_id
        join public.members r on r.id = sent.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
       where sent.batch = (p_key ->> 'batch')::timestamptz
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'event_starting'
         );

  elsif p_event = 'invite_request' then
    -- Somebody asked an org admin for an invite (20261029030000).
    return query
      select s.endpoint, s.p256dh, s.auth,
             'invite_request'::text, null::text, null::text, 0,
             o.name,
             q.name,
             '/invites#requests', 'invite_request:' || o.id::text,
             public.notification_badge(r.id)
        from public.invite_requests q
        join public.organizations o on o.id = q.organization_id
        join public.members r on r.id = q.admin_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
       where q.id = (p_key ->> 'id')::uuid
         and q.status = 'open'
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'invite_request'
         );

  elsif p_event = 'introduction' then
    -- A partner introduced them, or both said yes (20261029100000): the rows
    -- make_introduction and answer_introduction recorded.
    return query
      select s.endpoint, s.p256dh, s.auth,
             'introduction'::text, a.display_name, left(ix.note, 160), 0,
             case when n.detail = 'opened' then t.name else ox.display_name end,
             n.detail,
             case when n.detail = 'opened' then '/chat/t/' || n.thread_id::text
                  else '/introductions/' || ix.id::text end,
             n.tag,
             public.notification_badge(r.id)
        from public.notifications n
        join public.introductions ix on ix.id = n.introduction_id
        join public.members r on r.id = n.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
        left join public.members a on a.id = n.actor_id
        left join public.members ox
          on ox.id = case when ix.first_id = r.id then ix.second_id else ix.first_id end
        left join public.chat_threads t on t.id = n.thread_id
       where n.kind = 'introduction'
         and n.introduction_id = (p_key ->> 'id')::uuid
         and n.detail = p_key ->> 'step'
         and n.read_at is null
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'introduction'
         )
         and not exists (
           select 1 from public.member_blocks b
            where b.blocker_id = r.id and b.blocked_id in (n.actor_id, ox.id)
         );

  elsif p_event = 'daily' then
    -- Tomorrow, in each event's own zone.
    return query
      select s.endpoint, s.p256dh, s.auth,
             'event_reminder'::text, null::text, null::text, 0,
             e.title,
             lower(to_char(e.start_time at time zone coalesce(e.timezone, f.timezone, 'America/Los_Angeles'), 'FMHH12:MIam')),
             '/events/' || e.id::text, 'event:' || e.id::text,
             public.notification_badge(r.id)
        from public.events e
        left join public.data_feeds f on f.id = e.feed_id
        join public.event_rsvps rv on rv.event_id = e.id and rv.status = 'going'
        join public.members r on r.id = rv.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
       where e.all_day
         and (e.start_time at time zone coalesce(e.timezone, f.timezone, 'America/Los_Angeles'))::date
             = (now() at time zone coalesce(e.timezone, f.timezone, 'America/Los_Angeles'))::date + 1
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'event_reminder'
         );

    -- New in the last day from organizations a member follows, one per
    -- organization, counted.
    return query
      select s.endpoint, s.p256dh, s.auth,
             'org_events'::text, null::text, null::text, 0,
             o.name,
             count(*)::text,
             '/events/organizations/' || o.id::text, 'org:' || o.id::text,
             public.notification_badge(s.member_id)
        from public.organization_follows fo
        join public.organizations o on o.id = fo.organization_id
        join public.events e
          on e.organization_id = o.id
         and e.created_at > now() - interval '24 hours'
         and e.start_time > now()
        join public.members r on r.id = fo.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
       where not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'org_events'
         )
       group by s.endpoint, s.p256dh, s.auth, o.id, o.name;

  elsif p_event = 'grant_open' then
    -- A grant's applications opened: everybody following its organization.
    -- body is the grant's name, detail the day this cycle closes.
    return query
      select s.endpoint, s.p256dh, s.auth,
             'grant_open'::text, null::text, g.name, 0,
             o.name,
             to_char(c.cycle_closes, 'FMMon FMDD'),
             '/events/organizations/' || o.id::text, 'grant:' || g.id::text,
             public.notification_badge(r.id)
        from public.organization_grant_windows gw
        join public.organization_grants g on g.id = gw.grant_id
        join public.organizations o on o.id = g.organization_id and o.removed_at is null
        cross join lateral public.grant_window_cycle(
          gw.opens_on, gw.closes_on, gw.yearly, (now() at time zone 'America/Los_Angeles')::date
        ) c
        join public.organization_follows fo on fo.organization_id = g.organization_id
        join public.members r on r.id = fo.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
       where gw.id = key_id
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'grant_open'
         );

  elsif p_event = 'profile_reminder' then
    -- Today's reminders to finish Your details or the profile. detail is the
    -- step; the address opens it.
    return query
      select s.endpoint, s.p256dh, s.auth,
             'profile_reminder'::text, null::text, null::text, 0,
             null::text, pr.step,
             case pr.step when 'details' then '/profile/details' else '/profile?resume' end,
             'profile:' || pr.step,
             public.notification_badge(r.id)
        from public.profile_reminders pr
        join public.members r on r.id = pr.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
       where pr.sent_on = (p_key ->> 'day')::date
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'profile_reminder'
         );

  elsif p_event = 'blocks_weekly' then
    -- The week's count of blocks: the rows blocks_weekly_notify recorded, to
    -- administrators who have not switched off New reports. Names nobody.
    return query
      select s.endpoint, s.p256dh, s.auth,
             'blocks_weekly'::text, null::text, null::text, 0,
             null::text, n.detail,
             '/admin?tab=reports#blocks', n.tag,
             public.notification_badge(r.id)
        from public.notifications n
        join public.members r on r.id = n.member_id and r.is_admin and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
       where n.kind = 'blocks_weekly'
         and n.tag = 'blocks:' || (p_key ->> 'day')
         and not exists (
           select 1 from public.push_muted_kinds x where x.member_id = r.id and x.kind = 'report'
         );
  end if;
end;
$$;

revoke all on function public.my_notifications(timestamptz, integer) from public, anon;
grant execute on function public.my_notifications(timestamptz, integer) to authenticated;
revoke all on function public.push_owed(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.push_owed(text, text, jsonb) to service_role;

notify pgrst, 'reload schema';
