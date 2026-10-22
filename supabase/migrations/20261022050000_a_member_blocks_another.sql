-- ============================================================================
-- A member blocks another, and the administrators are told
-- ============================================================================
-- The owner, 2026-10-21, for App Store and Google Play review (guideline
-- 1.2), reversing CONTEXT.md's "no member-to-member blocking". This file is
-- the record and the report; what a block hides is 20261022060000, the
-- refused messages 20261022070000, the silenced notifications 20261022080000.
--
-- member_blocks: one row per blocker and blocked member. The blocker reads
-- their own rows and nothing else, so the blocked member can never find out
-- from the API. Written only through block_member / unblock_member.
--
-- Blocking is immediate and asks no reason. Each new block files a report
-- (kind 'block') naming who blocked whom, with no words in it. Administrators
-- see it on the Reports tab, labelled as a block and kept apart from the
-- reports waiting for a decision; it notifies nobody (20261022080000).
-- Pressing Block again while blocked files nothing. Unblocking leaves the
-- report: it is a record of what happened.
-- ============================================================================

create table public.member_blocks (
  blocker_id uuid not null references public.members (id) on delete cascade,
  blocked_id uuid not null references public.members (id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  primary key (blocker_id, blocked_id),
  constraint member_blocks_not_yourself check (blocker_id <> blocked_id)
);
create index member_blocks_blocked_idx on public.member_blocks (blocked_id);

alter table public.member_blocks enable row level security;
revoke all on public.member_blocks from public, anon, authenticated;
grant select on public.member_blocks to authenticated;
grant select, insert, update, delete on public.member_blocks to service_role;

create policy "a member reads the blocks they made" on public.member_blocks
  for select to authenticated using (blocker_id = (select auth.uid()));

comment on table public.member_blocks is
  'Who blocked whom. Readable by the blocker only; the blocked member is never told.';

-- ---------------------------------------------------------------- reports --
-- A block is a report with no post, no message and no words.
alter table public.chat_reports
  drop constraint chat_reports_kind_check,
  drop constraint chat_reports_kind_shape,
  drop constraint chat_reports_context_kind_check;
alter table public.chat_reports
  add constraint chat_reports_kind_check
    check (kind in ('post', 'message', 'block')),
  add constraint chat_reports_kind_shape check (
    case kind
      when 'post' then message_id is null
      when 'message' then post_id is null
      else post_id is null and message_id is null and body_snapshot = ''
    end),
  add constraint chat_reports_context_kind_check
    check (context_kind in ('room', 'group', 'direct', 'member'));

comment on table public.chat_reports is
  'One post or one message, handed to the administrators with a snapshot of what it said, or a block (kind block), which carries no words.';

-- ---------------------------------------------------------------- helpers --
-- The members the caller has blocked. Only their own rows, which they can
-- read anyway, so it reveals nothing to anybody blocked. Used by policies.
create function public.my_blocked_member_ids()
returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(b.blocked_id), '{}'::uuid[])
    from public.member_blocks b
   where b.blocker_id = auth.uid();
$$;
revoke all on function public.my_blocked_member_ids() from public, anon;
grant execute on function public.my_blocked_member_ids() to authenticated, service_role;

-- Either way round. Never granted to a member: it would tell the blocked
-- member who blocked them. For definer functions and triggers only.
create function public.members_blocked(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.member_blocks x
     where (x.blocker_id = a and x.blocked_id = b)
        or (x.blocker_id = b and x.blocked_id = a)
  );
$$;
revoke all on function public.members_blocked(uuid, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------- the writes --
create function public.block_member(member uuid)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  added integer;
begin
  -- A paused member can still protect themselves.
  if not public.is_member() then
    raise exception 'Only a member can block somebody.' using errcode = '42501';
  end if;
  if member is null or member = me then
    raise exception 'You cannot block yourself.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.members m where m.id = member) then
    raise exception 'There is no such member.' using errcode = 'P0002';
  end if;

  insert into public.member_blocks (blocker_id, blocked_id)
  values (me, member)
  on conflict do nothing;
  get diagnostics added = row_count;

  if added > 0 then
    insert into public.chat_reports
      (kind, context_kind, reporter_id, reported_author_id,
       body_snapshot, written_at, place)
    values
      ('block', 'member', me, member, '', clock_timestamp(), 'Blocked');
  end if;
end;
$$;
revoke all on function public.block_member(uuid) from public, anon;
grant execute on function public.block_member(uuid) to authenticated;

comment on function public.block_member(uuid) is
  'Block a member, and file a report naming who blocked whom. The blocked member is not told.';

create function public.unblock_member(member uuid)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_member() then
    raise exception 'Only a member can unblock somebody.' using errcode = '42501';
  end if;
  delete from public.member_blocks b
   where b.blocker_id = auth.uid() and b.blocked_id = member;
end;
$$;
revoke all on function public.unblock_member(uuid) from public, anon;
grant execute on function public.unblock_member(uuid) to authenticated;

comment on function public.unblock_member(uuid) is
  'Take a block back. The report it filed stays.';
