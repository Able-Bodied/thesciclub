/**
 * Screenshot a running dev server.
 *
 *   pnpm shoot /events                     one phone-width shot
 *   pnpm shoot /events --desktop           one 1280-wide shot
 *   pnpm shoot /events /me --both          every route at both widths
 *   pnpm shoot /events --text=larger       with a display preference applied
 *   pnpm shoot /me --prefs='{"highContrast":true}'   any display preferences
 *   pnpm shoot /events --full              full page rather than the viewport
 *   pnpm shoot /home --scroll=900          scrolled 900px down first
 *
 * Output lands in screenshots/ (gitignored) as <route>-<width>.png, with
 * `-s<pixels>` before the extension when the shot was scrolled.
 *
 * ---------------------------------------------------------------------------
 * Why --full is not enough, and what --scroll scrolls
 * ---------------------------------------------------------------------------
 * The app shell is `h-dvh` with its own scroller inside, so the page itself
 * never grows and `--full` captures one viewport. `--scroll` scrolls that
 * inner scroller instead: the tallest element whose overflow scrolls and
 * which has more to show. A screen with no such element falls back to the
 * window. Past the end it stops at the end, as a finger would.
 *
 * ---------------------------------------------------------------------------
 * Signing in
 * ---------------------------------------------------------------------------
 * Everything behind the tab bar needs a member session, so this signs in with
 * email and password before navigating: one of the accounts supabase/seed.sql
 * makes on the local stack, all with the password `local-dev-password`
 * (`sam@local.test` unless SHOOT_EMAIL says otherwise). They exist only on a
 * local database and are already in the repo.
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

/** A seeded local account (supabase/seed.sql), signed in through the real sign-in screen. */
const TEST_EMAIL = process.env.SHOOT_EMAIL ?? 'sam@local.test';
const TEST_PASSWORD = process.env.SHOOT_PASSWORD ?? 'local-dev-password';

const WIDTHS = { phone: 430, desktop: 1280 };

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const routes = args.filter((a) => !a.startsWith('--'));
if (routes.length === 0) routes.push('/events');

const textFlag = [...flags].find((f) => f.startsWith('--text='));
const textSize = textFlag ? textFlag.slice('--text='.length) : null;
const prefsFlag = [...flags].find((f) => f.startsWith('--prefs='));
const prefs = prefsFlag ? JSON.parse(prefsFlag.slice('--prefs='.length)) : null;
const fullPage = flags.has('--full');
const scrollFlag = [...flags].find((f) => f.startsWith('--scroll='));
const scrollBy = scrollFlag ? Number(scrollFlag.slice('--scroll='.length)) : 0;
if (!Number.isFinite(scrollBy) || scrollBy < 0) {
  throw new Error(`--scroll wants a number of pixels, not "${scrollFlag}".`);
}

const widths = flags.has('--both')
  ? [WIDTHS.phone, WIDTHS.desktop]
  : [flags.has('--desktop') ? WIDTHS.desktop : WIDTHS.phone];

async function signIn(page) {
  await page.goto(`${BASE}/join`, { waitUntil: 'networkidle' });
  // The welcome screen has two doors. This one leads to the sign-in rather
  // than to onboarding.
  await page.getByRole('button', { name: /already have an account/i }).click();
  await page.waitForTimeout(500);

  await page.locator('input[type="email"]').fill(TEST_EMAIL);
  await page.locator('input[type="password"]').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForTimeout(2500);

  if (/\/join/.test(page.url())) {
    // Landed in onboarding rather than inside the club, which means the
    // account has no member row (or was refused as not invited). Say so instead of quietly shooting a
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

  if (textSize || prefs) {
    // Seeded before any app code runs, so the first paint is already at the
    // chosen size — the same path a returning member takes.
    await page.addInitScript(
      (stored) => {
        localStorage.setItem('thesciclub.accessibility', stored);
      },
      JSON.stringify({ largeTargets: false, ...(textSize ? { textSize } : {}), ...prefs }),
    );
  }

  await signIn(page);

  for (const route of routes) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
    // Let images and any late query settle before the shutter.
    await page.waitForTimeout(1200);
    if (scrollBy > 0) {
      await page.evaluate((by) => {
        const scrollers = [...document.querySelectorAll('*')].filter((element) => {
          const { overflowY } = getComputedStyle(element);
          return (
            (overflowY === 'auto' || overflowY === 'scroll') &&
            element.scrollHeight > element.clientHeight
          );
        });
        const tallest = scrollers.sort((a, b) => b.clientHeight - a.clientHeight)[0];
        if (tallest) tallest.scrollTop = by;
        else window.scrollTo(0, by);
      }, scrollBy);
      // Lazy images below the fold start loading only now.
      await page.waitForTimeout(600);
    }
    const name = route.replace(/[/?=&]/g, '_').replace(/^_/, '') || 'root';
    const suffix = `${textSize ? `-${textSize}` : ''}${prefs ? '-prefs' : ''}${scrollBy > 0 ? `-s${scrollBy}` : ''}`;
    const file = `${OUT}/${name}-${width}${suffix}.png`;
    await page.screenshot({ path: file, fullPage });
    console.log(`  ${file}`);
  }
  await context.close();
}

await browser.close();
