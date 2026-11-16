-- A review can be changed for 30 days after it is posted (the owner, 2026-11-16).
-- After that it can still be deleted. Probe: supabase/tests/review-edit-window.sql.

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
    update public.reviews r
       set anonymous = coalesce(p_anonymous, false),
           only_organization = coalesce(p_only_organization, false),
           rating = p_rating,
           body = words,
           photos = pictures
     where r.id = was.id;
  end if;
end;
$$;
