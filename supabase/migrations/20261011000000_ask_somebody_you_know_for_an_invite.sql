-- ============================================================================
-- Asking somebody you know for an invite
-- ============================================================================
-- The owner, 2026-10-10: somebody whose number is not on the list should be
-- able to find, among the people they already know, one who can add them, and
-- text them. Somebody who knows nobody is sent to a consultation instead (the
-- client's link; nothing here).
--
-- ---------------------------------------------------------------------------
-- What this answers, and to whom
-- ---------------------------------------------------------------------------
-- Until now nothing answered a question about anybody else's number
-- (20260913010000: my_number_is_invited takes no number). This does, so it is
-- held tight:
--
--   * Only to somebody signed in with a verified phone who is not a member and
--     is not on the list: the person standing at the closed door, and nobody
--     who already has a way in.
--   * Only "which of these numbers can add you". No name, no account type, no
--     photo: the asker already has the number, and usually the name, in their
--     own phone. What they learn is that this person can invite to the club.
--   * Only about members who can invite (a mentor, an organization account, an
--     administrator, or somebody linked to an organization), active, and with
--     findable_for_invites on. It is on unless they turn it off (the owner's
--     choice: on, with a switch on Me).
--   * At most 100 numbers a look, and 5 looks a day per account, recorded in
--     invite_lookups. A typed number is a look of one.
--
-- The text itself is sent from the asker's own phone (an sms: link), so the
-- club sends nothing and stores no message.
-- ============================================================================

alter table public.members
  add column if not exists findable_for_invites boolean not null default true;

comment on column public.members.findable_for_invites is
  'Whether somebody who has this member''s number, and is not on the list, can learn that they can invite them. Only matters for members who can invite.';

create table if not exists public.invite_lookups (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  numbers integer not null check (numbers between 1 and 100),
  looked_at timestamptz not null default clock_timestamp()
);

comment on table public.invite_lookups is
  'Each look find_inviters answered, for its daily limit. No numbers are kept.';

create index if not exists invite_lookups_user_recent on public.invite_lookups (user_id, looked_at desc);

alter table public.invite_lookups enable row level security;
revoke all on public.invite_lookups from public, anon, authenticated;

create or replace function public.find_inviters(numbers text[])
returns table (phone text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  own text := public.normalize_phone(auth.jwt() ->> 'phone');
  asked text[];
begin
  if caller is null or own is null or own = '' then
    raise exception 'Verify your number first.' using errcode = '42501';
  end if;
  if exists (select 1 from public.members where id = caller) then
    raise exception 'You are already a member.' using errcode = '42501';
  end if;
  if public.my_number_is_invited() then
    raise exception 'Your number is already on the list.' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct n), '{}') into asked
    from (
      select public.normalize_phone(raw) as n
        from unnest(coalesce(numbers, '{}')) raw
    ) normalized
   where n is not null and n <> '' and n <> own;

  if cardinality(asked) = 0 then
    return;
  end if;
  if cardinality(asked) > 100 then
    raise exception 'Choose up to 100 numbers at a time.' using errcode = '22023';
  end if;
  if (select count(*) from public.invite_lookups l
       where l.user_id = caller and l.looked_at > now() - interval '1 day') >= 5 then
    raise exception 'You have looked five times today. Try again tomorrow, or book a call instead.'
      using errcode = '42501';
  end if;

  insert into public.invite_lookups (user_id, numbers) values (caller, cardinality(asked));

  return query
    select m.phone
      from public.members m
     where m.phone = any (asked)
       and m.status = 'active'
       and m.findable_for_invites
       and (
         m.is_admin
         or m.type in ('mentor', 'organization')
         or exists (
           select 1 from public.organization_representatives r
             join public.organizations o on o.id = r.organization_id and o.removed_at is null
            where r.member_id = m.id
         )
       );
end;
$$;

comment on function public.find_inviters(text[]) is
  'For somebody verified and not on the list: which of the numbers they give belong to a findable member who can invite. Numbers only; five looks a day.';

revoke all on function public.find_inviters(text[]) from public, anon;
grant execute on function public.find_inviters(text[]) to authenticated;
