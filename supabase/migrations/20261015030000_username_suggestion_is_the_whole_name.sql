-- ============================================================================
-- The first username suggestion is the whole name, with dots for the spaces
-- ============================================================================
-- The owner, 2026-10-15: "Ajay Shenoy" is offered @ajay.shenoy first, and
-- onboarding selects it, so Continue is all somebody has to press. Then the
-- suggestions as before (20261012000000): the first name, the names run
-- together, first_last, first and an initial, then the name with two digits.
--
-- Every word, not just the first and last: "Mary Ann Smith" is
-- @mary.ann.smith. A whole name too long for a username (over 20) is
-- skipped by username_available like any other invalid one, and the next
-- suggestion leads.
-- ============================================================================

create or replace function public.suggest_usernames(full_name text)
returns setof text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  words text[];
  first_name text;
  last_name text;
  base text;
  candidates text[] := '{}';
  picked text[] := '{}';
  candidate text;
  attempts int := 0;
begin
  if auth.uid() is null then
    return;
  end if;

  -- "José  García-López" -> {jose, garcialopez}: accents stripped (with the
  -- dictionary named, since the search path is empty), then only letters and
  -- digits kept within each word.
  select coalesce(array_agg(w), '{}') into words
    from (
      select regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, part)), '[^a-z0-9]', '', 'g') as w
        from regexp_split_to_table(coalesce(full_name, ''), '\s+') part
    ) parts
   where w <> '';

  if cardinality(words) = 0 then
    return;
  end if;

  first_name := words[1];
  last_name := case when cardinality(words) > 1 then words[cardinality(words)] end;
  base := first_name || coalesce(last_name, '');

  candidates := array[first_name, base];
  if last_name is not null then
    candidates := array[array_to_string(words, '.')] || candidates || array[
      first_name || '.' || last_name,
      first_name || '_' || last_name,
      first_name || left(last_name, 1)
    ];
  end if;

  foreach candidate in array candidates loop
    exit when cardinality(picked) >= 5;
    if not candidate = any (picked)
       and public.username_available(candidate) then
      picked := picked || candidate;
    end if;
  end loop;

  -- Then the plain name with two digits, until there are five.
  while cardinality(picked) < 5 and attempts < 60 loop
    attempts := attempts + 1;
    candidate := left(base, 18) || lpad((floor(random() * 100))::int::text, 2, '0');
    if not candidate = any (picked)
       and public.username_available(candidate) then
      picked := picked || candidate;
    end if;
  end loop;

  return query select unnest(picked);
end;
$$;
