-- ============================================================================
-- Connecting several members, or into a group
-- ============================================================================
-- The owner, 2026-11-06: org admins and professionals (can_connect) introduce
-- more than two people at once, into a new group they name or into one that
-- already exists, and keep the groups they started to use again.
--
-- connect_members does it in one call. A new group needs two or more people;
-- an existing group one or more. An existing group is a plain group (not an
-- event's or an organization's) that the connector is in, or one they
-- started by connecting people, even if they never joined it. That second
-- kind is new: a connector who stayed out can still add people to it, and
-- still cannot read it.
--
-- One row in connections per call. The pairs it brings together are also
-- written to introductions, as make_introduction does, so my_people, the
-- stats and "introduced to a mentor" count them with no change. A pair
-- connected before is not written twice. Only two people in a new group keep
-- make_introduction's rule that a pair is connected once.
--
-- make_introduction stays for the store builds (1.0.5, 1.2.0).
-- ============================================================================

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  made_by uuid references public.members (id) on delete set null,
  thread_id uuid references public.chat_threads (id) on delete set null,
  -- Who was introduced, in the order chosen.
  people uuid[] not null check (cardinality(people) between 1 and 50),
  into_existing boolean not null,
  note text not null check (note = btrim(note) and char_length(note) between 1 and 500),
  joined boolean not null,
  created_at timestamptz not null default now()
);

create index connections_by_idx on public.connections (made_by, created_at desc);
create index connections_thread_idx on public.connections (thread_id) where thread_id is not null;

alter table public.connections enable row level security;
revoke all on public.connections from public, anon, authenticated;

comment on table public.connections is
  'One per connect_members call: who was introduced, into which group. See 20261106020000.';

alter table public.introductions
  add column connection_id uuid references public.connections (id) on delete set null;

-- --------------------------------------------------- may add to that group --
create function private.may_connect_into(account uuid, thread uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_threads t
     where t.id = thread
       and t.kind = 'group'
       and t.event_id is null
       and t.organization_id is null
       and (
         exists (select 1 from public.chat_thread_members m
                  where m.thread_id = t.id and m.member_id = account)
         or exists (select 1 from public.connections c
                     where c.thread_id = t.id and c.made_by = account)
         or exists (select 1 from public.introductions i
                     where i.thread_id = t.id and i.introduced_by = account)
       )
  );
