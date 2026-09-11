/**
 * Screenshot a route of the running dev server.
 *
 *   node scripts/shot.mjs /peers                     phone width
 *   node scripts/shot.mjs /peers --desktop           1280 wide
 *   node scripts/shot.mjs /admin --as=11111111111    signed in first
 *   node scripts/shot.mjs /peers --out=/tmp/deck.png
 *
 * Exists because visual work cannot be verified from a test suite. A card that
 * renders its markup correctly and looks wrong passes every assertion in this
 * repo.
 *
 * Signing in runs the same phone-OTP calls the app does, against whichever
 * project .env.local points at, using the configured test numbers — it is the
 * same credential check, not a bypass.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const route = args.find((a) => !a.startsWith('--')) ?? '/';
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const has = (name) => args.includes(`--${name}`);

const BASE = flag('base') ?? 'http://localhost:5180';
const OUT = resolve(flag('out') ?? `/tmp/sciclub${route.replace(/\W+/g, '-') || '-home'}.png`);
const DESKTOP = has('desktop');
const PHONE = flag('as');

/** Test numbers are fixed OTPs, so the code is derivable from the number. */
const CODES = { 11111111111: '111111', 12222222222: '222222', 13333333333: '333333' };

function env() {
  const out = {};
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const [k, ...rest] = t.split('=');
    out[k] = rest.join('=');
  }
  return out;
}

/** Sign in over the auth API, then hand the session to the page as Supabase stores it. */
async function session(phone) {
  const { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: key } = env();
  const code = CODES[phone];
  if (!code) throw new Error(`${phone} is not one of the configured test numbers`);

  const headers = { apikey: key, 'Content-Type': 'application/json' };
  await fetch(`${url}/auth/v1/otp`, { method: 'POST', headers, body: JSON.stringify({ phone }) });
  const res = await fetch(`${url}/auth/v1/verify`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ phone, token: code, type: 'sms' }),
  });
  const body = await res.json();
  if (!body.access_token) throw new Error(`sign-in failed: ${JSON.stringify(body).slice(0, 200)}`);
  return { url, body };
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: DESKTOP ? { width: 1280, height: 900 } : { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`console: ${m.text()}`);
});
page.on('pageerror', (e) => {
  problems.push(`page error: ${e.message}`);
});

if (PHONE) {
  const { url, body } = await session(PHONE);
  const ref = new URL(url).hostname.split('.')[0];
  // Supabase reads its session from localStorage under a project-keyed name.
  await page.addInitScript(
    ([k, v]) => {
      window.localStorage.setItem(k, v);
    },
    [`sb-${ref}-auth-token`, JSON.stringify(body)],
  );
}

await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

mkdirSync(dirname(OUT), { recursive: true });
await page.screenshot({ path: OUT, fullPage: has('full') });
await browser.close();

console.log(`url    ${BASE}${route}`);
console.log(`as     ${PHONE ?? 'signed out'}`);
console.log(`size   ${DESKTOP ? '1280x900' : '390x844'}${has('full') ? ' (full page)' : ''}`);
console.log(`out    ${OUT}`);
if (problems.length) {
  console.log('\nbrowser reported:');
  for (const p of problems.slice(0, 8)) console.log(`  ${p}`);
}
