-- ============================================================================
-- A private event keeps its cover and its title to its audience
-- ============================================================================
-- Found by the robot check of private events (20261106030000) on 2026-11-06:
-- a signed-in member who was not invited, but had the event's id from its
-- link, could still
--
--   1. download its cover and sign a URL for it: the photos bucket's read rule
--      let every member read every photo, and event_cover_is_public only
--      governed signed-out reads;
--   2. read its title and organization from review_options, which never asked
--      can_see_event.
--
-- Now a photograph under events/ is read by a member only when an event they
-- can see uses it, or when no event uses it yet (an upload not saved yet).
-- review_options answers nothing for an event the member cannot see.
-- Signed-out reads are unchanged. Store builds (1.0.5, 1.2.0) read only what
-- they can see, so nothing changes for them.
--
-- Undo: supabase/undo/20261106050000.sql.
-- ============================================================================

-- Whether the signed-in member may read this photograph, for one under events/.
-- The event in its folder first (its cover, most of the time); then any other
-- event that uses it; then none at all.
create function public.event_photo_is_mine_to_see(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select object_name not like 'events/%'
    or exists (
      select 1 from public.events e
       where e.id::text = split_part(object_name, '/', 2)
         and (e.photo_path = object_name
              or e.more_photos @> jsonb_build_array(jsonb_build_object('path', object_name)))
         and public.can_see_event(e.id)
    )
    or exists (
      select 1 from public.events e
       where (e.photo_path = object_name
              or e.more_photos @> jsonb_build_array(jsonb_build_object('path', object_name)))
         and public.can_see_event(e.id)
    )
    or not exists (
      select 1 from public.events e
       where e.photo_path = object_name
          or e.more_photos @> jsonb_build_array(jsonb_build_object('path', object_name))
    );
$$;
revoke all on function public.event_photo_is_mine_to_see(text) from public, anon;
grant execute on function public.event_photo_is_mine_to_see(text) to authenticated;

-- As 20261029170000, with a member's read of events/ asking the above.
alter policy "a signed-in account reads the photographs it may see" on storage.objects
  using (((bucket_id = 'photos'::text) AND (((select public.is_member()) AND public.event_photo_is_mine_to_see(name)) OR ((storage.foldername(name))[1] = 'organizations'::text) OR ((storage.foldername(name))[1] = ((select auth.uid()))::text) OR public.photo_is_my_claimable(name))));

-- As 20261031100000, answering nothing for an event the member cannot see.
create or replace function public.review_options(p_event uuid default null, p_organization uuid default null)
returns table (
  can_review boolean,
  title text,
  organization_name text,
  anonymous_allowed boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_active_member()
    and (o.id is null or not public.speaks_for(o.id))
    and case
      when p_event is not null then exists (
        select 1 from public.event_check_ins c
         where c.event_id = p_event and c.member_id = auth.uid()
      )
      else exists (
        select 1 from public.organization_members om
         where om.organization_id = p_organization
           and om.member_id = auth.uid()
           and om.left_at is null
           and om.denied_at is null
      )
    end,
    coalesce(e.title, o.name),
    o.name,
    coalesce(o.anonymous_reviews, true)
  from (select p_event as event_id, p_organization as organization_id) wanted
  left join public.events e on e.id = wanted.event_id
  left join public.organizations o
    on o.id = coalesce(wanted.organization_id, e.organization_id)
  where wanted.event_id is null or public.can_see_event(wanted.event_id);
$$;
