/**
 * The two-browser check for realtime.
 *
 *   pnpm realtime-check
 *
 * Unit tests mock the channel, so nothing in `pnpm test` says that a message
 * one member writes reaches another. This does: two browsers, two test numbers,
 * and two things that have to move on their own.
 *
 *   1. Alex has the conversation open. Bo writes into it from another browser.
 *      Alex's screen shows it without anybody touching Alex's browser.
 *   2. Bo is on Peers, not on Chat at all. Alex writes. The dot appears on Bo's
 *      Chat tab.
 *
 * The second is the one worth the trouble. A subscription on the open screen is
 * easy to get right and easy to notice when it breaks; the one in the tab bar
 * is neither, and it is the whole of "somebody wrote to you while you were
 * doing something else".
 *
 * ---------------------------------------------------------------------------
 * What it needs
 * ---------------------------------------------------------------------------
 * A local stack **with realtime running** — the CLI remembers the last
 * exclusion set, so `supabase stop` then start without `realtime` in `-x`; see
 * HANDOFF.md — and a dev server pointed at it:
 *
 *   VITE_SUPABASE_URL=http://127.0.0.1:54321 \
 *   VITE_SUPABASE_ANON_KEY=$(pnpm exec supabase status -o json |
 *     python3 -c 'import json,sys; print(json.load(sys.stdin)["PUBLISHABLE_KEY"])') \
 *   ./node_modules/.bin/vite --port 5183 --strictPort
 *
 * Both test numbers need a member row: `pnpm demo-member`, then again with
 * `DEMO_PHONE=12222222222 DEMO_OTP=222222`.
 *
 * Local only, and it refuses to run anywhere else: it signs in with fixed OTPs
 * and writes messages.
 */

import { chromium } from 'playwright';

const BASE = process.env.SHOOT_BASE ?? 'http://localhost:5183';
const API = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ACCOUNTS = [
  { phone: process.env.RT_PHONE_A ?? '11111111111', otp: process.env.RT_OTP_A ?? '111111' },
  { phone: process.env.RT_PHONE_B ?? '12222222222', otp: process.env.RT_OTP_B ?? '222222' },
];

if (!/127\.0\.0\.1|localhost/.test(BASE) || !/127\.0\.0\.1|localhost/.test(API)) {
  console.error(`Refusing to run against ${BASE} / ${API}. Local only.`);
  process.exit(1);
}
if (!KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY (supabase status prints it).');
  process.exit(1);
}

/** The member id behind a test number, read with the service role. */
async function memberIdFor(phone) {
  const response = await fetch(`${API}/rest/v1/members?phone=eq.${phone}&select=id,display_name`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  const [row] = await response.json();
  if (!row) throw new Error(`${phone} has no member row — run pnpm demo-member for it.`);
  return row;
}

async function signIn(page, { phone, otp }) {
  await page.goto(`${BASE}/join`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /already have an account/i }).click();
  await page.waitForTimeout(500);
  await page.locator('input').first().fill(phone);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(2500);
  await page.locator('input').first().fill(otp);
  await page.waitForTimeout(400);
  const verify = page.getByRole('button', { name: /continue|verify/i });
  if (await verify.count()) await verify.first().click();
  await page.waitForTimeout(2500);
  if (/\/join/.test(page.url())) {
    throw new Error(`${phone} signed in but is not a member — run pnpm demo-member for it.`);
  }
}

const [a, b] = await Promise.all(ACCOUNTS.map((account) => memberIdFor(account.phone)));

const browser = await chromium.launch();
// Separate contexts, so the two are two different people and not two tabs.
const contexts = await Promise.all([
  browser.newContext({ viewport: { width: 430, height: 860 } }),
  browser.newContext({ viewport: { width: 430, height: 860 } }),
]);
const [first, second] = await Promise.all(contexts.map((context) => context.newPage()));

await signIn(first, ACCOUNTS[0]);
await signIn(second, ACCOUNTS[1]);

// The first one opens a conversation with the second from their profile, which
// also exercises chat_open_direct and the Message button.
await first.goto(`${BASE}/peers/${b.id}`, { waitUntil: 'networkidle' });
await first.waitForTimeout(800);
await first.getByRole('button', { name: /^Message / }).click();
await first.waitForTimeout(2500);
if (!/\/chat\/t\//.test(first.url())) throw new Error('Message did not open a conversation.');
const threadId = first.url().split('/chat/t/')[1];

await second.goto(`${BASE}/chat/t/${threadId}`, { waitUntil: 'networkidle' });
await second.waitForTimeout(2000);

let failed = false;
const check = async (what, run) => {
  try {
    await run();
    console.log(`  PASS  ${what}`);
  } catch {
    failed = true;
    console.log(`  FAIL  ${what}`);
  }
};

const words = `Realtime check ${Date.now()}`;
await second.getByRole('textbox').first().fill(words);
await second.getByRole('button', { name: /send/i }).click();
await check(`${a.display_name} saw it in the open conversation`, () =>
  first.getByText(words).waitFor({ timeout: 12000 }),
);

// Now the tab bar, which is the half that is hard to notice when it breaks.
await second.goto(`${BASE}/peers`, { waitUntil: 'networkidle' });
await second.waitForTimeout(1500);
const reply = `Reply ${Date.now()}`;
await first.getByRole('textbox').first().fill(reply);
await first.getByRole('button', { name: /send/i }).click();
await check(`${b.display_name} got the dot while looking at Peers`, () =>
  second.getByRole('link', { name: 'Chat, something new' }).waitFor({ timeout: 12000 }),
);

await browser.close();
process.exitCode = failed ? 1 : 0;
