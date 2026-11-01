-- ============================================================================
-- Reviews of events and organizations
--
-- The owner, 2026-10-31: "reviews of events and orgs ... useful for people to
-- reference when trying to figure out if to go to a similar event ... with
-- pictures. You could ask to provide feedback anonymously or only to the
-- organization." Org admins can turn anonymous reviews off for theirs.
--
-- Who: an event, whoever checked in; an organization, its members. Not its own
-- org admins. Each member writes one for each, and can change or delete it.
-- What: 1 to 5 stars, words, up to four pictures.
-- Who reads: members. "Only the organization" reads its org admins, the
-- club's administrators and the author. An organization's org admins can post
-- one reply under a review. Any member can report one to the administrators.
--
-- An event's page reads the reviews of every date of its series, and an
-- organization's reads its own and its events', so somebody deciding whether to
-- go has something to read before a first date has happened.
--
-- ---------------------------------------------------------------------------
-- Anonymous
-- ---------------------------------------------------------------------------
-- Hidden from other members and from the organization. The author is still on
-- the row, and the club's administrators see who it was on a reported review,
-- so an abusive one can be dealt with.
--
-- Files are left behind when a review is deleted, or a picture taken off it, as
-- an event's are (20261011070000): the names are random and nothing lists them.
-- ============================================================================

alter table public.organizations
  add column anonymous_reviews boolean not null default true;

comment on column public.organizations.anonymous_reviews is
  'Whether a review of it or its events can be anonymous. Set by its org admins. See 20261031080000.';

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete cascade,
  author_id uuid references public.members (id) on delete set null,
  anonymous boolean not null default false,
  only_organization boolean not null default false,
  rating smallint not null check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 2000),
  photos jsonb not null default '[]'::jsonb check (
    jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 4
  ),
  org_reply text check (char_length(org_reply) <= 1000),
  org_reply_at timestamptz,
  org_reply_by uuid references public.members (id) on delete set null,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((event_id is null) <> (organization_id is null))
);

create unique index reviews_one_of_an_event on public.reviews (event_id, author_id)
  where event_id is not null;
create unique index reviews_one_of_an_organization on public.reviews (organization_id, author_id)
  where organization_id is not null;
create index reviews_author_idx on public.reviews (author_id);
create index reviews_org_reply_by_idx on public.reviews (org_reply_by);

comment on table public.reviews is
  'Reviews of events and organizations, read and written through functions. See 20261031080000.';

alter table public.reviews enable row level security;
revoke all on public.reviews from public, anon, authenticated;

create table public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews (id) on delete cascade,
  reporter_id uuid references public.members (id) on delete set null,
  note text not null default '' check (char_length(note) <= 500),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (review_id, reporter_id)
);

create index review_reports_reporter_idx on public.review_reports (reporter_id);

alter table public.review_reports enable row level security;
revoke all on public.review_reports from public, anon, authenticated;

