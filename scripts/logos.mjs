/**
 * Find and check a logo for an organization.
 *
 *   pnpm logos                              which organizations still need one
 *   pnpm logos --find https://example.org   pull every candidate off a site
 *   pnpm logos --sheet                      render what has been pulled, at badge size
 *   pnpm logos --upload SC=sc.png           put a chosen file in the bucket
 *
 * Candidates land in .logo-candidates/ (gitignored). The sheet is the point:
 * it draws each one into the real badge at 96px and at the 38px an event card
 * actually uses, on the gold tile, so a person can see what they are choosing.
 *
 * ---------------------------------------------------------------------------
 * Why the ingest job does not do this on its own
 * ---------------------------------------------------------------------------
 * The obvious version — have the scraper download whatever a host's site calls
 * a logo — cannot do the only part that matters, which is looking at it. Doing
 * this by hand for six organizations turned up two candidates that a machine
 * would have taken and that are both wrong:
 *
 *   High Fives publishes its horizontal logo in white, for a dark header. On
 *   the badge it renders as an empty square.
 *
 *   Canine Companions' header logo is a 183x68 wordmark that letterboxes into
 *   a thin strip; their square app icon is the mark people recognise.
 *
 * Neither is detectable from the URL, the filename, or the alt text. A wrong
 * logo on an organization that vouches for members is worse than no logo — so
 * the job records nothing and publishes nothing, and this makes the human pass
 * quick instead of automating it badly.
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const DIR = '.logo-candidates';
const URL_BASE = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : (args[i + 1] ?? true);
};

const BADGE_CSS = `
 body{font-family:system-ui;background:#F4F6F9;margin:0;padding:18px}
 .row{display:flex;flex-wrap:wrap;gap:20px}
 figure{margin:0;text-align:center;width:150px}
 .big,.small{border-radius:22px;overflow:hidden;margin:0 auto;
   background:linear-gradient(140deg,#8A6712,#C9A227);display:grid;place-items:center}
 .big{width:96px;height:96px}
 .small{width:38px;height:38px;border-radius:12px;margin-top:8px}
 img{width:100%;height:100%;object-fit:contain;background:#fff;padding:5px;box-sizing:border-box}
 figcaption{font-size:11px;margin-top:8px;color:#455163;word-break:break-all}`;

async function listMissing() {
  if (!URL_BASE || !ANON) {
    console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
    process.exit(1);
  }
  const res = await fetch(
    `${URL_BASE}/rest/v1/organizations?select=short_code,name,logo_path&order=short_code`,
    { headers: { apikey: ANON } },
  );
  const rows = await res.json();
  for (const row of rows) {
    console.log(`  ${row.short_code.padEnd(4)} ${row.logo_path ? '✓' : '—'}  ${row.name}`);
  }
  const missing = rows.filter((r) => !r.logo_path);
  console.log(
    missing.length
      ? `\n  ${missing.length} without a logo. Try: pnpm logos --find <their site>`
      : '\n  Every organization has one.',
  );
}

/** Every plausible mark on a page: icons, og:image, and anything header-ish. */
async function find(site) {
  await mkdir(DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(site, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000);

  const urls = await page.evaluate(() => {
    const abs = (u) => {
      try {
        return new URL(u, location.href).href;
      } catch {
        return null;
      }
    };
    const out = new Set();
    document.querySelectorAll('link[rel*=icon]').forEach((l) => {
      const u = abs(l.getAttribute('href'));
      if (u) out.add(u);
    });
    const og = document.querySelector('meta[property="og:image"]');
    if (og) {
      const u = abs(og.getAttribute('content'));
      if (u) out.add(u);
    }
    document
      .querySelectorAll('header img, nav img, [class*=logo] img, img[class*=logo], img[alt*=ogo]')
      .forEach((i) => {
        const u = abs(i.currentSrc || i.getAttribute('src'));
        if (u) out.add(u);
      });
    return [...out];
  });

  console.log(`  ${urls.length} candidates on ${site}`);
  let n = 0;
  for (const url of urls) {
    // Through the page's own context, so a CDN that refuses a bare request
    // still serves it — the same session just loaded the page.
    const res = await context.request.get(url, { headers: { referer: site } }).catch(() => null);
    if (!res?.ok()) {
      console.log(`    skipped ${res?.status() ?? 'err'}  ${url.slice(0, 70)}`);
      continue;
    }
    const type = res.headers()['content-type'] ?? '';
    if (!type.startsWith('image/')) continue;
    const ext = type.includes('svg')
      ? 'svg'
      : type.includes('jpeg')
        ? 'jpg'
        : type.includes('webp')
          ? 'webp'
          : 'png';
    const name = `${String(++n).padStart(2, '0')}-${new URL(site).hostname.replace(/^www\./, '')}.${ext}`;
    await writeFile(`${DIR}/${name}`, await res.body());
    console.log(`    ${name}  ${type}  ${url.slice(0, 60)}`);
  }
  await browser.close();
  console.log('\n  Now look at them:  pnpm logos --sheet');
}

async function sheet() {
  const files = (await readdir(DIR).catch(() => [])).filter((f) =>
    /\.(png|jpe?g|webp|svg)$/i.test(f),
  );
  if (files.length === 0) {
    console.error(`  Nothing in ${DIR}. Run: pnpm logos --find <site>`);
    process.exit(1);
  }
  const mime = (f) =>
    f.endsWith('.svg')
      ? 'image/svg+xml'
      : /\.jpe?g$/.test(f)
        ? 'image/jpeg'
        : f.endsWith('.webp')
          ? 'image/webp'
          : 'image/png';

  const cells = await Promise.all(
    files.map(async (f) => {
      const data = (await readFile(`${DIR}/${f}`)).toString('base64');
      const src = `data:${mime(f)};base64,${data}`;
      return `<figure><div class=big><img src="${src}"></div><div class=small><img src="${src}"></div><figcaption>${f}</figcaption></figure>`;
    }),
  );

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1040, height: 300 },
    deviceScaleFactor: 2,
  });
  await page.setContent(`<style>${BADGE_CSS}</style><div class=row>${cells.join('')}</div>`);
  await page.waitForTimeout(500);
  const out = `${DIR}/sheet.png`;
  await page.screenshot({ path: out, fullPage: true });
  await browser.close();
  console.log(`  ${out} — a white square means a logo drawn for a dark header; pick another.`);
}

async function upload(spec) {
  const [code, file] = String(spec).split('=');
  if (!code || !file) {
    console.error('  Usage: pnpm logos --upload SC=03-example.png');
    process.exit(1);
  }
  if (!SERVICE) {
    console.error('  Set SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  const ext = file.split('.').pop();
  const path = `organizations/${code.toLowerCase()}.${ext}`;
  const body = await readFile(`${DIR}/${file}`);
  const res = await fetch(`${URL_BASE}/storage/v1/object/photos/${path}`, {
    method: 'POST',
    headers: {
      // The Storage API wants the secret key here, not in Authorization.
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      'x-upsert': 'true',
    },
    body,
  });
  if (!res.ok) {
    console.error(`  Upload failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  console.log(`  uploaded ${path}`);
  console.log(`  now add it to a migration:`);
  console.log(
    `    update public.organizations set logo_path = '${path}' where short_code = '${code}';`,
  );
}

const site = flag('find');
if (site && site !== true) await find(site);
else if (flag('sheet')) await sheet();
else if (flag('upload')) await upload(flag('upload'));
else await listMissing();
