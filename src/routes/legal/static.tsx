import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import PrivacyPage from '@/routes/legal/privacy';
import TermsPage from '@/routes/legal/terms';

/**
 * The Privacy Policy and the Terms of Service as finished HTML, written into
 * the build by `scripts/prerender-legal.mjs`.
 *
 * Every other path is the same empty shell until the app's JavaScript draws
 * it, and that was true of these two: a program that fetched /privacy without
 * running scripts got a page titled "The SCI Club" with nothing in it. Twilio's
 * pre-check of the text-message registration is such a program, and what it
 * looks for is a page titled "Privacy Policy" that carries the SMS sentence
 * and the brand's name (2026-10-01, "could not verify"). So these two paths
 * are served as HTML with their words already in them; the app then starts as
 * usual and draws the same page over it.
 *
 * Not the member pages. Those stay an empty shell on purpose, and keep the
 * noindex this removes from these two.
 */

export const STATIC_PAGES = [
  { file: 'privacy.html', title: 'Privacy Policy', Page: PrivacyPage },
  { file: 'terms.html', title: 'Terms of Service', Page: TermsPage },
] as const;

const ROBOTS = /\s*<meta name="robots" content="noindex, nofollow" \/>/;
const TITLE = '<title>The SCI Club</title>';
const ROOT = '<div id="root"></div>';

/**
 * The built index.html with one page written into it. Throws if the shell has
 * changed shape, so a build cannot quietly ship the empty page again.
 */
export function withPage(shell: string, title: string, Page: () => React.ReactElement): string {
  if (!ROBOTS.test(shell) || !shell.includes(TITLE) || !shell.includes(ROOT)) {
    throw new Error('index.html no longer has the robots meta, title and root this expects');
  }
  const markup = renderToStaticMarkup(
    <MemoryRouter>
      <Page />
    </MemoryRouter>,
  );
  return shell
    .replace(ROBOTS, '')
    .replace(TITLE, `<title>${title} · The SCI Club</title>`)
    .replace(ROOT, `<div id="root">${markup}</div>`);
}
