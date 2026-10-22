-- ============================================================================
-- A member reports another member's profile
-- ============================================================================
-- Apple guideline 1.2 and Google's user-generated-content policy expect a
-- profile, not only a message or a post, to be reportable (store-review audit
-- L3). Today a name, @username, bio or profile photograph that is offensive has
-- no Report anywhere near it.
--
-- This follows the message report (20260918150000) exactly:
--
--  - The report keeps a COPY taken at the moment of reporting: name,
--    @username, the photograph's path, and the free text the member wrote (bio,
--    how it happened, the specifics, equipment, grants, field of work, the
--    photograph's description, their own interests, topics and self-care
--    answers). Editing or deleting the profile afterwards removes none of it.
--    The copy lives in `profile_snapshot` (jsonb), because a profile is too long
--    for body_snapshot's 4,000 characters; body_snapshot is '' as a block's is.
--  - The reported member is not told and cannot read it. Nothing is granted on
--    the table to them, and the only column a reporter can read back is the new
--    `profile_id`, so the control can say "Reported".
--  - Administrators read it in Admin -> Reports with the others, labelled as a
--    profile report, and settle it the same way. The existing trigger notifies
--    them (kind 'report'): only a block is excluded from that.
--
-- ---------------------------------------------------------------------------
-- The photograph is kept the way a reported chat photograph is
-- ---------------------------------------------------------------------------
-- No SQL can copy a file, so the report records the path
-- (`profile_photo_path`) and a file named on a report cannot be deleted or
-- overwritten, by the member or by an administrator (the chat bucket's rule,
-- 20260918210000). The photos bucket is readable by every member already, so
-- an administrator can open it. A member's own session silently deletes
-- nothing of it when they change their photograph or delete their account: the
-- Storage API skips what a policy refuses, and says nothing.
--
-- Overwriting is closed too, because the app used to upload every photograph
-- to `<id>/profile.<ext>` with upsert. The client now names each upload
-- afresh, so an upload never lands on a reported path; an old client's upsert
-- onto one would be refused.
--
-- ---------------------------------------------------------------------------
-- Who can be reported
-- ---------------------------------------------------------------------------
-- Whoever the caller can open in Peers: report_member reads browse_members,
-- the view the profile page reads. Not yourself, not a member who has left,
-- not one hidden from Peers or blocked either way, and not by somebody paused
-- (they cannot open a profile either). One report per reporter per member, as
-- for a post.
-- ============================================================================

alter table public.chat_reports
  add column if not exists profile_id uuid references public.members (id) on delete set null,
  add column if not exists profile_snapshot jsonb,
  add column if not exists profile_photo_path text;

comment on column public.chat_reports.profile_id is
  'The member whose profile was reported. Readable by the reporter, to draw "Reported".';
comment on column public.chat_reports.profile_snapshot is
  'The profile as the reporter saw it: name, @username and what the member wrote. Copied, not read live.';
comment on column public.chat_reports.profile_photo_path is
  'The reported profile photograph, by path in the photos bucket. A named file cannot be deleted or overwritten.';

alter table public.chat_reports
  drop constraint chat_reports_kind_check,
  drop constraint chat_reports_kind_shape,
  drop constraint chat_reports_context_kind_check;
alter table public.chat_reports
  add constraint chat_reports_kind_check
    check (kind in ('post', 'message', 'block', 'profile')),
  add constraint chat_reports_kind_shape check (
    case kind
      when 'post' then message_id is null and profile_snapshot is null
      when 'message' then post_id is null and profile_snapshot is null
      when 'block' then
        post_id is null and message_id is null and body_snapshot = ''
        and profile_snapshot is null
      else
        post_id is null and message_id is null and body_snapshot = ''
        and profile_snapshot is not null
    end),
  add constraint chat_reports_context_kind_check
    check (context_kind in ('room', 'group', 'direct', 'member', 'profile')),
  add constraint chat_reports_one_per_profile unique (reporter_id, profile_id);

create index if not exists chat_reports_profile_idx on public.chat_reports (profile_id);

comment on table public.chat_reports is
  'One post, message or profile, handed to the administrators with a copy of what it said, or a block (kind block), which carries no words.';

-- One more column the reporter reads back, and no more.
grant select (profile_id) on public.chat_reports to authenticated;

