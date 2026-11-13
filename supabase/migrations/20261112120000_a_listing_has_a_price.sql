-- ============================================================================
-- A listing in For sale has a price
-- ============================================================================
-- The owner, 2026-11-12: Classifieds rooms show pictures in a grid, and the
-- For sale room's listings carry a price.
--
-- A table of its own rather than a column on chat_topics: chat_topics_for and
-- chat_create_topic stay exactly as every copy of the app calls them (an
-- iPhone copy from before this reads no prices and is otherwise unchanged),
-- and only one room has a use for it.
--
-- In whole cents, so $12.50 is exact. Up to a million dollars, which is more
-- than any chair. No row is "no price given", which the listing says nothing
-- about.
--
-- Read by anybody who can read the topic. Written only by the topic's own
-- author, while an active member, and only in For sale.
-- ============================================================================

create table if not exists public.chat_listing_prices (
  topic_id uuid primary key references public.chat_topics (id) on delete cascade,
  price_cents integer not null check (price_cents between 0 and 100000000),
  updated_at timestamptz not null default now()
);

comment on table public.chat_listing_prices is
  'The asking price of a listing in the For sale room, in cents. Written by the listing''s author only (20261112120000).';

alter table public.chat_listing_prices enable row level security;

create policy "a member reads a readable listing's price"
  on public.chat_listing_prices
  for select to authenticated
  using (
    exists (
      select 1 from public.chat_topics t
       where t.id = chat_listing_prices.topic_id
         and public.chat_room_is_readable(t.room_id)
    )
  );

create policy "the seller sets their own listing's price"
  on public.chat_listing_prices
  for insert to authenticated
  with check (
    public.is_active_member()
    and exists (
      select 1 from public.chat_topics t
       where t.id = chat_listing_prices.topic_id
         and t.author_id = auth.uid()
         and t.room_id = 'for-sale'
    )
  );

create policy "the seller changes their own listing's price"
  on public.chat_listing_prices
  for update to authenticated
  using (
    public.is_active_member()
    and exists (
      select 1 from public.chat_topics t
       where t.id = chat_listing_prices.topic_id
         and t.author_id = auth.uid()
         and t.room_id = 'for-sale'
    )
  )
  with check (
    public.is_active_member()
    and exists (
      select 1 from public.chat_topics t
       where t.id = chat_listing_prices.topic_id
         and t.author_id = auth.uid()
         and t.room_id = 'for-sale'
    )
  );

create policy "the seller takes their own listing's price off"
  on public.chat_listing_prices
  for delete to authenticated
  using (
    public.is_active_member()
    and exists (
      select 1 from public.chat_topics t
       where t.id = chat_listing_prices.topic_id
         and t.author_id = auth.uid()
    )
  );

revoke all on public.chat_listing_prices from anon;
grant select, insert, update, delete on public.chat_listing_prices to authenticated;
