-- ============================================================================
-- Admin → Members says who has the iPhone app
-- ============================================================================
-- The owner, 2026-11-16: "Can we add if the user has iOS installed in
-- admin/members".
--
-- The same knowing as the nudge's i_have_the_app (20261115130000), for every
-- member, plus the app's own daily device check (member_device_checks,
-- surface 'app', 20261102000000), which apps already on phones send:
--
--   * seen in the app: note_in_the_app, or a device check from the app, within
--     six months; `last_seen` is the latest of them;
--   * or holding an iPhone app's notification token (apns:...), which an app
--     deleted since loses once Apple refuses it; `last_seen` is null when that
--     is all there is.
--
-- A member not in the result is not known to have it. Only administrators, as
-- admin_member_reach (20261022040000). Expand only: a new function.
-- ============================================================================

create or replace function public.admin_members_with_the_app()
returns table (member_id uuid, last_seen timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not an administrator' using errcode = '42501';
  end if;
  return query
    with seen as (
      select s.user_id as id, s.at
        from private.app_seen s
      union all
      select d.member_id, d.seen_at
        from public.member_device_checks d
       where d.surface = 'app'
    ),
    latest as (
      select seen.id, max(seen.at) as at
        from seen
       where seen.at > now() - interval '6 months'
       group by seen.id
    )
    select m.id, l.at
      from public.members m
      left join latest l on l.id = m.id
     where l.id is not null
        or exists (
          select 1 from public.push_subscriptions p
           where p.member_id = m.id and p.endpoint like 'apns:%'
        );
end;
$$;

comment on function public.admin_members_with_the_app() is
  'For Admin → Members: each member the club knows has the iPhone app, and when it was last seen open. See 20261116210000.';

revoke all on function public.admin_members_with_the_app() from public, anon;
grant execute on function public.admin_members_with_the_app() to authenticated;
