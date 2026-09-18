-- "Prefer not to say" is an answer, and it completes a profile.
--
-- Asked for by the owner: a member who does not want to give one of these
-- should be able to say so, and the percentage should be able to reach 100.
--
-- ---------------------------------------------------------------------------
-- Why skipping was not already enough
-- ---------------------------------------------------------------------------
-- The survey has had "Skip this one" since it was built, and every field except
-- the name and the birthday is nullable. But skipping leaves a null, and a null
-- is indistinguishable from "have not got to it yet" — which is correct, and is
-- why the ring on Me counts it as undone. The consequence is that somebody who
-- is simply never going to put a photograph up is shown an unfinished profile
-- for ever, with no way to say that it is finished.
--
-- So there are two different things and both stay:
--
--   Skip this one     — not now. Still blank, still counted as missing.
--   Prefer not to say — a decision. Counted as answered.
--
-- That distinction is the whole point. Collapsing them would either nag people
-- who have decided, or quietly mark as complete a profile somebody meant to
-- come back to.
--
-- ---------------------------------------------------------------------------
-- One array, for the survey and the details both
-- ---------------------------------------------------------------------------
-- The two completeness measures are separate — progressOf() over the survey's
-- questions, missingDetails() over the five onboarding fields — but a decline
-- is the same fact in both, and a member does not think of them as two forms.
-- One column keyed by the thing being declined keeps it that way and means a
-- second measure added later gets this for free.
--
-- The keys are the client's own: the survey's question keys, and for the
-- details the five names missingDetails() already uses. They are not a schema
-- enum on purpose. This column records what somebody declined to say, not what
-- the form happens to ask this month — a key that stops being asked should sit
-- there harmlessly rather than fail a constraint on somebody's next save.
--
-- ---------------------------------------------------------------------------
-- The name and the birthday cannot be declined
-- ---------------------------------------------------------------------------
-- The owner's rule, and the database already agreed with it before this: a row
-- cannot exist without a name, and the 18+ trigger cannot do its job without a
-- birthday. The check is here rather than only in the client because it is a
-- rule about the record, and a client-side-only version of it is one fetch away
-- from not existing.

alter table public.members
  add column if not exists declined text[] not null default '{}';

comment on column public.members.declined is
  'Things this member has said they would rather not give. Counted as answered by progressOf() and missingDetails(). Never name or birthday.';

-- Dropped first so re-running this against a database that already has it
-- replaces the constraint rather than failing on the duplicate name.
alter table public.members drop constraint if exists members_declined_excludes_required;
alter table public.members
  add constraint members_declined_excludes_required
  check (not (declined && array['displayName', 'name', 'birthDate', 'birthday']::text[]));

-- No new policy. `members` already restricts a member to their own row, and
-- this is one more column on it; the survey and the details form write it the
-- same way they write everything else.
