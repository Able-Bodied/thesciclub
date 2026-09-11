/**
 * Screenshot a running dev server.
 *
 *   pnpm shoot /events                     one phone-width shot
 *   pnpm shoot /events --desktop           one 1280-wide shot
 *   pnpm shoot /events /me --both          every route at both widths
 *   pnpm shoot /events --text=larger       with a display preference applied
 *   pnpm shoot /events --full              full page rather than the viewport
 *
 * Output lands in screenshots/ (gitignored) as <route>-<width>.png.
 *
 * ---------------------------------------------------------------------------
 * Signing in
 * ---------------------------------------------------------------------------
 * Everything behind the tab bar needs a member session, so this signs in with
 * the test phone number and OTP from supabase/config.toml before navigating.
 * Those are test credentials that never reach Twilio and never leave a local
 * machine; they are already in the repo.
 *
 * ---------------------------------------------------------------------------
 * Why the libraries are on LD_LIBRARY_PATH
 * ---------------------------------------------------------------------------
 * `playwright install --with-deps` needs root, which is not available here, so
 * libnspr4/libnss3/libasound were unpacked from their .deb into a cache
 * directory instead. `pnpm shoot` sets the path; see README.
 */

import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.SHOOT_BASE ?? 'http://localhost:5181';
const OUT = 'screenshots';

/** Test credentials from supabase/config.toml — intercepted before Twilio. */
const TEST_PHONE = process.env.SHOOT_PHONE ?? '11111111111';
const TEST_OTP = process.env.SHOOT_OTP ?? '111111';

const WIDTHS = { phone: 430, desktop: 1280 };

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const routes = args.filter((a) => !a.startsWith('--'));
if (routes.length === 0) routes.push('/events');

const textFlag = [...flags].find((f) => f.startsWith('--text='));
const textSize = textFlag ? textFlag.slice('--text='.length) : null;
const fullPage = flags.has('--full');

const widths = flags.has('--both')
  ? [WIDTHS.phone, WIDTHS.desktop]
  : [flags.has('--desktop') ? WIDTHS.desktop : WIDTHS.phone];

async function signIn(page) {
  await page.goto(`${BASE}/join`, { waitUntil: 'networkidle' });
  // The welcome screen has two doors. This one leads to the sign-in rather
  // than to onboarding.
  await page.getByRole('button', { name: /already have an account/i }).click();
  await page.waitForTimeout(500);

  await page.locator('input').first().fill(TEST_PHONE);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(2500);

  await page.locator('input').first().fill(TEST_OTP);
  await page.waitForTimeout(400);
  const verify = page.getByRole('button', { name: /continue|verify/i });
  if (await verify.count()) await verify.first().click();
  await page.waitForTimeout(2500);

  if (/\/join/.test(page.url())) {
    // Landed in onboarding rather than inside the club, which means the test
    // account has no member row. Say so instead of quietly shooting a
    // half-filled signup form and calling it the Events page.
    throw new Error(
      'Signed in but not a member — run `pnpm demo-member` first (a db reset drops the auth schema too).',
    );
  }
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

for (const width of widths) {
  const context = await browser.newContext({
    viewport: { width, height: width >= 1000 ? 900 : 860 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  if (textSize) {
    // Seeded before any app code runs, so the first paint is already at the
    // chosen size — the same path a returning member takes.
    await page.addInitScript((size) => {
      localStorage.setItem(
        'thesciclub.accessibility',
        JSON.stringify({ textSize: size, largeTargets: false }),
      );
    }, textSize);
  }

  await signIn(page);

  for (const route of routes) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
    // Let images and any late query settle before the shutter.
    await page.waitForTimeout(1200);
    const name = route.replace(/\//g, '_').replace(/^_/, '') || 'root';
    const suffix = textSize ? `-${textSize}` : '';
    const file = `${OUT}/${name}-${width}${suffix}.png`;
    await page.screenshot({ path: file, fullPage });
    console.log(`  ${file}`);
  }
  await context.close();
}

await browser.close();
