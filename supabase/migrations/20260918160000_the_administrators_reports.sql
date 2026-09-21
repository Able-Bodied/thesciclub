-- ============================================================================
-- Chat, migration 16: the administrators' side of a report
-- ============================================================================
-- The reading end of 20260918150000. One function to list what has been handed
-- over and one to close a report off.
--
-- ---------------------------------------------------------------------------
-- What it returns, and the much longer list of what it does not
-- ---------------------------------------------------------------------------
-- Per report: the snapshot, where it was said in words, who wrote it, who
-- reported it, when each happened, the note, and how many people have reported
-- the same thing.
--
-- **No thread id, and no neighbouring messages.** An administrator handed a
-- report gets the one message and the ability to remove it by its id —
-- chat_remove_message already admits them for exactly that — and no way at all
-- to read the conversation it came out of. If this returned a thread id, the
-- next reasonable-looking change would be a "see the context" link, and the
-- promise on /chat that a conversation is private even from administrators
-- would be gone without anybody deciding to end it.
--
-- A post is different and carries `topic_id` and `room_id`, because a room is
-- readable by every member including an administrator already. Opening the
-- topic discloses nothing that was not open.
--
-- ---------------------------------------------------------------------------
-- Names, and the people who are gone
-- ---------------------------------------------------------------------------
-- Read from `members` directly rather than from `chat_authors`, because
-- chat_authors is gated on the *caller* being a member and this function is
-- already gated on their being an administrator; and because a removed member
-- has no row in either, so the join is a left one and the name comes back null.
-- The client draws "Former member" for a null. That case is not hypothetical:
-- the reports about somebody are part of why they were removed, and they
-- outlive the removal on purpose.
--
-- `already_removed` says whether the post or message has since been taken
-- down — by its author, by an administrator, or by the topic being deleted
-- underneath it. It is there so /admin does not offer "Remove it" on something
-- that is already gone, which would be a button that succeeds and changes
-- nothing. It is a fact about the reported row and not a window into the
-- conversation.
--
-- ---------------------------------------------------------------------------
-- Resolving takes a sentence, and does not take it twice
-- ---------------------------------------------------------------------------
-- The resolution is required, the way a strike's reason is (20260916040000):
-- the next administrator to open this needs to know what was decided, and
-- "resolved" is not a decision. It is bounded at 500 characters by the table.
--
-- Resolving an already-resolved report returns quietly rather than raising and
-- rather than overwriting. Same as chat_remove_post and chat_remove_message,
-- and for the same reason: two taps on a slow connection is the ordinary case,
-- and the second must not rewrite who decided or what they said.
--
-- Nothing here issues a strike, at any number of reports. Ending somebody's
-- membership is a person's decision and it lives on the member's row, where it
-- already is.
-- ============================================================================

create or replace function public.admin_chat_reports()
returns table (
  id uuid,
  kind text,
  -- Null once the reported row itself is gone. The snapshot is what survives.
  post_id uuid,
  message_id uuid,
  body_snapshot text,
  written_at timestamptz,
  place text,
  -- A post's way back into the room. There is no equivalent for a message and
  -- there must not be — see the header.
  topic_id uuid,
  room_id text,
  note text,
  created_at timestamptz,
  reporter_id uuid,
  reporter_name text,
  reported_author_id uuid,
  reported_author_name text,
  report_count bigint,
  already_removed boolean,
  resolved_at timestamptz,
  resolved_by uuid,
  resolved_by_name text,
  resolution text
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  -- Definer, so RLS is off in here and the table's own "your own rows" policy
  -- is not protecting anything. This line is the whole of the access control.
  if not public.is_admin() then
    raise exception 'Only an administrator can read the reports.' using errcode = '42501';
  end if;

  return query
  select
    r.id,
    r.kind,
    r.post_id,
    r.message_id,
    r.body_snapshot,
    r.written_at,
    r.place,
    r.topic_id,
    r.room_id,
    r.note,
    r.created_at,
    r.reporter_id,
    reporter.display_name,
    r.reported_author_id,
    author.display_name,
    (
      -- At least one, always: a report whose post or message row has since been
      -- deleted has nothing left to match on, and "0 people reported this" on a
      -- report is a sentence that cannot be true.
      select greatest(count(*), 1)
      from public.chat_reports peer
      where (r.post_id is not null and peer.post_id = r.post_id)
         or (r.message_id is not null and peer.message_id = r.message_id)
    ) as report_count,
    coalesce(
      (select p.removed_at is not null from public.chat_posts p where p.id = r.post_id),
      (select m.removed_at is not null from public.chat_messages m where m.id = r.message_id),
      -- Neither row is there any more: the topic or the thread was deleted
      -- under it. Gone is gone, and there is nothing left to remove.
      true
    ) as already_removed,
    r.resolved_at,
    r.resolved_by,
    resolver.display_name,
    r.resolution
  from public.chat_reports r
  left join public.members reporter on reporter.id = r.reporter_id
  left join public.members author on author.id = r.reported_author_id
  left join public.members resolver on resolver.id = r.resolved_by
  -- Open first, then newest first within each half. An administrator opens
  -- this screen to find what is waiting, not to browse what is done.
  order by (r.resolved_at is not null), r.created_at desc;
end;
$$;

comment on function public.admin_chat_reports() is
  'Every report, open ones first. No thread id and no neighbouring messages — one post or one message is all that was disclosed.';

revoke all on function public.admin_chat_reports() from public, anon;
grant execute on function public.admin_chat_reports() to authenticated;

-- ---------------------------------------------------------------- resolving
create or replace function public.admin_resolve_chat_report(
  report uuid,
  report_resolution text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.chat_reports;
  said text := btrim(coalesce(report_resolution, ''));
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can resolve a report.' using errcode = '42501';
  end if;

  if said = '' then
    raise exception 'Say what was decided. "Resolved" on its own is not a decision.'
      using errcode = '22023';
  end if;

  select * into target from public.chat_reports c where c.id = report;
  if not found then
    raise exception 'There is no such report.' using errcode = 'P0002';
  end if;

  -- Quietly, not an error, and without overwriting. See the header.
  if target.resolved_at is not null then
    return;
  end if;

  update public.chat_reports
     set resolved_at = clock_timestamp(),
         resolved_by = auth.uid(),
         resolution = said
   where id = target.id;
end;
$$;

comment on function public.admin_resolve_chat_report(uuid, text) is
  'Close a report off with what was decided. The sentence is required.';

revoke all on function public.admin_resolve_chat_report(uuid, text) from public, anon;
grant execute on function public.admin_resolve_chat_report(uuid, text) to authenticated;
