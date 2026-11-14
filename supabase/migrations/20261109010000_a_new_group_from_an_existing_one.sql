-- ============================================================================
-- A new group from an existing one
-- ============================================================================
-- The owner, 2026-11-09: an org admin may want to introduce someone to a group
-- of mentors they already have without adding them into that conversation.
-- p_copy starts a new group with that group's members and the people chosen;
-- the old group is left as it is. Members no longer findable (paused, left,
-- hidden from the directory) are not carried over. Every pair in the new
-- group is checked for blocks, as two old members may have blocked since.
-- Without p_copy, as 20261106040000.
-- ============================================================================

drop function public.connect_members(uuid[], text, boolean, uuid, text);

create function public.connect_members(
  p_members uuid[],
  p_note text,
  p_join boolean default false,
  p_group uuid default null,
  p_name text default null,
  p_copy boolean default false
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
  copying boolean := p_group is not null and coalesce(p_copy, false);
  making boolean := p_group is null or coalesce(p_copy, false);
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
  if char_length(clean) < 1 or char_length(clean) > 4000 then
    raise exception 'Write a note to them, of 4,000 characters or fewer.' using errcode = '22023';
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
    if copying then
      -- Carried over: whoever can still be added, never the connector.
      select coalesce(array_agg(r), '{}') into roster
        from unnest(roster) r
       where r <> me and public.chat_is_findable(r);
    else
      was_in := me = any (roster);
    end if;
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
  )) or (copying and exists (
    select 1 from unnest(roster) a(id) cross join unnest(roster) b(id)
     where a.id < b.id and private.blocked_between(a.id, b.id)
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

  if making then
    group_name := nullif(btrim(coalesce(p_name, '')), '');
    if group_name is not null and char_length(group_name) > 60 then
      raise exception 'A group''s name is 60 characters or fewer.' using errcode = '22023';
    end if;
    select array_agg(split_part(btrim(m.display_name), ' ', 1) order by u.n)
      into firsts
      from unnest(chosen) with ordinality as u(id, n)
      join public.members m on m.id = u.id;
    if copying then
      -- "Mentors & Bo": the old group's name and who joins it.
      group_name := coalesce(group_name, left(
        coalesce((select nullif(btrim(t.name), '') from public.chat_threads t
                   where t.id = p_group), 'Group') || ' & '
        || case when cardinality(firsts) = 1 then firsts[1]
                else firsts[1] || ' & ' || (cardinality(firsts) - 1) || ' more' end, 60));
    else
      group_name := coalesce(group_name, left(
        case
          when cardinality(firsts) = 2 then firsts[1] || ' & ' || firsts[2]
          when cardinality(firsts) = 3 then firsts[1] || ', ' || firsts[2] || ' & ' || firsts[3]
          else firsts[1] || ', ' || firsts[2] || ', ' || firsts[3] || ' & '
               || (cardinality(firsts) - 3) || ' more'
        end, 60));
    end if;

    insert into public.chat_threads (kind, name, created_by)
    values ('group', group_name, case when joins then me else chosen[1] end)
    returning id into thread;
  else
    thread := p_group;
  end if;

  -- Added by the connector: push_notify_enqueue tells each of them so.
  insert into public.chat_thread_members (thread_id, member_id, joined_at)
  select thread, x.member, clock_timestamp()
    from unnest(case when joins and not was_in then array[me] else '{}'::uuid[] end
                || case when copying then roster else '{}'::uuid[] end
                || chosen)
         with ordinality as x(member, n)
   order by x.n;

  insert into public.connections (made_by, thread_id, people, into_existing, note, joined)
  values (me, thread, chosen, not making, clean, joins or was_in)
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

  if not making then
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
revoke all on function public.connect_members(uuid[], text, boolean, uuid, text, boolean) from public, anon;
grant execute on function public.connect_members(uuid[], text, boolean, uuid, text, boolean) to authenticated;
