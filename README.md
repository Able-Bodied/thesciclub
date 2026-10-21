# The SCI Club

A private, invite-only community app for people living with spinal cord injury.
Members find peers and mentors, talk in topic rooms and direct messages, and
find events worth going to.

**Live:** [thesciclub.com](https://thesciclub.com) (membership required)

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Scripts](#scripts)
- [Testing and quality](#testing-and-quality)
- [Project structure](#project-structure)
- [Deployment](#deployment)
- [Tools](#tools)
- [Documentation](#documentation)
- [Contributing](#contributing)

## Features

- **Invite-only joining**: member organizations, peer mentors and
  administrators invite people by email. Sign in with email and password,
  Google or Apple.
- **Home**: a feed of recent topics, photographs, upcoming events and members
  worth meeting.
- **Chat**: topic rooms with nested replies, likes, emoji reactions, link
  previews, photographs and saved posts, plus direct and group conversations
  with read receipts.
- **Peers**: a members-only directory with profiles, injury level, interests
  and mentors.
- **Events**: imported nightly from partner organizations' calendars, plus
  events added by hand (including repeating ones), with RSVPs.
- **Notifications**: Web Push on installed apps, and a 30-day notification
  list.
- **Moderation**: reports, strikes, suspension, room and topic management, and
  an admin stats page.
- **Accessibility first**: adjustable text size, large tap targets, controls
  labelled for screen readers and voice control, light and dark themes.
- **Installable PWA**: works as a Home Screen app on iPhone and Android.

## Tech stack

| Area | Tools |
| --- | --- |
| Front end | [React 19](https://react.dev), [TypeScript](https://www.typescriptlang.org) (strict), [Vite 8](https://vite.dev), [React Router 7](https://reactrouter.com) |
| Styling | [Tailwind CSS 4](https://tailwindcss.com), [Lucide](https://lucide.dev) icons |
| Back end | [Supabase](https://supabase.com): Postgres with row-level security, Auth, Storage, Realtime, Edge Functions |
| Testing | [Vitest](https://vitest.dev), [Testing Library](https://testing-library.com), SQL probes run against a local Supabase stack, [Playwright](https://playwright.dev) for screenshots |
| Linting | [Biome](https://biomejs.dev), [ESLint](https://eslint.org) |
| Hosting | [Netlify](https://www.netlify.com) (web app), Supabase (database and functions), GitHub Actions (nightly event import) |

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org) 24 or later
- [pnpm](https://pnpm.io) (the version is pinned in `package.json`, so
  `corepack enable` picks it up)
- [Docker](https://www.docker.com), for the local Supabase stack

### Install

```bash
git clone https://github.com/Able-Bodied/thesciclub.git
cd thesciclub
pnpm install
```

### Configure

Copy the example environment file:

```bash
cp .env.example .env.local
```

| Variable | Used by | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | App | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | App | Public (anon) key. Row-level security protects the data, not this key. |
| `VITE_VAPID_PUBLIC_KEY` | App | Web Push public key. Leave it empty to hide notification settings. |
| `VITE_PASSKEYS` | App | Optional. Turns on passkey sign-in, which is off by default. |
| `SUPABASE_SERVICE_ROLE_KEY` | Event import, scripts | Server-side only. Bypasses row-level security. |
| `VAPID_PRIVATE_KEY` | `push-notify` function | Server-side only. |

> **Warning:** never put a secret in a `VITE_` variable. Anything with that
> prefix is built into the browser bundle. If `.env.local` points at the hosted
> project, `pnpm dev`, `pnpm shoot` and Vitest all use real data.

### Run the local Supabase stack

```bash
pnpm exec supabase start
pnpm exec supabase db reset   # applies every migration and supabase/seed.sql
pnpm demo-member              # once after each reset
```

Mail sent by the local stack (sign-up confirmations, password resets) appears at
<http://127.0.0.1:54324>.

### Start the app

Point the dev server at the local stack:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321 \
VITE_SUPABASE_ANON_KEY=$(pnpm exec supabase status -o json | node -pe 'JSON.parse(require("fs").readFileSync(0)).PUBLISHABLE_KEY') \
pnpm dev
```

Then open <http://localhost:5173>.

### Local test accounts

`supabase/seed.sql` creates these accounts on the local stack only, all with
the password `local-dev-password`:

| Email | Role |
| --- | --- |
| `alfred@local.test` | Administrator |
| `maya@local.test` | Mentor |
| `sam@local.test` | Peer |
| `invited@local.test` | Invited, has not joined yet |
| `stranger@local.test` | Not invited, so refused |
| `newcomer@local.test` | No account yet. Sign up to test joining. |

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the Vite dev server |
| `pnpm build` | Type-check, build for production and prerender the legal pages |
| `pnpm preview` | Serve the production build locally |
| `pnpm test` | Run the test suite once |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm check` | Run Biome, ESLint (no warnings allowed) and the TypeScript compiler |
| `pnpm fix` | Auto-fix lint and formatting |
| `pnpm shoot <routes>` | Screenshot pages in a real browser ([Tools](#tools)) |
| `pnpm logos` | Find and upload organization logos ([Tools](#tools)) |
| `pnpm demo-member` | Give the local test account a member profile |

## Testing and quality

Every change has to pass all three before it is pushed:

```bash
pnpm check
pnpm test
pnpm build
```

- **Unit and component tests** sit next to the code they cover
  (`*.test.ts`, `*.test.tsx`). Tests never reach the network: any hook that
  talks to Supabase is stubbed.
- **Database probes** in `supabase/tests/` run as real signed-in roles against
  the local stack, check row-level security and grants, and roll back when
  they finish. Each file's header shows how to run it, for example:

  ```bash
  docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
    psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
    -f - < supabase/tests/chat-saves.sql
  ```

## Project structure

```text
src/
  components/      Shared UI (navigation, avatars, sheets, date fields)
  lib/             Data access, hooks and pure helpers (chat, events, auth, push)
  routes/          One folder per screen: home, chat, peers, events, me, admin, …
  sw.ts            Service worker (offline shell, push, share target)
supabase/
  migrations/      Database schema, policies and functions, in order
  functions/       Edge Functions: push-notify, link-preview, send-invite,
                   sign-in-reminder, home-screen-handoff
  templates/       Auth email templates
  tests/           SQL probes for policies and grants
  seed.sql         Local test data
jobs/event-ingest/ Nightly import of partner organizations' event calendars
scripts/           Maintenance and developer tools
public/            Static assets, fonts and icons
```

## Deployment

- **Web app**: Netlify builds and publishes `main` automatically
  (`netlify.toml`).
- **Database**: migrations are applied with the Supabase CLI. Always preview
  first, and release a migration before the client code that depends on it:

  ```bash
  pnpm exec supabase db push --linked --dry-run
  pnpm exec supabase db push --linked
  ```

- **Edge Functions**: `pnpm exec supabase functions deploy <name>`. Add
  `--no-verify-jwt` where `supabase/config.toml` sets `verify_jwt = false`.
  Never run `supabase config push`.
- **Event import**: the `Event ingest` GitHub Actions workflow runs every night
  from `main`. See [`jobs/event-ingest/README.md`](jobs/event-ingest/README.md).

## Tools

### Screenshots

`pnpm shoot` signs in as a local test account (`sam@local.test` unless
`SHOOT_EMAIL` says otherwise), then saves PNGs of the routes you name to
`screenshots/`:

```bash
SHOOT_BASE=http://localhost:5173 pnpm shoot /events /me --both   # phone and desktop
SHOOT_BASE=http://localhost:5173 pnpm shoot /home --text=larger  # larger text setting
```

To install the browser, run `pnpm exec playwright install chromium`. Add
`--with-deps` if you have root. Without root, unpack the system libraries
into the cache folder the scripts look in:

```bash
mkdir -p ~/.cache/thesciclub-browser-libs/debs && cd $_
apt-get download libnspr4 libnss3 libasound2t64
for d in *.deb; do dpkg-deb -x "$d" ../root; done
```

### Organization logos

`pnpm logos` lists organizations without a logo, pulls candidate images from a
site, and shows them inside the real badge so you can pick one by eye:

```bash
pnpm logos                                  # list organizations missing a logo
pnpm logos --find https://example.org       # pull candidates
pnpm logos --sheet                          # preview them at 96px and 38px
pnpm logos --upload SC=03-example.org.png   # upload one
```

A person picks each logo on purpose, because scrapers tend to choose badly.
For example, one site publishes a white logo meant for a dark header, and it
renders as an empty square.

## Documentation

| Document | What it covers |
| --- | --- |
| [`CONTEXT.md`](CONTEXT.md) | What the club is, who it is for, and what it deliberately is not. Read it first. |
| [`HANDOFF.md`](HANDOFF.md) | Current state, rules, environment notes and known traps |
| [`LAUNCH-CHECK.md`](LAUNCH-CHECK.md) | Launch checklist |
| [`EMAIL-SIGN-IN-PLAN.md`](EMAIL-SIGN-IN-PLAN.md) | Email and passkey sign-in plan |
| Migration headers | Why each database change was made |

## Contributing

- Work on the `scaffold-and-peers-deck` branch. Fetch and merge before you
  push, and never force-push.
- Keep commits small, one change per commit, and make sure each one passes
  `pnpm check` on its own.
- Commit the files you changed by name, not with `git commit -a`.
- The repository is public: never commit real phone numbers, keys, or anything
  that says who the administrators are.
- In anything members read, call them "members", never "users".
