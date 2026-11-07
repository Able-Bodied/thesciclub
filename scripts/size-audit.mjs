/**
 * Every main screen at every common screen size, signed in on the local stack:
 * what runs off the side, and a screenshot of each (the owner, 2026-11-06:
 * "make the app work on all size phones, iPads, and desktop").
 *
 *   SHOOT_BASE=http://localhost:5181 pnpm size-audit /home /events …
 *   AUDIT_TEXT=larger AUDIT_ONLY=phone-320,ipad-768 pnpm size-audit /me   the hardest case
 *
 * Writes screenshots/sizes/<size>/<route>.png and screenshots/sizes/report.json.
 * An element counts as running off when its right edge passes the window's
 * and nothing it sits in scrolls sideways on purpose.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

// No default: a port that is another worktree's app measures the wrong code (2026-11-06).
const BASE = process.env.SHOOT_BASE;
if (!BASE)
  throw new Error('Set SHOOT_BASE to the address of the app to check, e.g. http://localhost:5191.');
const EMAIL = process.env.SHOOT_EMAIL ?? 'sam@local.test';
const PASSWORD = process.env.SHOOT_PASSWORD ?? 'local-dev-password';
const OUT = 'screenshots/sizes';

export const SIZES = [
  { name: 'phone-320', width: 320, height: 568, touch: true },
  { name: 'phone-375', width: 375, height: 667, touch: true },
  { name: 'phone-390', width: 390, height: 844, touch: true },
  { name: 'phone-430', width: 430, height: 932, touch: true },
  { name: 'ipad-mini-744', width: 744, height: 1133, touch: true },
  { name: 'ipad-768', width: 768, height: 1024, touch: true },
  { name: 'ipad-820', width: 820, height: 1180, touch: true },
  { name: 'ipad-1024', width: 1024, height: 768, touch: true },
  { name: 'ipad-1180', width: 1180, height: 820, touch: true },
  { name: 'ipad-1366', width: 1366, height: 1024, touch: true },
  { name: 'desktop-1440', width: 1440, height: 900, touch: false },
  { name: 'desktop-1920', width: 1920, height: 1080, touch: false },
];

const routes = process.argv.slice(2).filter((a) => a.startsWith('/'));
// AUDIT_TEXT=larger (with large targets) for the hardest case; AUDIT_ONLY=phone-320,phone-375 for some sizes.
const TEXT = process.env.AUDIT_TEXT ?? null;
const ONLY = process.env.AUDIT_ONLY ? new Set(process.env.AUDIT_ONLY.split(',')) : null;
// AUDIT_BROWSER=webkit draws it as Safari does.
const ENGINE = process.env.AUDIT_BROWSER === 'webkit' ? webkit : chromium;
const OUT_DIR = `${OUT}${TEXT ? `-${TEXT}` : ''}${process.env.AUDIT_BROWSER === 'webkit' ? '-webkit' : ''}`;

async function signIn(page) {
  await page.goto(`${BASE}/join`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /already have an account/i }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Sign in with email' }).click();
  await page.waitForTimeout(500);
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForTimeout(2500);
  if (/\/join/.test(page.url())) throw new Error('Signed in but not a member.');
}

/** Elements past the window's right edge, outside anything that scrolls sideways. */
function offTheSide() {
  const width = document.documentElement.clientWidth;
  const found = [];
  const scrollsSideways = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true;
    }
    return false;
  };
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || (style.position === 'fixed' && r.left >= width)) continue;
    if (r.right > width + 1 || r.left < -1) {
      if (scrollsSideways(el)) continue;
      const label = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 50);
      found.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className?.baseVal ?? el.className ?? '').toString().slice(0, 80),
        left: Math.round(r.left),
        right: Math.round(r.right),
        label,
      });
    }
  }
  // Only the outermost of each: a child of one already listed adds nothing.
  return found.slice(0, 12);
}