$$;
revoke all on function private.may_connect_into(uuid, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------- connecting --
create function public.connect_members(
  p_members uuid[],
  p_note text,
  p_join boolean default false,
  p_group uuid default null,
  p_name text default null
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
  chosen uuid[];
  roster uuid[];
  firsts text[];
  group_name text;
  thread uuid;
  made uuid;
  was_in boolean := false;
  person uuid;
begin
  if not private.can_connect(me) then
    raise exception 'Only an org admin or a trusted partner connects members.' using errcode = '42501';
  end if;

  -- Distinct, in the order chosen.
  select coalesce(array_agg(x.member order by x.n), '{}')
    into chosen
    from (select distinct on (u.member) u.member, u.n
            from unnest(coalesce(p_members, '{}')) with ordinality as u(member, n)
           where u.member is not null
           order by u.member, u.n) x;

  if me = any (chosen) then
    raise exception 'Connect other members; you can join the conversation yourself.' using errcode = '22023';
  end if;
  if char_length(clean) < 1 or char_length(clean) > 500 then
    raise exception 'Write a note to them, of 500 characters or fewer.' using errcode = '22023';
  end if;

  if p_group is null then
    if cardinality(chosen) < 2 then
      raise exception 'Choose at least two members to connect.' using errcode = '22023';
    end if;
    roster := '{}';
  else
    if not private.may_connect_into(me, p_group) then
      raise exception 'There is no such group.' using errcode = 'P0002';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('connect ' || p_group::text, 0));
    select coalesce(array_agg(m.member_id), '{}') into roster
      from public.chat_thread_members m where m.thread_id = p_group;
    was_in := me = any (roster);
    -- Whoever is in it already is left as they are.
    select coalesce(array_agg(c order by n), '{}') into chosen
      from unnest(chosen) with ordinality as u(c, n)
     where c <> all (roster);
    if cardinality(chosen) < 1 then
      raise exception 'Everyone you chose is in that group already.' using errcode = '22023';
    end if;
  end if;

  if cardinality(roster) + cardinality(chosen) + (case when joins and not was_in then 1 else 0 end)
     > public.chat_group_cap() then
    raise exception 'A group holds % members at most.', public.chat_group_cap() using errcode = '22023';
  end if;

  foreach person in array chosen loop
    if not public.chat_is_findable(person) then
      raise exception 'One of those members cannot be connected.' using errcode = 'P0002';
    end if;
  end loop;

  -- Nobody joins anyone they block or are blocked by, the connector included.
  if exists (
    select 1
      from unnest(chosen) a(id)
      cross join unnest(chosen || roster || array[me]) b(id)
     where a.id <> b.id and private.blocked_between(a.id, b.id)
  ) or (joins and not was_in and exists (
    select 1 from unnest(roster) r(id) where private.blocked_between(me, r.id)
  )) then
    raise exception 'One of those members cannot be connected.' using errcode = 'P0002';
  end if;

  if p_group is null and cardinality(chosen) = 2 then
    perform pg_advisory_xact_lock(hashtextextended(
      least(chosen[1], chosen[2])::text || greatest(chosen[1], chosen[2])::text, 0));
    if exists (
      select 1 from public.introductions i
       where least(i.first_id, i.second_id) = least(chosen[1], chosen[2])
         and greatest(i.first_id, i.second_id) = greatest(chosen[1], chosen[2])
         and i.opened_at is not null
    ) then
      raise exception 'Those two have been connected already.' using errcode = '23505';
    end if;
  end if;

  if (select count(*) from public.connections c
       where c.made_by = me and c.created_at > now() - interval '7 days')
     + (select count(*) from public.introductions i
         where i.introduced_by = me and i.connection_id is null
           and i.created_at > now() - interval '7 days') >= 50 then
    raise exception 'That is 50 connections this week. Try again in a few days.' using errcode = '54000';
  end if;

  if p_group is null then
    select array_agg(split_part(btrim(m.display_name), ' ', 1) order by u.n)
      into firsts
      from unnest(chosen) with ordinality as u(id, n)
      join public.members m on m.id = u.id;
    group_name := nullif(btrim(coalesce(p_name, '')), '');
    if group_name is not null and char_length(group_name) > 60 then
      raise exception 'A group''s name is 60 characters or fewer.' using errcode = '22023';
    end if;
    group_name := coalesce(group_name, left(
      case
        when cardinality(firsts) = 2 then firsts[1] || ' & ' || firsts[2]
        when cardinality(firsts) = 3 then firsts[1] || ', ' || firsts[2] || ' & ' || firsts[3]
        else firsts[1] || ', ' || firsts[2] || ', ' || firsts[3] || ' & '
             || (cardinality(firsts) - 3) || ' more'
      end, 60));

    insert into public.chat_threads (kind, name, created_by)
    values ('group', group_name, case when joins then me else chosen[1] end)
    returning id into thread;
  else
    thread := p_group;
  end if;

  -- Added by the connector: push_notify_enqueue tells each of them so.
  insert into public.chat_thread_members (thread_id, member_id, joined_at)
  select thread, x.member, clock_timestamp()
    from unnest(case when joins and not was_in then array[me] else '{}'::uuid[] end || chosen)
         with ordinality as x(member, n)
   order by x.n;

  insert into public.connections (made_by, thread_id, people, into_existing, note, joined)
  values (me, thread, chosen, p_group is not null, clean, joins or was_in)
  returning id into made;

  -- The pairs, for the stats: each newcomer with each other and with whoever
  -- was in the group, leaving out the connector and pairs connected before.
  insert into public.introductions
    (introduced_by, first_id, second_id, note, partner_joins, opened_at, thread_id, connection_id)
  select me, a.id, b.id, clean, joins or was_in, now(), thread, made
    from unnest(chosen) with ordinality a(id, n)
    join unnest(chosen || array_remove(roster, me)) with ordinality b(id, n)
      on a.id <> b.id and (b.id <> all (chosen) or a.n < b.n)
   where not exists (
     select 1 from public.introductions i
      where least(i.first_id, i.second_id) = least(a.id, b.id)
        and greatest(i.first_id, i.second_id) = greatest(a.id, b.id)
        and i.opened_at is not null
   );

  if p_group is not null then
    -- Each its own moment, so the lines read in order, the note last.
    insert into public.chat_messages (thread_id, author_id, body, notice, subject_id, created_at)
    select thread, me, 'Added ' || btrim(m.display_name) || ' to the group', 'added', m.id,
           clock_timestamp()
      from unnest(chosen) with ordinality u(id, n)
      join public.members m on m.id = u.id
     order by u.n;
  end if;

  -- "<connector> connected you…", with the note. A notice is never pushed.
  insert into public.chat_messages (thread_id, author_id, body, notice, created_at)
  values (thread, me, clean, 'introduced', clock_timestamp());

  return thread;
end;
$$;

revoke all on function public.connect_members(uuid[], text, boolean, uuid, text) from public, anon;
grant execute on function public.connect_members(uuid[], text, boolean, uuid, text) to authenticated;

-- --------------------------------------------------------- the groups list --
-- The groups a connector can connect people into: ones they started by
-- connecting, and plain groups they are in. Newest activity first.
create function public.my_connection_groups()
returns table (thread_id uuid, name text, members integer, i_am_in boolean, started boolean, last_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select auth.uid() as id where private.can_connect(auth.uid())
  ),
  started as (
    select c.thread_id from public.connections c, me where c.made_by = me.id and c.thread_id is not null
    union
    select i.thread_id from public.introductions i, me where i.introduced_by = me.id and i.thread_id is not null
  ),
  candidates as (
    select s.thread_id, true as started from started s
    union all
    select m.thread_id, false from public.chat_thread_members m, me where m.member_id = me.id
  )
  select t.id, t.name,
         (select count(*)::int from public.chat_thread_members m where m.thread_id = t.id),
         exists (select 1 from public.chat_thread_members m, me
                  where m.thread_id = t.id and m.member_id = me.id),
         bool_or(c.started),
         t.last_message_at
    from candidates c
    join public.chat_threads t on t.id = c.thread_id
   where t.kind = 'group' and t.event_id is null and t.organization_id is null
     and exists (select 1 from public.chat_thread_members m where m.thread_id = t.id)
   group by t.id
   order by t.last_message_at desc nulls last, t.created_at desc
   limit 200;
$$;
revoke all on function public.my_connection_groups() from public, anon;
grant execute on function public.my_connection_groups() to authenticated;

-- ------------------------------------------------------ what was connected --
-- One row per connection, and the pairs connected before this one by one.
create function public.my_connections()
returns table (
  id uuid,
  status text,
  note text,
  created_at timestamptz,
  thread_id uuid,
  group_name text,
  into_group boolean,
  people jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select auth.uid() as id where private.can_connect(auth.uid())
  )
  select x.id, x.status, x.note, x.created_at,
         case when exists (select 1 from public.chat_thread_members tm, me
                            where tm.thread_id = x.thread_id and tm.member_id = me.id)
              then x.thread_id end,
         x.group_name, x.into_group, x.people
    from (
      select c.id, 'opened'::text as status, c.note, c.created_at, c.thread_id,
             t.name as group_name, c.into_existing as into_group,
             (select coalesce(jsonb_agg(jsonb_build_object(
                        'id', m.id, 'name', m.display_name, 'photo', m.photo_path) order by u.n), '[]')
                from unnest(c.people) with ordinality u(id, n)
                join public.members m on m.id = u.id and m.status = 'active'
               where not private.blocked_between(me.id, m.id)) as people
        from public.connections c
        join me on c.made_by = me.id
        left join public.chat_threads t on t.id = c.thread_id
      union all
      select i.id, private.introduction_status(i), i.note, i.created_at, i.thread_id,
             null, false,
             jsonb_build_array(
               jsonb_build_object('id', a.id, 'name', a.display_name, 'photo', a.photo_path),
               jsonb_build_object('id', b.id, 'name', b.display_name, 'photo', b.photo_path))
        from public.introductions i
        join me on i.introduced_by = me.id
        join public.members a on a.id = i.first_id and a.status = 'active'
        join public.members b on b.id = i.second_id and b.status = 'active'
       where i.connection_id is null
         and not private.blocked_between(me.id, a.id)
         and not private.blocked_between(me.id, b.id)
    ) x
   where jsonb_array_length(x.people) > 0
   order by x.created_at desc
   limit 500;
$$;
revoke all on function public.my_connections() from public, anon;
grant execute on function public.my_connections() to authenticated;
