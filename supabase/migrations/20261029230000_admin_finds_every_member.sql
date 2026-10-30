-- ============================================================================
-- Admin finds every member
-- ============================================================================
-- SPEED-PLAN.md, Step 7. Admin downloaded the whole roster (admin_members) to
-- search it in the browser, and the API returns at most 1,000 rows, so member
-- number 1,001 could never be found. Search and paging move here, 50 at a
-- time, behind the same administrator check and with the same columns.
--
-- admin_member_search: the roster, filtered and searched as Admin's box did
--   (name, email, @username, phone, city, state, account type, status,
--   "admin"; a phone's digits however typed), an exact match first, then
--   newest first, with the total.
--   One member by id too, for a report's "go to member".
-- admin_member_counts: the header's and the filters' numbers.
--
-- unlimited_invites also says yes for a trusted partner (20261029100000),
-- which admin_members predates. admin_members itself is left as it is.
-- ============================================================================

create or replace function public.admin_member_search(
  p_query text default null,
  p_filter text default 'all',
  p_member uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  display_name text,
  phone text,
  type text,
  status text,
  is_admin boolean,
  is_seed boolean,
  city text,
  state text,
  level_range text,
  exact_level text,
  show_in_browse boolean,
  created_at timestamptz,
  updated_at timestamptz,
  invites_used integer,
  strikes integer,
  unlimited_invites boolean,
  email text,
  username text,
  total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q text := lower(btrim(coalesce(p_query, '')));
  -- Typed as a phone number: match its digits, however they are spaced.
  digits text := case when btrim(coalesce(p_query, '')) ~ '^[+\d\s()-]+$'
                      then regexp_replace(p_query, '\D', '', 'g') end;
  pattern text;
begin
  if not public.is_admin() then
    raise exception 'Not an administrator' using errcode = '42501';
  end if;
  if coalesce(p_filter, 'all') not in ('all', 'joined', 'directory', 'attention', 'active') then
    raise exception 'Unknown filter: %', p_filter using errcode = '22023';
  end if;
  -- What was typed, literally: % and _ match themselves.
  pattern := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  with roster as (
    select m.*,
           private.account_email(m.id) as account_email,
           public.active_strike_count(m.id) as strike_count
      from public.members m
     where p_member is null or m.id = p_member
  ),
  found as (
    select r.*
      from roster r
     where case coalesce(p_filter, 'all')
             when 'joined' then not r.is_seed
             when 'directory' then r.is_seed
             when 'attention' then not r.is_seed and (r.status <> 'active' or r.strike_count > 0)
             when 'active' then not r.is_seed and r.status = 'active'
             else true
           end
       and (
         q = ''
         or lower(concat_ws(' ', r.display_name, r.account_email, r.username::text, r.phone,
                            r.city, r.state, r.type, r.status,
                            case when r.is_admin then 'admin' end)) like pattern
         or (digits <> '' and regexp_replace(coalesce(r.phone, ''), '\D', '', 'g') like '%' || digits || '%')
       )
  )
  select f.id, f.display_name, f.phone, f.type, f.status, f.is_admin, f.is_seed,
         f.city, f.state, f.level_range, f.exact_level, f.show_in_browse,
         f.created_at, f.updated_at,
         public.live_invite_count(f.id),
         f.strike_count,
         (
           f.is_admin
           or f.type = 'organization'
           or exists (
             select 1
               from public.organization_representatives rep
               join public.organizations o on o.id = rep.organization_id and o.removed_at is null
              where rep.member_id = f.id
           )
           or exists (select 1 from public.club_partners cp where cp.member_id = f.id)
         ),
         f.account_email,
         f.username::text,
         count(*) over ()
    from found f
   -- Exactly what was typed first, so "Sam Lee" is not lost among newer
   -- names that contain it; then newest first.
   order by coalesce(q <> '' and q in (lower(f.display_name), lower(f.username::text), lower(f.account_email)), false) desc,
            f.created_at desc, f.id desc
   limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

comment on function public.admin_member_search(text, text, uuid, integer, integer) is
  'Admin''s roster, searched and paged in the database, with the total found. Administrators only. See 20261029230000.';

create or replace function public.admin_member_counts()
returns table (everyone bigint, joined bigint, directory bigint, attention bigint)
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
  select count(*),
         count(*) filter (where not m.is_seed),
         count(*) filter (where m.is_seed),
         count(*) filter (where not m.is_seed
                            and (m.status <> 'active' or public.active_strike_count(m.id) > 0))
    from public.members m;
end;
$$;

comment on function public.admin_member_counts() is
  'How many members in all, joined, from the directory, and paused or struck. Administrators only. See 20261029230000.';

revoke all on function public.admin_member_search(text, text, uuid, integer, integer) from public, anon;
revoke all on function public.admin_member_counts() from public, anon;
grant execute on function public.admin_member_search(text, text, uuid, integer, integer) to authenticated;
grant execute on function public.admin_member_counts() to authenticated;

notify pgrst, 'reload schema';
