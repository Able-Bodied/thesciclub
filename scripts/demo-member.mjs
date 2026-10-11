/**
 * Make sure a local account has a member row, so screenshots and manual
 * poking land inside the club rather than at the questions.
 *
 *   pnpm demo-member
 *   DEMO_EMAIL=invited@local.test pnpm demo-member
 *
 * `supabase db reset` runs supabase/seed.sql, which makes alfred, maya and sam
 * members already. This is for the others: `invited@local.test` has an account
 * and an invite and no member row, and any account you sign up by hand is the
 * same until it has been through the questions. Clicking through those is a
 * dozen screens, and none of them are what is being tested.
 *
 * Local only, and it refuses to run anywhere else: it writes a member row
 * directly with the service role, which is a reasonable thing to do to a
 * throwaway database and not to a real one.
 */

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = (process.env.DEMO_EMAIL ?? 'sam@local.test').trim().toLowerCase();
const PASSWORD = process.env.DEMO_PASSWORD ?? 'local-dev-password';

if (!/127\.0\.0\.1|localhost/.test(URL)) {
  console.error(`Refusing to run against ${URL}. This writes a member row directly; local only.`);
  process.exit(1);
}
if (!KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY (supabase status prints it).');
  process.exit(1);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

/**
 * Sign in with the password, as the sign-in screen does. The anon key is what
 * the screen uses; the service key is accepted here too, and is what is set.
 */
async function signIn() {
  const response = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const body = await response.json();
  if (!body.user?.id) throw new Error(`Could not sign in: ${JSON.stringify(body).slice(0, 200)}`);
  return body.user.id;
}

const userId = await signIn();

const present = await fetch(`${URL}/rest/v1/members?id=eq.${userId}&select=id,display_name`, {
  headers,
});
const [already] = await present.json();
if (already) {
  console.log(`  ${EMAIL} is a member already (${already.display_name}, ${userId})`);
  process.exit(0);
}

// An invite first: the members insert trigger consumes one, and without it the
// row is refused exactly as a real signup would be.
const existing = await fetch(
  `${URL}/rest/v1/invites?email=eq.${encodeURIComponent(EMAIL)}&select=id`,
  {
    headers,
  },
);
const invites = await existing.json();
if (!Array.isArray(invites) || invites.length === 0) {
  const organizations = await fetch(`${URL}/rest/v1/organizations?short_code=eq.NCS&select=id`, {
    headers,
  });
  const [ncs] = await organizations.json();
  await fetch(`${URL}/rest/v1/invites`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email: EMAIL,
      status: 'pending',
      invited_by_organization_id: ncs?.id ?? null,
    }),
  });
}

const member = {
  id: userId,
  display_name: 'Alex',
  username: EMAIL.split('@')[0]
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, 20),
  birth_date: '1984-06-21',
  level_range: 'T7–T12',
  exact_level: 'T10',
  completeness: 'Incomplete',
  injury_date: '2013-03-01',
  injury_date_precision: 'month',
  city: 'San Jose',
  state: 'CA',
  type: 'peer',
  status: 'active',
  show_in_browse: true,
};

const written = await fetch(`${URL}/rest/v1/members?on_conflict=id`, {
  method: 'POST',
  headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
  body: JSON.stringify(member),
});

if (!written.ok) {
  console.error(`Could not write the member row: ${await written.text()}`);
  process.exit(1);
}
console.log(`  ${EMAIL} is a member (${member.display_name}, ${userId})`);