-- ------------------------------------------------------------------- report --
create or replace function public.report_member(member uuid, report_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.members;
begin
  -- Definer, so RLS is off in here: every gate is stated. A paused member can
  -- say what was done to them, as for a message; they cannot open a profile,
  -- so the visibility check below refuses them anyway.
  if not public.is_member() then
    raise exception 'Only a member can report somebody.' using errcode = '42501';
  end if;

  if member is null or member = auth.uid() then
    raise exception 'You cannot report yourself.' using errcode = '42501';
  end if;

  -- What the profile page can show this caller. A member who has left, hides
  -- from Peers or is blocked either way is "no such member".
  if not exists (select 1 from public.browse_members b where b.id = member) then
    raise exception 'There is no such member.' using errcode = 'P0002';
  end if;

  select * into target from public.members m where m.id = member;

  insert into public.chat_reports
    (kind, context_kind, profile_id, reporter_id, reported_author_id,
     body_snapshot, profile_snapshot, profile_photo_path, written_at, place, note)
  values
    ('profile', 'profile', target.id, auth.uid(), target.id,
     '',
     jsonb_strip_nulls(jsonb_build_object(
       'display_name', target.display_name,
       'username', target.username::text,
       'photo_alt', nullif(btrim(coalesce(target.photo_alt, '')), ''),
       'bio', nullif(btrim(coalesce(target.bio, '')), ''),
       'how_injured', nullif(btrim(coalesce(target.how_injured, '')), ''),
       'detail', nullif(btrim(coalesce(target.detail, '')), ''),
       'sports_equipment', nullif(btrim(coalesce(target.sports_equipment, '')), ''),
       'grants', nullif(btrim(coalesce(target.grants, '')), ''),
       'field_of_work', nullif(btrim(coalesce(target.field_of_work, '')), ''),
       'interests', to_jsonb(coalesce(target.interests, '{}'::text[])),
       'topics', to_jsonb(coalesce(target.topics, '{}'::text[])),
       'self_care', to_jsonb(coalesce(target.self_care, '{}'::text[]))
     )),
     target.photo_path,
     clock_timestamp(), 'A member''s profile',
     nullif(btrim(coalesce(report_note, '')), ''))
  -- Twice is one row and no error, as for a post.
  on conflict (reporter_id, profile_id) do nothing;
end;
$$;

comment on function public.report_member(uuid, text) is
  'Hand a member''s profile to the administrators, with a copy of it as it is now. The member is not told.';

revoke all on function public.report_member(uuid, text) from public, anon;
grant execute on function public.report_member(uuid, text) to authenticated;

-- --------------------------------------------------- the photograph is kept --
-- A definer function and not a subquery in the policies: a member has select
-- on three columns of chat_reports and this reads another.
create or replace function public.photo_is_on_a_report(object_name text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_reports r where r.profile_photo_path = object_name
  );
$$;

comment on function public.photo_is_on_a_report(text) is
  'Whether any profile report names this photograph. A named file cannot be deleted or overwritten by anybody.';

revoke all on function public.photo_is_on_a_report(text) from public, anon;
grant execute on function public.photo_is_on_a_report(text) to authenticated;

-- As 20260910120100 and 20260918000000, with the file named on a report left.
drop policy if exists "members can replace their own photo" on storage.objects;
create policy "members can replace their own photo"
  on storage.objects for update
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.photo_is_on_a_report(name)
  );

drop policy if exists "members can delete their own photo" on storage.objects;
create policy "members can delete their own photo"
  on storage.objects for delete
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.photo_is_on_a_report(name)
  );

drop policy if exists "an administrator can delete any photo" on storage.objects;
create policy "an administrator can delete any photo"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'photos'
    and public.is_admin()
    and not public.photo_is_on_a_report(name)
  );

-- ------------------------------------------------------ the administrators --
-- As 20260918200000, with the profile's three columns, and report_count
-- counting the same member's profile reports.
drop function if exists public.admin_chat_reports();

create or replace function public.admin_chat_reports()
returns table (
  id uuid,
  kind text,
  context_kind text,
  post_id uuid,
  message_id uuid,
  body_snapshot text,
  attachments text[],
  -- A profile report's copy of the profile, and its photograph in the photos
  -- bucket (readable by every member, so by an administrator).
  profile_snapshot jsonb,
  profile_photo_path text,
  written_at timestamptz,
  place text,
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
  if not public.is_admin() then
    raise exception 'Only an administrator can read the reports.' using errcode = '42501';
  end if;

  return query
  select
    r.id,
    r.kind,
    r.context_kind,
    r.post_id,
    r.message_id,
    r.body_snapshot,
    r.attachments,
    r.profile_snapshot,
    r.profile_photo_path,
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
      select greatest(count(*), 1)
      from public.chat_reports peer
      where (r.post_id is not null and peer.post_id = r.post_id)
         or (r.message_id is not null and peer.message_id = r.message_id)
         or (r.profile_id is not null and peer.profile_id = r.profile_id)
    ) as report_count,
    -- A profile is not removed; it is dealt with on the member's row.
    r.kind <> 'profile' and coalesce(
      (select p.removed_at is not null from public.chat_posts p where p.id = r.post_id),
      (select m.removed_at is not null from public.chat_messages m where m.id = r.message_id),
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
  order by (r.resolved_at is not null), r.created_at desc;
end;
$$;

comment on function public.admin_chat_reports() is
  'Every report, open ones first. No thread id and no neighbouring messages: one post, one message or one profile is all that was disclosed.';

revoke all on function public.admin_chat_reports() from public, anon;
grant execute on function public.admin_chat_reports() to authenticated;
