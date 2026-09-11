-- ============================================================================
-- Adults only
-- ============================================================================
-- The club is 18+. Everything inside it is written by adults for adults —
-- bowel programmes, intimacy, catheters, what happened the night somebody was
-- injured — and none of it is moderated for a minor's benefit. There is no
-- version of this product that is safe to hand a fifteen-year-old, so the rule
-- is a door rather than a setting.
--
-- A trigger rather than a CHECK constraint. A check written against
-- current_date is not immutable: the row it accepts today is one a later dump
-- and restore re-evaluates against a different today. A trigger evaluates once,
-- at the moment the claim is made, which is exactly when the question is being
-- asked.
--
-- The comparison only ever gets safer with time — somebody who was 18 when they
-- joined does not become 17 — so this cannot retroactively invalidate a member.
-- ============================================================================

create or replace function public.assert_adult()
returns trigger
language plpgsql
as $$
begin
  if new.birth_date is null then
    raise exception 'A date of birth is required';
  end if;
  if new.birth_date > current_date - interval '18 years' then
    raise exception 'The SCI Club is for adults. You must be 18 or older to join.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists members_assert_adult on public.members;
create trigger members_assert_adult
  before insert or update of birth_date on public.members
  for each row execute function public.assert_adult();
