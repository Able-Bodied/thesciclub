-- ============================================================================
-- A question shared by an administrator can let people in, for 24 hours
-- ============================================================================
-- The owner, 2026-11-16: "Have a toggle that enables the link to work as an
-- invite link for 24 hours. Meaning user can join the club if they come
-- through the copied link for 24 hours."
--
-- The link is the question's own address with an administrator's code on it
-- (?from=<code>, src/lib/qr-codes.ts): a code made to share a question (or
-- any topic: the topic page does not know which it is) lets in
-- whoever comes through it while it is live, as an organization's or a
-- partner's code does (20261028960000, 20261029100000). Anyone with the link,
-- as often as it is opened, until it expires; turned off from the codes list
-- like any other. Only a club administrator makes one, and it stands only while
-- they are an administrator (private.qr_code_maker_stands, unchanged: a code
-- with no organization, not a partner's, is an administrator's).
--
-- Expand only: a new column and function, and the three rules that ask whether
-- a code lets people in now ask private.qr_code_lets_in. The iPhone app reads
-- none of them directly.
-- ============================================================================

alter table public.qr_codes
  add column if not exists made_to_share boolean not null default false,
  add column if not exists topic_id uuid references public.chat_topics (id) on delete set null;

comment on column public.qr_codes.made_to_share is
  'Made by an administrator to share a question: lets in whoever comes through the link while live (24 hours). See 20261116200000.';
comment on column public.qr_codes.topic_id is
  'The topic a shared link was made for. See 20261116200000.';

-- Whether a code lets in whoever comes through it while live, rather than only
-- crediting its maker.
create or replace function private.qr_code_lets_in(q public.qr_codes)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select q.organization_id is not null or q.made_as_partner or q.made_to_share;
$$;

revoke all on function private.qr_code_lets_in(public.qr_codes) from public, anon, authenticated;

-- As 20261029100000, asking qr_code_lets_in.
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
       and private.qr_code_lets_in(q)
       and (q.turned_off_at is null or q.turned_off_at > c.claimed_at)
       and (q.expires_at is null or c.claimed_at <= q.expires_at)
       and private.qr_code_maker_stands(q)
  );
$$;

revoke all on function private.qr_code_admits(uuid) from public, anon, authenticated;

-- As 20261029100000, asking qr_code_lets_in.
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
         case when public.joining_is_open() or private.qr_code_lets_in(q)
              then null else q.contact_email::text end,
         o.name,
         private.qr_code_lets_in(q)
    from public.qr_codes q
    join public.members a on a.id = q.admin_id
    left join public.organizations o on o.id = q.organization_id
   where q.id = private.live_qr_code(p_code);
$$;

-- As 20261102020000, asking qr_code_lets_in.
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
  scanned text := btrim(coalesce(event -> 'user' -> 'user_metadata' ->> 'qr_code', ''));
begin
  if provider in ('google', 'apple') then
    return '{}'::jsonb;
  end if;

  -- Anything but an email sign-up is refused, open or not.
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
       or (
         token <> ''
         and exists (
           select 1 from public.invites i
            where i.token_hash = encode(extensions.digest(token, 'sha256'), 'hex')
              and i.status = 'pending'
              and i.claimed_by is null
         )
       )
       or (
         scanned <> ''
         and exists (
           select 1 from public.qr_codes q
            where q.id = private.live_qr_code(scanned)
              and private.qr_code_lets_in(q)
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
  'Before User Created hook: an email sign-up needs a pending invite for its address, a live invite token, or a live code that admits, unless joining is open. A registration for an event never counts. See 20261012040000, 20261014000000, 20261022230000, 20261101100000, 20261102020000 and 20261116200000.';

revoke execute on function public.signup_needs_an_invite(jsonb) from public, anon, authenticated;
grant execute on function public.signup_needs_an_invite(jsonb) to supabase_auth_admin;

-- The code for an administrator's share of a question, or any topic: the one they made for it
-- within the hour, so turning the toggle off and on again is one code, or a new
-- one, live for 24 hours. Its note names the question in the codes list.
create or replace function public.share_topic_code(p_topic uuid)
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  topic_title text;
  made public.qr_codes;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can make a link that lets people join.' using errcode = '42501';
  end if;
  select t.title into topic_title from public.chat_topics t where t.id = p_topic;
  if not found then
    raise exception 'That topic is no longer in the club.' using errcode = 'P0002';
  end if;

  select q.* into made
    from public.qr_codes q
   where q.admin_id = auth.uid()
     and q.made_to_share
     and q.topic_id = p_topic
     and q.turned_off_at is null
     and q.created_at > now() - interval '1 hour'
     and q.expires_at > now()
   order by q.created_at desc
   limit 1;
  if not found then
    insert into public.qr_codes (admin_id, made_to_share, topic_id, expires_at, notes)
    values (
      auth.uid(),
      true,
      p_topic,
      now() + interval '24 hours',
      btrim(left('Shared: ' || btrim(topic_title), 300))
    )
    returning * into made;
  end if;
  return query select made.code, made.expires_at;
end;
$$;

comment on function public.share_topic_code(uuid) is
  'An administrator''s code for sharing a question or other topic: anyone who comes through the link in the next 24 hours may join. See 20261116200000.';

revoke all on function public.share_topic_code(uuid) from public, anon;
grant execute on function public.share_topic_code(uuid) to authenticated;
