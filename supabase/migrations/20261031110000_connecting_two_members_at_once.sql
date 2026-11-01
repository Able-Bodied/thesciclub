-- Stats & controls, for org admins as well as trusted partners (the owner,
-- 2026-10-31).
--
-- Connecting two members no longer asks either: "most likely they know, they
-- have already been told." make_introduction opens the group at once, with
-- the note as its first line, and the connector in it only if they chose. It
-- is added to by whoever connects them, so each of the two gets the ordinary
-- "added you to a group" notification, and can leave, block or report as in
-- any group. A blocked pair is still refused, and a pair connected once is
-- not connected again, so somebody who left is not pulled back in.
--
-- An introduction still waiting from before this keeps its answer page and
-- answer_introduction until it runs out; connecting that pair replaces it.
--
-- Who connects: can_connect, a partner, an org admin or a club administrator.
-- my_people, my_partner_stats and my_introductions widen to the same people.
--
-- my_organization_stats counts only what an org admin can already see person
-- by person on the organization's page, and no conversation.

create function private.can_connect(account uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_partner(account) or exists (
    select 1 from public.members m
     where m.id = account
       and m.status = 'active'
       and (
         m.is_admin
         or exists (
           select 1 from public.organization_representatives r
             join public.organizations o on o.id = r.organization_id and o.removed_at is null
            where r.member_id = account
         )
       )
  );
$$;
revoke all on function private.can_connect(uuid) from public, anon, authenticated;

create function public.i_can_connect()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_connect(auth.uid());
$$;
revoke all on function public.i_can_connect() from public, anon;
grant execute on function public.i_can_connect() to authenticated, service_role;

create or replace function public.make_introduction(
  p_first uuid,
  p_second uuid,
  p_note text,
  p_join boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  clean text := btrim(coalesce(p_note, ''));
  joins boolean := coalesce(p_join, false);
  group_name text;
  thread uuid;
  made uuid;
begin
  if not private.can_connect(me) then
    raise exception 'Only an org admin or a trusted partner connects members.' using errcode = '42501';
  end if;
  if p_first is null or p_second is null or p_first = p_second then
    raise exception 'Choose two different members to connect.' using errcode = '22023';
  end if;
  if me in (p_first, p_second) then
    raise exception 'Connect two other members; message somebody yourself to meet them.' using errcode = '22023';
  end if;
  if char_length(clean) < 1 or char_length(clean) > 500 then
    raise exception 'Write a note to both of them, of 500 characters or fewer.' using errcode = '22023';
  end if;
  if not (public.chat_is_findable(p_first) and public.chat_is_findable(p_second)) then
    raise exception 'One of those members cannot be connected.' using errcode = 'P0002';
  end if;
  if private.blocked_between(p_first, p_second)
     or private.blocked_between(me, p_first)
     or private.blocked_between(me, p_second) then
    raise exception 'One of those members cannot be connected.' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    least(p_first, p_second)::text || greatest(p_first, p_second)::text, 0));
  if exists (
    select 1 from public.introductions i
     where least(i.first_id, i.second_id) = least(p_first, p_second)
       and greatest(i.first_id, i.second_id) = greatest(p_first, p_second)
       and i.opened_at is not null
  ) then
    raise exception 'Those two have been connected already.' using errcode = '23505';
  end if;
  if (select count(*) from public.introductions i
       where i.introduced_by = me and i.created_at > now() - interval '7 days') >= 50 then
    raise exception 'That is 50 connections this week. Try again in a few days.' using errcode = '54000';
  end if;

  -- One from before this, still waiting on an answer, is replaced.
  with waiting as (
    update public.introductions i set withdrawn_at = now()
     where least(i.first_id, i.second_id) = least(p_first, p_second)
       and greatest(i.first_id, i.second_id) = greatest(p_first, p_second)
       and private.introduction_status(i) = 'asked'
    returning i.id
  )
  delete from public.notifications n
   using waiting
   where n.introduction_id = waiting.id and n.detail = 'asked' and n.read_at is null;

  select left(
           split_part(btrim(a.display_name), ' ', 1) || ' & ' || split_part(btrim(b.display_name), ' ', 1),
           60)
    into group_name
    from public.members a, public.members b
   where a.id = p_first and b.id = p_second;

  insert into public.chat_threads (kind, name, created_by)
  values ('group', group_name, case when joins then me else p_first end)
  returning id into thread;

  -- Added by the connector: push_notify_enqueue tells each of the two so.
  insert into public.chat_thread_members (thread_id, member_id, joined_at)
  select thread, x.member, clock_timestamp()
    from unnest(case when joins then array[me, p_first, p_second]
                     else array[p_first, p_second] end) with ordinality as x(member, n)
   order by x.n;

  insert into public.introductions
    (introduced_by, first_id, second_id, note, partner_joins, opened_at, thread_id)
  values (me, p_first, p_second, clean, joins, now(), thread)
  returning id into made;

  -- "<connector> connected you…", with the note. A notice is never pushed.
  insert into public.chat_messages (thread_id, author_id, body, notice)
  values (thread, me, clean, 'introduced');

  return made;
