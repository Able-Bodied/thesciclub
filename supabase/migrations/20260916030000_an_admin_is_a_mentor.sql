-- An administrator is a mentor, and stays one.
--
-- `/admin` no longer offers Make peer or Make mentor on an administrator's own
-- row — nothing about an administrator's membership is changed from the
-- application any more — so the type has to be decided somewhere, and a screen
-- that no longer shows a control is not a place. A trigger, for the same reason
-- the 18+ rule is one: it holds however the row is written, including the
-- service role promoting somebody by hand, which is the only way anybody
-- becomes an administrator.
--
-- Mentor rather than peer because of what the word does. CONTEXT.md: a mentor
-- "appears first to newly injured members", and the person running the club is
-- the one member who has undertaken to answer. The club's own account is an
-- administrator, and it was already a mentor — this makes that a rule instead
-- of a row that happens to be right.
--
-- It coerces rather than raising. `type` is not something a caller is asking a
-- question about here; it is a consequence of `is_admin`, and an insert that
-- fails because it also said 'peer' would be a puzzle for whoever is promoting
-- an administrator at the time.

create or replace function public.members_admin_is_mentor()
returns trigger
language plpgsql
as $$
begin
  if new.is_admin then
    new.type := 'mentor';
  end if;
  return new;
end;
$$;

drop trigger if exists members_admin_is_mentor on public.members;
create trigger members_admin_is_mentor
  before insert or update on public.members
  for each row execute function public.members_admin_is_mentor();

-- Existing administrators, so the rule is true of the table and not only of
-- rows written after it.
update public.members set type = 'mentor' where is_admin and type <> 'mentor';

-- And the function says so, rather than appearing to work and being undone by
-- the trigger a millisecond later. Same shape as the guards on
-- admin_set_member_status, admin_delete_member and admin_block_number: each
-- checks for itself, because there is no shared gate they pass through.
create or replace function public.admin_set_member_type(target uuid, new_type text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_is_admin boolean;
begin
  if not public.is_admin() then
    raise exception 'Not an administrator';
  end if;
  if new_type not in ('peer', 'mentor') then
    raise exception 'Unknown type: %', new_type;
  end if;

  select is_admin into target_is_admin from public.members where id = target;
  if not found then
    raise exception 'No such member';
  end if;
  if target_is_admin then
    raise exception 'An administrator is a mentor and cannot be made a peer';
  end if;

  update public.members set type = new_type where id = target;
end;
$$;
