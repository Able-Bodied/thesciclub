-- ============================================================================
-- organizations — the bodies that run events and can vouch for members
-- ============================================================================
-- Organizations are public (CONTEXT.md, "What is public"): they are the
-- shopfront, they already publish themselves elsewhere, and an organization
-- page is a reasonable thing to land on from a search engine. Members are not.
--
-- `can_invite` is what makes an organization able to put a phone number on the
-- club's list. It is deliberately a column rather than an implicit property of
-- existing: not every organization that runs events is one we let in the door.
-- ============================================================================

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  -- Two or three letters, drawn in the badge on a mentor's card.
  short_code text not null unique check (short_code ~ '^[A-Z]{2,4}$'),
  name text not null unique,
  city text not null,
  description text not null default '',
  tags text[] not null default '{}',
  can_invite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.organizations enable row level security;

-- Readable by anyone, signed in or not. Writes happen through the service role
-- (seed and the events ingest job); no client-side policy grants them.
drop policy if exists "organizations are public" on public.organizations;
create policy "organizations are public"
  on public.organizations for select
  using (true);
