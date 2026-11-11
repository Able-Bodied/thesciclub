# Working here

## Tests (owner, 2026-11-08)

The suite grows with every change and a third of each change's edits were
test files. Add tests only where they earn their upkeep.

**Write a test for:**
- a bug that really happened (the regression test for its fix)
- security, privacy and who-can-see-what rules (blocking, paused members,
  invites, admin powers, row-level security)
- legal and App Store requirements
- tricky logic: dates and time zones, paging, caches, counting

**Do not write a test for:**
- wording or copy, layout, styling
- "the button is there" with nothing behind it
- what TypeScript already guarantees
- a second case of something an existing test already covers

**Usually one new test per change**, but one for each separate security or
privacy rule the change adds, or more when the owner asks. Prefer extending
an existing test over adding a new one.

**While working**, run only the tests the change touches:
`pnpm test:related <changed files>`. Run the full `pnpm test` once, before a
push. The Check workflow runs it on every push to `main` and every PR.

## Commits (owner, 2026-11-09)

No `Co-Authored-By: Claude` line (or any Claude trailer) in commit
messages, for everyone working here.

## Test site (owner, 2026-11-10)

After every change or addition, put it on https://tests.thesciclub.com
(the `tests` branch, its own Supabase project) and give the owner the link.
Never push `main` without the owner's word.

- Run `pnpm check` first, alone, and stop if it fails.
- Merge, don't overwrite: other sessions push here too. Fetch, merge
  `origin/tests` into your work, then `git push origin HEAD:tests`.
  Never force-push `tests`.
- Database changes go to the test project too, never the live one.
