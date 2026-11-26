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

## Tests, then staging, then live (owner, 2026-11-10; staging 2026-11-26)

Every change goes `tests` → `staging` → `main`. Never push `main` without
the owner's word.

**1. tests** (https://tests.thesciclub.com, its own Supabase project). After
every change or addition, put it here and give the link to the person you
are working for. `tests` carries other people's unreleased work, so keep it
out of yours:

- Your work branch stays based on `origin/main`. **Never merge or rebase
  `tests` into it**: that pulls in everybody's unreleased commits.
- To put a commit on `tests`: `git fetch origin`, make a scratch checkout
  with `git worktree add --detach <dir> origin/tests`, copy `.env.local`
  into it, `git cherry-pick <your commit>`, run `pnpm test:related` on the
  files it touches, then `git push origin HEAD:tests` and remove the
  worktree. Never force-push `tests`.
- Database changes go to the test project first.

**2. staging** (a branch, no site of its own): what is ready for live. When
the person you are working for says a change works on tests, put the same
commits on `staging` the same way: a scratch checkout of `origin/staging`,
`git cherry-pick`, `pnpm check`, `pnpm test:related`, `git push origin
HEAD:staging`. Only what was on tests; never merge `tests` into it, never
force-push it. In the commit message, say what live will need: a migration
to apply, an edge function to deploy.

**3. live** (`main`): the owner releases, at night when hardly anybody is
using the app, so live changes as seldom as it can. They, or Claude at their
word, push `main`, change the live database and deploy edge functions to
live. Everybody else stops at `staging` and tells them it is there.

One exception: anatol may release his own work when he explicitly asks to.
Before doing it, recommend once that it go to `staging` for the owner's
release instead, to keep pushes few and at night. If he still asks, release
it as the owner would (the steps below).

To release (the owner's sessions):

1. `git fetch origin`. If `main` has commits `staging` lacks (a hotfix),
   merge `origin/main` into `staging` first.
2. On `staging`: `pnpm check` alone, then `pnpm test`. Stop if either fails.
3. Migrations in the repo but not in live's
   `supabase_migrations.schema_migrations`: apply them in one transaction,
   in order, recording each.
4. Edge functions changed since `main`
   (`git diff --name-only origin/main origin/staging -- supabase/functions`):
   check that live's copy matches `main` first, then deploy from `staging`.
5. `git push origin origin/staging:main`. `main` and `staging` are then the same.

Run `pnpm check` alone before any push, and stop if it fails.

## One release a day (owner, 2026-11-21)

Every push to `main` makes every installed app download a new copy and
reload, and several in a day felt slow and unstable. So:

- Push `main` at most once a day. Until then, changes wait on `staging`. Push
  sooner only when the person you are working for says so for that change
  (a live bug, say).
- Near the end of their day (they say they are done, or it is past 5 PM
  Pacific and a task has finished), remind them once to release, and list
  what is waiting: `git log --oneline origin/main..origin/staging`, with
  who wrote each, so everybody's work goes out together and nobody is
  surprised by it. Name what is on `tests` but not staged too.
- Releases are tagged `release-<build minute>` (.github/workflows/site.yml).
  Admin › Page speed shows each release's times, and
  .github/workflows/release-speed.yml compares the day's releases each night.

## The admin site (owner, 2026-11-22)

admin.thesciclub.com (admin/, cloudflare/admin/, vite.admin.config.ts) is
used only by the club's administrators, so it has no test copy: its changes
go straight to `staging`, and the owner may release them without waiting for
the day's release. A push that changes only those files does
not rebuild the app (.github/workflows/site.yml), so installed apps do not
reload for it. Two exceptions go the usual way, through `tests`: the screens
it shares with the app's Admin tab (src/routes/admin/) and database changes.

## Installed apps must keep updating (owner, 2026-11-21)

The site is on Cloudflare (since 2026-11-20). Installed apps find a new
version through `/sw.js` and `/version.json`, so both must be fetched fresh
every time (`Cache-Control: no-cache` in netlify.toml, carried to Cloudflare
and checked by scripts/cloudflare-site-rules.test.mjs). Cloudflare's
Caching › Configuration › Browser Cache TTL must stay **Respect Existing
Headers**, or it overrides them and apps sit on an old copy. Moving hosts
again: read commit 529b7c9f first.

## Screenshot review (owner, 2026-11-12)

Before you show the person you are working for screenshots of a change,
have a subagent running Fable 5.2 (the Agent tool with `model: "fable"`)
look at them. Give it the image paths and what the change was meant to do,
not your own verdict, and ask it for problems: anything cut off,
overlapping or misaligned, wording that is wrong or does not fit, things
that look broken or unfinished, and anything that does not match the
request. Fix what it finds and take the screenshots again, then send them.
Say in one line what the review caught.