end;
$$;

create function public.my_organization_stats(p_organization uuid, p_days integer default 30)
returns table (
  members integer,
  joined integer,
  left_it integer,
  waiting integer,
  by_code integer,
  by_check_in integer,
  events_held integer,
  events_ahead integer,
  going integer,
  checked_in integer,
  reviews integer,
  rating numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with since as (
    select now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 3660)) as at
  ),
  held as (
    select e.id from public.events e, since
     where e.organization_id = p_organization and e.start_time > since.at and e.start_time <= now()
  ),
  belonging as (
    select om.joined_at, om.joined_via, om.left_at, om.denied_at
      from public.organization_members om
      join public.members m on m.id = om.member_id and not m.is_seed
     where om.organization_id = p_organization
       and (om.left_at is not null or m.status = 'active')
  ),
  theirs as (
    select r.rating, r.created_at
      from public.reviews r
      left join public.events e on e.id = r.event_id
     where r.removed_at is null
       and coalesce(r.organization_id, e.organization_id) = p_organization
  )
  select
    (select count(*)::int from belonging b where b.left_at is null and b.denied_at is null),
    (select count(*)::int from belonging b, since
      where b.denied_at is null and b.joined_at > since.at),
    (select count(*)::int from belonging b, since where b.left_at > since.at),
    (select count(*)::int from public.organization_join_requests q
      where q.organization_id = p_organization),
    (select count(*)::int from belonging b, since
      where b.denied_at is null and b.joined_at > since.at and b.joined_via = 'code'),
    (select count(*)::int from belonging b, since
      where b.denied_at is null and b.joined_at > since.at and b.joined_via = 'check_in'),
    (select count(*)::int from held),
    (select count(*)::int from public.events e
      where e.organization_id = p_organization and e.start_time > now()),
    (select count(*)::int from public.event_rsvps r
      where r.status = 'going' and r.event_id in (select id from held)),
    (select count(*)::int from public.event_check_ins c
      where c.event_id in (select id from held)),
    (select count(*)::int from theirs t, since where t.created_at > since.at),
    (select round(avg(t.rating), 1) from theirs t, since where t.created_at > since.at)
   where public.is_admin() or public.speaks_for(p_organization);
$$;
revoke all on function public.my_organization_stats(uuid, integer) from public, anon;
grant execute on function public.my_organization_stats(uuid, integer) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.my_people()
 RETURNS TABLE(member_id uuid, display_name text, photo_path text, injury_type text, member_type text, invited_email text, invited_at timestamp with time zone, invite_id uuid, invited boolean, joined_at timestamp with time zone, profile_done boolean, introduced_to_mentor boolean, my_introductions integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with me as (
    select auth.uid() as id where private.can_connect(auth.uid())
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
$function$;

CREATE OR REPLACE FUNCTION public.my_partner_stats(p_days integer DEFAULT 30)
 RETURNS TABLE(invited integer, joined integer, active integer, introductions integer, opened integer, with_mentor integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with me as (
    select auth.uid() as id where private.can_connect(auth.uid())
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
$function$;

CREATE OR REPLACE FUNCTION public.my_introductions()
 RETURNS TABLE(id uuid, status text, yeses integer, note text, created_at timestamp with time zone, thread_id uuid, first_id uuid, first_name text, first_photo text, second_id uuid, second_name text, second_photo text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
     and private.can_connect(auth.uid())
     and not private.blocked_between(auth.uid(), a.id)
     and not private.blocked_between(auth.uid(), b.id)
   order by i.created_at desc
   limit 500;
$function$;
