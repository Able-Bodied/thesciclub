-- ============================================================================
-- Admin's member search starts a word
-- ============================================================================
-- The owner, 2026-11-06: every search finds the start of a word, as most
-- search does (src/lib/search.ts in the app). admin_member_search matched
-- what was typed anywhere ("ran" found Pranav). Now each typed word has to
-- start a word of the name, email, @name, place, type or status. A phone
-- number's digits still match anywhere, as typing its last four finds it.
-- Otherwise as 20261029230000.
--
-- Undo: supabase/undo/20261106080000.sql.
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
begin
  if not public.is_admin() then
    raise exception 'Not an administrator' using errcode = '42501';
  end if;
  if coalesce(p_filter, 'all') not in ('all', 'joined', 'directory', 'attention', 'active') then
    raise exception 'Unknown filter: %', p_filter using errcode = '22023';
  end if;

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
         -- Each typed word starts a word (the owner, 2026-11-06): "ran" finds
         -- Ran, not Pranav. Punctuation starts a word too, so "parakh" finds
         -- pranav.parakh and "example" finds ran@example.com. What is typed is
         -- matched literally: every character but a letter or digit escaped.
         or not exists (
           select 1
             from regexp_split_to_table(q, '\s+') as typed(word)
            where ltrim(typed.word, '@#') <> ''
              and lower(concat_ws(' ', r.display_name, r.account_email, r.username::text, r.phone,
                                  r.city, r.state, r.type, r.status,
                                  case when r.is_admin then 'admin' end))
                  !~ ('(^|[^[:alnum:]])'
                      || regexp_replace(ltrim(typed.word, '@#'), '([^[:alnum:]])', '\\\1', 'g'))
         )
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
