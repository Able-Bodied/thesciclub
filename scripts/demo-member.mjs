/**
 * Make sure the local test phone has a member row, so screenshots and manual
 * poking land inside the club rather than at step one of onboarding.
 *
 *   pnpm demo-member
 *
 * `supabase db reset` drops the auth schema along with everything else, so the
 * test account goes back to being a stranger every time the schema changes.
 * Clicking through onboarding to fix that is a dozen screens, and none of them
 * are what is being tested.
 *
 * Local only, and it refuses to run anywhere else: it writes a member row
 * directly with the service role, which is a reasonable thing to do to a
 * throwaway database and not to a real one.
 */

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PHONE = process.env.DEMO_PHONE ?? '11111111111';
const OTP = process.env.DEMO_OTP ?? '111111';

if (!/127\.0\.0\.1|localhost/.test(URL)) {
  console.error(`Refusing to run against ${URL}. This writes a member row directly; local only.`);
  process.exit(1);
}
if (!KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY (supabase status prints it).');
  process.exit(1);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

/** Sign in with the test OTP, which config.toml intercepts before Twilio. */
async function signIn() {
  await fetch(`${URL}/auth/v1/otp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ phone: PHONE, create_user: true }),
  });
  const verified = await fetch(`${URL}/auth/v1/verify`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ phone: PHONE, token: OTP, type: 'sms' }),
  });
  const body = await verified.json();
  if (!body.user?.id) throw new Error(`Could not sign in: ${JSON.stringify(body).slice(0, 200)}`);
  return body.user.id;
}

const userId = await signIn();

// An invite first: the members insert trigger consumes one, and without it the
// row is refused exactly as a real signup would be.
const existing = await fetch(`${URL}/rest/v1/invites?phone=eq.${PHONE}&select=id`, { headers });
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
      phone_raw: PHONE,
      status: 'pending',
      invited_by_organization_id: ncs?.id ?? null,
    }),
  });
}

const member = {
  id: userId,
  display_name: 'Alex',
  phone: PHONE,
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
console.log(`  ${PHONE} is a member (${member.display_name}, ${userId})`);
