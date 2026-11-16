-- A review keeps its edit history, and new stars give it a new date (the owner,
-- 2026-11-16). Probe: supabase/tests/review-history.sql.

alter table public.reviews
  add column edited_at timestamptz,
  add column rated_at timestamptz;
update public.reviews set rated_at = created_at;
alter table public.reviews
  alter column rated_at set default now(),
  alter column rated_at set not null;

-- The versions a review had before, read through reviews_for only.
create table public.review_edits (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews (id) on delete cascade,
  rating smallint not null,
  body text not null,
  anonymous boolean not null,
  only_organization boolean not null,
  written_at timestamptz not null,
  replaced_at timestamptz not null default now()
);
create index review_edits_review_idx on public.review_edits (review_id, written_at);
comment on table public.review_edits is
  'Earlier versions of a review, read through reviews_for. See 20261116100000.';
alter table public.review_edits enable row level security;
revoke all on public.review_edits from public, anon, authenticated;

create or replace function public.save_review(
  p_event uuid,
  p_organization uuid,
  p_rating integer,
  p_body text,
  p_anonymous boolean,
  p_only_organization boolean,
  p_photos jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  options record;
  was public.reviews%rowtype;
  words text := btrim(coalesce(p_body, ''));
  pictures jsonb := coalesce(p_photos, '[]'::jsonb);
  paths text[];
  item_path text;
begin
  if (p_event is null) = (p_organization is null) then
    raise exception 'A review is of one event or one organization.' using errcode = '22023';
  end if;
  select * into options from public.review_options(p_event, p_organization);
  if not coalesce(options.can_review, false) then
    raise exception 'Reviews come from people who were there or belong to it.' using errcode = '42501';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'Choose from 1 to 5 stars.' using errcode = '22023';
  end if;
  if char_length(words) > 2000 then
    raise exception 'A review can be 2,000 characters at most.' using errcode = '22023';
  end if;
  if coalesce(p_anonymous, false) and not options.anonymous_allowed then
    raise exception 'This organization does not take anonymous reviews.' using errcode = '42501';
  end if;
  if coalesce(p_only_organization, false) and options.organization_name is null then
    raise exception 'There is no organization to send this to.' using errcode = '22023';
  end if;
  if jsonb_typeof(pictures) <> 'array' or jsonb_array_length(pictures) > 4 then
    raise exception 'A review can have up to 4 pictures.' using errcode = '22023';
  end if;

  select * into was from public.reviews r
   where r.author_id = me
     and (r.event_id = p_event or r.organization_id = p_organization)
   for update;

  select coalesce(array_agg(item ->> 'path'), '{}') into paths
    from jsonb_array_elements(pictures) as item;
  foreach item_path in array paths loop
    if not coalesce(was.photos, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('path', item_path)) then
      if item_path is null
         or item_path !~ '^reviews/[0-9a-f-]{36}/[A-Za-z0-9_-]{1,80}\.[a-z0-9]{1,5}$' then
        raise exception 'That picture is not a review''s.' using errcode = '22023';
      end if;
      if not exists (
        select 1 from storage.objects o where o.bucket_id = 'photos' and o.name = item_path
      ) then
        raise exception 'That picture was not uploaded.' using errcode = 'P0002';
      end if;
    end if;
  end loop;

  -- Changes for 30 days after posting (the owner, 2026-11-16); deleting stays open.
  if was.id is not null and was.created_at < now() - interval '30 days' then
    raise exception 'A review can be changed for 30 days after it is posted.' using errcode = '42501';
  end if;

  if was.id is null then
    insert into public.reviews (
      event_id, organization_id, author_id, anonymous, only_organization,
      rating, body, photos
    )
    values (
      p_event, p_organization, me,
      coalesce(p_anonymous, false), coalesce(p_only_organization, false),
      p_rating, words, pictures
    );
  else
    -- New stars or words keep the version they replace.
    if was.rating <> p_rating or was.body <> words then
      insert into public.review_edits (review_id, rating, body, anonymous, only_organization, written_at)
      values (was.id, was.rating, was.body, was.anonymous, was.only_organization,
              coalesce(was.edited_at, was.created_at));
    end if;
    update public.reviews r
       set anonymous = coalesce(p_anonymous, false),
           only_organization = coalesce(p_only_organization, false),
           rating = p_rating,
           body = words,
           photos = pictures,
           edited_at = case when was.rating <> p_rating or was.body <> words then now() else r.edited_at end,
           -- New stars are a new review as far as its date goes (the owner, 2026-11-16).
           rated_at = case when was.rating <> p_rating then now() else r.rated_at end
     where r.id = was.id;
  end if;
end;
$$;

drop function public.reviews_for(uuid, uuid);
create function public.reviews_for(p_event uuid default null, p_organization uuid default null)
returns table (
  id uuid,
  event_id uuid,
  event_title text,
  organization_name text,
  rating smallint,
  body text,
  photos jsonb,
  anonymous boolean,
  only_organization boolean,
  author_id uuid,
  author_name text,
  author_has_profile boolean,
  author_photo text,
  org_reply text,
  created_at timestamptz,
  mine boolean,
  can_reply boolean,
  rated_at timestamptz,
  edited_at timestamptz,
  history jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.event_id, e.title, o.name, r.rating, r.body, r.photos,
         r.anonymous, r.only_organization,
         case when r.anonymous then null else r.author_id end,
         case when r.anonymous then null else coalesce(a.display_name, 'Deleted member') end,
         coalesce(not r.anonymous and a.status = 'active' and a.show_in_browse, false),
         case when r.anonymous then null else a.photo_path end,
         r.org_reply, r.created_at,
         r.author_id = auth.uid(),
         o.id is not null and (public.speaks_for(o.id) or public.is_admin()),
         r.rated_at, r.edited_at,
         -- Earlier versions, newest first. One said only to the organization, or
         -- said anonymously before the name went on, stays with whoever could read it then.
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'rating', h.rating, 'body', h.body, 'written_at', h.written_at)
                  order by h.written_at desc)
             from public.review_edits h
            where h.review_id = r.id
              and (
                r.author_id = auth.uid()
                or public.is_admin()
                or (
                  (not h.only_organization or (o.id is not null and public.speaks_for(o.id)))
                  and (not h.anonymous or r.anonymous)
                )
              )
         ), '[]'::jsonb)
    from public.reviews r
    left join public.events e on e.id = r.event_id
    left join public.organizations o on o.id = coalesce(r.organization_id, e.organization_id)
    left join public.members a on a.id = r.author_id
   where public.is_member()
     and r.removed_at is null
     and (
       (p_event is not null and (
         r.event_id = p_event
         or e.series_id = (select x.series_id from public.events x where x.id = p_event)
       ))
       or (p_organization is not null and o.id = p_organization)
     )
     and (
       not r.only_organization
       or public.is_admin()
       or (o.id is not null and public.speaks_for(o.id))
       or r.author_id = auth.uid()
     )
     and (r.author_id is null or not public.members_blocked(auth.uid(), r.author_id))
   order by r.rated_at desc, r.id
   limit 200;
$$;
revoke all on function public.reviews_for(uuid, uuid) from public, anon;
grant execute on function public.reviews_for(uuid, uuid) to authenticated;
