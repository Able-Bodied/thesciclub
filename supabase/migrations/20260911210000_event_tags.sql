-- ============================================================================
-- tags / event_tags — what an event is about
-- ============================================================================
-- docs/index.html shows two or three chips on every event card ("Adaptive
-- sport", "Beginner welcome", "Newly injured") and they are how somebody scans
-- a list of thirty events for the two that are for them. So the mock requires
-- this; the question is only where the values come from.
--
-- In ab-peers they came from a model: the taxonomy existed so an AI
-- verification pass could assign tags to scraped events. That pass was never
-- wired up, and this port has no AI calls and no paid API keys, so importing
-- the table unchanged would import a taxonomy nothing ever applies.
--
-- Instead the ingest job assigns tags with keyword rules over the title and
-- description (jobs/event-ingest/classify.js). That is dumber than a model and
-- it is honest about being dumber: `event_tags.source` records 'scraper' for
-- every row it writes, so a tag a human later corrects is distinguishable and
-- survives the next run. Feeds describe their own events in a small, repetitive
-- vocabulary — "handcycle", "peer support", "monoski" — which is the case
-- keyword matching handles well.
--
-- ---------------------------------------------------------------------------
-- Why a self-referential table rather than an enum or a text[]
-- ---------------------------------------------------------------------------
-- The hierarchy is data, so adding a tag or a whole category is an INSERT with
-- no migration and no code change. A join table rather than an array column on
-- events because an array cannot carry a foreign key, and without one a typo in
-- the ingest job would silently invent a tag no taxonomy row backs — which
-- shows up as a filter chip that matches one event and nobody can explain.
--
-- The tree is two deep today (category -> tag) because the filter sheet groups
-- by category. Nothing here assumes it stays that way.
-- ============================================================================

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.tags(id) on delete cascade,
  slug text not null unique,
  name text not null,
  -- Order within a parent, so the filter sheet does not have to sort
  -- alphabetically and split "Adaptive sport" from "Handcycling".
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists tags_parent_id_idx on public.tags (parent_id);

create table if not exists public.event_tags (
  event_id uuid not null references public.events(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  -- Who applied it. 'scraper' is a keyword rule; 'human' is a correction and
  -- the ingest job must not overwrite it.
  source text not null default 'scraper' check (source in ('scraper', 'human')),
  created_at timestamptz not null default now(),
  primary key (event_id, tag_id)
);

create index if not exists event_tags_tag_id_idx on public.event_tags (tag_id);

-- ---------------------------------------------------------------------------
-- RLS — same posture as events: public read, service_role writes
-- ---------------------------------------------------------------------------
alter table public.tags enable row level security;
alter table public.event_tags enable row level security;

drop policy if exists "tags are public" on public.tags;
create policy "tags are public" on public.tags for select using (true);

drop policy if exists "event tags are public" on public.event_tags;
create policy "event tags are public" on public.event_tags for select using (true);

-- ---------------------------------------------------------------------------
-- Seed the taxonomy
-- ---------------------------------------------------------------------------
-- The vocabulary is the mock's own — every chip in docs/index.html's EV list
-- appears here — widened with the activities the two live feeds actually
-- publish, which the mock's ten hand-written events do not cover.
--
-- Runs as the table owner, so it bypasses RLS. Idempotent on slug.

insert into public.tags (slug, name, display_order) values
  ('sport',       'Sport & recreation', 1),
  ('support',     'Support & groups',   2),
  ('skills',      'Skills & services',  3),
  ('social',      'Social & travel',    4),
  ('advocacy',    'Advocacy',           5),
  ('who',         'Who it is for',      6)
on conflict (slug) do nothing;

insert into public.tags (slug, name, parent_id, display_order)
select child.slug, child.name, parent.id, child.ord
from (values
  -- Sport & recreation. 'adaptive-sport' is the broad one the mock uses as a
  -- segment; the rest are the specific activities the feeds name.
  ('adaptive-sport',    'Adaptive sport',    'sport',    1),
  ('handcycling',       'Handcycling',       'sport',    2),
  ('wheelchair-rugby',  'Wheelchair rugby',  'sport',    3),
  ('winter-sports',     'Winter sports',     'sport',    4),
  ('monoskiing',        'Monoskiing',        'sport',    5),
  ('adaptive-climbing', 'Adaptive climbing', 'sport',    6),
  ('kayaking',          'Kayaking',          'sport',    7),
  ('outdoors',          'Outdoors',          'sport',    8),
  ('hiking-trails',     'Hiking & trails',   'sport',    9),

  ('peer-support',      'Peer support',      'support',  1),
  ('mens-group',        'Men''s group',      'support',  2),
  ('womens-group',      'Women''s group',    'support',  3),
  ('caregiver-group',   'Caregiver group',   'support',  4),

  ('independence',      'Independence',      'skills',   1),
  ('driving',           'Driving & hand controls', 'skills', 2),
  ('equipment',         'Equipment clinics', 'skills',   3),
  ('benefits',          'Benefits advice',   'skills',   4),
  ('health',            'Health & therapy',  'skills',   5),

  ('social-meetup',     'Social meetup',     'social',   1),
  ('travel',            'Travel',            'social',   2),
  ('food-drink',        'Food & drink',      'social',   3),
  ('arts',              'Arts & music',      'social',   4),

  ('policy-access',     'Policy & access',   'advocacy', 1),
  ('fundraising',       'Fundraising',       'advocacy', 2),

  -- Who it is for. These are audience notes rather than subjects, which is why
  -- they are their own category: "Beginner welcome" is not a kind of activity,
  -- it is a promise about the room, and it is the chip that decides whether
  -- somebody newly injured feels able to turn up.
  ('newly-injured',     'Newly injured',     'who',      1),
  ('beginner-welcome',  'Beginner welcome',  'who',      2),
  ('small-group',       'Small group',       'who',      3),
  ('family',            'Family',            'who',      4),
  ('parenting',         'Parenting',         'who',      5)
) as child(slug, name, parent_slug, ord)
join public.tags as parent on parent.slug = child.parent_slug
on conflict (slug) do nothing;
