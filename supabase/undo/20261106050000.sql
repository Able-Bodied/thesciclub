-- Undo for 20261106050000_a_private_event_keeps_its_cover_and_title.sql: the
-- photos rule and review_options as 20261029170000 and 20261031100000 left
-- them. This reopens both leaks.

alter policy "a signed-in account reads the photographs it may see" on storage.objects
  using (((bucket_id = 'photos'::text) AND ((select public.is_member()) OR ((storage.foldername(name))[1] = 'organizations'::text) OR ((storage.foldername(name))[1] = ((select auth.uid()))::text) OR public.photo_is_my_claimable(name))));

drop function public.event_photo_is_mine_to_see(text);

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
    on o.id = coalesce(wanted.organization_id, e.organization_id);
$$;