-- ----------------------------------------------------------------- helpers --
-- reviews/<random>/<file>, for any active member.
create function public.review_photo_is_writable(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  parts text[] := storage.foldername(object_name);
begin
  return coalesce(cardinality(parts), 0) = 2
    and parts[1] = 'reviews'
    and parts[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.is_active_member();
end;
$$;

revoke all on function public.review_photo_is_writable(text) from public, anon;
grant execute on function public.review_photo_is_writable(text) to authenticated;

create policy "a member uploads a review's pictures"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'photos' and public.review_photo_is_writable(name));

-- ----------------------------------------------------------------- reading --
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
  can_reply boolean
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
         o.id is not null and (public.speaks_for(o.id) or public.is_admin())
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
   order by r.created_at desc, r.id
   limit 200;
$$;

revoke all on function public.reviews_for(uuid, uuid) from public, anon;
grant execute on function public.reviews_for(uuid, uuid) to authenticated;

-- What the form needs: whether they may, what it is called, and its rules.
create function public.review_options(p_event uuid default null, p_organization uuid default null)
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
    on o.id = coalesce(wanted.organization_id, e.organization_id) and not o.is_the_club;
$$;

revoke all on function public.review_options(uuid, uuid) from public, anon;
grant execute on function public.review_options(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------- writing --
create function public.save_review(
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

revoke all on function public.save_review(uuid, uuid, integer, text, boolean, boolean, jsonb) from public, anon;
grant execute on function public.save_review(uuid, uuid, integer, text, boolean, boolean, jsonb) to authenticated;

create function public.delete_my_review(p_review uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.reviews r
   where r.id = p_review and r.author_id = auth.uid();
  if not found then
    raise exception 'That is not your review.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.delete_my_review(uuid) from public, anon;
grant execute on function public.delete_my_review(uuid) to authenticated;

-- One reply, which can be changed, or taken off with nothing.
create function public.reply_to_review(p_review uuid, p_reply text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  words text := nullif(btrim(coalesce(p_reply, '')), '');
  organization uuid;
begin
  select coalesce(r.organization_id, e.organization_id) into organization
    from public.reviews r
    left join public.events e on e.id = r.event_id
   where r.id = p_review and r.removed_at is null;
  if organization is null
     or not (public.speaks_for(organization) or public.is_admin()) then
    raise exception 'Only its org admins can reply.' using errcode = '42501';
  end if;
  if char_length(coalesce(words, '')) > 1000 then
    raise exception 'A reply can be 1,000 characters at most.' using errcode = '22023';
  end if;
  update public.reviews r
     set org_reply = words,
         org_reply_at = case when words is null then null else now() end,
         org_reply_by = case when words is null then null else auth.uid() end
   where r.id = p_review;
end;
$$;

revoke all on function public.reply_to_review(uuid, text) from public, anon;
grant execute on function public.reply_to_review(uuid, text) to authenticated;

create function public.set_organization_anonymous_reviews(p_organization uuid, p_allowed boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.speaks_for(p_organization) or public.is_admin()) then
    raise exception 'Only its org admins can change this.' using errcode = '42501';
  end if;
  update public.organizations o
     set anonymous_reviews = coalesce(p_allowed, true)
   where o.id = p_organization and o.removed_at is null;
  if not found then
    raise exception 'There is no such organization.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_organization_anonymous_reviews(uuid, boolean) from public, anon;
grant execute on function public.set_organization_anonymous_reviews(uuid, boolean) to authenticated;

-- --------------------------------------------------------------- reporting --
-- In the bell for the administrators, as any report is. Not by push: push-notify
-- reads chat_reports, and this is not one.
create function public.report_review(p_review uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_member() then
    raise exception 'Only an active member can report a review.' using errcode = '42501';
  end if;
  if char_length(coalesce(p_note, '')) > 500 then
    raise exception 'A report can be 500 characters at most.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.reviews r where r.id = p_review and r.removed_at is null) then
    raise exception 'That review is gone.' using errcode = 'P0002';
  end if;

  insert into public.review_reports (review_id, reporter_id, note)
  values (p_review, auth.uid(), btrim(coalesce(p_note, '')))
  on conflict (review_id, reporter_id) do update
    set note = excluded.note, resolved_at = null;

  insert into public.notifications as n (member_id, kind, tag)
  select r.id, 'report', 'review_report:' || p_review::text
    from public.members r
   where r.is_admin and r.status = 'active' and r.id <> auth.uid()
  on conflict (member_id, tag) where read_at is null
  do update set created_at = clock_timestamp(), count = n.count + 1, seen_at = null;
end;
$$;

revoke all on function public.report_review(uuid, text) from public, anon;
grant execute on function public.report_review(uuid, text) to authenticated;

create function public.admin_reported_reviews()
returns table (
  review_id uuid,
  place text,
  rating smallint,
  body text,
  photos jsonb,
  anonymous boolean,
  author_name text,
  notes text[],
  reports integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, coalesce(e.title, o.name, 'Gone'), r.rating, r.body, r.photos, r.anonymous,
         coalesce(a.display_name, 'Deleted member'),
         array_remove(array_agg(nullif(x.note, '')), null),
         count(*)::integer
    from public.review_reports x
    join public.reviews r on r.id = x.review_id
    left join public.events e on e.id = r.event_id
    left join public.organizations o on o.id = r.organization_id
    left join public.members a on a.id = r.author_id
   where public.is_admin()
     and x.resolved_at is null
     and r.removed_at is null
   group by r.id, e.title, o.name, a.display_name
   order by min(x.created_at), r.id;
$$;

revoke all on function public.admin_reported_reviews() from public, anon;
grant execute on function public.admin_reported_reviews() to authenticated;

-- Remove it, or leave it up; either way its reports are dealt with.
create function public.admin_settle_review_report(p_review uuid, p_remove boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can do this.' using errcode = '42501';
  end if;
  if p_remove then
    update public.reviews r set removed_at = now() where r.id = p_review;
  end if;
  update public.review_reports x
     set resolved_at = now()
   where x.review_id = p_review and x.resolved_at is null;
end;
$$;

revoke all on function public.admin_settle_review_report(uuid, boolean) from public, anon;
grant execute on function public.admin_settle_review_report(uuid, boolean) to authenticated;