/**
 * Rows that scroll sideways and hide something (a chip row on purpose, or a
 * toolbar cut short), and words cut off with an ellipsis.
 */
function hidden() {
  const rows = [];
  for (const el of document.querySelectorAll('body *')) {
    const style = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (
      (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
      el.scrollWidth > el.clientWidth + 2
    ) {
      const words = [...el.children]
        .map((c) => (c.textContent || c.getAttribute('aria-label') || '').trim().slice(0, 18))
        .filter(Boolean)
        .slice(0, 6);
      rows.push({
        kind: 'scrolls',
        hides: el.scrollWidth - el.clientWidth,
        words: words.join(' | '),
      });
    }
    if (
      (style.overflowX === 'hidden' || style.overflowX === 'clip') &&
      style.textOverflow !== 'ellipsis' &&
      el.scrollWidth > el.clientWidth + 2
    ) {
      const words = [
        ...el.querySelectorAll('button, a, [role="button"], span, p, h1, h2, h3, label'),
      ]
        .filter((c) => {
          const b = c.getBoundingClientRect();
          return b.width > 0 && (b.right > r.right + 1 || b.left < r.left - 1);
        })
        .map((c) => (c.textContent || c.getAttribute('aria-label') || '').trim().slice(0, 20))
        .filter(Boolean)
        .slice(0, 4);
      if (words.length > 0)
        rows.push({
          kind: 'clipped',
          hides: el.scrollWidth - el.clientWidth,
          words: words.join(' | '),
        });
    }
    if (style.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) {
      rows.push({ kind: 'cut', text: (el.textContent || '').trim().slice(0, 60) });
    }
  }
  return rows.slice(0, 15);
}

/** The object under `key`, made the first time. */
function note(into, key) {
  if (!into[key]) into[key] = {};
  return into[key];
}

// WebKit here needs its libraries beside it (no root): WEBKIT_PATH names a
// launcher that sets them, e.g. ~/.cache/thesciclub-webkit-libs/run.sh.
const browser = await ENGINE.launch(
  ENGINE === webkit && process.env.WEBKIT_PATH ? { executablePath: process.env.WEBKIT_PATH } : {},
);
const report = {};
for (const size of SIZES.filter((s) => !ONLY || ONLY.has(s.name))) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 1,
    hasTouch: size.touch,
    isMobile: size.touch && size.width < 1000,
  });
  const page = await context.newPage();
  if (TEXT) {
    await page.addInitScript(
      (stored) => {
        localStorage.setItem('thesciclub.accessibility', stored);
      },
      JSON.stringify({ largeTargets: true, textSize: TEXT }),
    );
  }
  await signIn(page);
  await mkdir(`${OUT_DIR}/${size.name}`, { recursive: true });
  for (const route of routes) {
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(900);
      const docWide = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      const off = await page.evaluate(offTheSide);
      const cut = size.width < 1100 ? await page.evaluate(hidden) : [];
      if (cut.length > 0) note(note(report, '__hidden'), route)[size.name] = cut;
      const file = `${OUT_DIR}/${size.name}/${route.replace(/[/:?=&]+/g, '_').replace(/^_/, '') || 'root'}.png`;
      await page.screenshot({ path: file });
      if (docWide > 0 || off.length > 0) {
        note(report, route)[size.name] = { docWide, off };
      }
    } catch (e) {
      note(report, route)[size.name] = { error: String(e).slice(0, 200) };
    }
  }
  await context.close();
}
await browser.close();
await writeFile(`${OUT_DIR}/report.json`, JSON.stringify(report, null, 1));
const problems = Object.entries(report).filter(([route]) => route !== '__hidden');
console.log(
  problems.length === 0
    ? 'Nothing runs off the side.'
    : `${problems.length} routes with something off the side:`,
);
for (const [route, bySize] of problems) console.log(` ${route}: ${Object.keys(bySize).join(', ')}`);
